from __future__ import annotations

import json
import os
from typing import Annotated, Any, Literal

import asyncpg
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from routes.agent_routes import (
    AgentActionResponse,
    _resolve_agent_context,
    execute_action_with_context,
    list_agent_skills_registry,
    skill_action_map,
)
from routes.auth_routes import get_current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])

MessageRole = Literal["system", "user", "assistant", "tool"]


class ChatMessage(BaseModel):
    role: MessageRole
    content: str = ""


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: list[ChatMessage] = Field(default_factory=list)
    scope: str | None = Field(default=None, max_length=64)


class ChatResponse(BaseModel):
    reply: str
    approval: AgentActionResponse | None = None


def _pool_from_request(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return pool


def _chat_model() -> str:
    return (os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip() or "deepseek-chat")


def _chat_base_url() -> str:
    base = (os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip() or "https://api.deepseek.com").rstrip("/")
    return base


def _chat_api_key() -> str:
    value = (os.getenv("DEEPSEEK_API_KEY", "").strip())
    if not value:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY 未配置")
    return value


def _max_tool_loops() -> int:
    raw = (os.getenv("CHAT_MAX_TOOL_LOOPS", "4").strip() or "4")
    try:
        value = int(raw)
    except Exception:
        value = 4
    return max(1, min(value, 8))


def _build_system_prompt() -> str:
    return (
        "你是 Ark 的 dashboard agent，对话对象是产品用户。"
        "你可以调用 skills 来查看任务、更新任务、发起敏感操作审批，以及准备 arXiv 每日任务。"
        "规则："
        "1. 优先使用工具获取事实，不要编造任务数据。"
        "2. 如果工具返回 approval_required，向用户简洁解释将发生什么，并明确需要在前端确认。"
        "3. 不要声称已经完成需要确认的敏感操作，除非 commit 工具已经成功执行。"
        "4. 回答使用简体中文，简洁、自然、像产品里的助手。"
    )


def _tool_definitions() -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    for skill in list_agent_skills_registry():
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": skill.name,
                    "description": skill.description,
                    "parameters": skill.parameters,
                },
            }
        )
    commit_tool_params = {
        "type": "object",
        "properties": {
            "approval_id": {"type": "string"},
            "commit_action": {"type": "string", "enum": ["task.delete.commit", "arxiv.daily_tasks.commit"]},
        },
        "required": ["approval_id", "commit_action"],
    }
    tools.append(
        {
            "type": "function",
            "function": {
                "name": "approval_commit",
                "description": "在用户已经通过前端确认后，执行批准中的敏感操作。",
                "parameters": commit_tool_params,
            },
        }
    )
    return tools


def _messages_for_model(body: ChatRequest) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = [{"role": "system", "content": _build_system_prompt()}]
    for item in body.history[-12:]:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": body.message})
    return messages


async def _deepseek_chat_completion(messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
    url = f"{_chat_base_url()}/chat/completions"
    headers = {
        "Authorization": f"Bearer {_chat_api_key()}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _chat_model(),
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "temperature": 0.2,
    }
    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(url, headers=headers, json=payload)
    if resp.status_code >= 400:
        detail = resp.text[:500]
        raise HTTPException(status_code=502, detail=f"DeepSeek 调用失败：{detail}")
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise HTTPException(status_code=502, detail="DeepSeek 未返回候选结果")
    message = choices[0].get("message") or {}
    return message if isinstance(message, dict) else {}


def _extract_text_content(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "\n".join(parts).strip()
    return ""


def _tool_calls_from_message(message: dict[str, Any]) -> list[dict[str, Any]]:
    raw = message.get("tool_calls")
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


def _parse_tool_arguments(raw: Any) -> dict[str, Any]:
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"工具参数解析失败：{exc}") from exc
        if isinstance(parsed, dict):
            return parsed
    if isinstance(raw, dict):
        return raw
    return {}


async def _execute_tool_call(
    pool: asyncpg.Pool,
    *,
    ctx: Any,
    call: dict[str, Any],
) -> tuple[dict[str, Any], AgentActionResponse | None]:
    function = call.get("function")
    if not isinstance(function, dict):
        raise HTTPException(status_code=422, detail="工具调用缺少 function")
    name = function.get("name")
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(status_code=422, detail="工具调用缺少名称")
    arguments = _parse_tool_arguments(function.get("arguments"))

    if name == "approval_commit":
        approval_id = arguments.get("approval_id")
        commit_action = arguments.get("commit_action")
        if not isinstance(approval_id, str) or not isinstance(commit_action, str):
            raise HTTPException(status_code=422, detail="approval_commit 参数无效")
        result = await execute_action_with_context(
            pool,
            action_name=commit_action,
            ctx=ctx,
            payload={"approval_id": approval_id},
        )
    else:
        action_name = skill_action_map().get(name)
        if action_name is None:
            raise HTTPException(status_code=422, detail=f"未知 skill：{name}")
        result = await execute_action_with_context(pool, action_name=action_name, ctx=ctx, payload=arguments)

    tool_message = {
        "role": "tool",
        "tool_call_id": call.get("id"),
        "content": result.model_dump_json(),
    }
    approval = result if result.type == "approval_required" else None
    return tool_message, approval


@router.post("", response_model=ChatResponse)
async def chat_with_agent(
    request: Request,
    body: ChatRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> ChatResponse:
    ctx = _resolve_agent_context(request, int(user.id))
    pool = _pool_from_request(request)
    tools = _tool_definitions()
    messages = _messages_for_model(body)
    latest_approval: AgentActionResponse | None = None

    for _ in range(_max_tool_loops()):
        model_message = await _deepseek_chat_completion(messages, tools)
        assistant_entry = {
            "role": "assistant",
            "content": _extract_text_content(model_message),
        }
        tool_calls = _tool_calls_from_message(model_message)
        if tool_calls:
            assistant_entry["tool_calls"] = tool_calls
        messages.append(assistant_entry)

        if not tool_calls:
            reply = assistant_entry["content"] or "我已经处理好了。"
            return ChatResponse(reply=reply, approval=latest_approval)

        for call in tool_calls:
            tool_message, approval = await _execute_tool_call(pool, ctx=ctx, call=call)
            if approval is not None:
                latest_approval = approval
            messages.append(tool_message)

    raise HTTPException(status_code=502, detail="工具调用轮数超过限制")
