from __future__ import annotations

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
            return next((event for event in self.events if event["id"] == event_id and event["user_id"] == user_id), None)
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
            self.events = [event for event in self.events if not (event["id"] == event_id and event["user_id"] == user_id)]
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
    conn.stats_rows = [
        {"id": task_id, "title": "Task 1", "total_duration": 3600}
    ]

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
        {"id": task_id2, "title": "Task 2", "total_duration": 1800}
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
