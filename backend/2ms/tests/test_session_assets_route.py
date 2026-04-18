"""Tests for protected session image asset serving."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from mini_agent.assets import IMAGE_ASSET_DIR
from mini_agent.server.auth import CurrentUser, get_current_user
from mini_agent.server.repository import SessionRecord
from mini_agent.server.routers import sessions


def make_user(user_id: int = 1) -> CurrentUser:
    return CurrentUser(
        id=user_id,
        username=f"user-{user_id}",
        is_active=True,
        is_admin=False,
        created_at=datetime.now(UTC),
    )


def make_session(workspace_path: Path, user_id: int = 1) -> SessionRecord:
    now = datetime.now(UTC)
    return SessionRecord(
        id="session-1",
        user_id=user_id,
        profile_id="profile-1",
        name="Session",
        workspace_path=str(workspace_path),
        status="idle",
        created_at=now,
        updated_at=now,
    )


def make_client(monkeypatch: pytest.MonkeyPatch, workspace_path: Path, *, owner_user_id: int = 1) -> TestClient:
    app = FastAPI()
    app.include_router(sessions.router, prefix="/api")

    async def fake_current_user() -> CurrentUser:
        return make_user(1)

    async def fake_pool_dep():
        return object()

    async def fake_get_session(pool, user_id, session_id):
        del pool, session_id
        if user_id != owner_user_id:
            return None
        return make_session(workspace_path, user_id=owner_user_id)

    app.dependency_overrides[get_current_user] = fake_current_user
    app.dependency_overrides[sessions._pool_dep] = fake_pool_dep
    monkeypatch.setattr(sessions, "get_session", fake_get_session)
    return TestClient(app)


def test_session_asset_route_serves_owned_png(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    asset_id = "img_0123456789abcdef0123456789abcdef.png"
    asset_path = tmp_path / IMAGE_ASSET_DIR / asset_id
    asset_path.parent.mkdir(parents=True, exist_ok=True)
    asset_path.write_bytes(b"png-bytes")
    client = make_client(monkeypatch, tmp_path)

    response = client.get(f"/api/sessions/session-1/assets/{asset_id}")

    assert response.status_code == 200
    assert response.content == b"png-bytes"
    assert response.headers["content-type"].startswith("image/png")


def test_session_asset_route_rejects_other_user(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    asset_id = "img_0123456789abcdef0123456789abcdef.png"
    asset_path = tmp_path / IMAGE_ASSET_DIR / asset_id
    asset_path.parent.mkdir(parents=True, exist_ok=True)
    asset_path.write_bytes(b"png-bytes")
    client = make_client(monkeypatch, tmp_path, owner_user_id=2)

    response = client.get(f"/api/sessions/session-1/assets/{asset_id}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Session not found"


def test_session_asset_route_rejects_invalid_asset_id(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    client = make_client(monkeypatch, tmp_path)

    response = client.get("/api/sessions/session-1/assets/not-an-image.txt")

    assert response.status_code == 404


def test_session_asset_route_returns_404_for_missing_asset(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    client = make_client(monkeypatch, tmp_path)

    response = client.get("/api/sessions/session-1/assets/img_0123456789abcdef0123456789abcdef.png")

    assert response.status_code == 404
    assert response.json()["detail"] == "Asset not found"
