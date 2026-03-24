from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.agents.chat import router
from routes.agents.models import AgentActionResponse
from routes.auth_routes import get_current_user


@dataclass
class _DummyUser:
    id: int = 7


class _FakePool:
    def acquire(self) -> None:
        raise AssertionError("This test monkeypatches action execution and should not touch the DB pool directly")


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _DummyUser()
    return app


def test_chat_returns_plain_reply(monkeypatch) -> None:
    async def _fake_completion(messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        assert tools
        assert messages[-1]["content"] == "你好"
        return {"role": "assistant", "content": "你好，我在。"}

    monkeypatch.setattr("routes.agents.chat.deepseek_chat_completion", _fake_completion)
    monkeypatch.setattr("routes.agents.chat.pool_from_request", lambda _: _FakePool())
    client = TestClient(_build_app())
    resp = client.post("/api/chat", json={"message": "你好", "history": []})
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"] == "你好，我在。"
    assert body["approval"] is None


def test_chat_surfaces_approval(monkeypatch) -> None:
    calls = {"count": 0}

    async def _fake_completion(messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
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

    async def _fake_completion(messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        captured["system"] = messages[0]["content"]
        captured["tools"] = [tool["function"]["name"] for tool in tools]
        return {"role": "assistant", "content": "好的"}

    monkeypatch.setattr("routes.agents.chat.deepseek_chat_completion", _fake_completion)
    monkeypatch.setattr("routes.agents.chat.pool_from_request", lambda _: _FakePool())
    client = TestClient(_build_app())
    resp = client.post("/api/chat", json={"message": "查论文", "history": [], "allowed_skills": ["arxiv_search"]})
    assert resp.status_code == 200
    assert captured["tools"] == ["arxiv_search", "approval_commit"]
    assert "arxiv_search" in captured["system"]
    assert "task_update" not in captured["system"]
