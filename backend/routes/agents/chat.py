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

SUGGESTIONS_START = "\n<ark_suggestions>"
SUGGESTIONS_END = "</ark_suggestions>"


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


def _response_mode(scope: str | None) -> str:
    return "chara" if (scope or "").strip() == "dashboard_chara" else "default"


def build_system_prompt(profile: AgentProfileOut, allowed_skills: list[str], *, response_mode: str = "default") -> str:
    app = get_app_definition(profile.primary_app_id)
    system_base = (
        "你是 Ark 的 AI Agent，对话对象是产品用户。"
        "你可以调用 skills 来查看任务、更新任务、发起敏感操作审批，以及访问当前主应用或受控跨应用的信息。"
        "规则：1. 优先使用工具获取事实，不要编造任务数据。"
        "2. 如果工具返回 approval_required，向用户简洁解释将发生什么，并明确需要在前端确认。"
        "3. 不要尝试替用户提交审批确认；审批只能由前端确认按钮触发。"
        "4. 不要声称已经完成需要确认的敏感操作，除非前端确认后的 commit 请求已经成功执行。"
        "5. 回答使用简体中文，简洁、自然、像产品里的助手。"
    )
    context = profile.context_prompt.strip() or app.default_context_prompt
    constraints = (
        f"当前 Agent 名称：{profile.name}。"
        f"当前主应用：{app.display_name}。"
        f"当前会话仅允许调用这些 skills：{', '.join(allowed_skills) or '无'}。不要调用未被允许的 skill。"
    )
    suggestion_format = (
        "最终回复时，请把用户可见正文放在前面；在最后紧跟一个建议块，格式必须是："
        f"{SUGGESTIONS_START}"
        '["建议1","建议2","建议3"]'
        f"{SUGGESTIONS_END}。"
        "建议块不能出现在正文中间。建议要简短、可点击、适合继续对话，最多 3 条。"
    )
    chara_constraints = (
        "当前是首页角色悬浮字幕模式。正文控制在 1 到 2 句内，像角色当下说出的话，避免写成长段说明。"
        if response_mode == "chara"
        else "正文保持自然、清晰；如无必要，不要冗长。"
    )
    return "\n".join([system_base, context, constraints, chara_constraints, suggestion_format])


def tool_definitions(allowed_skills: list[str] | None = None) -> list[dict[str, Any]]:
    allowed = set(allowed_skills or [])
    return [
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


def messages_for_model(body: ChatRequest, profile: AgentProfileOut) -> list[dict[str, Any]]:
    allowed_skills = _allowed_skill_names(body, profile)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": build_system_prompt(profile, allowed_skills, response_mode=_response_mode(body.scope))}
    ]
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


def _reply_claims_frontend_confirmation(reply: str) -> bool:
    text = reply.strip()
    if not text:
        return False
    frontend_confirm_pairs = [
        ("前端", "确认"),
        ("界面", "确认"),
        ("确认按钮", ""),
        ("点击确认", ""),
        ("审批按钮", ""),
    ]
    for left, right in frontend_confirm_pairs:
        if left in text and (not right or right in text):
            return True
    return False


def _finalize_reply(reply: str, approval: AgentActionResponse | None) -> str:
    text = reply.strip() or "我已经处理好了。"
    if approval is not None:
        return text
    if _reply_claims_frontend_confirmation(text):
        return "我这轮还没有成功发起前端确认卡片，所以现在不会弹出确认框。请再试一次，我会重新发起需要确认的操作。"
    return text


def _clean_suggestion(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = " ".join(value.split()).strip()
    if not text:
        return None
    return text[:80]


def split_reply_and_suggestions(raw_reply: str) -> tuple[str, list[str]]:
    text = raw_reply.strip()
    if not text:
        return "", []
    start = text.find(SUGGESTIONS_START)
    if start == -1:
        return text, []
    end = text.find(SUGGESTIONS_END, start + len(SUGGESTIONS_START))
    if end == -1:
        return text[:start].strip(), []
    visible = text[:start].strip()
    payload = text[start + len(SUGGESTIONS_START) : end].strip()
    try:
        parsed = json.loads(payload)
    except Exception:
        return visible, []
    items = parsed if isinstance(parsed, list) else parsed.get("suggestions") if isinstance(parsed, dict) else []
    if not isinstance(items, list):
        return visible, []
    suggestions: list[str] = []
    for item in items:
        cleaned = _clean_suggestion(item)
        if cleaned and cleaned not in suggestions:
            suggestions.append(cleaned)
        if len(suggestions) >= 3:
            break
    return visible, suggestions


def _visible_stream_text(raw_text: str, emitted_chars: int) -> str:
    marker_index = raw_text.find(SUGGESTIONS_START)
    if marker_index >= 0:
        visible = raw_text[:marker_index]
    else:
        safe_end = max(0, len(raw_text) - (len(SUGGESTIONS_START) - 1))
        visible = raw_text[:safe_end]
    return visible[emitted_chars:]


def _confirmation_repair_message() -> dict[str, str]:
    return {
        "role": "system",
        "content": (
            "系统纠偏：你刚才提到了需要用户在前端确认，但当前并没有任何 approval_required 票据。"
            "如果这一步确实需要审批，请立即调用对应的 prepare skill 真正发起审批；"
            "如果不需要审批，就直接正常回答。"
            "不要再次输出“去前端确认/点击确认按钮”之类的话，除非这轮已经返回了 approval_required。"
        ),
    }


def _is_tool_argument_parse_error(exc: HTTPException) -> bool:
    return exc.status_code == 422 and isinstance(exc.detail, str) and exc.detail.startswith("工具参数解析失败：")


def _tool_argument_repair_message(call: dict[str, Any], detail: str) -> dict[str, str]:
    function = call.get("function") if isinstance(call, dict) else None
    name = function.get("name") if isinstance(function, dict) and isinstance(function.get("name"), str) else "未知工具"
    raw_arguments = (
        function.get("arguments") if isinstance(function, dict) and isinstance(function.get("arguments"), str) else ""
    )
    return {
        "role": "system",
        "content": (
            f"系统纠偏：你刚才调用工具 {name} 时，参数不是合法 JSON。"
            f"错误：{detail}。"
            f"上次的 arguments 原文：{raw_arguments or '<empty>'}。"
            "请立即重新发起同一个工具调用，并只输出合法 JSON 参数对象。"
            "不要输出解释，不要改成自然语言回答。"
        ),
    }


def _tool_argument_error_tool_message(call: dict[str, Any], detail: str) -> dict[str, Any]:
    return {
        "role": "tool",
        "tool_call_id": call.get("id"),
        "content": json.dumps(
            {
                "ok": False,
                "error": "invalid_tool_arguments",
                "detail": detail,
            },
            ensure_ascii=False,
        ),
    }


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
        raise HTTPException(status_code=403, detail="approval_commit 只能由前端确认按钮触发")
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
) -> tuple[str, AgentActionResponse | None, list[str]]:
    profile = await _resolve_profile(pool, body=body, user_id=user_id)
    ctx = build_profile_context(profile, user_id=user_id, session_id=session_id)
    allowed_skills = _allowed_skill_names(body, profile)
    tools = tool_definitions(allowed_skills)
    messages = messages_for_model(body, profile)
    latest_approval: AgentActionResponse | None = None
    confirmation_repair_used = False
    argument_repair_used = False
    for _ in range(max_tool_loops(profile.max_tool_loops)):
        model_message = await deepseek_chat_completion(messages, tools, temperature=profile.temperature)
        assistant_entry: dict[str, Any] = {"role": "assistant", "content": extract_text_content(model_message)}
        tool_calls = tool_calls_from_message(model_message)
        if tool_calls:
            assistant_entry["tool_calls"] = tool_calls
        messages.append(assistant_entry)
        if not tool_calls:
            if latest_approval is None and _reply_claims_frontend_confirmation(assistant_entry["content"]) and not confirmation_repair_used:
                confirmation_repair_used = True
                messages.append(_confirmation_repair_message())
                continue
            visible_reply, suggestions = split_reply_and_suggestions(assistant_entry["content"])
            return _finalize_reply(visible_reply, latest_approval), latest_approval, suggestions
        retry_for_invalid_arguments = False
        for call in tool_calls:
            try:
                tool_message, approval = await execute_tool_call(pool, ctx=ctx, call=call, allowed_skills=set(allowed_skills))
            except HTTPException as exc:
                if _is_tool_argument_parse_error(exc) and not argument_repair_used:
                    argument_repair_used = True
                    messages.append(_tool_argument_error_tool_message(call, exc.detail))
                    messages.append(_tool_argument_repair_message(call, exc.detail))
                    retry_for_invalid_arguments = True
                    break
                raise
            if approval is not None:
                latest_approval = approval
            messages.append(tool_message)
        if retry_for_invalid_arguments:
            continue
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
        confirmation_repair_used = False
        argument_repair_used = False
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
            emitted_chars = 0
            assistant_tool_calls: list[dict[str, Any]] = []
            async for delta in deepseek_chat_completion_stream(messages, tools, temperature=profile.temperature):
                text_delta = _stream_delta_text(delta)
                if text_delta:
                    assistant_text += text_delta
                    visible_delta = _visible_stream_text(assistant_text, emitted_chars)
                    if visible_delta:
                        emitted_chars += len(visible_delta)
                        yield _sse_event({"type": "message_delta", "delta": visible_delta})
                _merge_stream_tool_calls(assistant_tool_calls, delta.get("tool_calls"))
            assistant_entry: dict[str, Any] = {"role": "assistant", "content": assistant_text.strip()}
            if assistant_tool_calls:
                assistant_entry["tool_calls"] = assistant_tool_calls
            messages.append(assistant_entry)
            if not assistant_tool_calls:
                if latest_approval is None and _reply_claims_frontend_confirmation(assistant_entry["content"]) and not confirmation_repair_used:
                    confirmation_repair_used = True
                    messages.append(_confirmation_repair_message())
                    continue
                visible_reply, suggestions = split_reply_and_suggestions(assistant_entry["content"])
                final_delta = visible_reply[emitted_chars:]
                if final_delta:
                    yield _sse_event({"type": "message_delta", "delta": final_delta})
                yield _sse_event(
                    {
                        "type": "done",
                        "reply": _finalize_reply(visible_reply, latest_approval),
                        "approval": latest_approval.model_dump(mode="json") if latest_approval else None,
                        "suggestions": suggestions,
                    }
                )
                return
            retry_for_invalid_arguments = False
            for call in assistant_tool_calls:
                function = call.get("function") if isinstance(call, dict) else None
                yield _sse_event(
                    {
                        "type": "tool_call",
                        "name": function.get("name") if isinstance(function, dict) else None,
                    }
                )
                try:
                    tool_message, approval = await execute_tool_call(pool, ctx=ctx, call=call, allowed_skills=set(allowed_skills))
                except HTTPException as exc:
                    if _is_tool_argument_parse_error(exc) and not argument_repair_used:
                        argument_repair_used = True
                        messages.append(_tool_argument_error_tool_message(call, exc.detail))
                        messages.append(_tool_argument_repair_message(call, exc.detail))
                        retry_for_invalid_arguments = True
                        break
                    raise
                if approval is not None:
                    latest_approval = approval
                    yield _sse_event({"type": "approval_required", "approval": approval.model_dump(mode="json")})
                messages.append(tool_message)
            if retry_for_invalid_arguments:
                continue
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
    reply, approval, suggestions = await _run_chat_turn(pool=pool, body=body, user_id=int(user.id), session_id=session_id)
    return ChatResponse(reply=reply, approval=approval, suggestions=suggestions)


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
