from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import asyncpg
from fastapi import HTTPException, Request


@dataclass(frozen=True)
class ProfileRecord:
    id: str
    user_id: int
    key: str
    name: str
    config_json: dict[str, Any] | None
    system_prompt: str | None
    system_prompt_path: str | None
    mcp_config_json: dict[str, Any] | None
    is_default: bool
    created_at: datetime
    updated_at: datetime
    mcp_server_ids: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class MCPServerRecord:
    id: str
    user_id: int
    name: str
    description: str | None
    config_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class ProfileFileRecord:
    id: str
    profile_id: str
    user_id: int
    file_type: str
    filename: str
    content: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class SessionRecord:
    id: str
    user_id: int
    profile_id: str
    name: str | None
    workspace_path: str | None
    status: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class SessionRunRecord:
    id: str
    session_id: str
    profile_id: str
    workspace_path: str
    status: str
    snapshot_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


@dataclass(frozen=True)
class MessageRecord:
    id: str
    session_id: str
    run_id: str | None
    role: str
    content: str | None
    event_type: str | None
    sequence_no: int
    name: str | None
    tool_call_id: str | None
    metadata_json: dict[str, Any] | None
    created_at: datetime


AGENT_TABLES = {
    "agent_profiles": {
        "user_id": "BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE",
        "profile_key": "VARCHAR(120)",
        "name": "VARCHAR(50) NOT NULL",
        "config_json": "JSONB",
        "system_prompt": "TEXT",
        "system_prompt_path": "VARCHAR(500)",
        "mcp_config_json": "JSONB",
        "is_default": "BOOLEAN NOT NULL DEFAULT FALSE",
        "created_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "updated_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
    "agent_profile_files": {
        "user_id": "BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE",
        "profile_id": "UUID NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE",
        "file_type": "VARCHAR(50) NOT NULL",
        "filename": "VARCHAR(255) NOT NULL",
        "content": "TEXT",
        "created_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "updated_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
    "agent_mcp_servers": {
        "user_id": "BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE",
        "name": "VARCHAR(120) NOT NULL",
        "description": "VARCHAR(255)",
        "config_json": "JSONB NOT NULL",
        "created_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "updated_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
    "agent_profile_mcp_servers": {
        "profile_id": "UUID NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE",
        "mcp_server_id": "UUID NOT NULL REFERENCES agent_mcp_servers(id) ON DELETE CASCADE",
        "created_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
    "agent_sessions": {
        "user_id": "BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE",
        "profile_id": "UUID NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE",
        "name": "VARCHAR(120)",
        "workspace_path": "VARCHAR(500)",
        "status": "VARCHAR(20) NOT NULL DEFAULT 'idle'",
        "created_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "updated_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
    "agent_session_runs": {
        "session_id": "UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE",
        "profile_id": "UUID NOT NULL REFERENCES agent_profiles(id) ON DELETE RESTRICT",
        "workspace_path": "VARCHAR(500) NOT NULL",
        "status": "VARCHAR(20) NOT NULL DEFAULT 'created'",
        "snapshot_json": "JSONB NOT NULL",
        "created_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "updated_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "completed_at": "TIMESTAMPTZ",
    },
    "agent_message_history": {
        "session_id": "UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE",
        "run_id": "UUID REFERENCES agent_session_runs(id) ON DELETE SET NULL",
        "role": "VARCHAR(20) NOT NULL",
        "content": "TEXT",
        "event_type": "VARCHAR(50)",
        "sequence_no": "INTEGER NOT NULL DEFAULT 0",
        "name": "VARCHAR(255)",
        "tool_call_id": "VARCHAR(255)",
        "metadata_json": "JSONB",
        "created_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
}


def _decode_json_object(value: Any, *, default: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """asyncpg returns JSONB as text by default; normalize it back to dicts for the API layer."""

    if value is None:
        return default
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return default
        if isinstance(decoded, dict):
            return decoded
    return default


async def _ensure_uuid_primary_key(conn: asyncpg.Connection, table_name: str) -> None:
    """Make sure the table's id column uses UUID so FK constraints can be created."""

    column = await conn.fetchrow(
        """
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = 'id'
        """,
        table_name,
    )

    if column is None:
        await conn.execute(
            f"ALTER TABLE {table_name} ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();"
        )
        return

    if (column["data_type"] or "").lower() != "uuid":
        await conn.execute(f"ALTER TABLE {table_name} ALTER COLUMN id DROP DEFAULT;")
        await conn.execute(
            f"ALTER TABLE {table_name} ALTER COLUMN id TYPE UUID USING id::uuid;"
        )
        await conn.execute(
            f"ALTER TABLE {table_name} ALTER COLUMN id SET DEFAULT gen_random_uuid();"
        )


def database_url() -> str:
    url = (
        os.getenv("DATABASE_URL", "").strip()
        or os.getenv("SUPABASE_DB_URL", "").strip()
        or os.getenv("POSTGRES_URL", "").strip()
    )
    if not url:
        raise RuntimeError("DATABASE_URL is not configured (or SUPABASE_DB_URL / POSTGRES_URL)")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    parsed = urlparse(url)
    if parsed.hostname and parsed.hostname.endswith(".supabase.co"):
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        if "sslmode" not in query:
            query["sslmode"] = "require"
            url = urlunparse(parsed._replace(query=urlencode(query)))
    return url


async def init_db(app: Any) -> None:
    pool = await asyncpg.create_pool(dsn=database_url(), min_size=1, max_size=5, command_timeout=30)
    app.state.auth_pool = pool
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await ensure_agent_schema(conn)


async def close_db(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is not None:
        await pool.close()
        app.state.auth_pool = None


async def ensure_agent_schema(conn: asyncpg.Connection) -> None:
    for table_name, columns in AGENT_TABLES.items():
        if table_name == "agent_profiles":
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_profiles (
                  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
                );
                """
            )
        else:
            await conn.execute(
                f"CREATE TABLE IF NOT EXISTS {table_name} (id UUID PRIMARY KEY DEFAULT gen_random_uuid());"
            )

        await _ensure_uuid_primary_key(conn, table_name)

        for column_name, ddl in columns.items():
            await conn.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {column_name} {ddl};")

    await conn.execute(
        """
        UPDATE agent_profiles
        SET profile_key = CONCAT('profile-', REPLACE(id::text, '-', ''))
        WHERE profile_key IS NULL OR BTRIM(profile_key) = '';
        """
    )

    await conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_profile_files_unique ON agent_profile_files(profile_id, file_type);"
    )
    await conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_profiles_profile_key_unique
        ON agent_profiles(profile_key)
        WHERE profile_key IS NOT NULL;
        """
    )
    await conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_mcp_servers_user_name_unique ON agent_mcp_servers(user_id, name);"
    )
    await conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_profile_mcp_servers_unique ON agent_profile_mcp_servers(profile_id, mcp_server_id);"
    )
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_profiles_user_id ON agent_profiles(user_id);")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_mcp_servers_user_id ON agent_mcp_servers(user_id);")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_profile_mcp_servers_profile_id ON agent_profile_mcp_servers(profile_id);")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_sessions_profile_id ON agent_sessions(profile_id);")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_session_runs_session_id ON agent_session_runs(session_id);")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_message_history_session_id ON agent_message_history(session_id);")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_message_history_run_id ON agent_message_history(run_id);")


async def get_pool(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="Database is not initialized")
    return pool


def get_pool_from_app(app: Any) -> asyncpg.Pool:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("Database is not initialized")
    return pool


def _profile_from_row(row: asyncpg.Record, mcp_server_ids: list[str] | None = None) -> ProfileRecord:
    return ProfileRecord(
        id=str(row["id"]),
        user_id=int(row["user_id"]),
        key=str(row["key"]),
        name=str(row["name"]),
        config_json=_decode_json_object(row["config_json"]),
        system_prompt=row["system_prompt"],
        system_prompt_path=row["system_prompt_path"],
        mcp_config_json=_decode_json_object(row["mcp_config_json"]),
        is_default=bool(row["is_default"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        mcp_server_ids=list(mcp_server_ids or []),
    )


def _mcp_server_from_row(row: asyncpg.Record) -> MCPServerRecord:
    return MCPServerRecord(
        id=str(row["id"]),
        user_id=int(row["user_id"]),
        name=str(row["name"]),
        description=row["description"],
        config_json=_decode_json_object(row["config_json"], default={}) or {},
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _profile_file_from_row(row: asyncpg.Record) -> ProfileFileRecord:
    return ProfileFileRecord(
        id=str(row["id"]),
        profile_id=str(row["profile_id"]),
        user_id=int(row["user_id"]),
        file_type=str(row["file_type"]),
        filename=str(row["filename"]),
        content=row["content"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _session_from_row(row: asyncpg.Record) -> SessionRecord:
    return SessionRecord(
        id=str(row["id"]),
        user_id=int(row["user_id"]),
        profile_id=str(row["profile_id"]),
        name=row["name"],
        workspace_path=row["workspace_path"],
        status=str(row["status"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _run_from_row(row: asyncpg.Record) -> SessionRunRecord:
    return SessionRunRecord(
        id=str(row["id"]),
        session_id=str(row["session_id"]),
        profile_id=str(row["profile_id"]),
        workspace_path=str(row["workspace_path"]),
        status=str(row["status"]),
        snapshot_json=_decode_json_object(row["snapshot_json"], default={}) or {},
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        completed_at=row["completed_at"],
    )


def _message_from_row(row: asyncpg.Record) -> MessageRecord:
    return MessageRecord(
        id=str(row["id"]),
        session_id=str(row["session_id"]),
        run_id=str(row["run_id"]) if row["run_id"] is not None else None,
        role=str(row["role"]),
        content=row["content"],
        event_type=row["event_type"],
        sequence_no=int(row["sequence_no"]),
        name=row["name"],
        tool_call_id=row["tool_call_id"],
        metadata_json=_decode_json_object(row["metadata_json"]),
        created_at=row["created_at"],
    )


async def list_profiles(pool: asyncpg.Pool, user_id: int) -> list[ProfileRecord]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, user_id, profile_key AS key, name, config_json, system_prompt, system_prompt_path,
                   mcp_config_json, is_default, created_at, updated_at
            FROM agent_profiles
            WHERE user_id = $1
            ORDER BY is_default DESC, created_at ASC, id ASC
            """,
            user_id,
        )
        mcp_server_ids = await _load_profile_mcp_server_ids_map(conn, [str(row["id"]) for row in rows])
    return [_profile_from_row(row, mcp_server_ids.get(str(row["id"]), [])) for row in rows]


async def get_profile(pool: asyncpg.Pool, user_id: int, profile_id: str) -> ProfileRecord | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, profile_key AS key, name, config_json, system_prompt, system_prompt_path,
                   mcp_config_json, is_default, created_at, updated_at
            FROM agent_profiles
            WHERE user_id = $1 AND id = $2::uuid
            """,
            user_id,
            profile_id,
        )
        if row is None:
            return None
        mcp_server_ids = await _load_profile_mcp_server_ids_map(conn, [profile_id])
    return _profile_from_row(row, mcp_server_ids.get(profile_id, []))


async def get_profile_by_key(pool: asyncpg.Pool, profile_key: str) -> ProfileRecord | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, profile_key AS key, name, config_json, system_prompt, system_prompt_path,
                   mcp_config_json, is_default, created_at, updated_at
            FROM agent_profiles
            WHERE profile_key = $1
            """,
            profile_key,
        )
        if row is None:
            return None
        profile_id = str(row["id"])
        mcp_server_ids = await _load_profile_mcp_server_ids_map(conn, [profile_id])
    return _profile_from_row(row, mcp_server_ids.get(profile_id, []))


async def _load_profile_mcp_server_ids_map(
    conn: asyncpg.Connection,
    profile_ids: list[str],
) -> dict[str, list[str]]:
    if not profile_ids:
        return {}
    rows = await conn.fetch(
        """
        SELECT profile_id, mcp_server_id
        FROM agent_profile_mcp_servers
        WHERE profile_id = ANY($1::uuid[])
        ORDER BY created_at ASC, mcp_server_id ASC
        """,
        profile_ids,
    )
    mapping: dict[str, list[str]] = {profile_id: [] for profile_id in profile_ids}
    for row in rows:
        mapping.setdefault(str(row["profile_id"]), []).append(str(row["mcp_server_id"]))
    return mapping


async def _replace_profile_mcp_server_bindings(
    conn: asyncpg.Connection,
    profile_id: str,
    mcp_server_ids: list[str],
) -> None:
    await conn.execute("DELETE FROM agent_profile_mcp_servers WHERE profile_id = $1::uuid", profile_id)
    if not mcp_server_ids:
        return
    rows = await conn.fetch(
        """
        SELECT id
        FROM agent_mcp_servers
        WHERE id = ANY($1::uuid[])
        ORDER BY id ASC
        """,
        mcp_server_ids,
    )
    valid_ids = {str(row["id"]) for row in rows}
    missing = [server_id for server_id in mcp_server_ids if server_id not in valid_ids]
    if missing:
        raise HTTPException(status_code=400, detail="One or more selected MCP servers were not found")
    for server_id in mcp_server_ids:
        await conn.execute(
            """
            INSERT INTO agent_profile_mcp_servers(profile_id, mcp_server_id)
            VALUES ($1::uuid, $2::uuid)
            ON CONFLICT (profile_id, mcp_server_id) DO NOTHING
            """,
            profile_id,
            server_id,
        )


async def create_profile(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    key: str,
    name: str,
    config_json: dict[str, Any] | None,
    system_prompt: str | None,
    system_prompt_path: str | None,
    mcp_config_json: dict[str, Any] | None,
    mcp_server_ids: list[str] | None,
    is_default: bool,
) -> ProfileRecord:
    async with pool.acquire() as conn:
        try:
            async with conn.transaction():
                existing = await conn.fetchval("SELECT id FROM agent_profiles WHERE user_id = $1 LIMIT 1", user_id)
                should_be_default = is_default or existing is None
                if should_be_default:
                    await conn.execute(
                        "UPDATE agent_profiles SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_default = TRUE",
                        user_id,
                    )
                row = await conn.fetchrow(
                    """
                    INSERT INTO agent_profiles(user_id, profile_key, name, config_json, system_prompt, system_prompt_path, mcp_config_json, is_default, updated_at)
                    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, NOW())
                    RETURNING id, user_id, profile_key AS key, name, config_json, system_prompt, system_prompt_path,
                              mcp_config_json, is_default, created_at, updated_at
                    """,
                    user_id,
                    key,
                    name,
                    json.dumps(config_json) if config_json is not None else None,
                    system_prompt,
                    system_prompt_path,
                    json.dumps(mcp_config_json) if mcp_config_json is not None else None,
                    should_be_default,
                )
                await _replace_profile_mcp_server_bindings(conn, str(row["id"]), list(mcp_server_ids or []))
        except asyncpg.UniqueViolationError as exc:
            raise HTTPException(status_code=409, detail=f"Profile key `{key}` already exists") from exc
    return _profile_from_row(row, list(mcp_server_ids or []))


async def update_profile(pool: asyncpg.Pool, user_id: int, profile_id: str, data: dict[str, Any]) -> ProfileRecord | None:
    async with pool.acquire() as conn:
        try:
            async with conn.transaction():
                current = await conn.fetchrow(
                    """
                    SELECT id, user_id, profile_key AS key, name, config_json, system_prompt, system_prompt_path,
                           mcp_config_json, is_default, created_at, updated_at
                    FROM agent_profiles
                    WHERE user_id = $1 AND id = $2::uuid
                    """,
                    user_id,
                    profile_id,
                )
                if current is None:
                    return None
                current_ids_map = await _load_profile_mcp_server_ids_map(conn, [profile_id])
                current_profile = _profile_from_row(current, current_ids_map.get(profile_id, []))
                is_default = data.get("is_default")
                if is_default is True:
                    await conn.execute(
                        "UPDATE agent_profiles SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_default = TRUE",
                        user_id,
                    )
                elif is_default is False and current_profile.is_default:
                    replacement = await conn.fetchval(
                        "SELECT id FROM agent_profiles WHERE user_id = $1 AND id != $2::uuid ORDER BY created_at ASC, id ASC LIMIT 1",
                        user_id,
                        profile_id,
                    )
                    if replacement is not None:
                        await conn.execute(
                            "UPDATE agent_profiles SET is_default = TRUE, updated_at = NOW() WHERE id = $1::uuid",
                            str(replacement),
                        )
                    else:
                        data.pop("is_default", None)

                merged = {
                    "key": data.get("key", current_profile.key),
                    "name": data.get("name", current_profile.name),
                    "config_json": data.get("config_json", current_profile.config_json),
                    "system_prompt": data.get("system_prompt", current_profile.system_prompt),
                    "system_prompt_path": data.get("system_prompt_path", current_profile.system_prompt_path),
                    "mcp_config_json": data.get("mcp_config_json", current_profile.mcp_config_json),
                    "mcp_server_ids": data.get("mcp_server_ids", current_profile.mcp_server_ids),
                    "is_default": data.get("is_default", current_profile.is_default),
                }
                row = await conn.fetchrow(
                    """
                    UPDATE agent_profiles
                    SET profile_key = $2,
                        name = $3,
                        config_json = $4::jsonb,
                        system_prompt = $5,
                        system_prompt_path = $6,
                        mcp_config_json = $7::jsonb,
                        is_default = $8,
                        updated_at = NOW()
                    WHERE user_id = $9 AND id = $1::uuid
                    RETURNING id, user_id, profile_key AS key, name, config_json, system_prompt, system_prompt_path,
                              mcp_config_json, is_default, created_at, updated_at
                    """,
                    profile_id,
                    merged["key"],
                    merged["name"],
                    json.dumps(merged["config_json"]) if merged["config_json"] is not None else None,
                    merged["system_prompt"],
                    merged["system_prompt_path"],
                    json.dumps(merged["mcp_config_json"]) if merged["mcp_config_json"] is not None else None,
                    merged["is_default"],
                    user_id,
                )
                await _replace_profile_mcp_server_bindings(conn, profile_id, list(merged["mcp_server_ids"] or []))
        except asyncpg.UniqueViolationError as exc:
            attempted_key = data.get("key", "")
            raise HTTPException(status_code=409, detail=f"Profile key `{attempted_key}` already exists") from exc
    return _profile_from_row(row, list(merged["mcp_server_ids"] or [])) if row else None


async def delete_profile(pool: asyncpg.Pool, user_id: int, profile_id: str) -> tuple[bool, str | None]:
    async with pool.acquire() as conn:
        async with conn.transaction():
            profile_row = await conn.fetchrow(
                "SELECT id, is_default FROM agent_profiles WHERE user_id = $1 AND id = $2::uuid",
                user_id,
                profile_id,
            )
            if profile_row is None:
                return False, None
            replacement = await conn.fetchrow(
                "SELECT id FROM agent_profiles WHERE user_id = $1 AND id != $2::uuid ORDER BY created_at ASC, id ASC LIMIT 1",
                user_id,
                profile_id,
            )
            if replacement is None:
                raise HTTPException(status_code=409, detail="Cannot delete the last remaining profile")
            replacement_id = str(replacement["id"])
            if bool(profile_row["is_default"]):
                await conn.execute(
                    "UPDATE agent_profiles SET is_default = FALSE, updated_at = NOW() WHERE is_default = TRUE",
                )
                await conn.execute(
                    "UPDATE agent_profiles SET is_default = TRUE, updated_at = NOW() WHERE id = $1::uuid",
                    replacement_id,
                )
            await conn.execute(
                "UPDATE agent_sessions SET profile_id = $1::uuid, updated_at = NOW() WHERE profile_id = $2::uuid",
                replacement_id,
                profile_id,
            )
            await conn.execute(
                "UPDATE agent_session_runs SET profile_id = $1::uuid, updated_at = NOW() WHERE profile_id = $2::uuid",
                replacement_id,
                profile_id,
            )
            await conn.execute("DELETE FROM agent_profiles WHERE id = $1::uuid", profile_id)
    return True, replacement_id


async def set_default_profile(pool: asyncpg.Pool, user_id: int, profile_id: str) -> ProfileRecord | None:
    async with pool.acquire() as conn:
        async with conn.transaction():
            exists = await conn.fetchval(
                "SELECT id FROM agent_profiles WHERE user_id = $1 AND id = $2::uuid",
                user_id,
                profile_id,
            )
            if exists is None:
                return None
            await conn.execute(
                "UPDATE agent_profiles SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_default = TRUE",
                user_id,
            )
            row = await conn.fetchrow(
                """
                UPDATE agent_profiles
                SET is_default = TRUE, updated_at = NOW()
                WHERE id = $1::uuid
                RETURNING id, user_id, profile_key AS key, name, config_json, system_prompt, system_prompt_path,
                          mcp_config_json, is_default, created_at, updated_at
                """,
                profile_id,
            )
        mcp_server_ids = await _load_profile_mcp_server_ids_map(conn, [profile_id])
    return _profile_from_row(row, mcp_server_ids.get(profile_id, [])) if row else None


async def list_mcp_servers(pool: asyncpg.Pool, user_id: int) -> list[MCPServerRecord]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, user_id, name, description, config_json, created_at, updated_at
            FROM agent_mcp_servers
            WHERE user_id = $1
            ORDER BY name ASC, id ASC
            """,
            user_id,
        )
    return [_mcp_server_from_row(row) for row in rows]


async def create_mcp_server(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    name: str,
    description: str | None,
    config_json: dict[str, Any],
) -> MCPServerRecord:
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO agent_mcp_servers(user_id, name, description, config_json, updated_at)
                VALUES ($1, $2, $3, $4::jsonb, NOW())
                RETURNING id, user_id, name, description, config_json, created_at, updated_at
                """,
                user_id,
                name,
                description,
                json.dumps(config_json),
            )
        except asyncpg.UniqueViolationError as exc:
            raise HTTPException(status_code=409, detail=f"MCP server `{name}` already exists") from exc
    return _mcp_server_from_row(row)


async def update_mcp_server(
    pool: asyncpg.Pool,
    user_id: int,
    server_id: str,
    data: dict[str, Any],
) -> MCPServerRecord | None:
    async with pool.acquire() as conn:
        current = await conn.fetchrow(
            """
            SELECT id, user_id, name, description, config_json, created_at, updated_at
            FROM agent_mcp_servers
            WHERE user_id = $1 AND id = $2::uuid
            """,
            user_id,
            server_id,
        )
        if current is None:
            return None
        current_server = _mcp_server_from_row(current)
        try:
            row = await conn.fetchrow(
                """
                UPDATE agent_mcp_servers
                SET name = $3,
                    description = $4,
                    config_json = $5::jsonb,
                    updated_at = NOW()
                WHERE user_id = $1 AND id = $2::uuid
                RETURNING id, user_id, name, description, config_json, created_at, updated_at
                """,
                user_id,
                server_id,
                data.get("name", current_server.name),
                data.get("description", current_server.description),
                json.dumps(data.get("config_json", current_server.config_json)),
            )
        except asyncpg.UniqueViolationError as exc:
            attempted_name = data.get("name", current_server.name)
            raise HTTPException(status_code=409, detail=f"MCP server `{attempted_name}` already exists") from exc
    return _mcp_server_from_row(row) if row else None


async def delete_mcp_server(pool: asyncpg.Pool, user_id: int, server_id: str) -> bool:
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM agent_mcp_servers WHERE user_id = $1 AND id = $2::uuid",
            user_id,
            server_id,
        )
    return result.endswith("1")


async def import_mcp_servers(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    config_json: dict[str, Any],
) -> list[MCPServerRecord]:
    mcp_servers = config_json.get("mcpServers", {})
    if not isinstance(mcp_servers, dict) or not mcp_servers:
        raise HTTPException(status_code=400, detail="Import payload must contain a non-empty `mcpServers` object")

    imported: list[MCPServerRecord] = []
    for name, server_config in mcp_servers.items():
        if not isinstance(server_config, dict):
            raise HTTPException(status_code=400, detail=f"MCP server `{name}` must be a JSON object")
        imported.append(
            await create_mcp_server(
                pool,
                user_id=user_id,
                name=name,
                description=server_config.get("description") if isinstance(server_config.get("description"), str) else None,
                config_json=server_config,
            )
        )
    return imported


async def list_mcp_servers_for_profile(pool: asyncpg.Pool, user_id: int, profile_id: str) -> list[MCPServerRecord]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.id, s.user_id, s.name, s.description, s.config_json, s.created_at, s.updated_at
            FROM agent_mcp_servers s
            JOIN agent_profile_mcp_servers pms ON pms.mcp_server_id = s.id
            JOIN agent_profiles p ON p.id = pms.profile_id
            WHERE p.user_id = $1 AND p.id = $2::uuid
            ORDER BY s.name ASC, s.id ASC
            """,
            user_id,
            profile_id,
        )
    return [_mcp_server_from_row(row) for row in rows]


async def list_profile_files(pool: asyncpg.Pool, user_id: int, profile_id: str) -> list[ProfileFileRecord]:
    del user_id
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT f.id, f.profile_id, f.user_id, f.file_type, f.filename, f.content, f.created_at, f.updated_at
            FROM agent_profile_files f
            JOIN agent_profiles p ON p.id = f.profile_id
            WHERE p.id = $1::uuid
            ORDER BY f.created_at ASC, f.id ASC
            """,
            profile_id,
        )
    return [_profile_file_from_row(row) for row in rows]


async def get_profile_file(pool: asyncpg.Pool, user_id: int, profile_id: str, file_type: str) -> ProfileFileRecord | None:
    del user_id
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT f.id, f.profile_id, f.user_id, f.file_type, f.filename, f.content, f.created_at, f.updated_at
            FROM agent_profile_files f
            JOIN agent_profiles p ON p.id = f.profile_id
            WHERE p.id = $1::uuid AND f.file_type = $2
            """,
            profile_id,
            file_type,
        )
    return _profile_file_from_row(row) if row else None


async def upsert_profile_file(
    pool: asyncpg.Pool,
    user_id: int,
    profile_id: str,
    file_type: str,
    filename: str,
    content: str | None,
) -> ProfileFileRecord:
    async with pool.acquire() as conn:
        async with conn.transaction():
            exists = await conn.fetchval(
                "SELECT id FROM agent_profiles WHERE id = $1::uuid",
                profile_id,
            )
            if exists is None:
                raise HTTPException(status_code=404, detail="Profile not found")
            row = await conn.fetchrow(
                """
                INSERT INTO agent_profile_files(user_id, profile_id, file_type, filename, content, updated_at)
                VALUES ($1, $2::uuid, $3, $4, $5, NOW())
                ON CONFLICT (profile_id, file_type)
                DO UPDATE SET filename = EXCLUDED.filename, content = EXCLUDED.content, updated_at = NOW()
                RETURNING id, profile_id, user_id, file_type, filename, content, created_at, updated_at
                """,
                user_id,
                profile_id,
                file_type,
                filename,
                content,
            )
    return _profile_file_from_row(row)


async def delete_profile_file(pool: asyncpg.Pool, user_id: int, profile_id: str, file_type: str) -> None:
    del user_id
    async with pool.acquire() as conn:
        await conn.execute(
            """
            DELETE FROM agent_profile_files f
            USING agent_profiles p
            WHERE f.profile_id = p.id AND p.id = $1::uuid AND f.file_type = $2
            """,
            profile_id,
            file_type,
        )


async def list_sessions(pool: asyncpg.Pool, user_id: int) -> list[SessionRecord]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, user_id, profile_id, name, workspace_path, status, created_at, updated_at
            FROM agent_sessions
            WHERE user_id = $1
            ORDER BY updated_at DESC, id DESC
            """,
            user_id,
        )
    return [_session_from_row(row) for row in rows]


async def get_session(pool: asyncpg.Pool, user_id: int, session_id: str) -> SessionRecord | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, profile_id, name, workspace_path, status, created_at, updated_at
            FROM agent_sessions
            WHERE user_id = $1 AND id = $2::uuid
            """,
            user_id,
            session_id,
        )
    return _session_from_row(row) if row else None


async def get_latest_session_for_profile(pool: asyncpg.Pool, user_id: int, profile_id: str) -> SessionRecord | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, profile_id, name, workspace_path, status, created_at, updated_at
            FROM agent_sessions
            WHERE user_id = $1 AND profile_id = $2::uuid
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """,
            user_id,
            profile_id,
        )
    return _session_from_row(row) if row else None


async def create_session(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    profile_id: str,
    name: str | None,
    workspace_path: str | None,
    status: str,
) -> SessionRecord:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO agent_sessions(user_id, profile_id, name, workspace_path, status, updated_at)
            VALUES ($1, $2::uuid, $3, $4, $5, NOW())
            RETURNING id, user_id, profile_id, name, workspace_path, status, created_at, updated_at
            """,
            user_id,
            profile_id,
            name,
            workspace_path,
            status,
        )
    return _session_from_row(row)


async def update_session(
    pool: asyncpg.Pool,
    user_id: int,
    session_id: str,
    *,
    profile_id: str | None = None,
    name: str | None = None,
    workspace_path: str | None = None,
    status: str | None = None,
) -> SessionRecord | None:
    async with pool.acquire() as conn:
        current = await conn.fetchrow(
            """
            SELECT id, user_id, profile_id, name, workspace_path, status, created_at, updated_at
            FROM agent_sessions
            WHERE user_id = $1 AND id = $2::uuid
            """,
            user_id,
            session_id,
        )
        if current is None:
            return None
        current_session = _session_from_row(current)
        row = await conn.fetchrow(
            """
            UPDATE agent_sessions
            SET profile_id = $3::uuid,
                name = $4,
                workspace_path = $5,
                status = $6,
                updated_at = NOW()
            WHERE user_id = $1 AND id = $2::uuid
            RETURNING id, user_id, profile_id, name, workspace_path, status, created_at, updated_at
            """,
            user_id,
            session_id,
            profile_id or current_session.profile_id,
            name if name is not None else current_session.name,
            workspace_path if workspace_path is not None else current_session.workspace_path,
            status or current_session.status,
        )
    return _session_from_row(row) if row else None


async def delete_session(pool: asyncpg.Pool, user_id: int, session_id: str) -> bool:
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM agent_sessions WHERE user_id = $1 AND id = $2::uuid",
            user_id,
            session_id,
        )
    return result.endswith("1")


async def list_messages(pool: asyncpg.Pool, user_id: int, session_id: str) -> list[MessageRecord]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT m.id, m.session_id, m.run_id, m.role, m.content, m.event_type, m.sequence_no,
                   m.name, m.tool_call_id, m.metadata_json, m.created_at
            FROM agent_message_history m
            JOIN agent_sessions s ON s.id = m.session_id
            WHERE s.user_id = $1 AND s.id = $2::uuid
            ORDER BY m.sequence_no ASC, m.created_at ASC
            """,
            user_id,
            session_id,
        )
    return [_message_from_row(row) for row in rows]


async def get_session_history(pool: asyncpg.Pool, session_id: str) -> list[MessageRecord]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, session_id, run_id, role, content, event_type, sequence_no, name, tool_call_id, metadata_json, created_at
            FROM agent_message_history
            WHERE session_id = $1::uuid
            ORDER BY sequence_no ASC, created_at ASC
            """,
            session_id,
        )
    return [_message_from_row(row) for row in rows]


async def create_message(
    pool: asyncpg.Pool,
    user_id: int,
    session_id: str,
    *,
    role: str,
    content: str,
    event_type: str,
    run_id: str | None = None,
    name: str | None = None,
    tool_call_id: str | None = None,
    metadata_json: dict[str, Any] | None = None,
) -> MessageRecord:
    async with pool.acquire() as conn:
        async with conn.transaction():
            exists = await conn.fetchval(
                "SELECT id FROM agent_sessions WHERE user_id = $1 AND id = $2::uuid",
                user_id,
                session_id,
            )
            if exists is None:
                raise HTTPException(status_code=404, detail="Session not found")
            sequence_no = await next_sequence_no(conn, session_id)
            return await insert_message_event(
                conn,
                session_id=session_id,
                run_id=run_id,
                role=role,
                content=content,
                event_type=event_type,
                sequence_no=sequence_no,
                name=name,
                tool_call_id=tool_call_id,
                metadata_json=metadata_json,
            )


async def list_runs(pool: asyncpg.Pool, user_id: int, session_id: str) -> list[SessionRunRecord]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT r.id, r.session_id, r.profile_id, r.workspace_path, r.status, r.snapshot_json, r.created_at, r.updated_at, r.completed_at
            FROM agent_session_runs r
            JOIN agent_sessions s ON s.id = r.session_id
            WHERE s.user_id = $1 AND s.id = $2::uuid
            ORDER BY r.created_at ASC, r.id ASC
            """,
            user_id,
            session_id,
        )
    return [_run_from_row(row) for row in rows]


async def get_run(pool: asyncpg.Pool, user_id: int, session_id: str, run_id: str) -> SessionRunRecord | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT r.id, r.session_id, r.profile_id, r.workspace_path, r.status, r.snapshot_json, r.created_at, r.updated_at, r.completed_at
            FROM agent_session_runs r
            JOIN agent_sessions s ON s.id = r.session_id
            WHERE s.user_id = $1 AND s.id = $2::uuid AND r.id = $3::uuid
            """,
            user_id,
            session_id,
            run_id,
        )
    return _run_from_row(row) if row else None


async def create_run(
    pool: asyncpg.Pool,
    *,
    session_id: str,
    profile_id: str,
    workspace_path: str,
    snapshot_json: dict[str, Any],
) -> SessionRunRecord:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO agent_session_runs(session_id, profile_id, workspace_path, status, snapshot_json, updated_at)
            VALUES ($1::uuid, $2::uuid, $3, 'created', $4::jsonb, NOW())
            RETURNING id, session_id, profile_id, workspace_path, status, snapshot_json, created_at, updated_at, completed_at
            """,
            session_id,
            profile_id,
            workspace_path,
            json.dumps(snapshot_json),
        )
    return _run_from_row(row)


async def update_run_status(
    pool: asyncpg.Pool,
    *,
    run_id: str,
    session_id: str,
    session_status: str,
    run_status: str,
    completed_at: datetime | None = None,
) -> None:
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE agent_sessions SET status = $1, updated_at = NOW() WHERE id = $2::uuid",
                session_status,
                session_id,
            )
            await conn.execute(
                "UPDATE agent_session_runs SET status = $1, completed_at = $2, updated_at = NOW() WHERE id = $3::uuid",
                run_status,
                completed_at,
                run_id,
            )


async def update_session_status(pool: asyncpg.Pool, *, user_id: int, session_id: str, status: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE agent_sessions SET status = $1, updated_at = NOW() WHERE user_id = $2 AND id = $3::uuid",
            status,
            user_id,
            session_id,
        )


async def next_sequence_no(conn: asyncpg.Connection, session_id: str) -> int:
    value = await conn.fetchval(
        "SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM agent_message_history WHERE session_id = $1::uuid",
        session_id,
    )
    return int(value)


async def insert_message_event(
    conn: asyncpg.Connection,
    *,
    session_id: str,
    run_id: str | None,
    role: str,
    content: str | None,
    event_type: str | None,
    sequence_no: int,
    name: str | None,
    tool_call_id: str | None,
    metadata_json: dict[str, Any] | None,
) -> MessageRecord:
    row = await conn.fetchrow(
        """
        INSERT INTO agent_message_history(session_id, run_id, role, content, event_type, sequence_no, name, tool_call_id, metadata_json)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::jsonb)
        RETURNING id, session_id, run_id, role, content, event_type, sequence_no, name, tool_call_id, metadata_json, created_at
        """,
        session_id,
        run_id,
        role,
        content,
        event_type,
        sequence_no,
        name,
        tool_call_id,
        json.dumps(metadata_json) if metadata_json is not None else None,
    )
    return _message_from_row(row)
