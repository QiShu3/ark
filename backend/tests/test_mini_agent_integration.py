from __future__ import annotations

import importlib

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute, APIWebSocketRoute
from fastapi.testclient import TestClient

from mini_agent_integration import init_mini_agent, register_mini_agent


class _AcquireCtx:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeConn:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _FakeConn:
    def __init__(self) -> None:
        self.sql: list[str] = []

    async def execute(self, sql: str, *args) -> str:
        del args
        self.sql.append(sql)
        return "OK"


class _FakePool:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def test_register_mini_agent_routes_are_exposed_on_main_app() -> None:
    from main import app

    http_paths = {route.path for route in app.routes if isinstance(route, APIRoute)}
    websocket_paths = {route.path for route in app.routes if isinstance(route, APIWebSocketRoute)}

    assert "/health" in http_paths
    assert "/auth/login" in http_paths
    assert "/web" in http_paths
    assert "/api/profiles" in http_paths
    assert "/api/sessions" in http_paths
    assert "/api/sessions/ws/{session_id}" in websocket_paths


def test_web_page_serves_static_assets_with_cache_busting() -> None:
    app = FastAPI()
    register_mini_agent(app)
    client = TestClient(app)

    response = client.get("/web")

    assert response.status_code == 200
    assert "/static/app.js?v=" in response.text
    assert "/static/styles.css?v=" in response.text


def test_profile_routes_require_authentication() -> None:
    app = FastAPI()
    register_mini_agent(app)
    client = TestClient(app)

    response = client.get("/api/profiles")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_init_mini_agent_reuses_existing_auth_pool(monkeypatch) -> None:
    conn = _FakeConn()
    pool = _FakePool(conn)

    app = FastAPI()
    app.state.auth_pool = pool

    module = importlib.import_module("mini_agent_integration")
    module._ensure_mini_agent_import_path()
    repo = importlib.import_module("mini_agent.server.repository")

    captured: list[object] = []

    async def fake_ensure_agent_schema(fake_conn) -> None:
        captured.append(fake_conn)

    monkeypatch.setattr(repo, "get_pool_from_app", lambda _: pool)
    monkeypatch.setattr(repo, "ensure_agent_schema", fake_ensure_agent_schema)

    await init_mini_agent(app)

    assert app.state.auth_pool is pool
    assert conn.sql == ["CREATE EXTENSION IF NOT EXISTS pgcrypto;"]
    assert captured == [conn]
