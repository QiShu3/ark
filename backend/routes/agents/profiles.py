from __future__ import annotations

import json
import os
import secrets
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from routes.agents.models import (
    AgentContext,
    AgentProfileCreateRequest,
    AgentProfileOut,
    AgentProfileUpdateRequest,
)
from routes.agents.policy import DEFAULT_CAPABILITIES
from routes.agents.skills import list_agent_skills_registry

BACKEND_DIR = Path(__file__).resolve().parents[2]
AVATAR_UPLOAD_DIR = Path(os.getenv("ARK_AGENT_AVATAR_DIR", str(BACKEND_DIR / "uploads" / "agent-avatars")))
AVATAR_URL_PREFIX = "/uploads/agent-avatars/"
MAX_AVATAR_BYTES = 2 * 1024 * 1024
ALLOWED_AVATAR_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}


def _default_profile_values(agent_type: str) -> tuple[str, str, str | None]:
    if agent_type == "app_agent:arxiv":
        return (
            "ArXiv Researcher",
            "关注论文检索、每日候选与阅读任务安排。",
            "你像一位认真、清晰、偏研究助理风格的 AI 助手，优先帮助用户快速筛选论文、组织阅读任务。",
        )
    if agent_type == "app_agent:vocab":
        return (
            "Vocab Coach",
            "关注背词节奏、复习反馈与学习鼓励。",
            "你像一位有耐心、鼓励式的英语教练，语气轻快，但回答要具体。",
        )
    return (
        "Ark Agent",
        "通用任务调度与信息整理助手。",
        "你像一位冷静、清晰、执行力强的任务助手，回答简洁，优先给出可执行信息。",
    )


def _skill_names() -> set[str]:
    return {skill.name for skill in list_agent_skills_registry()}


def normalize_allowed_skills(value: list[str] | None, *, agent_type: str) -> list[str]:
    available = _skill_names()
    selected = [name.strip() for name in (value or []) if isinstance(name, str) and name.strip()]
    if not selected:
        selected = sorted(available)
    deduped = list(dict.fromkeys(selected))
    invalid = [name for name in deduped if name not in available]
    if invalid:
        raise HTTPException(status_code=422, detail=f"非法 skills: {', '.join(invalid)}")
    if agent_type == "app_agent:arxiv":
        disallowed = [name for name in deduped if not name.startswith("arxiv_")]
        if disallowed:
            raise HTTPException(status_code=422, detail="app_agent:arxiv 只能绑定 arXiv 相关 skills")
    if agent_type == "app_agent:vocab":
        disallowed = [name for name in deduped if name.startswith("arxiv_")]
        if disallowed:
            raise HTTPException(status_code=422, detail="app_agent:vocab 不能绑定 arXiv skills")
    return deduped


def normalize_app_id(agent_type: str, app_id: str | None) -> str | None:
    if agent_type == "app_agent:arxiv":
        return "arxiv"
    if agent_type == "app_agent:vocab":
        return "vocab"
    return app_id.strip() if isinstance(app_id, str) and app_id.strip() else None


def build_profile_context(profile: AgentProfileOut, *, user_id: int, session_id: str | None) -> AgentContext:
    return AgentContext(
        user_id=user_id,
        agent_type=profile.agent_type,
        app_id=profile.app_id,
        session_id=session_id,
        capabilities=DEFAULT_CAPABILITIES[profile.agent_type],
    )


def avatar_upload_dir() -> Path:
    return AVATAR_UPLOAD_DIR


def avatar_url_for_filename(filename: str) -> str:
    return f"{AVATAR_URL_PREFIX}{filename}"


def avatar_path_from_url(url: str | None) -> Path | None:
    if not isinstance(url, str) or not url.startswith(AVATAR_URL_PREFIX):
        return None
    filename = url.removeprefix(AVATAR_URL_PREFIX).strip()
    if not filename:
        return None
    return avatar_upload_dir() / filename


def delete_avatar_file(url: str | None) -> None:
    path = avatar_path_from_url(url)
    if path is not None and path.exists():
        path.unlink()


def row_to_profile(row: Any) -> AgentProfileOut:
    raw_skills = row["allowed_skills_json"]
    if isinstance(raw_skills, str):
        allowed_skills = json.loads(raw_skills)
    else:
        allowed_skills = list(raw_skills or [])
    return AgentProfileOut(
        id=str(row["id"]),
        user_id=int(row["user_id"]),
        name=str(row["name"]),
        description=str(row["description"] or ""),
        agent_type=str(row["agent_type"]),
        app_id=str(row["app_id"]) if row["app_id"] is not None else None,
        avatar_url=str(row["avatar_url"]) if "avatar_url" in row and row["avatar_url"] is not None else None,
        persona_prompt=str(row["persona_prompt"] or ""),
        allowed_skills=[str(item) for item in allowed_skills],
        temperature=float(row["temperature"]),
        max_tool_loops=int(row["max_tool_loops"]),
        is_default=bool(row["is_default"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def init_agent_profiles(conn: Any) -> None:
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_profiles (
          id TEXT PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          agent_type TEXT NOT NULL,
          app_id TEXT NULL,
          avatar_url TEXT NULL,
          persona_prompt TEXT NOT NULL DEFAULT '',
          allowed_skills_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          temperature DOUBLE PRECISION NOT NULL DEFAULT 0.2,
          max_tool_loops INTEGER NOT NULL DEFAULT 4,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT chk_agent_profiles_agent_type CHECK (agent_type IN ('dashboard_agent', 'app_agent:arxiv', 'app_agent:vocab')),
          CONSTRAINT chk_agent_profiles_temperature CHECK (temperature >= 0 AND temperature <= 1.2),
          CONSTRAINT chk_agent_profiles_max_tool_loops CHECK (max_tool_loops >= 1 AND max_tool_loops <= 8)
        );
        """
    )
    await conn.execute("ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;")
    await conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_profiles_default_per_user ON agent_profiles(user_id) WHERE is_default = TRUE;"
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_profiles_user_updated ON agent_profiles(user_id, updated_at DESC);"
    )


async def _clear_default_for_user(conn: Any, *, user_id: int, exclude_id: str | None = None) -> None:
    if exclude_id is None:
        await conn.execute("UPDATE agent_profiles SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_default = TRUE", user_id)
    else:
        await conn.execute(
            "UPDATE agent_profiles SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_default = TRUE AND id <> $2",
            user_id,
            exclude_id,
        )


async def ensure_default_profile(conn: Any, *, user_id: int) -> AgentProfileOut:
    row = await conn.fetchrow(
        """
        SELECT id, user_id, name, description, agent_type, app_id, avatar_url, persona_prompt, allowed_skills_json,
               temperature, max_tool_loops, is_default, created_at, updated_at
        FROM agent_profiles
        WHERE user_id = $1
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
        """,
        user_id,
    )
    if row is not None:
        return row_to_profile(row)

    name, description, persona_prompt = _default_profile_values("dashboard_agent")
    default_skills = normalize_allowed_skills([], agent_type="dashboard_agent")
    profile_id = "apf_" + secrets.token_urlsafe(12)
    inserted = await conn.fetchrow(
        """
        INSERT INTO agent_profiles(
            id, user_id, name, description, agent_type, app_id, avatar_url, persona_prompt,
            allowed_skills_json, temperature, max_tool_loops, is_default
        )
        VALUES ($1, $2, $3, $4, 'dashboard_agent', NULL, NULL, $5, $6::jsonb, 0.2, 4, TRUE)
        RETURNING id, user_id, name, description, agent_type, app_id, avatar_url, persona_prompt, allowed_skills_json,
                  temperature, max_tool_loops, is_default, created_at, updated_at
        """,
        profile_id,
        user_id,
        name,
        description,
        persona_prompt,
        json.dumps(default_skills, ensure_ascii=False),
    )
    if inserted is None:
        raise HTTPException(status_code=500, detail="创建默认 Agent Profile 失败")
    return row_to_profile(inserted)


async def list_profiles(conn: Any, *, user_id: int) -> list[AgentProfileOut]:
    _ = await ensure_default_profile(conn, user_id=user_id)
    rows = await conn.fetch(
        """
        SELECT id, user_id, name, description, agent_type, app_id, avatar_url, persona_prompt, allowed_skills_json,
               temperature, max_tool_loops, is_default, created_at, updated_at
        FROM agent_profiles
        WHERE user_id = $1
        ORDER BY is_default DESC, updated_at DESC
        """,
        user_id,
    )
    return [row_to_profile(row) for row in rows]


async def get_profile_by_id(conn: Any, *, user_id: int, profile_id: str) -> AgentProfileOut:
    row = await conn.fetchrow(
        """
        SELECT id, user_id, name, description, agent_type, app_id, avatar_url, persona_prompt, allowed_skills_json,
               temperature, max_tool_loops, is_default, created_at, updated_at
        FROM agent_profiles
        WHERE user_id = $1 AND id = $2
        """,
        user_id,
        profile_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Agent Profile 不存在")
    return row_to_profile(row)


async def get_default_profile(conn: Any, *, user_id: int) -> AgentProfileOut:
    profile = await ensure_default_profile(conn, user_id=user_id)
    if profile.is_default:
        return profile
    row = await conn.fetchrow(
        """
        SELECT id, user_id, name, description, agent_type, app_id, avatar_url, persona_prompt, allowed_skills_json,
               temperature, max_tool_loops, is_default, created_at, updated_at
        FROM agent_profiles
        WHERE user_id = $1 AND is_default = TRUE
        LIMIT 1
        """,
        user_id,
    )
    if row is not None:
        return row_to_profile(row)
    await _clear_default_for_user(conn, user_id=user_id)
    await conn.execute("UPDATE agent_profiles SET is_default = TRUE, updated_at = NOW() WHERE id = $1", profile.id)
    updated = await get_profile_by_id(conn, user_id=user_id, profile_id=profile.id)
    return updated


async def create_profile(conn: Any, *, user_id: int, payload: AgentProfileCreateRequest) -> AgentProfileOut:
    agent_type = payload.agent_type
    default_name, default_description, default_persona = _default_profile_values(agent_type)
    allowed_skills = normalize_allowed_skills(payload.allowed_skills, agent_type=agent_type)
    app_id = normalize_app_id(agent_type, payload.app_id)
    if payload.is_default:
        await _clear_default_for_user(conn, user_id=user_id)
    else:
        await ensure_default_profile(conn, user_id=user_id)
    row = await conn.fetchrow(
        """
        INSERT INTO agent_profiles(
            id, user_id, name, description, agent_type, app_id, avatar_url, persona_prompt,
            allowed_skills_json, temperature, max_tool_loops, is_default
        )
        VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8::jsonb, $9, $10, $11)
        RETURNING id, user_id, name, description, agent_type, app_id, avatar_url, persona_prompt, allowed_skills_json,
                  temperature, max_tool_loops, is_default, created_at, updated_at
        """,
        "apf_" + secrets.token_urlsafe(12),
        user_id,
        payload.name.strip() or default_name,
        payload.description.strip() if payload.description.strip() else default_description,
        agent_type,
        app_id,
        payload.persona_prompt.strip() if payload.persona_prompt.strip() else default_persona,
        json.dumps(allowed_skills, ensure_ascii=False),
        payload.temperature,
        payload.max_tool_loops or 4,
        payload.is_default,
    )
    if row is None:
        raise HTTPException(status_code=500, detail="创建 Agent Profile 失败")
    return row_to_profile(row)


async def update_profile(conn: Any, *, user_id: int, profile_id: str, payload: AgentProfileUpdateRequest) -> AgentProfileOut:
    current = await get_profile_by_id(conn, user_id=user_id, profile_id=profile_id)
    agent_type = payload.agent_type or current.agent_type
    default_name, default_description, default_persona = _default_profile_values(agent_type)
    allowed_skills = normalize_allowed_skills(
        payload.allowed_skills if payload.allowed_skills is not None else current.allowed_skills,
        agent_type=agent_type,
    )
    app_id = normalize_app_id(agent_type, payload.app_id if payload.app_id is not None else current.app_id)
    name = payload.name.strip() if isinstance(payload.name, str) and payload.name.strip() else current.name or default_name
    description = payload.description.strip() if isinstance(payload.description, str) else current.description or default_description
    persona_prompt = payload.persona_prompt.strip() if isinstance(payload.persona_prompt, str) and payload.persona_prompt.strip() else current.persona_prompt or default_persona
    temperature = payload.temperature if payload.temperature is not None else current.temperature
    max_tool_loops = payload.max_tool_loops if payload.max_tool_loops is not None else current.max_tool_loops
    next_default = payload.is_default if payload.is_default is not None else current.is_default
    if next_default:
        await _clear_default_for_user(conn, user_id=user_id, exclude_id=profile_id)
    row = await conn.fetchrow(
        """
        UPDATE agent_profiles
        SET name = $1,
            description = $2,
            agent_type = $3,
            app_id = $4,
            avatar_url = $5,
            persona_prompt = $6,
            allowed_skills_json = $7::jsonb,
            temperature = $8,
            max_tool_loops = $9,
            is_default = $10,
            updated_at = NOW()
        WHERE id = $11 AND user_id = $12
        RETURNING id, user_id, name, description, agent_type, app_id, avatar_url, persona_prompt, allowed_skills_json,
                  temperature, max_tool_loops, is_default, created_at, updated_at
        """,
        name,
        description,
        agent_type,
        app_id,
        current.avatar_url,
        persona_prompt,
        json.dumps(allowed_skills, ensure_ascii=False),
        temperature,
        max_tool_loops,
        next_default,
        profile_id,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Agent Profile 不存在")
    return row_to_profile(row)


async def set_default_profile(conn: Any, *, user_id: int, profile_id: str) -> AgentProfileOut:
    _ = await get_profile_by_id(conn, user_id=user_id, profile_id=profile_id)
    await _clear_default_for_user(conn, user_id=user_id, exclude_id=profile_id)
    await conn.execute("UPDATE agent_profiles SET is_default = TRUE, updated_at = NOW() WHERE id = $1 AND user_id = $2", profile_id, user_id)
    return await get_profile_by_id(conn, user_id=user_id, profile_id=profile_id)


async def delete_profile(conn: Any, *, user_id: int, profile_id: str) -> dict[str, bool]:
    profile = await get_profile_by_id(conn, user_id=user_id, profile_id=profile_id)
    await conn.execute("DELETE FROM agent_profiles WHERE id = $1 AND user_id = $2", profile_id, user_id)
    delete_avatar_file(profile.avatar_url)
    if profile.is_default:
        next_row = await conn.fetchrow(
            """
            SELECT id
            FROM agent_profiles
            WHERE user_id = $1
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            user_id,
        )
        if next_row is not None:
            await conn.execute("UPDATE agent_profiles SET is_default = TRUE, updated_at = NOW() WHERE id = $1", str(next_row["id"]))
    return {"ok": True}


async def upload_profile_avatar(
    conn: Any,
    *,
    user_id: int,
    profile_id: str,
    content_type: str | None,
    content: bytes,
) -> AgentProfileOut:
    profile = await get_profile_by_id(conn, user_id=user_id, profile_id=profile_id)
    normalized_type = (content_type or "").strip().lower()
    ext = ALLOWED_AVATAR_TYPES.get(normalized_type)
    if ext is None:
        raise HTTPException(status_code=422, detail="仅支持 PNG、JPEG 或 WebP 图片")
    if not content:
        raise HTTPException(status_code=422, detail="头像文件不能为空")
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="头像文件不能超过 2MB")
    avatar_upload_dir().mkdir(parents=True, exist_ok=True)
    filename = f"{user_id}_{profile_id}_{secrets.token_urlsafe(8)}.{ext}"
    avatar_path = avatar_upload_dir() / filename
    avatar_path.write_bytes(content)
    avatar_url = avatar_url_for_filename(filename)
    try:
        row = await conn.fetchrow(
            """
            UPDATE agent_profiles
            SET avatar_url = $1,
                updated_at = NOW()
            WHERE id = $2 AND user_id = $3
            RETURNING id, user_id, name, description, agent_type, app_id, avatar_url, persona_prompt, allowed_skills_json,
                      temperature, max_tool_loops, is_default, created_at, updated_at
            """,
            avatar_url,
            profile_id,
            user_id,
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Agent Profile 不存在")
    except Exception:
        if avatar_path.exists():
            avatar_path.unlink()
        raise
    delete_avatar_file(profile.avatar_url)
    return row_to_profile(row)


async def remove_profile_avatar(conn: Any, *, user_id: int, profile_id: str) -> AgentProfileOut:
    profile = await get_profile_by_id(conn, user_id=user_id, profile_id=profile_id)
    row = await conn.fetchrow(
        """
        UPDATE agent_profiles
        SET avatar_url = NULL,
            updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING id, user_id, name, description, agent_type, app_id, avatar_url, persona_prompt, allowed_skills_json,
                  temperature, max_tool_loops, is_default, created_at, updated_at
        """,
        profile_id,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Agent Profile 不存在")
    delete_avatar_file(profile.avatar_url)
    return row_to_profile(row)
