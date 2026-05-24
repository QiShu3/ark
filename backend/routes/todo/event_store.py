from __future__ import annotations

from typing import Any
from uuid import UUID

from .helpers import _propagate_event_due_at
from .schemas import EventCreateRequest


async def clear_primary_event(conn: Any, *, user_id: int, exclude_event_id: UUID | None = None) -> None:
    if exclude_event_id is None:
        await conn.execute(
            """
            UPDATE events
            SET is_primary = FALSE, updated_at = NOW()
            WHERE user_id = $1 AND is_primary = TRUE
            """,
            user_id,
        )
        return
    await conn.execute(
        """
        UPDATE events
        SET is_primary = FALSE, updated_at = NOW()
        WHERE user_id = $1 AND is_primary = TRUE AND id <> $2
        """,
        user_id,
        exclude_event_id,
    )


async def create_event_row(conn: Any, *, user_id: int, body: EventCreateRequest) -> Any | None:
    if body.is_primary:
        await clear_primary_event(conn, user_id=user_id)
    return await conn.fetchrow(
        """
        INSERT INTO events(user_id, name, start_date, due_at, is_primary)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, name, start_date, due_at, is_primary, created_at, updated_at
        """,
        user_id,
        body.name,
        body.start_date,
        body.due_at,
        body.is_primary,
    )


async def list_event_rows(conn: Any, *, user_id: int) -> list[Any]:
    return await conn.fetch(
        """
        SELECT id, user_id, name, start_date, due_at, is_primary, created_at, updated_at
        FROM events
        WHERE user_id = $1
        ORDER BY due_at ASC, created_at DESC
        """,
        user_id,
    )


async def get_primary_event_row(conn: Any, *, user_id: int) -> Any | None:
    return await conn.fetchrow(
        """
        SELECT id, user_id, name, start_date, due_at, is_primary, created_at, updated_at
        FROM events
        WHERE user_id = $1 AND is_primary = TRUE
        """,
        user_id,
    )


async def get_event_row(conn: Any, *, user_id: int, event_id: UUID) -> Any | None:
    return await conn.fetchrow(
        """
        SELECT id, user_id, name, start_date, due_at, is_primary, created_at, updated_at
        FROM events
        WHERE id = $1 AND user_id = $2
        """,
        event_id,
        user_id,
    )


async def update_event_row(conn: Any, *, user_id: int, event_id: UUID, patch: dict[str, Any]) -> Any | None:
    if not patch:
        return await get_event_row(conn, user_id=user_id, event_id=event_id)

    allowed_cols: dict[str, str] = {
        "name": "name",
        "start_date": "start_date",
        "due_at": "due_at",
        "is_primary": "is_primary",
    }
    sets: list[str] = []
    args: list[Any] = []
    for key, value in patch.items():
        col = allowed_cols.get(key)
        if col is None:
            continue
        args.append(value)
        sets.append(f"{col} = ${len(args)}")
    if not sets:
        return None

    args.append(event_id)
    event_i = len(args)
    args.append(user_id)
    user_i = len(args)

    if patch.get("is_primary") is True:
        await clear_primary_event(conn, user_id=user_id, exclude_event_id=event_id)

    row = await conn.fetchrow(
        f"""
        UPDATE events
        SET {", ".join(sets)}, updated_at = NOW()
        WHERE id = ${event_i} AND user_id = ${user_i}
        RETURNING id, user_id, name, start_date, due_at, is_primary, created_at, updated_at
        """,
        *args,
    )
    if row is not None and patch.get("due_at") is not None:
        await _propagate_event_due_at(conn, user_id=user_id, event_id=event_id, due_at=row["due_at"])
    return row


async def delete_event_row(conn: Any, *, user_id: int, event_id: UUID) -> str:
    await conn.execute(
        """
        UPDATE tasks
        SET is_deleted = TRUE,
            event_id = NULL,
            source_type = 'user',
            app_id = NULL,
            app_task_type = NULL,
            app_config_id = NULL,
            app_instance_key = NULL,
            managed_by_app = FALSE,
            updated_at = NOW()
        WHERE user_id = $1 AND event_id = $2 AND is_deleted = FALSE
        """,
        user_id,
        event_id,
    )
    await conn.execute(
        """
        UPDATE appointments
        SET is_deleted = TRUE, event_id = NULL, updated_at = NOW()
        WHERE user_id = $1 AND event_id = $2 AND is_deleted = FALSE
        """,
        user_id,
        event_id,
    )
    await conn.execute(
        "DELETE FROM focus_workflow_presets WHERE user_id = $1 AND event_id = $2",
        user_id,
        event_id,
    )
    await conn.execute(
        "DELETE FROM app_task_configs WHERE user_id = $1 AND event_id = $2",
        user_id,
        event_id,
    )
    return await conn.execute(
        "DELETE FROM events WHERE id = $1 AND user_id = $2",
        event_id,
        user_id,
    )


async def get_event_delete_preview_row(conn: Any, *, user_id: int, event_id: UUID) -> Any | None:
    return await conn.fetchrow(
        """
        SELECT
          (
            SELECT COUNT(*)
            FROM tasks
            WHERE user_id = $1 AND event_id = $2 AND is_deleted = FALSE
          ) AS tasks_count,
          (
            SELECT COUNT(*)
            FROM appointments
            WHERE user_id = $1 AND event_id = $2 AND is_deleted = FALSE
          ) AS appointments_count,
          (
            SELECT COUNT(*)
            FROM focus_workflow_presets
            WHERE user_id = $1 AND event_id = $2
          ) AS workflows_count,
          (
            SELECT COUNT(*)
            FROM app_task_configs
            WHERE user_id = $1 AND event_id = $2
          ) AS app_configs_count
        WHERE EXISTS (
          SELECT 1 FROM events WHERE id = $2 AND user_id = $1
        )
        """,
        user_id,
        event_id,
    )
