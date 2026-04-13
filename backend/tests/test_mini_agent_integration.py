from __future__ import annotations

import asyncio
import importlib
from datetime import datetime
from types import SimpleNamespace

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
    assert "/api/skills" in http_paths
    assert "/api/skills/upload" in http_paths
    assert "/api/pages/{profile_key}/session" in http_paths
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


def test_web_page_exposes_minimax_group_id_field() -> None:
    app = FastAPI()
    register_mini_agent(app)
    client = TestClient(app)

    response = client.get("/web")

    assert response.status_code == 200
    assert 'id="tts-minimax-group-id"' in response.text


def test_web_page_exposes_profile_key_field() -> None:
    app = FastAPI()
    register_mini_agent(app)
    client = TestClient(app)

    response = client.get("/web")

    assert response.status_code == 200
    assert 'id="profile-key"' in response.text


def test_web_page_exposes_skill_management_controls() -> None:
    app = FastAPI()
    register_mini_agent(app)
    client = TestClient(app)

    response = client.get("/web")

    assert response.status_code == 200
    assert 'id="open-skills-modal-button"' in response.text
    assert 'id="skills-modal"' in response.text
    assert 'id="close-skills-modal-button"' in response.text
    assert 'id="skills-list"' in response.text
    assert 'id="skill-upload-input"' in response.text
    assert 'id="profile-skill-selector-toggle"' in response.text
    assert 'id="profile-skill-selector-panel"' in response.text
    assert 'id="profile-allowed-skills"' in response.text


def test_web_page_exposes_log_export_controls() -> None:
    app = FastAPI()
    register_mini_agent(app)
    client = TestClient(app)

    response = client.get("/web")

    assert response.status_code == 200
    assert 'id="download-session-logs-button"' in response.text
    assert 'id="log-export-modal"' in response.text
    assert 'id="log-export-session-summary"' in response.text
    assert 'id="log-export-session-events"' in response.text
    assert 'id="log-export-runs"' in response.text
    assert 'id="log-export-client-debug"' in response.text
    assert 'id="log-export-tts-debug"' in response.text
    assert "/static/jszip.min.js?v=" in response.text


def test_profile_routes_require_authentication() -> None:
    app = FastAPI()
    register_mini_agent(app)
    client = TestClient(app)

    response = client.get("/api/profiles")

    assert response.status_code == 401


def test_page_session_route_returns_latest_existing_session(monkeypatch) -> None:
    app = FastAPI()
    register_mini_agent(app)

    module = importlib.import_module("mini_agent_integration")
    module._ensure_mini_agent_import_path()
    auth_module = importlib.import_module("mini_agent.server.auth")
    pages_module = importlib.import_module("mini_agent.server.routers.pages")
    repository_module = importlib.import_module("mini_agent.server.repository")

    async def fake_current_user():
        return auth_module.CurrentUser(
            id=7,
            username="tester",
            is_active=True,
            is_admin=False,
            created_at=datetime.utcnow(),
        )

    profile = repository_module.ProfileRecord(
        id="profile-1",
        user_id=1,
        key="agent-console",
        name="Agent Console",
        config_json={"llm": {"api_key": "test-key"}},
        system_prompt=None,
        system_prompt_path=None,
        mcp_config_json=None,
        is_default=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session = repository_module.SessionRecord(
        id="session-1",
        user_id=7,
        profile_id="profile-1",
        name="会话 session-1",
        workspace_path="/tmp/session-1",
        status="idle",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    app.dependency_overrides[auth_module.get_current_user] = fake_current_user
    app.state.auth_pool = object()
    async def fake_get_profile_by_key(pool, key):
        return profile if key == "agent-console" else None

    async def fake_get_latest_session_for_profile(pool, user_id, profile_id):
        return session

    monkeypatch.setattr(pages_module, "get_profile_by_key", fake_get_profile_by_key)
    monkeypatch.setattr(pages_module, "get_latest_session_for_profile", fake_get_latest_session_for_profile)

    client = TestClient(app)
    response = client.post("/api/pages/agent-console/session")

    assert response.status_code == 200
    assert response.json()["id"] == "session-1"


def test_page_session_route_creates_session_when_missing(monkeypatch) -> None:
    app = FastAPI()
    register_mini_agent(app)

    module = importlib.import_module("mini_agent_integration")
    module._ensure_mini_agent_import_path()
    auth_module = importlib.import_module("mini_agent.server.auth")
    pages_module = importlib.import_module("mini_agent.server.routers.pages")
    repository_module = importlib.import_module("mini_agent.server.repository")

    async def fake_current_user():
        return auth_module.CurrentUser(
            id=9,
            username="creator",
            is_active=True,
            is_admin=False,
            created_at=datetime.utcnow(),
        )

    profile = repository_module.ProfileRecord(
        id="profile-2",
        user_id=1,
        key="agent-console",
        name="Agent Console",
        config_json={"llm": {"api_key": "test-key"}},
        system_prompt=None,
        system_prompt_path=None,
        mcp_config_json=None,
        is_default=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    created = repository_module.SessionRecord(
        id="session-2",
        user_id=9,
        profile_id="profile-2",
        name=None,
        workspace_path=None,
        status="idle",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    finalized = repository_module.SessionRecord(
        id="session-2",
        user_id=9,
        profile_id="profile-2",
        name="会话 session-",
        workspace_path="/tmp/workspace/session-2",
        status="idle",
        created_at=created.created_at,
        updated_at=datetime.utcnow(),
    )

    async def fake_get_profile_by_key(pool, key):
        return profile if key == "agent-console" else None

    async def fake_get_latest_session_for_profile(pool, user_id, profile_id):
        return None

    async def fake_create_session(pool, *, user_id, profile_id, name, workspace_path, status):
        assert user_id == 9
        assert profile_id == "profile-2"
        return created

    async def fake_update_session(pool, user_id, session_id, **kwargs):
        assert user_id == 9
        assert session_id == "session-2"
        assert kwargs["workspace_path"] == "/tmp/workspace/session-2"
        return finalized

    app.dependency_overrides[auth_module.get_current_user] = fake_current_user
    app.state.auth_pool = object()
    monkeypatch.setattr(pages_module, "get_profile_by_key", fake_get_profile_by_key)
    monkeypatch.setattr(pages_module, "get_latest_session_for_profile", fake_get_latest_session_for_profile)
    monkeypatch.setattr(pages_module, "build_profile_runtime_config", lambda profile: SimpleNamespace())
    monkeypatch.setattr(
        pages_module,
        "build_session_workspace_path",
        lambda config, session_id, explicit_workspace_path=None: "/tmp/workspace/session-2",
    )
    monkeypatch.setattr(pages_module, "create_session", fake_create_session)
    monkeypatch.setattr(pages_module, "update_session", fake_update_session)

    client = TestClient(app)
    response = client.post("/api/pages/agent-console/session")

    assert response.status_code == 200
    assert response.json()["id"] == "session-2"
    assert response.json()["workspace_path"] == "/tmp/workspace/session-2"


@pytest.mark.asyncio
async def test_page_session_route_deduplicates_concurrent_creation(monkeypatch) -> None:
    module = importlib.import_module("mini_agent_integration")
    module._ensure_mini_agent_import_path()
    auth_module = importlib.import_module("mini_agent.server.auth")
    pages_module = importlib.import_module("mini_agent.server.routers.pages")
    repository_module = importlib.import_module("mini_agent.server.repository")

    profile = repository_module.ProfileRecord(
        id="profile-3",
        user_id=1,
        key="agent-console",
        name="Agent Console",
        config_json={"llm": {"api_key": "test-key"}},
        system_prompt=None,
        system_prompt_path=None,
        mcp_config_json=None,
        is_default=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    current_user = auth_module.CurrentUser(
        id=11,
        username="dedupe",
        is_active=True,
        is_admin=False,
        created_at=datetime.utcnow(),
    )
    created_at = datetime.utcnow()
    create_calls = 0
    latest_lookup_calls = 0
    second_lookup_seen = asyncio.Event()
    existing_session = None

    async def fake_get_profile_by_key(pool, key):
        del pool
        return profile if key == "agent-console" else None

    async def fake_get_latest_session_for_profile(pool, user_id, profile_id):
        del pool, user_id, profile_id
        nonlocal latest_lookup_calls
        latest_lookup_calls += 1
        if latest_lookup_calls == 1:
            try:
                await asyncio.wait_for(second_lookup_seen.wait(), timeout=0.05)
            except TimeoutError:
                pass
        else:
            second_lookup_seen.set()
        return existing_session

    async def fake_create_session(pool, *, user_id, profile_id, name, workspace_path, status):
        del pool, user_id, profile_id, name, workspace_path, status
        nonlocal create_calls, existing_session
        create_calls += 1
        existing_session = repository_module.SessionRecord(
            id=f"session-{create_calls}",
            user_id=current_user.id,
            profile_id=profile.id,
            name=None,
            workspace_path=None,
            status="idle",
            created_at=created_at,
            updated_at=created_at,
        )
        return existing_session

    async def fake_update_session(pool, user_id, session_id, **kwargs):
        del pool, user_id
        nonlocal existing_session
        existing_session = repository_module.SessionRecord(
            id=session_id,
            user_id=current_user.id,
            profile_id=profile.id,
            name=kwargs.get("name"),
            workspace_path=kwargs.get("workspace_path"),
            status=kwargs.get("status", "idle"),
            created_at=created_at,
            updated_at=datetime.utcnow(),
        )
        return existing_session

    monkeypatch.setattr(pages_module, "get_profile_by_key", fake_get_profile_by_key)
    monkeypatch.setattr(pages_module, "get_latest_session_for_profile", fake_get_latest_session_for_profile)
    monkeypatch.setattr(pages_module, "build_profile_runtime_config", lambda profile: SimpleNamespace())
    monkeypatch.setattr(
        pages_module,
        "build_session_workspace_path",
        lambda config, session_id, explicit_workspace_path=None: f"/tmp/workspace/{session_id}",
    )
    monkeypatch.setattr(pages_module, "create_session", fake_create_session)
    monkeypatch.setattr(pages_module, "update_session", fake_update_session)

    first, second = await asyncio.gather(
        pages_module.route_get_or_create_page_session("agent-console", current_user, object()),
        pages_module.route_get_or_create_page_session("agent-console", current_user, object()),
    )

    assert create_calls == 1
    assert first.id == second.id == "session-1"
    assert first.workspace_path == second.workspace_path == "/tmp/workspace/session-1"


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
