from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.agents.chat import router
from routes.agents.models import AgentActionResponse, AgentProfileOut
from routes.auth_routes import get_current_user


@dataclass
class _DummyUser:
    id: int = 7


class _FakePool:
    class _Acquire:
        async def __aenter__(self) -> _FakeConn:
            return _FakeConn()

        async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
            _ = exc_type
            _ = exc
            _ = tb
            return False

    def acquire(self) -> _FakePool._Acquire:
        return self._Acquire()


class _FakeConn:
    pass


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _DummyUser()
    return app


def _profile(profile_id: str = "apf_default", *, temperature: float = 0.2, loops: int = 4) -> AgentProfileOut:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return AgentProfileOut(
        id=profile_id,
        user_id=7,
        name="Ark Agent",
        description="Default profile",
        agent_type="dashboard_agent",
        app_id=None,
        avatar_url=None,
        persona_prompt="你像一个冷静的任务助手。",
        allowed_skills=["task_list", "delete_task"],
        temperature=temperature,
        max_tool_loops=loops,
        is_default=True,
        created_at=now,
        updated_at=now,
    )


async def _fake_default_profile(conn: Any, *, user_id: int) -> AgentProfileOut:
    _ = conn
    assert user_id == 7
    return _profile()


def test_chat_returns_plain_reply(monkeypatch) -> None:
    async def _fake_completion(
        messages: list[dict[str, Any]], tools: list[dict[str, Any]], *, temperature: float = 0.2
    ) -> dict[str, Any]:
        assert temperature == 0.2
        assert tools
        assert messages[-1]["content"] == "你好"
        return {"role": "assistant", "content": "你好，我在。"}

    monkeypatch.setattr("routes.agents.chat.deepseek_chat_completion", _fake_completion)
    monkeypatch.setattr("routes.agents.chat.pool_from_request", lambda _: _FakePool())
    monkeypatch.setattr("routes.agents.chat.get_default_profile", _fake_default_profile)
    client = TestClient(_build_app())
    resp = client.post("/api/chat", json={"message": "你好", "history": []})
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"] == "你好，我在。"
    assert body["approval"] is None


def test_chat_surfaces_approval(monkeypatch) -> None:
    calls = {"count": 0}

    async def _fake_completion(
        messages: list[dict[str, Any]], tools: list[dict[str, Any]], *, temperature: float = 0.2
    ) -> dict[str, Any]:
        assert temperature == 0.2
        calls["count"] += 1
        if calls["count"] == 1:
            return {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "delete_task", "arguments": '{"task_id":"task_1"}'},
                    }
                ],
            }
        return {"role": "assistant", "content": "我已经发起删除审批，请在界面确认。"}

    async def _fake_execute_action(pool: Any, *, action_name: str, ctx: Any, payload: dict[str, Any]) -> Any:
        _ = pool
        _ = ctx
        assert action_name == "task.delete.prepare"
        assert payload == {"task_id": "task_1"}
        return AgentActionResponse(
            type="approval_required",
            action_id="task.delete.prepare",
            approval_id="appr_1",
            title="删除任务",
            message="需要确认",
            commit_action="task.delete.commit",
        )

    monkeypatch.setattr("routes.agents.chat.deepseek_chat_completion", _fake_completion)
    monkeypatch.setattr("routes.agents.chat.execute_action_with_context", _fake_execute_action)
    monkeypatch.setattr("routes.agents.chat.pool_from_request", lambda _: _FakePool())
    monkeypatch.setattr("routes.agents.chat.get_default_profile", _fake_default_profile)
    client = TestClient(_build_app())
    resp = client.post("/api/chat", json={"message": "删掉任务", "history": []})
    assert resp.status_code == 200
    body = resp.json()
    assert "审批" in body["reply"]
    assert body["approval"]["approval_id"] == "appr_1"


def test_chat_tool_definitions_include_arxiv_skills() -> None:
    from routes.agents.chat import tool_definitions

    names = [item["function"]["name"] for item in tool_definitions() if item.get("type") == "function"]
    assert "arxiv_daily_candidates" in names
    assert "arxiv_search" in names
    assert "arxiv_paper_details" in names


def test_chat_tool_definitions_can_be_filtered() -> None:
    from routes.agents.chat import tool_definitions

    names = [item["function"]["name"] for item in tool_definitions(["task_list"]) if item.get("type") == "function"]
    assert "task_list" in names
    assert "approval_commit" in names
    assert "task_update" not in names
    assert "arxiv_search" not in names


def test_chat_passes_allowed_skills_to_model(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    async def _fake_completion(
        messages: list[dict[str, Any]], tools: list[dict[str, Any]], *, temperature: float = 0.2
    ) -> dict[str, Any]:
        captured["system"] = messages[0]["content"]
        captured["tools"] = [tool["function"]["name"] for tool in tools]
        captured["temperature"] = temperature
        return {"role": "assistant", "content": "好的"}

    monkeypatch.setattr("routes.agents.chat.deepseek_chat_completion", _fake_completion)
    monkeypatch.setattr("routes.agents.chat.pool_from_request", lambda _: _FakePool())
    monkeypatch.setattr("routes.agents.chat.get_default_profile", _fake_default_profile)
    client = TestClient(_build_app())
    resp = client.post("/api/chat", json={"message": "查论文", "history": [], "allowed_skills": ["arxiv_search"]})
    assert resp.status_code == 200
    assert captured["tools"] == ["task_list", "delete_task", "approval_commit"]
    assert "task_list" in captured["system"]
    assert "arxiv_search" not in captured["system"]
    assert captured["temperature"] == 0.2


def test_chat_uses_selected_profile(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    async def _fake_completion(messages: list[dict[str, Any]], tools: list[dict[str, Any]], *, temperature: float = 0.2) -> dict[str, Any]:
        captured["system"] = messages[0]["content"]
        captured["tools"] = [tool["function"]["name"] for tool in tools]
        captured["temperature"] = temperature
        return {"role": "assistant", "content": "切换成功"}

    async def _fake_get_profile(conn: Any, *, user_id: int, profile_id: str) -> AgentProfileOut:
        assert user_id == 7
        assert profile_id == "apf_custom"
        return _profile("apf_custom", temperature=0.7, loops=6).model_copy(
            update={
                "name": "Research Agent",
                "persona_prompt": "你像一位学术研究助理。",
                "allowed_skills": ["delete_task"],
            }
        )

    monkeypatch.setattr("routes.agents.chat.deepseek_chat_completion", _fake_completion)
    monkeypatch.setattr("routes.agents.chat.pool_from_request", lambda _: _FakePool())
    monkeypatch.setattr("routes.agents.chat.get_profile_by_id", _fake_get_profile)
    client = TestClient(_build_app())
    resp = client.post("/api/chat", json={"profile_id": "apf_custom", "message": "你好", "history": []})
    assert resp.status_code == 200
    assert captured["tools"] == ["delete_task", "approval_commit"]
    assert "Research Agent" in captured["system"]
    assert captured["temperature"] == 0.7


def test_chat_stream_emits_text_events(monkeypatch) -> None:
    async def _fake_stream(
        messages: list[dict[str, Any]], tools: list[dict[str, Any]], *, temperature: float = 0.2
    ):
        _ = messages
        _ = tools
        assert temperature == 0.2
        for item in [{"content": "你好"}, {"content": "，我是流式助手。"}]:
            yield item

    monkeypatch.setattr("routes.agents.chat.deepseek_chat_completion_stream", _fake_stream)
    monkeypatch.setattr("routes.agents.chat.pool_from_request", lambda _: _FakePool())
    monkeypatch.setattr("routes.agents.chat.get_default_profile", _fake_default_profile)
    client = TestClient(_build_app())
    resp = client.post("/api/chat/stream", json={"message": "你好", "history": []})
    assert resp.status_code == 200
    events = [
        json.loads(line[5:].strip())
        for line in resp.text.splitlines()
        if line.startswith("data:")
    ]
    assert events[0]["type"] == "profile"
    assert events[1] == {"type": "message_delta", "delta": "你好"}
    assert events[2] == {"type": "message_delta", "delta": "，我是流式助手。"}
    assert events[-1]["type"] == "done"
    assert events[-1]["reply"] == "你好，我是流式助手。"


def test_chat_stream_emits_approval_events(monkeypatch) -> None:
    calls = {"count": 0}

    async def _fake_stream(
        messages: list[dict[str, Any]], tools: list[dict[str, Any]], *, temperature: float = 0.2
    ):
        _ = messages
        _ = tools
        assert temperature == 0.2
        calls["count"] += 1
        if calls["count"] == 1:
            yield {
                "tool_calls": [
                    {
                        "index": 0,
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "delete_task", "arguments": '{"task_id":"task_1"}'},
                    }
                ]
            }
            return
        yield {"content": "请先在前端确认删除。"}

    async def _fake_execute_action(pool: Any, *, action_name: str, ctx: Any, payload: dict[str, Any]) -> Any:
        _ = pool
        _ = ctx
        assert action_name == "task.delete.prepare"
        assert payload == {"task_id": "task_1"}
        return AgentActionResponse(
            type="approval_required",
            action_id="task.delete.prepare",
            approval_id="appr_stream_1",
            title="删除任务",
            message="需要确认",
            commit_action="task.delete.commit",
        )

    monkeypatch.setattr("routes.agents.chat.deepseek_chat_completion_stream", _fake_stream)
    monkeypatch.setattr("routes.agents.chat.execute_action_with_context", _fake_execute_action)
    monkeypatch.setattr("routes.agents.chat.pool_from_request", lambda _: _FakePool())
    monkeypatch.setattr("routes.agents.chat.get_default_profile", _fake_default_profile)
    client = TestClient(_build_app())
    resp = client.post("/api/chat/stream", json={"message": "删掉任务", "history": []})
    assert resp.status_code == 200
    events = [
        json.loads(line[5:].strip())
        for line in resp.text.splitlines()
        if line.startswith("data:")
    ]
    assert any(item == {"type": "tool_call", "name": "delete_task"} for item in events)
    approval_events = [item for item in events if item.get("type") == "approval_required"]
    assert approval_events
    assert approval_events[0]["approval"]["approval_id"] == "appr_stream_1"
    assert events[-1]["type"] == "done"
    assert events[-1]["approval"]["approval_id"] == "appr_stream_1"
