from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from typing import Annotated, Any

import asyncpg
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from routes.agents.apps import get_app_definition
from routes.agents.executor import execute_action_with_context, pool_from_request
from routes.agents.models import AgentActionResponse, AgentProfileOut, ChatRequest, ChatResponse
from routes.agents.profiles import build_profile_context, get_default_profile, get_profile_by_id
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


def max_tool_loops(default_value: int = 4) -> int:
    raw = os.getenv("CHAT_MAX_TOOL_LOOPS", "4").strip() or "4"
    try:
        value = int(raw)
    except Exception:
        value = default_value
    return max(1, min(value, 8))


def _allowed_skill_names(body: ChatRequest, profile: AgentProfileOut) -> list[str]:
    registry = {skill.name for skill in list_agent_skills_registry()}
    base = profile.allowed_skills if profile.allowed_skills else [skill.name for skill in list_agent_skills_registry()]
    selected = [name.strip() for name in base if isinstance(name, str) and name.strip() in registry]
    return list(dict.fromkeys(selected))


def build_system_prompt(profile: AgentProfileOut, allowed_skills: list[str]) -> str:
    app = get_app_definition(profile.primary_app_id)
    system_base = (
        "你是 Ark 的 AI Agent，对话对象是产品用户。"
        "你可以调用 skills 来查看任务、更新任务、发起敏感操作审批，以及访问当前主应用或受控跨应用的信息。"
        "规则：1. 优先使用工具获取事实，不要编造任务数据。"
        "2. 如果工具返回 approval_required，向用户简洁解释将发生什么，并明确需要在前端确认。"
        "3. 不要声称已经完成需要确认的敏感操作，除非 commit 工具已经成功执行。"
        "4. 回答使用简体中文，简洁、自然、像产品里的助手。"
    )
    context = profile.context_prompt.strip() or app.default_context_prompt
    constraints = (
        f"当前 Agent 名称：{profile.name}。"
        f"当前主应用：{app.display_name}。"
        f"当前会话仅允许调用这些 skills：{', '.join(allowed_skills) or '无'}。不要调用未被允许的 skill。"
    )
    return "\n".join([system_base, context, constraints])


def tool_definitions(allowed_skills: list[str] | None = None) -> list[dict[str, Any]]:
    allowed = set(allowed_skills or [])
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
        if not allowed or skill.name in allowed
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


def messages_for_model(body: ChatRequest, profile: AgentProfileOut) -> list[dict[str, Any]]:
    allowed_skills = _allowed_skill_names(body, profile)
    messages: list[dict[str, Any]] = [{"role": "system", "content": build_system_prompt(profile, allowed_skills)}]
    for item in body.history[-12:]:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": body.message})
    return messages


async def deepseek_chat_completion(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    *,
    temperature: float = 0.2,
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(
            f"{chat_base_url()}/chat/completions",
            headers={"Authorization": f"Bearer {chat_api_key()}", "Content-Type": "application/json"},
            json={"model": chat_model(), "messages": messages, "tools": tools, "tool_choice": "auto", "temperature": temperature},
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


def _stream_delta_text(delta: dict[str, Any]) -> str:
    content = delta.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            item["text"]
            for item in content
            if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str)
        ]
        return "".join(parts)
    return ""


def _merge_stream_tool_calls(existing: list[dict[str, Any]], raw_calls: Any) -> None:
    if not isinstance(raw_calls, list):
        return
    for raw_item in raw_calls:
        if not isinstance(raw_item, dict):
            continue
        index = raw_item.get("index")
        if not isinstance(index, int) or index < 0:
            index = len(existing)
        while len(existing) <= index:
            existing.append({"id": None, "type": "function", "function": {"name": "", "arguments": ""}})
        target = existing[index]
        item_id = raw_item.get("id")
        if isinstance(item_id, str) and item_id:
            target["id"] = item_id
        item_type = raw_item.get("type")
        if isinstance(item_type, str) and item_type:
            target["type"] = item_type
        raw_function = raw_item.get("function")
        if not isinstance(raw_function, dict):
            continue
        target_function = target.setdefault("function", {})
        if not isinstance(target_function, dict):
            target_function = {}
            target["function"] = target_function
        name = raw_function.get("name")
        if isinstance(name, str) and name:
            target_function["name"] = f"{target_function.get('name', '')}{name}"
        arguments = raw_function.get("arguments")
        if isinstance(arguments, str) and arguments:
            target_function["arguments"] = f"{target_function.get('arguments', '')}{arguments}"


async def _resolve_profile(pool: asyncpg.Pool, *, body: ChatRequest, user_id: int) -> AgentProfileOut:
    async with pool.acquire() as conn:
        if body.profile_id:
            return await get_profile_by_id(conn, user_id=user_id, profile_id=body.profile_id)
        return await get_default_profile(conn, user_id=user_id)


async def deepseek_chat_completion_stream(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    *,
    temperature: float = 0.2,
) -> AsyncIterator[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=45) as client:
        async with client.stream(
            "POST",
            f"{chat_base_url()}/chat/completions",
            headers={"Authorization": f"Bearer {chat_api_key()}", "Content-Type": "application/json"},
            json={
                "model": chat_model(),
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
                "temperature": temperature,
                "stream": True,
            },
        ) as resp:
            if resp.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"DeepSeek 调用失败：{(await resp.aread()).decode('utf-8', 'ignore')[:500]}")
            async for line in resp.aiter_lines():
                trimmed = line.strip()
                if not trimmed or not trimmed.startswith("data:"):
                    continue
                payload = trimmed[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                except Exception:
                    continue
                choices = data.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                if isinstance(delta, dict):
                    yield delta


def _sse_event(payload: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode()


async def execute_tool_call(
    pool: asyncpg.Pool, *, ctx: Any, call: dict[str, Any], allowed_skills: set[str]
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
        if name not in allowed_skills:
            raise HTTPException(status_code=403, detail=f"skill 未被当前会话允许：{name}")
        action_name = skill_action_map().get(name)
        if action_name is None:
            raise HTTPException(status_code=422, detail=f"未知 skill：{name}")
        result = await execute_action_with_context(pool, action_name=action_name, ctx=ctx, payload=arguments)
    tool_message = {"role": "tool", "tool_call_id": call.get("id"), "content": result.model_dump_json()}
    return tool_message, result if result.type == "approval_required" else None


async def _run_chat_turn(
    *,
    pool: asyncpg.Pool,
    body: ChatRequest,
    user_id: int,
    session_id: str | None,
) -> tuple[str, AgentActionResponse | None]:
    profile = await _resolve_profile(pool, body=body, user_id=user_id)
    ctx = build_profile_context(profile, user_id=user_id, session_id=session_id)
    allowed_skills = _allowed_skill_names(body, profile)
    tools = tool_definitions(allowed_skills)
    messages = messages_for_model(body, profile)
    latest_approval: AgentActionResponse | None = None
    for _ in range(max_tool_loops(profile.max_tool_loops)):
        model_message = await deepseek_chat_completion(messages, tools, temperature=profile.temperature)
        assistant_entry: dict[str, Any] = {"role": "assistant", "content": extract_text_content(model_message)}
        tool_calls = tool_calls_from_message(model_message)
        if tool_calls:
            assistant_entry["tool_calls"] = tool_calls
        messages.append(assistant_entry)
        if not tool_calls:
            return assistant_entry["content"] or "我已经处理好了。", latest_approval
        for call in tool_calls:
            tool_message, approval = await execute_tool_call(pool, ctx=ctx, call=call, allowed_skills=set(allowed_skills))
            if approval is not None:
                latest_approval = approval
            messages.append(tool_message)
    raise HTTPException(status_code=502, detail="工具调用轮数超过限制")


async def _stream_chat_turn(
    *,
    pool: asyncpg.Pool,
    body: ChatRequest,
    user_id: int,
    session_id: str | None,
) -> AsyncIterator[bytes]:
    try:
        profile = await _resolve_profile(pool, body=body, user_id=user_id)
        ctx = build_profile_context(profile, user_id=user_id, session_id=session_id)
        allowed_skills = _allowed_skill_names(body, profile)
        tools = tool_definitions(allowed_skills)
        messages = messages_for_model(body, profile)
        latest_approval: AgentActionResponse | None = None
        yield _sse_event(
                    {
                        "type": "profile",
                        "profile": {
                            "id": profile.id,
                            "name": profile.name,
                            "primary_app_id": profile.primary_app_id,
                        },
                    }
                )
        for _ in range(max_tool_loops(profile.max_tool_loops)):
            assistant_text = ""
            assistant_tool_calls: list[dict[str, Any]] = []
            async for delta in deepseek_chat_completion_stream(messages, tools, temperature=profile.temperature):
                text_delta = _stream_delta_text(delta)
                if text_delta:
                    assistant_text += text_delta
                    yield _sse_event({"type": "message_delta", "delta": text_delta})
                _merge_stream_tool_calls(assistant_tool_calls, delta.get("tool_calls"))
            assistant_entry: dict[str, Any] = {"role": "assistant", "content": assistant_text.strip()}
            if assistant_tool_calls:
                assistant_entry["tool_calls"] = assistant_tool_calls
            messages.append(assistant_entry)
            if not assistant_tool_calls:
                yield _sse_event(
                    {
                        "type": "done",
                        "reply": assistant_entry["content"] or "我已经处理好了。",
                        "approval": latest_approval.model_dump(mode="json") if latest_approval else None,
                    }
                )
                return
            for call in assistant_tool_calls:
                function = call.get("function") if isinstance(call, dict) else None
                yield _sse_event(
                    {
                        "type": "tool_call",
                        "name": function.get("name") if isinstance(function, dict) else None,
                    }
                )
                tool_message, approval = await execute_tool_call(pool, ctx=ctx, call=call, allowed_skills=set(allowed_skills))
                if approval is not None:
                    latest_approval = approval
                    yield _sse_event({"type": "approval_required", "approval": approval.model_dump(mode="json")})
                messages.append(tool_message)
        raise HTTPException(status_code=502, detail="工具调用轮数超过限制")
    except HTTPException as exc:
        yield _sse_event({"type": "error", "message": exc.detail if isinstance(exc.detail, str) else "请求失败"})
    except Exception as exc:  # pragma: no cover
        yield _sse_event({"type": "error", "message": str(exc) or "请求失败"})


@router.post("", response_model=ChatResponse)
async def chat_with_agent(
    request: Request,
    body: ChatRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> ChatResponse:
    pool = pool_from_request(request)
    session_id = (request.headers.get("X-Ark-Session-Id") or "").strip() or None
    reply, approval = await _run_chat_turn(pool=pool, body=body, user_id=int(user.id), session_id=session_id)
    return ChatResponse(reply=reply, approval=approval)


@router.post("/stream")
async def chat_with_agent_stream(
    request: Request,
    body: ChatRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> StreamingResponse:
    pool = pool_from_request(request)
    session_id = (request.headers.get("X-Ark-Session-Id") or "").strip() or None
    return StreamingResponse(
        _stream_chat_turn(pool=pool, body=body, user_id=int(user.id), session_id=session_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
