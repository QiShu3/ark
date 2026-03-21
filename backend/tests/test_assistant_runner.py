from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from MCP.assistant_runner import (
    _build_builtin_tools_payload,
    _builtin_event_primary,
    _builtin_events_list,
    _is_daily_allowed_tool_name,
    chat_with_tools_stream,
)
from MCP.mcp_registry import MCPRegistry


@dataclass
class _DummyUser:
    id: int = 7


class _AcquireCtx:
    def __init__(self, conn: _FakeAssistantConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeAssistantConn:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _FakeAssistantConn:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def fetch(self, sql: str, *args):
        if "FROM events" in sql and "ORDER BY due_at ASC" in sql:
            user_id = args[0]
            rows = [event for event in self.events if event["user_id"] == user_id]
            return sorted(rows, key=lambda event: (event["due_at"], -event["created_at"].timestamp()))
        return []

    async def fetchrow(self, sql: str, *args):
        if "FROM events" in sql and "is_primary = TRUE" in sql:
            user_id = args[0]
            return next((event for event in self.events if event["user_id"] == user_id and event["is_primary"]), None)
        return None


class _FakePool:
    def __init__(self, conn: _FakeAssistantConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def _make_request(pool: _FakePool | None, token: str = "token") -> SimpleNamespace:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    app = SimpleNamespace(state=SimpleNamespace(auth_pool=pool))
    return SimpleNamespace(headers=headers, app=app)


async def _fake_auth_user(pool, token):
    return _DummyUser()


def test_daily_tool_permission_allows_list_and_add() -> None:
    assert _is_daily_allowed_tool_name("todo__list_today")
    assert _is_daily_allowed_tool_name("todo__create_task")
    assert _is_daily_allowed_tool_name("arxiv__daily_prepare_add_tasks")


def test_daily_tool_permission_denies_delete() -> None:
    assert not _is_daily_allowed_tool_name("todo__delete_task")


def test_build_builtin_tools_includes_event_tools_only_in_general_scope() -> None:
    registry = MCPRegistry([], allowlist={"todo": {"list_today", "event_primary", "events_list"}})

    general_payload, _ = _build_builtin_tools_payload(registry, scope="general")
    daily_payload, _ = _build_builtin_tools_payload(registry, scope="daily")

    general_names = {tool["function"]["name"] for tool in general_payload}
    daily_names = {tool["function"]["name"] for tool in daily_payload}

    assert "todo__event_primary" in general_names
    assert "todo__events_list" in general_names
    assert "todo__event_primary" not in daily_names
    assert "todo__events_list" not in daily_names


@pytest.mark.asyncio
async def test_builtin_event_primary_returns_primary_event(monkeypatch) -> None:
    now = datetime(2026, 3, 20, tzinfo=UTC)
    conn = _FakeAssistantConn()
    conn.events = [
        {
            "id": uuid4(),
            "user_id": 7,
            "name": "论文冲刺",
            "due_at": datetime(2026, 3, 25, tzinfo=UTC),
            "created_at": now,
            "is_primary": True,
        },
        {
            "id": uuid4(),
            "user_id": 8,
            "name": "Other",
            "due_at": datetime(2026, 3, 24, tzinfo=UTC),
            "created_at": now,
            "is_primary": True,
        },
    ]
    request = _make_request(_FakePool(conn))
    monkeypatch.setattr("MCP.assistant_runner._auth_user_from_token", _fake_auth_user)

    raw = await _builtin_event_primary(request)
    data = json.loads(raw)

    assert data["primary_event"]["name"] == "论文冲刺"
    assert data["primary_event"]["is_primary"] is True


@pytest.mark.asyncio
async def test_builtin_event_primary_returns_null_without_primary(monkeypatch) -> None:
    conn = _FakeAssistantConn()
    request = _make_request(_FakePool(conn))
    monkeypatch.setattr("MCP.assistant_runner._auth_user_from_token", _fake_auth_user)

    raw = await _builtin_event_primary(request)

    assert json.loads(raw) == {"primary_event": None}


@pytest.mark.asyncio
async def test_builtin_events_list_returns_user_events(monkeypatch) -> None:
    now = datetime(2026, 3, 20, tzinfo=UTC)
    first_id = uuid4()
    second_id = uuid4()
    conn = _FakeAssistantConn()
    conn.events = [
        {
            "id": first_id,
            "user_id": 7,
            "name": "答辩",
            "due_at": datetime(2026, 3, 21, tzinfo=UTC),
            "created_at": now,
            "is_primary": False,
        },
        {
            "id": second_id,
            "user_id": 7,
            "name": "开题",
            "due_at": datetime(2026, 3, 22, tzinfo=UTC),
            "created_at": now,
            "is_primary": True,
        },
        {
            "id": uuid4(),
            "user_id": 8,
            "name": "Other",
            "due_at": datetime(2026, 3, 19, tzinfo=UTC),
            "created_at": now,
            "is_primary": True,
        },
    ]
    request = _make_request(_FakePool(conn))
    monkeypatch.setattr("MCP.assistant_runner._auth_user_from_token", _fake_auth_user)

    raw = await _builtin_events_list(request)
    data = json.loads(raw)

    assert [event["name"] for event in data["events"]] == ["答辩", "开题"]
    assert all(event["id"] in {str(first_id), str(second_id)} for event in data["events"])


@pytest.mark.asyncio
async def test_builtin_event_tools_require_login(monkeypatch) -> None:
    request = _make_request(None, token="")
    monkeypatch.setattr("MCP.assistant_runner._auth_user_from_token", _fake_auth_user)

    primary = await _builtin_event_primary(request)
    events = await _builtin_events_list(request)

    assert primary == "未登录，无法查询主事件"
    assert events == "未登录，无法查询事件列表"


# ─── Streaming tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stream_text_only_yields_delta_and_done(monkeypatch) -> None:
    """当模型直接返回文本（无 tool_calls），应 yield 多个 delta 和一个 done。"""
    registry = MCPRegistry([], allowlist={})

    async def fake_chat(messages, tools):
        return {"content": "你好世界", "role": "assistant"}

    monkeypatch.setattr("MCP.assistant_runner._call_deepseek_chat", fake_chat)
    request = _make_request(None, token="")

    events = []
    async for evt in chat_with_tools_stream([{"role": "user", "content": "hi"}], request, registry):
        events.append(evt)

    types = [e["type"] for e in events]
    assert "delta" in types
    assert types[-1] == "done"
    full_text = "".join(e["content"] for e in events if e["type"] == "delta")
    assert full_text == "你好世界"


@pytest.mark.asyncio
async def test_stream_with_tool_call_yields_tool_call_event(monkeypatch) -> None:
    """当模型先返回 tool_calls 再返回文本，应先 yield tool_call 再 yield delta+done。"""
    registry = MCPRegistry([], allowlist={"todo": {"list_today"}})
    call_count = 0

    async def fake_chat(messages, tools):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return {
                "role": "assistant",
                "content": None,
                "tool_calls": [{"id": "tc_1", "function": {"name": "todo__list_today", "arguments": "{}"}}],
            }
        return {"content": "完成", "role": "assistant"}

    async def fake_todo_list(req):
        return json.dumps({"today_tasks": []})

    monkeypatch.setattr("MCP.assistant_runner._call_deepseek_chat", fake_chat)
    monkeypatch.setattr("MCP.assistant_runner._builtin_todo_list_today", fake_todo_list)
    request = _make_request(None, token="tok")

    events = []
    async for evt in chat_with_tools_stream([{"role": "user", "content": "hi"}], request, registry):
        events.append(evt)

    types = [e["type"] for e in events]
    assert "tool_call" in types
    assert "delta" in types
    assert types[-1] == "done"
    tc_event = next(e for e in events if e["type"] == "tool_call")
    assert tc_event["name"] == "todo__list_today"


@pytest.mark.asyncio
async def test_stream_confirm_action_yields_actions_event(monkeypatch) -> None:
    """当内置工具返回 confirm action，流应 yield actions 事件。"""
    registry = MCPRegistry([], allowlist={"todo": {"list_today", "focus_start"}})
    call_count = 0

    async def fake_chat(messages, tools):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {"id": "tc_1", "function": {"name": "todo__focus_start", "arguments": '{"task_id":"abc"}'}}
                ],
            }
        return {"content": "好的", "role": "assistant"}

    async def fake_focus_start(req, args):
        return json.dumps({"action": "confirm", "operation": "focus_start", "title": "开始专注"})

    monkeypatch.setattr("MCP.assistant_runner._call_deepseek_chat", fake_chat)
    monkeypatch.setattr("MCP.assistant_runner._builtin_focus_start", fake_focus_start)
    request = _make_request(None, token="tok")

    events = []
    async for evt in chat_with_tools_stream([{"role": "user", "content": "开始"}], request, registry):
        events.append(evt)

    types = [e["type"] for e in events]
    assert "actions" in types
    actions_evt = next(e for e in events if e["type"] == "actions")
    assert actions_evt["actions"][0]["operation"] == "focus_start"


@pytest.mark.asyncio
async def test_stream_empty_reply_still_yields_done(monkeypatch) -> None:
    """即使模型返回空回复，流也应正常结束并 yield done。"""
    registry = MCPRegistry([], allowlist={})

    async def fake_chat(messages, tools):
        return {"content": "", "role": "assistant"}

    monkeypatch.setattr("MCP.assistant_runner._call_deepseek_chat", fake_chat)
    request = _make_request(None, token="")

    events = []
    async for evt in chat_with_tools_stream([{"role": "user", "content": "hi"}], request, registry):
        events.append(evt)

    types = [e["type"] for e in events]
    assert types[-1] == "done"
    assert "delta" not in types
