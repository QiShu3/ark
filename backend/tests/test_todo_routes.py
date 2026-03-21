from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.auth_routes import get_current_user
from routes.todo_routes import router


@dataclass
class _DummyUser:
    id: int = 7


class _TxCtx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None


class _AcquireCtx:
    def __init__(self, conn: _FakeTodoConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeTodoConn:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _FakeTodoConn:
    def __init__(self) -> None:
        self.stats_rows: list[dict[str, Any]] = []
        self.events: list[dict[str, Any]] = []

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        if "WITH bounds AS" in sql and "FROM log_durations ld" in sql:
            # Check user_id
            if args[0] != 7:
                return []
            return self.stats_rows
        if "FROM events" in sql and "ORDER BY due_at ASC" in sql:
            user_id = args[0]
            rows = [event for event in self.events if event["user_id"] == user_id]
            return sorted(rows, key=lambda event: (event["due_at"], -event["created_at"].timestamp()))
        return []

    async def fetchrow(self, sql: str, *args: Any) -> dict[str, Any] | None:
        if "INSERT INTO events" in sql:
            event_id = uuid4()
            now = datetime.now(UTC)
            row = {
                "id": event_id,
                "user_id": args[0],
                "name": args[1],
                "due_at": args[2],
                "is_primary": args[3],
                "created_at": now,
                "updated_at": now,
            }
            self.events.append(row)
            return row
        if "FROM events" in sql and "is_primary = TRUE" in sql:
            user_id = args[0]
            return next((event for event in self.events if event["user_id"] == user_id and event["is_primary"]), None)
        if "FROM events" in sql and "WHERE id = $1 AND user_id = $2" in sql:
            event_id, user_id = args[0], args[1]
            return next(
                (event for event in self.events if event["id"] == event_id and event["user_id"] == user_id), None
            )
        if "UPDATE events" in sql and "RETURNING id, user_id, name, due_at, is_primary, created_at, updated_at" in sql:
            event_id, user_id = args[-2], args[-1]
            event = next((item for item in self.events if item["id"] == event_id and item["user_id"] == user_id), None)
            if event is None:
                return None
            if "name = $1" in sql:
                event["name"] = args[0]
            if "due_at = $2" in sql:
                event["due_at"] = args[1]
            elif "due_at = $1" in sql:
                event["due_at"] = args[0]
            if "is_primary = $3" in sql:
                event["is_primary"] = args[2]
            elif "is_primary = $2" in sql:
                event["is_primary"] = args[1]
            elif "is_primary = $1" in sql:
                event["is_primary"] = args[0]
            event["updated_at"] = datetime.now(UTC)
            return event
        return None

    async def execute(self, sql: str, *args: Any) -> str:
        if "UPDATE events" in sql and "SET is_primary = FALSE" in sql:
            user_id = args[0]
            exclude_id = args[1] if len(args) > 1 else None
            for event in self.events:
                if event["user_id"] == user_id and event["is_primary"] and event["id"] != exclude_id:
                    event["is_primary"] = False
                    event["updated_at"] = datetime.now(UTC)
            return "UPDATE 1"
        if sql.startswith("DELETE FROM events"):
            event_id, user_id = args
            before = len(self.events)
            self.events = [
                event for event in self.events if not (event["id"] == event_id and event["user_id"] == user_id)
            ]
            deleted = before - len(self.events)
            return f"DELETE {deleted}"
        return "UPDATE 1"

    def transaction(self):
        return _TxCtx()


class _FakePool:
    def __init__(self, conn: _FakeTodoConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _DummyUser()
    return app


def test_get_focus_stats_today(monkeypatch) -> None:
    conn = _FakeTodoConn()
    task_id = uuid4()
    conn.stats_rows = [{"id": task_id, "title": "Task 1", "total_duration": 3600}]

    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/stats?range=today")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_duration"] == 3600
    assert len(data["tasks"]) == 1
    assert data["tasks"][0]["title"] == "Task 1"
    assert data["tasks"][0]["duration"] == 3600


def test_get_focus_stats_week(monkeypatch) -> None:
    conn = _FakeTodoConn()
    task_id1 = uuid4()
    task_id2 = uuid4()
    conn.stats_rows = [
        {"id": task_id1, "title": "Task 1", "total_duration": 3600},
        {"id": task_id2, "title": "Task 2", "total_duration": 1800},
    ]

    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/stats?range=week")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_duration"] == 5400
    assert len(data["tasks"]) == 2


def test_get_focus_stats_month(monkeypatch) -> None:
    conn = _FakeTodoConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/stats?range=month")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_duration"] == 0
    assert len(data["tasks"]) == 0


def test_get_focus_stats_invalid_range(monkeypatch) -> None:
    conn = _FakeTodoConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/stats?range=year")
    assert resp.status_code == 422


def test_create_event_can_be_primary(monkeypatch) -> None:
    conn = _FakeTodoConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    due_at = "2026-03-20T08:00:00Z"
    resp = client.post("/todo/events", json={"name": "DDL", "due_at": due_at, "is_primary": True})

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "DDL"
    assert data["is_primary"] is True
    assert len(conn.events) == 1


def test_list_events_isolated_by_user(monkeypatch) -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    conn.events = [
        {
            "id": uuid4(),
            "user_id": 7,
            "name": "Mine",
            "due_at": datetime(2026, 3, 20, tzinfo=UTC),
            "is_primary": False,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": uuid4(),
            "user_id": 8,
            "name": "Other",
            "due_at": datetime(2026, 3, 21, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        },
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/events")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Mine"


def test_update_event_primary_clears_previous_primary(monkeypatch) -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    first_id = uuid4()
    second_id = uuid4()
    conn.events = [
        {
            "id": first_id,
            "user_id": 7,
            "name": "First",
            "due_at": datetime(2026, 3, 20, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": second_id,
            "user_id": 7,
            "name": "Second",
            "due_at": datetime(2026, 3, 21, tzinfo=UTC),
            "is_primary": False,
            "created_at": now,
            "updated_at": now,
        },
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.patch(f"/todo/events/{second_id}", json={"is_primary": True})
    assert resp.status_code == 200
    assert resp.json()["is_primary"] is True
    assert next(event for event in conn.events if event["id"] == first_id)["is_primary"] is False
    assert next(event for event in conn.events if event["id"] == second_id)["is_primary"] is True


def test_get_primary_event_returns_404_when_missing(monkeypatch) -> None:
    conn = _FakeTodoConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/events/primary")
    assert resp.status_code == 404


def test_delete_primary_event_leaves_no_primary(monkeypatch) -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    event_id = uuid4()
    conn.events = [
        {
            "id": event_id,
            "user_id": 7,
            "name": "Main",
            "due_at": datetime(2026, 3, 20, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        }
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    delete_resp = client.delete(f"/todo/events/{event_id}")
    assert delete_resp.status_code == 200

    primary_resp = client.get("/todo/events/primary")
    assert primary_resp.status_code == 404


class _WorkflowConn:
    def __init__(self) -> None:
        self.task_id = uuid4()
        self.workflow = {
            "id": uuid4(),
            "user_id": 7,
            "task_id": self.task_id,
            "workflow_name": "测试流",
            "phases": [{"phase_type": "focus", "duration": 1500}, {"phase_type": "break", "duration": 300}],
            "current_phase_index": 0,
            "focus_duration": 1500,
            "break_duration": 300,
            "current_phase": "focus",
            "phase_started_at": datetime.now(UTC),
            "phase_planned_duration": 1500,
            "pending_confirmation": True,
        }

    async def fetchrow(self, sql: str, *args: Any) -> dict[str, Any] | None:
        if "SELECT title FROM tasks" in sql:
            return {"title": "Task A"}
        if "FROM focus_workflows" in sql and "WHERE id = $1" in sql:
            return self.workflow
        return None

    async def execute(self, sql: str, *args: Any) -> str:
        if "SET current_phase = $1" in sql:
            self.workflow["current_phase"] = str(args[0])
            self.workflow["current_phase_index"] = int(args[1])
            self.workflow["phase_planned_duration"] = int(args[2])
            self.workflow["pending_confirmation"] = False
            self.workflow["phase_started_at"] = datetime.now(UTC)
        return "UPDATE 1"

    def transaction(self):
        return _TxCtx()


class _WorkflowPool:
    def __init__(self, conn: _WorkflowConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def test_ai_create_workflow_requires_authorization() -> None:
    app = _build_app()
    client = TestClient(app)
    resp = client.post(
        "/todo/focus/workflow/ai-create",
        json={"task_id": str(uuid4()), "focus_duration": 1500, "break_duration": 300},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "AI 创建工作流需要用户授权"


def test_get_focus_workflow_current_returns_normal_when_none(monkeypatch) -> None:
    conn = _WorkflowConn()
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    async def _mock_sync(_conn: Any, _user_id: int):
        return None

    monkeypatch.setattr("routes.todo_routes._sync_active_focus_workflow", _mock_sync)
    app = _build_app()
    client = TestClient(app)
    resp = client.get("/todo/focus/workflow/current")
    assert resp.status_code == 200
    assert resp.json()["state"] == "normal"


def test_confirm_focus_workflow_transition_to_break(monkeypatch) -> None:
    conn = _WorkflowConn()
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    async def _mock_sync(_conn: Any, _user_id: int):
        return conn.workflow

    monkeypatch.setattr("routes.todo_routes._sync_active_focus_workflow", _mock_sync)
    app = _build_app()
    client = TestClient(app)
    resp = client.post("/todo/focus/workflow/confirm")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "break"
    assert data["pending_confirmation"] is False
    assert data["task_title"] == "Task A"


def test_confirm_focus_workflow_supports_string_phases(monkeypatch) -> None:
    conn = _WorkflowConn()
    conn.workflow["phases"] = json.dumps(conn.workflow["phases"])
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    async def _mock_sync(_conn: Any, _user_id: int):
        return conn.workflow

    monkeypatch.setattr("routes.todo_routes._sync_active_focus_workflow", _mock_sync)
    app = _build_app()
    client = TestClient(app)
    resp = client.post("/todo/focus/workflow/confirm")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "break"
    assert len(data["phases"]) == 2


def test_confirm_focus_workflow_fallbacks_when_phases_invalid(monkeypatch) -> None:
    conn = _WorkflowConn()
    conn.workflow["phases"] = '[{"phase_type":"focus","duration":"1500.5"},{"phase_type":"break","duration":300}]'
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    async def _mock_sync(_conn: Any, _user_id: int):
        return conn.workflow

    monkeypatch.setattr("routes.todo_routes._sync_active_focus_workflow", _mock_sync)
    app = _build_app()
    client = TestClient(app)
    resp = client.post("/todo/focus/workflow/confirm")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "break"
    assert data["phase_planned_duration"] == 300


def test_confirm_focus_workflow_fallbacks_when_index_invalid(monkeypatch) -> None:
    conn = _WorkflowConn()
    conn.workflow["phases"] = '[{"phase_type":"focus","duration":"oops"},{"phase_type":"break","duration":"300"}]'
    conn.workflow["current_phase_index"] = "oops"
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    async def _mock_sync(_conn: Any, _user_id: int):
        return conn.workflow

    monkeypatch.setattr("routes.todo_routes._sync_active_focus_workflow", _mock_sync)
    app = _build_app()
    client = TestClient(app)
    resp = client.post("/todo/focus/workflow/confirm")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "break"
    assert data["current_phase_index"] == 1


class _WorkflowPresetConn:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        if "FROM focus_workflow_presets" in sql and "ORDER BY is_default DESC" in sql:
            user_id = int(args[0])
            items = [row for row in self.rows if int(row["user_id"]) == user_id]
            return sorted(items, key=lambda row: (not bool(row["is_default"]), -row["updated_at"].timestamp()))
        return []

    async def fetchrow(self, sql: str, *args: Any) -> dict[str, Any] | None:
        if "WHERE user_id = $1 AND is_default = TRUE" in sql:
            user_id = int(args[0])
            return next((row for row in self.rows if int(row["user_id"]) == user_id and bool(row["is_default"])), None)
        if "INSERT INTO focus_workflow_presets" in sql:
            now = datetime.now(UTC)
            phases_arg = args[4]
            phases = json.loads(phases_arg) if isinstance(phases_arg, str) else phases_arg
            row = {
                "id": uuid4(),
                "user_id": int(args[0]),
                "name": str(args[1]),
                "focus_duration": int(args[2]),
                "break_duration": int(args[3]),
                "phases": phases,
                "is_default": bool(args[5]),
                "created_at": now,
                "updated_at": now,
            }
            self.rows.append(row)
            return row
        if "SELECT id, is_default FROM focus_workflow_presets" in sql:
            preset_id = args[0]
            user_id = int(args[1])
            return next((row for row in self.rows if row["id"] == preset_id and int(row["user_id"]) == user_id), None)
        if "SELECT id, user_id, name, focus_duration, break_duration, phases, is_default, created_at, updated_at" in sql and "WHERE id = $1 AND user_id = $2" in sql:
            preset_id = args[0]
            user_id = int(args[1])
            return next((row for row in self.rows if row["id"] == preset_id and int(row["user_id"]) == user_id), None)
        if "UPDATE focus_workflow_presets" in sql and "RETURNING id, user_id, name, focus_duration, break_duration, phases, is_default, created_at, updated_at" in sql:
            if "SET is_default = TRUE" in sql:
                preset_id = args[0]
                user_id = int(args[1])
                target = next((row for row in self.rows if row["id"] == preset_id and int(row["user_id"]) == user_id), None)
                if target is None:
                    return None
                target["is_default"] = True
                target["updated_at"] = datetime.now(UTC)
                return target
            preset_id = args[-2]
            user_id = int(args[-1])
            target = next((row for row in self.rows if row["id"] == preset_id and int(row["user_id"]) == user_id), None)
            if target is None:
                return None
            if "name =" in sql:
                target["name"] = str(args[0])
            if "focus_duration =" in sql:
                target["focus_duration"] = int(args[1 if "name =" in sql else 0])
            if "break_duration =" in sql:
                idx = 2 if "name =" in sql else (1 if "focus_duration =" in sql else 0)
                target["break_duration"] = int(args[idx])
            if "phases =" in sql:
                phases_arg = args[-4] if "is_default =" in sql else args[-3]
                target["phases"] = json.loads(phases_arg) if isinstance(phases_arg, str) else phases_arg
            if "is_default =" in sql:
                target["is_default"] = bool(args[-3])
            target["updated_at"] = datetime.now(UTC)
            return target
        if "SELECT id" in sql and "FROM focus_workflow_presets" in sql and "LIMIT 1" in sql:
            user_id = int(args[0])
            items = [row for row in self.rows if int(row["user_id"]) == user_id]
            if not items:
                return None
            items.sort(key=lambda row: row["updated_at"], reverse=True)
            return {"id": items[0]["id"]}
        return None

    async def execute(self, sql: str, *args: Any) -> str:
        if "UPDATE focus_workflow_presets SET is_default = FALSE" in sql:
            user_id = int(args[0])
            for row in self.rows:
                if int(row["user_id"]) == user_id:
                    row["is_default"] = False
                    row["updated_at"] = datetime.now(UTC)
            return "UPDATE 1"
        if sql.startswith("DELETE FROM focus_workflow_presets"):
            preset_id = args[0]
            user_id = int(args[1])
            before = len(self.rows)
            self.rows = [row for row in self.rows if not (row["id"] == preset_id and int(row["user_id"]) == user_id)]
            return f"DELETE {before - len(self.rows)}"
        if "UPDATE focus_workflow_presets SET is_default = TRUE" in sql:
            preset_id = args[0]
            for row in self.rows:
                if row["id"] == preset_id:
                    row["is_default"] = True
                    row["updated_at"] = datetime.now(UTC)
            return "UPDATE 1"
        return "UPDATE 1"

    def transaction(self):
        return _TxCtx()


class _WorkflowPresetPool:
    def __init__(self, conn: _WorkflowPresetConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def test_create_and_list_focus_workflow_presets(monkeypatch) -> None:
    conn = _WorkflowPresetConn()
    pool = _WorkflowPresetPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    create_resp = client.post(
        "/todo/focus/workflows",
        json={"name": "默认番茄", "focus_duration": 1500, "break_duration": 300, "is_default": True},
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["is_default"] is True

    list_resp = client.get("/todo/focus/workflows")
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) == 1
    assert items[0]["name"] == "默认番茄"


def test_set_default_and_delete_focus_workflow_preset(monkeypatch) -> None:
    conn = _WorkflowPresetConn()
    pool = _WorkflowPresetPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    first = client.post(
        "/todo/focus/workflows",
        json={"name": "A", "focus_duration": 1500, "break_duration": 300, "is_default": True},
    ).json()
    second = client.post(
        "/todo/focus/workflows",
        json={"name": "B", "focus_duration": 1800, "break_duration": 600, "is_default": False},
    ).json()

    set_default_resp = client.post(f"/todo/focus/workflows/{second['id']}/default")
    assert set_default_resp.status_code == 200
    assert set_default_resp.json()["is_default"] is True

    delete_resp = client.delete(f"/todo/focus/workflows/{second['id']}")
    assert delete_resp.status_code == 200
    assert delete_resp.json()["ok"] is True

    list_resp = client.get("/todo/focus/workflows")
    assert list_resp.status_code == 200
    rows = list_resp.json()
    assert len(rows) == 1
    assert rows[0]["id"] == first["id"]
    assert rows[0]["is_default"] is True
