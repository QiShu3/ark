from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.agents.routes import router
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
        now = datetime.now(UTC)
        self.profiles: list[dict[str, Any]] = [
            {
                "id": "apf_default",
                "user_id": 7,
                "name": "Ark Agent",
                "description": "Default profile",
                "agent_type": "dashboard",
                "app_id": None,
                "avatar_url": None,
                "persona_prompt": "Default persona",
                "allowed_skills_json": ["task_list", "delete_task"],
                "temperature": 0.2,
                "max_tool_loops": 4,
                "is_default": True,
                "created_at": now,
                "updated_at": now,
            }
        ]

    async def fetchrow(self, sql: str, *args: Any) -> dict[str, Any] | None:
        if "INSERT INTO agent_profiles" in sql:
            now = datetime.now(UTC)
            if len(args) == 6:
                agent_type = "dashboard"
                app_id = None
                avatar_url = None
                persona_prompt = str(args[4])
                allowed_skills_json = json.loads(str(args[5]))
                temperature = 0.2
                max_tool_loops = 4
                is_default = True
            else:
                agent_type = str(args[4])
                app_id = None
                avatar_url = None
                persona_prompt = str(args[5])
                allowed_skills_json = json.loads(str(args[6]))
                temperature = float(args[7])
                max_tool_loops = int(args[8])
                is_default = bool(args[9])
            row = {
                "id": str(args[0]),
                "user_id": int(args[1]),
                "name": str(args[2]),
                "description": str(args[3]),
                "agent_type": agent_type,
                "app_id": app_id,
                "avatar_url": avatar_url,
                "persona_prompt": persona_prompt,
                "allowed_skills_json": allowed_skills_json,
                "temperature": temperature,
                "max_tool_loops": max_tool_loops,
                "is_default": is_default,
                "created_at": now,
                "updated_at": now,
            }
            self.profiles.append(row)
            return row
        if "UPDATE agent_profiles" in sql and "SET avatar_url = $1" in sql:
            profile_id = str(args[1])
            user_id = int(args[2])
            row = next((item for item in self.profiles if item["id"] == profile_id and item["user_id"] == user_id), None)
            if row is None:
                return None
            row["avatar_url"] = args[0]
            row["updated_at"] = datetime.now(UTC)
            return row
        if "UPDATE agent_profiles" in sql and "SET avatar_url = NULL" in sql:
            profile_id = str(args[0])
            user_id = int(args[1])
            row = next((item for item in self.profiles if item["id"] == profile_id and item["user_id"] == user_id), None)
            if row is None:
                return None
            row["avatar_url"] = None
            row["updated_at"] = datetime.now(UTC)
            return row
        if "UPDATE agent_profiles" in sql and "RETURNING id, user_id, name" in sql:
            profile_id = str(args[-2])
            user_id = int(args[-1])
            row = next((item for item in self.profiles if item["id"] == profile_id and item["user_id"] == user_id), None)
            if row is None:
                return None
            row.update(
                {
                    "name": str(args[0]),
                    "description": str(args[1]),
                    "agent_type": str(args[2]),
                    "app_id": None,
                    "avatar_url": args[3],
                    "persona_prompt": str(args[4]),
                    "allowed_skills_json": json.loads(str(args[5])),
                    "temperature": float(args[6]),
                    "max_tool_loops": int(args[7]),
                    "is_default": bool(args[8]),
                    "updated_at": datetime.now(UTC),
                }
            )
            return row
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
        if "FROM agent_profiles" in sql:
            user_id = int(args[0])
            if "WHERE user_id = $1 AND id = $2" in sql:
                profile_id = str(args[1])
                return next((row for row in self.profiles if row["user_id"] == user_id and row["id"] == profile_id), None)
            rows = [row for row in self.profiles if row["user_id"] == user_id]
            if "is_default = TRUE" in sql:
                return next((row for row in rows if row["is_default"]), None)
            rows.sort(key=lambda row: (not row["is_default"], -row["updated_at"].timestamp()))
            return rows[0] if rows else None
        return None

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        if "FROM agent_profiles" in sql:
            user_id = int(args[0])
            rows = [row for row in self.profiles if row["user_id"] == user_id]
            return sorted(rows, key=lambda row: (not row["is_default"], -row["updated_at"].timestamp()))
        return []

    async def execute(self, sql: str, *args: Any) -> str:
        if "UPDATE agent_profiles SET is_default = FALSE" in sql:
            user_id = int(args[0])
            exclude_id = str(args[1]) if len(args) > 1 else None
            for row in self.profiles:
                if row["user_id"] == user_id and row["is_default"] and row["id"] != exclude_id:
                    row["is_default"] = False
                    row["updated_at"] = datetime.now(UTC)
            return "UPDATE 1"
        if "INSERT INTO agent_approvals" in sql:
            approval_id = str(args[0])
            self.approvals[approval_id] = {
                "id": approval_id,
                "user_id": int(args[1]),
                "agent_type": str(args[2]),
                "primary_app_id": args[3],
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
        if "DELETE FROM agent_profiles" in sql:
            profile_id = str(args[0])
            user_id = int(args[1])
            self.profiles = [row for row in self.profiles if not (row["id"] == profile_id and row["user_id"] == user_id)]
            return "DELETE 1"
        if "UPDATE agent_profiles SET is_default = TRUE" in sql:
            profile_id = str(args[0])
            for row in self.profiles:
                if row["id"] == profile_id:
                    row["is_default"] = True
                    row["updated_at"] = datetime.now(UTC)
            return "UPDATE 1"
        return "OK"

    async def fetchval(self, sql: str, *args: Any) -> Any:
        _ = sql
        _ = args
        return None

    def transaction(self) -> _TxCtx:
        return _TxCtx()


class _FakePool:
    def __init__(self, conn: _FakeAgentConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def client_profile(profile_id: str, *, is_default: bool) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "id": profile_id,
        "user_id": 7,
        "name": "Second Profile",
        "description": "Another profile",
        "agent_type": "dashboard",
        "app_id": None,
        "avatar_url": None,
        "persona_prompt": "Another context",
        "allowed_skills_json": ["task_list"],
        "temperature": 0.3,
        "max_tool_loops": 4,
        "is_default": is_default,
        "created_at": now,
        "updated_at": now,
    }


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _DummyUser()
    return app


def test_list_agent_skills_smoke(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.get("/api/agent/skills")
    assert resp.status_code == 200
    names = [item["name"] for item in resp.json()]
    assert "arxiv_daily_candidates" in names
    assert "arxiv_search" in names
    assert "arxiv_paper_details" in names
    assert "delete_task" in names
    assert "task_update" in names


def test_list_agent_apps_smoke(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.get("/api/agent/apps")
    assert resp.status_code == 200
    body = resp.json()
    app_ids = [item["app_id"] for item in body]
    assert "dashboard" in app_ids
    assert "arxiv" in app_ids
    assert "vocab" in app_ids
    assert "todo" in app_ids


def test_list_profiles_returns_default_profile(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.get("/api/agent/profiles")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["is_default"] is True
    assert body[0]["name"] == "Ark Agent"


def test_create_profile_rejects_invalid_skill(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/profiles",
        json={
            "name": "Bad Profile",
            "allowed_skills": ["not_real_skill"],
        },
    )
    assert resp.status_code == 422


def test_create_profile_for_arxiv_agent_normalizes_app_scope(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/profiles",
        json={
            "name": "Researcher",
            "primary_app_id": "arxiv",
            "context_prompt": "你是一个专注论文阅读和任务整理的研究助手。",
            "allowed_skills": ["arxiv_search", "arxiv_paper_details"],
            "temperature": 0.6,
            "max_tool_loops": 5,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["primary_app_id"] == "arxiv"
    assert body["context_prompt"] == "你是一个专注论文阅读和任务整理的研究助手。"
    assert body["allowed_skills"] == ["arxiv_search", "arxiv_paper_details"]


def test_delete_default_profile_falls_back_to_remaining(monkeypatch) -> None:
    conn = _FakeAgentConn()
    extra = client_profile("apf_second", is_default=False)
    conn.profiles.append(extra)
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.delete("/api/agent/profiles/apf_default")
    assert resp.status_code == 200
    assert any(profile["id"] == "apf_second" and profile["is_default"] for profile in conn.profiles)


def test_set_default_profile_updates_flag(monkeypatch) -> None:
    conn = _FakeAgentConn()
    conn.profiles.append(client_profile("apf_second", is_default=False))
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.post("/api/agent/profiles/apf_second/default")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "apf_second"
    assert body["is_default"] is True


def test_upload_profile_avatar_persists_file(monkeypatch, tmp_path: Path) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    monkeypatch.setattr("routes.agents.profiles.AVATAR_UPLOAD_DIR", tmp_path)
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/profiles/apf_default/avatar",
        files={"avatar": ("agent.png", b"fake-image-bytes", "image/png")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["avatar_url"].startswith("/uploads/agent-avatars/")
    saved_file = tmp_path / body["avatar_url"].removeprefix("/uploads/agent-avatars/")
    assert saved_file.exists()


def test_upload_profile_avatar_rejects_invalid_type(monkeypatch, tmp_path: Path) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    monkeypatch.setattr("routes.agents.profiles.AVATAR_UPLOAD_DIR", tmp_path)
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/profiles/apf_default/avatar",
        files={"avatar": ("agent.gif", b"gif-bytes", "image/gif")},
    )
    assert resp.status_code == 422


def test_upload_profile_avatar_rejects_oversized_file(monkeypatch, tmp_path: Path) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    monkeypatch.setattr("routes.agents.profiles.AVATAR_UPLOAD_DIR", tmp_path)
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/profiles/apf_default/avatar",
        files={"avatar": ("large.png", b"x" * (2 * 1024 * 1024 + 1), "image/png")},
    )
    assert resp.status_code == 413


def test_remove_profile_avatar_deletes_file(monkeypatch, tmp_path: Path) -> None:
    conn = _FakeAgentConn()
    avatar_path = tmp_path / "old.png"
    avatar_path.write_bytes(b"old-image")
    conn.profiles[0]["avatar_url"] = "/uploads/agent-avatars/old.png"
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    monkeypatch.setattr("routes.agents.profiles.AVATAR_UPLOAD_DIR", tmp_path)
    client = TestClient(_build_app())
    resp = client.delete("/api/agent/profiles/apf_default/avatar")
    assert resp.status_code == 200
    body = resp.json()
    assert body["avatar_url"] is None
    assert not avatar_path.exists()


def test_dashboard_agent_can_search_arxiv(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))

    async def _fake_search(**kwargs: Any) -> list[dict[str, Any]]:
        assert kwargs["keywords"] == "transformer"
        assert kwargs["limit"] == 5
        return [
            {
                "arxiv_id": "2401.00001",
                "title": "A Paper",
                "authors": ["Alice"],
                "published": "2024-01-01T00:00:00",
                "summary": "Summary",
            }
        ]

    monkeypatch.setattr("routes.agents.actions.arxiv_actions.search_arxiv_papers", _fake_search)
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/actions/arxiv.search",
        headers={"X-Ark-Primary-App-Id": "dashboard"},
        json={"payload": {"keywords": "transformer", "limit": 5}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "result"
    assert body["data"]["count"] == 1
    assert body["data"]["items"][0]["arxiv_id"] == "2401.00001"


def test_app_agent_can_get_daily_candidates(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))

    async def _fake_daily_candidates(conn: Any, *, user_id: int, run_day: Any) -> list[dict[str, Any]]:
        assert user_id == 7
        return [
            {
                "arxiv_id": "2401.00002",
                "title": "Daily Paper",
                "authors": ["Bob"],
                "published": "2024-01-02T00:00:00",
                "summary": "Daily summary",
                "is_read": False,
                "linked_task_id": None,
                "linked_task_status": None,
            }
        ]

    monkeypatch.setattr("routes.agents.actions.arxiv_actions.get_daily_candidates_with_auto_refresh", _fake_daily_candidates)
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/actions/arxiv.daily_candidates",
        headers={"X-Ark-Primary-App-Id": "arxiv"},
        json={"payload": {}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "result"
    assert body["data"]["items"][0]["arxiv_id"] == "2401.00002"


def test_app_agent_can_get_paper_details(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))

    async def _fake_details(arxiv_ids: list[str]) -> list[dict[str, Any]]:
        assert arxiv_ids == ["2401.00003", "2401.00004"]
        return [
            {
                "arxiv_id": "2401.00003",
                "title": "Detail Paper",
                "authors": ["Carol"],
                "published": "2024-01-03T00:00:00",
                "summary": "Detail summary",
            }
        ]

    monkeypatch.setattr("routes.agents.actions.arxiv_actions.fetch_paper_details", _fake_details)
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/actions/arxiv.paper_details",
        headers={"X-Ark-Primary-App-Id": "arxiv"},
        json={"payload": {"arxiv_ids": ["2401.00003", "2401.00004"]}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "result"
    assert body["data"]["count"] == 1
    assert body["data"]["items"][0]["title"] == "Detail Paper"


def test_task_delete_prepare_forbidden_for_app_agent(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/actions/task.delete.prepare",
        headers={"X-Ark-Primary-App-Id": "arxiv"},
        json={"payload": {"task_id": conn.task_id}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "forbidden"


def test_task_list_summary_requires_capability(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/actions/task.list",
        headers={"X-Ark-Primary-App-Id": "arxiv"},
        json={"payload": {}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "forbidden"


def test_task_list_summary_with_capability(monkeypatch) -> None:
    conn = _FakeAgentConn()
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))

    async def _fake_list_tasks(conn: Any, *, user_id: int, payload: dict[str, Any], summary_only: bool) -> dict[str, Any]:
        assert user_id == 7
        assert summary_only is True
        return {
            "items": [{"id": "task_1", "title": "Summary", "status": "todo", "priority": 1, "due_date": None}],
            "view": "summary",
        }

    monkeypatch.setattr("routes.agents.actions.task_actions.list_tasks_action", _fake_list_tasks)
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/actions/task.list",
        headers={
            "X-Ark-Primary-App-Id": "arxiv",
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
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())

    prepare = client.post(
        "/api/agent/actions/task.delete.prepare",
        headers={"X-Ark-Primary-App-Id": "dashboard"},
        json={"payload": {"task_id": conn.task_id}},
    )
    assert prepare.status_code == 200
    prepare_body = prepare.json()
    assert prepare_body["type"] == "approval_required"
    approval_id = prepare_body["approval_id"]
    assert approval_id in conn.approvals

    commit = client.post(
        "/api/agent/actions/task.delete.commit",
        headers={"X-Ark-Primary-App-Id": "dashboard"},
        json={"payload": {"approval_id": approval_id}},
    )
    assert commit.status_code == 200
    commit_body = commit.json()
    assert commit_body["type"] == "result"
    assert commit_body["data"]["ok"] is True
    assert conn.deleted is True

    second_commit = client.post(
        "/api/agent/actions/task.delete.commit",
        headers={"X-Ark-Primary-App-Id": "dashboard"},
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
        "agent_type": "dashboard",
        "primary_app_id": "dashboard",
        "session_id": None,
        "action_id": "task.delete",
        "payload_json": {"task_id": conn.task_id},
        "status": "pending",
        "expires_at": datetime.now(UTC) - timedelta(minutes=1),
    }
    monkeypatch.setattr("routes.agents.routes.pool_from_request", lambda _: _FakePool(conn))
    client = TestClient(_build_app())
    resp = client.post(
        "/api/agent/actions/task.delete.commit",
        headers={"X-Ark-Primary-App-Id": "dashboard"},
        json={"payload": {"approval_id": expired_id}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "forbidden"
