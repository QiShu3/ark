from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.auth_routes import get_current_user
from routes.checkin_routes import router


@dataclass
class _DummyUser:
    id: int = 7


class _AcquireCtx:
    def __init__(self, conn: _FakeCheckinConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeCheckinConn:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _FakeCheckinConn:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    async def execute(self, sql: str, *args: Any) -> str:
        if "INSERT INTO user_checkins" in sql:
            user_id = args[0]
            checkin_date = args[1]
            if not any(r["user_id"] == user_id and r["checkin_date"] == checkin_date for r in self.rows):
                self.rows.append({
                    "user_id": user_id,
                    "checkin_date": checkin_date,
                    "created_at": datetime.now(UTC),
                })
            return "INSERT 1"
        return "OK"

    async def fetchrow(self, sql: str, *args: Any) -> dict[str, Any] | None:
        if "SELECT 1 FROM user_checkins" in sql:
            user_id, checkin_date = args
            for r in self.rows:
                if r["user_id"] == user_id and r["checkin_date"] == checkin_date:
                    return {"1": 1}
            return None
        if "SELECT COUNT(*) as total FROM user_checkins" in sql:
            user_id = args[0]
            total = sum(1 for r in self.rows if r["user_id"] == user_id)
            return {"total": total}
        return None

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        if "SELECT checkin_date FROM user_checkins" in sql:
            user_id = args[0]
            user_rows = [r for r in self.rows if r["user_id"] == user_id]
            user_rows.sort(key=lambda x: x["checkin_date"], reverse=True)
            return user_rows
        return []


class _FakePool:
    def __init__(self, conn: _FakeCheckinConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _DummyUser()
    return app


def test_create_checkin(monkeypatch) -> None:
    conn = _FakeCheckinConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.checkin_routes._pool_from_request", lambda _: pool)
    
    app = _build_app()
    client = TestClient(app)
    
    resp = client.post("/api/checkin")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert len(conn.rows) == 1
    
    # Second time should be idempotent
    resp = client.post("/api/checkin")
    assert resp.status_code == 200
    assert len(conn.rows) == 1


def test_get_checkin_status_empty(monkeypatch) -> None:
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
    assert data["current_streak"] == 0
    assert data["checked_dates"] == []


def test_get_checkin_status_with_streak(monkeypatch) -> None:
    conn = _FakeCheckinConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.checkin_routes._pool_from_request", lambda _: pool)
    
    today = datetime.now(UTC).date()
    yesterday = datetime.fromordinal(today.toordinal() - 1).date()
    two_days_ago = datetime.fromordinal(yesterday.toordinal() - 1).date()
    four_days_ago = datetime.fromordinal(two_days_ago.toordinal() - 2).date()
    
    conn.rows = [
        {"user_id": 7, "checkin_date": today, "created_at": datetime.now(UTC)},
        {"user_id": 7, "checkin_date": yesterday, "created_at": datetime.now(UTC)},
        {"user_id": 7, "checkin_date": two_days_ago, "created_at": datetime.now(UTC)},
        {"user_id": 7, "checkin_date": four_days_ago, "created_at": datetime.now(UTC)},
    ]
    
    app = _build_app()
    client = TestClient(app)
    
    resp = client.get("/api/checkin/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_checked_in_today"] is True
    assert data["total_days"] == 4
    assert data["current_streak"] == 3
    assert len(data["checked_dates"]) == 4


def test_get_checkin_status_missing_today_but_checked_yesterday(monkeypatch) -> None:
    conn = _FakeCheckinConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.checkin_routes._pool_from_request", lambda _: pool)
    
    today = datetime.now(UTC).date()
    yesterday = datetime.fromordinal(today.toordinal() - 1).date()
    two_days_ago = datetime.fromordinal(yesterday.toordinal() - 1).date()
    
    conn.rows = [
        {"user_id": 7, "checkin_date": yesterday, "created_at": datetime.now(UTC)},
        {"user_id": 7, "checkin_date": two_days_ago, "created_at": datetime.now(UTC)},
    ]
    
    app = _build_app()
    client = TestClient(app)
    
    resp = client.get("/api/checkin/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_checked_in_today"] is False
    assert data["total_days"] == 2
    assert data["current_streak"] == 2
