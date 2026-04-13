"""Tests for the skill management API."""

from __future__ import annotations

import io
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from mini_agent.server.auth import CurrentUser, get_current_user
from mini_agent.server.routers import skills as skills_router


def _make_skill_zip(name: str = "uploaded-skill", description: str = "Uploaded skill") -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            f"{name}/SKILL.md",
            f"---\nname: {name}\ndescription: {description}\n---\n\nUse this skill.\n",
        )
    return buffer.getvalue()


def _build_app(tmp_path: Path) -> TestClient:
    app = FastAPI()
    app.include_router(skills_router.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=1,
        username="tester",
        is_active=True,
        is_admin=False,
        created_at=datetime.utcnow(),
    )
    app.state.skill_install_root = tmp_path / "uploaded-skills"
    app.state.skill_builtin_dirs = [tmp_path / "builtin-skills"]
    app.state.skill_builtin_dirs[0].mkdir(parents=True)
    (app.state.skill_builtin_dirs[0] / "builtin-skill").mkdir()
    (app.state.skill_builtin_dirs[0] / "builtin-skill" / "SKILL.md").write_text(
        "---\nname: builtin-skill\ndescription: Builtin skill\n---\n\nBuiltin.\n",
        encoding="utf-8",
    )
    return TestClient(app)


def test_list_skills_returns_builtin_and_uploaded_entries(tmp_path):
    client = _build_app(tmp_path)

    upload = client.post(
        "/api/skills/upload",
        files={"file": ("uploaded-skill.zip", _make_skill_zip(), "application/zip")},
    )
    assert upload.status_code == 201

    response = client.get("/api/skills")

    assert response.status_code == 200
    names = {item["name"] for item in response.json()}
    assert names == {"builtin-skill", "uploaded-skill"}


def test_upload_skill_rejects_invalid_zip(tmp_path):
    client = _build_app(tmp_path)

    response = client.post(
        "/api/skills/upload",
        files={"file": ("broken.zip", b"not-a-zip", "application/zip")},
    )

    assert response.status_code == 400
    assert "zip" in response.json()["detail"].lower()
