from __future__ import annotations

import os
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from routes.auth_routes import get_current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])

_DEFAULT_SYSTEM_PROMPT = "你是一个简洁可靠的中文助手。按用户要求直接回答，不要添加多余包装。"
_MAX_HISTORY_MESSAGES = 12


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: str = Field(min_length=1, max_length=32)
    content: str = Field(default="", max_length=8000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    message: str = Field(min_length=1, max_length=8000)
    history: list[ChatMessage] = Field(default_factory=list)
    scope: str | None = Field(default=None, max_length=64)


class ChatResponse(BaseModel):
    reply: str


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if value:
        return value
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"{name} 未配置")


def _chat_api_key() -> str:
    return _required_env("CHAT_API_KEY")


def _chat_base_url() -> str:
    return _required_env("CHAT_BASE_URL").rstrip("/")


def _chat_model() -> str:
    return _required_env("CHAT_MODEL")


def _chat_timeout_seconds() -> float:
    raw = os.getenv("CHAT_TIMEOUT_SECONDS", "45").strip() or "45"
    try:
        seconds = float(raw)
    except Exception:
        seconds = 45.0
    return min(max(seconds, 5.0), 180.0)


def _build_messages(body: ChatRequest) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": _DEFAULT_SYSTEM_PROMPT}]
    for item in body.history[-_MAX_HISTORY_MESSAGES:]:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": body.message})
    return messages


def _truncate_error(text: str, limit: int = 200) -> str:
    compact = " ".join(text.split()).strip()
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1] + "…"


def _extract_reply_content(message: dict[str, Any]) -> str:
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


def _request_chat_completion(messages: list[dict[str, str]]) -> dict[str, Any]:
    try:
        response = httpx.post(
            f"{_chat_base_url()}/chat/completions",
            headers={
                "Authorization": f"Bearer {_chat_api_key()}",
                "Content-Type": "application/json",
            },
            json={
                "model": _chat_model(),
                "messages": messages,
                "temperature": 0.2,
            },
            timeout=_chat_timeout_seconds(),
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"聊天模型调用失败：{_truncate_error(str(exc)) or '网络错误'}",
        ) from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"聊天模型调用失败：{_truncate_error(response.text) or f'HTTP {response.status_code}'}",
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="聊天模型返回了无效 JSON") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="聊天模型返回格式无效")
    return payload


def _run_chat_completion(messages: list[dict[str, str]]) -> str:
    payload = _request_chat_completion(messages)
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="聊天模型未返回候选结果")

    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get("message")
    if not isinstance(message, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="聊天模型未返回有效消息")

    reply = _extract_reply_content(message)
    if not reply:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="聊天模型未返回有效内容")
    return reply


@router.post("", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> ChatResponse:
    del user
    return ChatResponse(reply=_run_chat_completion(_build_messages(body)))
