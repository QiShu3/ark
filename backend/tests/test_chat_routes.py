from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.auth_routes import get_current_user
from routes.chat_routes import router


@dataclass
class _DummyUser:
    id: int = 7
    username: str = "tester"
    is_active: bool = True
    is_admin: bool = False
    created_at: datetime = datetime(2026, 1, 1, tzinfo=UTC)


def _build_app(*, authenticated: bool = True) -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    if authenticated:
        app.dependency_overrides[get_current_user] = lambda: _DummyUser()
    return app


def test_chat_requires_authentication() -> None:
    app = _build_app(authenticated=False)
    client = TestClient(app)

    response = client.post("/api/chat", json={"message": "你好"})

    assert response.status_code == 401
    assert response.json()["detail"] == "未登录"


def test_chat_returns_reply(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    def _fake_run(messages: list[dict[str, str]]) -> str:
        captured["messages"] = messages
        return "结构化结果"

    monkeypatch.setattr("routes.chat_routes._run_chat_completion", _fake_run)

    app = _build_app()
    client = TestClient(app)

    response = client.post(
        "/api/chat",
        json={
            "message": "请帮我整理任务",
            "history": [
                {"role": "user", "content": "昨天还有什么没做？"},
                {"role": "assistant", "content": "还剩论文阅读。"},
            ],
            "scope": "general",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"reply": "结构化结果"}
    assert captured["messages"] == [
        {"role": "system", "content": "你是一个简洁可靠的中文助手。按用户要求直接回答，不要添加多余包装。"},
        {"role": "user", "content": "昨天还有什么没做？"},
        {"role": "assistant", "content": "还剩论文阅读。"},
        {"role": "user", "content": "请帮我整理任务"},
    ]


def test_chat_accepts_missing_history_and_ignores_extra_fields(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    def _fake_run(messages: list[dict[str, str]]) -> str:
        captured["messages"] = messages
        return "翻译结果"

    monkeypatch.setattr("routes.chat_routes._run_chat_completion", _fake_run)

    app = _build_app()
    client = TestClient(app)

    response = client.post(
        "/api/chat",
        json={
            "message": "Translate this abstract.",
            "profile_id": "ignored-profile",
            "allowed_skills": ["ignored-skill"],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"reply": "翻译结果"}
    assert captured["messages"] == [
        {"role": "system", "content": "你是一个简洁可靠的中文助手。按用户要求直接回答，不要添加多余包装。"},
        {"role": "user", "content": "Translate this abstract."},
    ]


def test_chat_returns_error_when_api_key_missing(monkeypatch) -> None:
    monkeypatch.delenv("CHAT_API_KEY", raising=False)
    monkeypatch.setenv("CHAT_BASE_URL", "https://example.com/v1")
    monkeypatch.setenv("CHAT_MODEL", "test-model")

    app = _build_app()
    client = TestClient(app)

    response = client.post("/api/chat", json={"message": "你好"})

    assert response.status_code == 503
    assert response.json()["detail"] == "CHAT_API_KEY 未配置"


def test_chat_returns_502_when_upstream_response_is_empty(monkeypatch) -> None:
    def _fake_request(messages: list[dict[str, str]]) -> dict[str, Any]:
        return {"choices": []}

    monkeypatch.setattr("routes.chat_routes._request_chat_completion", _fake_request)
    monkeypatch.setenv("CHAT_API_KEY", "test-key")
    monkeypatch.setenv("CHAT_BASE_URL", "https://example.com/v1")
    monkeypatch.setenv("CHAT_MODEL", "test-model")

    app = _build_app()
    client = TestClient(app)

    response = client.post("/api/chat", json={"message": "你好"})

    assert response.status_code == 502
    assert response.json()["detail"] == "聊天模型未返回候选结果"


def test_chat_keeps_recent_history_only(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    def _fake_run(messages: list[dict[str, str]]) -> str:
        captured["messages"] = messages
        return "ok"

    monkeypatch.setattr("routes.chat_routes._run_chat_completion", _fake_run)

    history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"msg-{i}"} for i in range(14)]

    app = _build_app()
    client = TestClient(app)

    response = client.post("/api/chat", json={"message": "latest", "history": history})

    assert response.status_code == 200
    assert [item["content"] for item in captured["messages"]] == [
        "你是一个简洁可靠的中文助手。按用户要求直接回答，不要添加多余包装。",
        "msg-2",
        "msg-3",
        "msg-4",
        "msg-5",
        "msg-6",
        "msg-7",
        "msg-8",
        "msg-9",
        "msg-10",
        "msg-11",
        "msg-12",
        "msg-13",
        "latest",
    ]
