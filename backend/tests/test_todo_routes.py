from __future__ import annotations

from dataclasses import dataclass
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

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        if "WITH bounds AS" in sql and "FROM log_durations ld" in sql:
             # Check user_id
            if args[0] != 7:
                return []
            return self.stats_rows
        return []

    async def fetchrow(self, sql: str, *args: Any) -> dict[str, Any] | None:
        return None

    async def execute(self, sql: str, *args: Any) -> str:
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
