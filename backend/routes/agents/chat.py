from __future__ import annotations

import json
import os
from typing import Annotated, Any

import asyncpg
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from routes.agents.executor import execute_action_with_context, pool_from_request
from routes.agents.models import AgentActionResponse, ChatRequest, ChatResponse
from routes.agents.policy import resolve_agent_context
from routes.agents.skills import list_agent_skills_registry, skill_action_map
from routes.auth_routes import get_current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])


def chat_model() -> str:
    return os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip() or "deepseek-chat"


def chat_base_url() -> str:
    return (os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip() or "https://api.deepseek.com").rstrip("/")


def chat_api_key() -> str:
    value = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not value:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY 未配置")
    return value


def max_tool_loops() -> int:
    raw = os.getenv("CHAT_MAX_TOOL_LOOPS", "4").strip() or "4"
    try:
        value = int(raw)
    except Exception:
        value = 4
    return max(1, min(value, 8))


def build_system_prompt() -> str:
    return (
        "你是 Ark 的 dashboard agent，对话对象是产品用户。"
        "你可以调用 skills 来查看任务、更新任务、发起敏感操作审批，以及准备 arXiv 每日任务。"
        "规则：1. 优先使用工具获取事实，不要编造任务数据。"
        "2. 如果工具返回 approval_required，向用户简洁解释将发生什么，并明确需要在前端确认。"
        "3. 不要声称已经完成需要确认的敏感操作，除非 commit 工具已经成功执行。"
        "4. 回答使用简体中文，简洁、自然、像产品里的助手。"
    )


def tool_definitions() -> list[dict[str, Any]]:
    tools = [
        {
            "type": "function",
            "function": {
                "name": skill.name,
                "description": skill.description,
                "parameters": skill.parameters,
            },
        }
        for skill in list_agent_skills_registry()
    ]
    tools.append(
        {
            "type": "function",
            "function": {
                "name": "approval_commit",
                "description": "在用户已经通过前端确认后，执行批准中的敏感操作。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "approval_id": {"type": "string"},
                        "commit_action": {"type": "string", "enum": ["task.delete.commit", "arxiv.daily_tasks.commit"]},
                    },
                    "required": ["approval_id", "commit_action"],
                },
            },
        }
    )
    return tools


def messages_for_model(body: ChatRequest) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = [{"role": "system", "content": build_system_prompt()}]
    for item in body.history[-12:]:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": body.message})
    return messages


async def deepseek_chat_completion(messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(
            f"{chat_base_url()}/chat/completions",
            headers={"Authorization": f"Bearer {chat_api_key()}", "Content-Type": "application/json"},
            json={"model": chat_model(), "messages": messages, "tools": tools, "tool_choice": "auto", "temperature": 0.2},
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"DeepSeek 调用失败：{resp.text[:500]}")
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise HTTPException(status_code=502, detail="DeepSeek 未返回候选结果")
    message = choices[0].get("message") or {}
    return message if isinstance(message, dict) else {}


def extract_text_content(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [
            item["text"]
            for item in content
            if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str)
        ]
        return "\n".join(parts).strip()
    return ""


def tool_calls_from_message(message: dict[str, Any]) -> list[dict[str, Any]]:
    raw = message.get("tool_calls")
    return [item for item in raw if isinstance(item, dict)] if isinstance(raw, list) else []


def parse_tool_arguments(raw: Any) -> dict[str, Any]:
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


async def execute_tool_call(
    pool: asyncpg.Pool, *, ctx: Any, call: dict[str, Any]
) -> tuple[dict[str, Any], AgentActionResponse | None]:
    function = call.get("function")
    if not isinstance(function, dict):
        raise HTTPException(status_code=422, detail="工具调用缺少 function")
    name = function.get("name")
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(status_code=422, detail="工具调用缺少名称")
    arguments = parse_tool_arguments(function.get("arguments"))
    if name == "approval_commit":
        approval_id = arguments.get("approval_id")
        commit_action = arguments.get("commit_action")
        if not isinstance(approval_id, str) or not isinstance(commit_action, str):
            raise HTTPException(status_code=422, detail="approval_commit 参数无效")
        result = await execute_action_with_context(pool, action_name=commit_action, ctx=ctx, payload={"approval_id": approval_id})
    else:
        action_name = skill_action_map().get(name)
        if action_name is None:
            raise HTTPException(status_code=422, detail=f"未知 skill：{name}")
        result = await execute_action_with_context(pool, action_name=action_name, ctx=ctx, payload=arguments)
    tool_message = {"role": "tool", "tool_call_id": call.get("id"), "content": result.model_dump_json()}
    return tool_message, result if result.type == "approval_required" else None


@router.post("", response_model=ChatResponse)
async def chat_with_agent(
    request: Request,
    body: ChatRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> ChatResponse:
    ctx = resolve_agent_context(request, int(user.id))
    pool = pool_from_request(request)
    tools = tool_definitions()
    messages = messages_for_model(body)
    latest_approval: AgentActionResponse | None = None
    for _ in range(max_tool_loops()):
        model_message = await deepseek_chat_completion(messages, tools)
        assistant_entry: dict[str, Any] = {"role": "assistant", "content": extract_text_content(model_message)}
        tool_calls = tool_calls_from_message(model_message)
        if tool_calls:
            assistant_entry["tool_calls"] = tool_calls
        messages.append(assistant_entry)
        if not tool_calls:
            return ChatResponse(reply=assistant_entry["content"] or "我已经处理好了。", approval=latest_approval)
        for call in tool_calls:
            tool_message, approval = await execute_tool_call(pool, ctx=ctx, call=call)
            if approval is not None:
                latest_approval = approval
            messages.append(tool_message)
    raise HTTPException(status_code=502, detail="工具调用轮数超过限制")
