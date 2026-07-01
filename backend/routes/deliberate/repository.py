from __future__ import annotations

import json
from typing import Any

import asyncpg

from lib.focus_work_types import normalize_deliberate_kind, normalize_focus_work_type, normalize_snapshot_type


def _json_param(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False, default=str)


def _json_value(value: Any) -> Any:
    if value is None:
        return {}
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return {}
    return value


def _iso(value: Any) -> str:
    return value.isoformat() if value is not None and hasattr(value, "isoformat") else ""


async def init_deliberate(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 deliberate workflow 表")
    await init_tables(pool)


async def init_tables(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS deliberate_workflow_configs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                focus_work_type TEXT NOT NULL,
                bank_id TEXT,
                target_count INTEGER NOT NULL DEFAULT 10,
                scope_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                completion_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'choice';"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD COLUMN IF NOT EXISTS scope_json JSONB NOT NULL DEFAULT '{}'::jsonb;"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD COLUMN IF NOT EXISTS completion_json JSONB NOT NULL DEFAULT '{}'::jsonb;"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD COLUMN IF NOT EXISTS pass_criteria_json JSONB NOT NULL DEFAULT '{}'::jsonb;"
        )
        await conn.execute("ALTER TABLE deliberate_workflow_configs DROP CONSTRAINT IF EXISTS chk_deliberate_configs_kind;")
        await conn.execute("UPDATE deliberate_workflow_configs SET kind = 'flash_card' WHERE kind = 'flashcard'")
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD CONSTRAINT chk_deliberate_configs_kind CHECK (kind IN ('flash_card', 'choice', 'input'));"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs DROP CONSTRAINT IF EXISTS chk_deliberate_configs_focus_work_type;"
        )
        await conn.execute("UPDATE deliberate_workflow_configs SET focus_work_type = 'flash_card' WHERE focus_work_type = 'vocab_today'")
        await conn.execute("UPDATE deliberate_workflow_configs SET focus_work_type = 'choice' WHERE focus_work_type IN ('practice', 'review')")
        await conn.execute(
            """
            ALTER TABLE deliberate_workflow_configs
            ADD CONSTRAINT chk_deliberate_configs_focus_work_type
            CHECK (focus_work_type IN ('flash_card', 'choice', 'input'));
            """
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD COLUMN IF NOT EXISTS task_id UUID NULL;"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD COLUMN IF NOT EXISTS children_json JSONB NOT NULL DEFAULT '[]'::jsonb;"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD COLUMN IF NOT EXISTS primary_filter TEXT NOT NULL DEFAULT 'all';"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD COLUMN IF NOT EXISTS sort_order TEXT NOT NULL DEFAULT 'sequential';"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD COLUMN IF NOT EXISTS use_fsrs BOOLEAN NOT NULL DEFAULT false;"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD COLUMN IF NOT EXISTS backflow_rule TEXT NOT NULL DEFAULT 'none';"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs DROP CONSTRAINT IF EXISTS chk_deliberate_configs_target_count;"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_configs ADD CONSTRAINT chk_deliberate_configs_target_count CHECK (target_count BETWEEN 1 AND 500);"
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS deliberate_workflow_runs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
                config_id UUID NULL REFERENCES deliberate_workflow_configs(id) ON DELETE SET NULL,
                workflow_id UUID NULL REFERENCES focus_workflows(id) ON DELETE SET NULL,
                focus_run_id UUID NULL REFERENCES focus_work_runs(id) ON DELETE SET NULL,
                focus_work_type TEXT NOT NULL,
                bank_id TEXT,
                config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
                progress_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
                snapshot_id UUID NULL,
                snapshot_type TEXT NULL,
                status TEXT NOT NULL DEFAULT 'started',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMPTZ NULL
            );
            """
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_runs ADD COLUMN IF NOT EXISTS progress_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;"
        )
        await conn.execute("ALTER TABLE deliberate_workflow_runs ADD COLUMN IF NOT EXISTS snapshot_id UUID NULL;")
        await conn.execute("ALTER TABLE deliberate_workflow_runs ADD COLUMN IF NOT EXISTS snapshot_type TEXT NULL;")
        await conn.execute("ALTER TABLE deliberate_workflow_runs DROP CONSTRAINT IF EXISTS chk_deliberate_runs_status;")
        await conn.execute(
            "ALTER TABLE deliberate_workflow_runs ADD CONSTRAINT chk_deliberate_runs_status CHECK (status IN ('started', 'content_completed', 'completed', 'abandoned'));"
        )
        await conn.execute("ALTER TABLE deliberate_workflow_runs DROP CONSTRAINT IF EXISTS chk_deliberate_runs_snapshot_type;")
        await conn.execute("UPDATE deliberate_workflow_runs SET snapshot_type = 'flash_card_deck' WHERE snapshot_type = 'vocab_deck'")
        await conn.execute(
            "ALTER TABLE deliberate_workflow_runs ADD CONSTRAINT chk_deliberate_runs_snapshot_type CHECK (snapshot_type IS NULL OR snapshot_type IN ('choice_set', 'flash_card_deck', 'input_set'));"
        )
        await conn.execute(
            "ALTER TABLE deliberate_workflow_runs DROP CONSTRAINT IF EXISTS chk_deliberate_runs_focus_work_type;"
        )
        await conn.execute("UPDATE deliberate_workflow_runs SET focus_work_type = 'flash_card' WHERE focus_work_type = 'vocab_today'")
        await conn.execute("UPDATE deliberate_workflow_runs SET focus_work_type = 'choice' WHERE focus_work_type IN ('practice', 'review')")
        await conn.execute(
            """
            ALTER TABLE deliberate_workflow_runs
            ADD CONSTRAINT chk_deliberate_runs_focus_work_type
            CHECK (focus_work_type IN ('flash_card', 'choice', 'input'));
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_deliberate_configs_user_updated ON deliberate_workflow_configs(user_id, updated_at DESC);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_deliberate_runs_user_config_created ON deliberate_workflow_runs(user_id, config_id, created_at DESC);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_deliberate_runs_focus_run ON deliberate_workflow_runs(focus_run_id);"
        )


def config_to_dict(row: asyncpg.Record | dict[str, Any], *, bank_summary: Any = None, latest_run: Any = None) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "kind": normalize_deliberate_kind(row["kind"]),
        "focus_work_type": normalize_focus_work_type(row["focus_work_type"]),
        "bank_id": row["bank_id"],
        "task_id": str(row["task_id"]) if row.get("task_id") else None,
        "target_count": int(row["target_count"]),
        "scope": _json_value(row["scope_json"]) or {},
        "completion": _json_value(row["completion_json"]) or {},
        "pass_criteria": _json_value(row["pass_criteria_json"]) or {},
        "children": _json_value(row["children_json"]) or [],
        "primary_filter": row.get("primary_filter", "all"),
        "sort_order": row.get("sort_order", "sequential"),
        "use_fsrs": bool(row.get("use_fsrs", False)),
        "backflow_rule": row.get("backflow_rule", "none"),
        "bank_summary": bank_summary,
        "latest_run": latest_run,
        "created_at": _iso(row["created_at"]),
        "updated_at": _iso(row["updated_at"]),
    }


def run_to_summary(row: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "config_id": str(row["config_id"]) if row["config_id"] is not None else None,
        "workflow_id": str(row["workflow_id"]) if row["workflow_id"] is not None else None,
        "focus_run_id": str(row["focus_run_id"]) if row["focus_run_id"] is not None else None,
        "focus_work_type": normalize_focus_work_type(row["focus_work_type"]),
        "bank_id": row["bank_id"],
        "snapshot_id": str(row["snapshot_id"]) if row["snapshot_id"] is not None else None,
        "snapshot_type": normalize_snapshot_type(row["snapshot_type"]) or None,
        "status": row["status"],
        "progress_snapshot": _json_value(row["progress_snapshot"]) or {},
        "created_at": _iso(row["created_at"]),
        "updated_at": _iso(row["updated_at"]),
        "completed_at": _iso(row["completed_at"]) if row["completed_at"] is not None else None,
    }


def run_to_dict(row: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    data = run_to_summary(row)
    data["config_snapshot"] = _json_value(row["config_snapshot"]) or {}
    return data


async def list_configs(conn: asyncpg.Connection, *, user_id: int) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id, user_id, name, kind, focus_work_type, bank_id, task_id, target_count,
               scope_json, completion_json, pass_criteria_json, children_json,
               primary_filter, sort_order, use_fsrs, backflow_rule,
               created_at, updated_at
        FROM deliberate_workflow_configs
        WHERE user_id = $1
        ORDER BY updated_at DESC, created_at DESC
        """,
        user_id,
    )


async def get_config(conn: asyncpg.Connection, *, user_id: int, config_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT id, user_id, name, kind, focus_work_type, bank_id, task_id, target_count,
               scope_json, completion_json, pass_criteria_json, children_json,
               primary_filter, sort_order, use_fsrs, backflow_rule,
               created_at, updated_at
        FROM deliberate_workflow_configs
        WHERE id = $1::uuid AND user_id = $2
        """,
        config_id,
        user_id,
    )


async def create_config(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    name: str,
    kind: str,
    focus_work_type: str,
    bank_id: str | None,
    task_id: str | None,
    target_count: int,
    scope: dict[str, Any],
    completion: dict[str, Any],
    pass_criteria: dict[str, Any],
    children: list[dict[str, Any]] | None = None,
    primary_filter: str = "all",
    sort_order: str = "sequential",
    use_fsrs: bool = False,
    backflow_rule: str = "none",
) -> asyncpg.Record:
    return await conn.fetchrow(
        """
        INSERT INTO deliberate_workflow_configs(
            user_id, name, kind, focus_work_type, bank_id, task_id, target_count,
            scope_json, completion_json, pass_criteria_json, children_json,
            primary_filter, sort_order, use_fsrs, backflow_rule
        )
        VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
                $12, $13, $14, $15)
        RETURNING id, user_id, name, kind, focus_work_type, bank_id, task_id, target_count,
                  scope_json, completion_json, pass_criteria_json, children_json,
                  primary_filter, sort_order, use_fsrs, backflow_rule,
                  created_at, updated_at
        """,
        user_id,
        name,
        kind,
        focus_work_type,
        bank_id,
        task_id,
        target_count,
        _json_param(scope),
        _json_param(completion),
        _json_param(pass_criteria),
        _json_param(children or []),
        primary_filter,
        sort_order,
        use_fsrs,
        backflow_rule,
    )


async def update_config(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    config_id: str,
    patch: dict[str, Any],
) -> asyncpg.Record | None:
    fields: list[str] = []
    values: list[Any] = []
    mapping = {
        "name": "name",
        "kind": "kind",
        "focus_work_type": "focus_work_type",
        "bank_id": "bank_id",
        "task_id": "task_id",
        "target_count": "target_count",
        "primary_filter": "primary_filter",
        "sort_order": "sort_order",
        "use_fsrs": "use_fsrs",
        "backflow_rule": "backflow_rule",
    }
    for key, column in mapping.items():
        if key in patch:
            values.append(patch[key])
            fields.append(f"{column} = ${len(values)}")
    if "scope" in patch:
        values.append(_json_param(patch["scope"]))
        fields.append(f"scope_json = ${len(values)}::jsonb")
    if "completion" in patch:
        values.append(_json_param(patch["completion"]))
        fields.append(f"completion_json = ${len(values)}::jsonb")
    if "pass_criteria" in patch:
        values.append(_json_param(patch["pass_criteria"]))
        fields.append(f"pass_criteria_json = ${len(values)}::jsonb")
    if "children" in patch:
        values.append(_json_param(patch["children"]))
        fields.append(f"children_json = ${len(values)}::jsonb")
    if not fields:
        return await get_config(conn, user_id=user_id, config_id=config_id)
    values.extend([config_id, user_id])
    return await conn.fetchrow(
        f"""
        UPDATE deliberate_workflow_configs
        SET {', '.join(fields)}, updated_at = NOW()
        WHERE id = ${len(values) - 1}::uuid AND user_id = ${len(values)}
        RETURNING id, user_id, name, kind, focus_work_type, bank_id, task_id, target_count,
                  scope_json, completion_json, pass_criteria_json, children_json, created_at, updated_at
        """,
        *values,
    )


async def delete_config(conn: asyncpg.Connection, *, user_id: int, config_id: str) -> bool:
    result = await conn.execute(
        "DELETE FROM deliberate_workflow_configs WHERE id = $1::uuid AND user_id = $2",
        config_id,
        user_id,
    )
    return result != "DELETE 0"


async def latest_run_for_config(conn: asyncpg.Connection, *, user_id: int, config_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT id, user_id, config_id, workflow_id, focus_run_id, focus_work_type, bank_id,
               config_snapshot, progress_snapshot, snapshot_id, snapshot_type, status,
               created_at, updated_at, completed_at
        FROM deliberate_workflow_runs
        WHERE user_id = $1 AND config_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 1
        """,
        user_id,
        config_id,
    )


async def list_runs_for_config(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    config_id: str,
    limit: int = 30,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id, user_id, config_id, workflow_id, focus_run_id, focus_work_type, bank_id,
               config_snapshot, progress_snapshot, snapshot_id, snapshot_type, status,
               created_at, updated_at, completed_at
        FROM deliberate_workflow_runs
        WHERE user_id = $1 AND config_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT $3
        """,
        user_id,
        config_id,
        limit,
    )


async def get_run(conn: asyncpg.Connection, *, user_id: int, run_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT id, user_id, config_id, workflow_id, focus_run_id, focus_work_type, bank_id,
               config_snapshot, progress_snapshot, snapshot_id, snapshot_type, status,
               created_at, updated_at, completed_at
        FROM deliberate_workflow_runs
        WHERE user_id = $1 AND id = $2::uuid
        """,
        user_id,
        run_id,
    )


async def create_run(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    config_id: str | None,
    focus_work_type: str,
    bank_id: str | None,
    config_snapshot: dict[str, Any],
) -> asyncpg.Record:
    return await conn.fetchrow(
        """
        INSERT INTO deliberate_workflow_runs(user_id, config_id, focus_work_type, bank_id, config_snapshot, status)
        VALUES ($1, $2::uuid, $3, $4, $5::jsonb, 'started')
        RETURNING id, user_id, config_id, workflow_id, focus_run_id, focus_work_type, bank_id,
                  config_snapshot, progress_snapshot, snapshot_id, snapshot_type, status,
                  created_at, updated_at, completed_at
        """,
        user_id,
        config_id,
        focus_work_type,
        bank_id,
        _json_param(config_snapshot),
    )


async def attach_workflow(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    run_id: str,
    workflow_id: Any,
) -> None:
    await conn.execute(
        """
        UPDATE deliberate_workflow_runs
        SET workflow_id = $1, updated_at = NOW()
        WHERE id = $2::uuid AND user_id = $3
        """,
        workflow_id,
        run_id,
        user_id,
    )


async def attach_focus_run(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    run_id: str,
    focus_run_id: Any,
) -> None:
    await conn.execute(
        """
        UPDATE deliberate_workflow_runs
        SET focus_run_id = $1, updated_at = NOW()
        WHERE id = $2::uuid AND user_id = $3
        """,
        focus_run_id,
        run_id,
        user_id,
    )


async def mark_content_completed(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    run_id: str,
    progress_snapshot: dict[str, Any],
) -> None:
    await conn.execute(
        """
        UPDATE deliberate_workflow_runs
        SET status = 'content_completed', progress_snapshot = $1::jsonb, updated_at = NOW()
        WHERE id = $2::uuid AND user_id = $3 AND status IN ('started', 'content_completed')
        """,
        _json_param(progress_snapshot),
        run_id,
        user_id,
    )


async def mark_completed(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    run_id: str,
    progress_snapshot: dict[str, Any] | None = None,
    snapshot_id: str | None = None,
    snapshot_type: str | None = None,
) -> None:
    await conn.execute(
        """
        UPDATE deliberate_workflow_runs
        SET status = 'completed',
            progress_snapshot = COALESCE($1::jsonb, progress_snapshot),
            snapshot_id = COALESCE($2::uuid, snapshot_id),
            snapshot_type = COALESCE($3, snapshot_type),
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW()
        WHERE id = $4::uuid AND user_id = $5 AND status IN ('started', 'content_completed', 'completed')
        """,
        _json_param(progress_snapshot) if progress_snapshot is not None else None,
        snapshot_id,
        snapshot_type,
        run_id,
        user_id,
    )


async def mark_abandoned(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    run_id: str,
    progress_snapshot: dict[str, Any] | None = None,
) -> None:
    await conn.execute(
        """
        UPDATE deliberate_workflow_runs
        SET status = 'abandoned',
            progress_snapshot = COALESCE($1::jsonb, progress_snapshot),
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW()
        WHERE id = $2::uuid AND user_id = $3 AND status IN ('started', 'content_completed', 'abandoned')
        """,
        _json_param(progress_snapshot) if progress_snapshot is not None else None,
        run_id,
        user_id,
    )
