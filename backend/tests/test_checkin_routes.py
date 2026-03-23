from __future__ import annotations

from typing import Any

import asyncpg
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.auth_routes import get_current_user
from routes.checkin_routes import router


class _DummyUser:
    id: int = 7


class _AcquireCtx:
    def __init__(self, conn: Any) -> None:
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        pass


class _FakeCheckinConn:
    def __init__(self) -> None:
        self.checkins: list[dict[str, Any]] = []

    async def execute(self, sql: str, *args: Any):
        if "INSERT INTO user_checkins" in sql:
            user_id = args[0]
            if any(c["user_id"] == user_id for c in self.checkins):
                raise asyncpg.UniqueViolationError
            self.checkins.append({"user_id": user_id})

    async def fetchrow(self, sql: str, *args: Any):
        if "SELECT 1 FROM user_checkins" in sql:
            user_id = args[0]
            return {"1": 1} if any(c["user_id"] == user_id for c in self.checkins) else None
        if "SELECT COUNT(*) AS total FROM user_checkins" in sql:
            return {"total": sum(1 for c in self.checkins if c["user_id"] == args[0])}
        if "WITH checkin_dates AS" in sql:
            return {"streak_len": sum(1 for c in self.checkins if c["user_id"] == args[0])}
        return None


class _FakePool:
    def __init__(self, conn: Any) -> None:
        self._conn = conn

    def acquire(self):
        return _AcquireCtx(self._conn)


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _DummyUser()
    return app


def test_perform_checkin(monkeypatch) -> None:
    conn = _FakeCheckinConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.checkin_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    resp = client.post("/api/checkin")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    resp2 = client.post("/api/checkin")
    assert resp2.status_code == 409


def test_get_checkin_status(monkeypatch) -> None:
    conn = _FakeCheckinConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.checkin_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    resp = client.get("/api/checkin/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_checked_in_today"] is False
    assert data["total_days"] == 0

    client.post("/api/checkin")

    resp2 = client.get("/api/checkin/status")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["is_checked_in_today"] is True
    assert data2["total_days"] == 1
    assert data2["current_streak"] == 1
