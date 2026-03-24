from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.agent_routes import router
from routes.auth_routes import get_current_user


@dataclass
class _DummyUser:
    id: int = 7


class _TxCtx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None


class _AcquireCtx:
    def __init__(self, conn: _FakeAgentConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeAgentConn:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _FakeAgentConn:
    def __init__(self) -> None:
        self.approvals: dict[str, dict[str, Any]] = {}
        self.task_id = str(uuid4())
        self.task_title = "Write tests"
        self.deleted = False

    async def fetchrow(self, sql: str, *args: Any) -> dict[str, Any] | None:
        if "FROM tasks" in sql:
            task_id, user_id = str(args[0]), int(args[1])
            include_deleted = bool(args[2]) if len(args) > 2 else False
            if user_id != 7 or task_id != self.task_id or (self.deleted and not include_deleted):
                return None
            now = datetime.now(UTC)
            return {
                "id": uuid4() if task_id == "other" else args[0],
                "user_id": user_id,
                "title": self.task_title,
                "content": None,
                "status": "todo",
                "priority": 1,
                "target_duration": 1500,
                "current_cycle_count": 0,
                "target_cycle_count": 1,
                "cycle_period": "daily",
                "cycle_every_days": None,
                "event": "",
                "event_ids": [],
                "task_type": "focus",
                "tags": [],
                "actual_duration": 0,
                "start_date": None,
                "due_date": None,
                "is_deleted": self.deleted,
                "created_at": now,
                "updated_at": now,
            }
        if "FROM agent_approvals" in sql:
            approval_id = str(args[0])
            user_id = int(args[1])
            row = self.approvals.get(approval_id)
            if row is None or int(row["user_id"]) != user_id:
                return None
            return row
        return None

    async def execute(self, sql: str, *args: Any) -> str:
        if "INSERT INTO agent_approvals" in sql:
            approval_id = str(args[0])
            self.approvals[approval_id] = {
                "id": approval_id,
                "user_id": int(args[1]),
                "agent_type": str(args[2]),
                "app_id": args[3],
                "session_id": args[4],
                "action_id": str(args[5]),
                "payload_json": {"task_id": self.task_id},
                "status": "pending",
                "expires_at": args[9],
            }
            return "INSERT 1"
        if "SET status = 'expired'" in sql:
            approval_id = str(args[0])
            if approval_id in self.approvals:
                self.approvals[approval_id]["status"] = "expired"
            return "UPDATE 1"
        if "SET status = 'confirmed'" in sql:
            approval_id = str(args[0])
            if approval_id in self.approvals:
                self.approvals[approval_id]["status"] = "confirmed"
                self.approvals[approval_id]["confirmed_at"] = datetime.now(UTC)
            return "UPDATE 1"
        if "UPDATE tasks" in sql and "SET is_deleted = TRUE" in sql:
            task_id = str(args[0])
            user_id = int(args[1])
            if user_id == 7 and task_id == self.task_id and not self.deleted:
                self.deleted = True
                return "UPDATE 1"
            return "UPDATE 0"
        return "OK"

    def transaction(self) -> _TxCtx:
        return _TxCtx()


class _FakePool:
    def __init__(self, conn: _FakeAgentConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _DummyUser()
    return app


def test_list_agent_skills_smoke(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agent_routes._pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.get("/api/agent/skills")
    assert resp.status_code == 200
    names = [item["name"] for item in resp.json()]
    assert "delete_task" in names
    assert "task_update" in names


def test_task_delete_prepare_forbidden_for_app_agent(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agent_routes._pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/actions/task.delete.prepare",
        headers={"X-Ark-Agent-Type": "app_agent:arxiv", "X-Ark-App-Id": "arxiv"},
        json={"payload": {"task_id": conn.task_id}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "forbidden"


def test_task_list_summary_requires_capability(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agent_routes._pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/actions/task.list",
        headers={"X-Ark-Agent-Type": "app_agent:arxiv", "X-Ark-App-Id": "arxiv"},
        json={"payload": {}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "forbidden"


def test_task_list_summary_with_capability(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agent_routes._pool_from_request", lambda _: _FakePool(conn))

    async def _fake_list_tasks(conn: Any, *, user_id: int, payload: dict[str, Any], summary_only: bool) -> dict[str, Any]:
        assert user_id == 7
        assert summary_only is True
        return {
            "items": [{"id": "task_1", "title": "Summary", "status": "todo", "priority": 1, "due_date": None}],
            "view": "summary",
        }

    monkeypatch.setattr("routes.agent_routes._list_tasks_action", _fake_list_tasks)
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/actions/task.list",
        headers={
            "X-Ark-Agent-Type": "app_agent:arxiv",
            "X-Ark-App-Id": "arxiv",
            "X-Ark-Capabilities": "cross_app.read.summary",
        },
        json={"payload": {}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "result"
    assert body["data"]["view"] == "summary"


def test_task_delete_prepare_and_commit(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agent_routes._pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())

    prepare = client.post(
        "/api/agent/actions/task.delete.prepare",
        headers={"X-Ark-Agent-Type": "dashboard_agent"},
        json={"payload": {"task_id": conn.task_id}},
    )
    assert prepare.status_code == 200
    prepare_body = prepare.json()
    assert prepare_body["type"] == "approval_required"
    approval_id = prepare_body["approval_id"]
    assert approval_id in conn.approvals

    commit = client.post(
        "/api/agent/actions/task.delete.commit",
        headers={"X-Ark-Agent-Type": "dashboard_agent"},
        json={"payload": {"approval_id": approval_id}},
    )
    assert commit.status_code == 200
    commit_body = commit.json()
    assert commit_body["type"] == "result"
    assert commit_body["data"]["ok"] is True
    assert conn.deleted is True

    second_commit = client.post(
        "/api/agent/actions/task.delete.commit",
        headers={"X-Ark-Agent-Type": "dashboard_agent"},
        json={"payload": {"approval_id": approval_id}},
    )
    assert second_commit.status_code == 200
    assert second_commit.json()["type"] == "forbidden"


def test_task_delete_commit_rejects_expired_approval(monkeypatch) -> None:
    conn = _FakeAgentConn()
    expired_id = "appr_expired"
    conn.approvals[expired_id] = {
        "id": expired_id,
        "user_id": 7,
        "agent_type": "dashboard_agent",
        "app_id": None,
        "session_id": None,
        "action_id": "task.delete",
        "payload_json": {"task_id": conn.task_id},
        "status": "pending",
        "expires_at": datetime.now(UTC) - timedelta(minutes=1),
    }
    monkeypatch.setattr("routes.agent_routes._pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/actions/task.delete.commit",
        headers={"X-Ark-Agent-Type": "dashboard_agent"},
        json={"payload": {"approval_id": expired_id}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "forbidden"
