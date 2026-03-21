from datetime import UTC, datetime
from typing import Any

FOCUS_MAX_SECONDS = 25 * 60


async def get_today_tasks(pool: Any, user_id: int) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            WITH bounds AS (
              SELECT date_trunc('day', NOW()) AS day_start,
                     date_trunc('day', NOW()) + interval '1 day' AS day_end
            )
            SELECT id, title, status, priority, start_date, due_date
            FROM tasks t
            CROSS JOIN bounds b
            WHERE t.user_id = $1
              AND t.is_deleted = FALSE
              AND (
                (t.start_date IS NOT NULL AND t.start_date >= b.day_start AND t.start_date < b.day_end)
                OR
                (t.due_date IS NOT NULL AND t.due_date >= b.day_start AND t.due_date < b.day_end)
              )
            ORDER BY priority DESC, updated_at DESC
            LIMIT 100
            """,
            int(user_id),
        )
    return [
        {
            "id": str(r["id"]),
            "title": str(r["title"]),
            "status": str(r["status"]),
            "priority": int(r["priority"]),
            "start_date": r["start_date"].isoformat() if r["start_date"] else None,
            "due_date": r["due_date"].isoformat() if r["due_date"] else None,
        }
        for r in rows
    ]


def _event_row_to_payload(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": str(row["name"]),
        "due_at": row["due_at"].isoformat() if row["due_at"] else None,
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "is_primary": bool(row["is_primary"]),
    }


async def get_primary_event(pool: Any, user_id: int) -> dict[str, Any] | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, name, due_at, created_at, is_primary
            FROM events
            WHERE user_id = $1 AND is_primary = TRUE
            LIMIT 1
            """,
            int(user_id),
        )
    return _event_row_to_payload(row) if row else None


async def get_events_list(pool: Any, user_id: int) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, due_at, created_at, is_primary
            FROM events
            WHERE user_id = $1
            ORDER BY due_at ASC, created_at DESC
            LIMIT 100
            """,
            int(user_id),
        )
    return [_event_row_to_payload(row) for row in rows]


async def get_focus_current(pool: Any, user_id: int) -> dict[str, Any]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, task_id, duration, start_time, end_at, created_at
            FROM focus_logs
            WHERE user_id = $1 AND end_at IS NULL
            """,
            int(user_id),
        )
        if row is None:
            return {"is_focusing": False}

        dur = int((datetime.now(UTC) - row["start_time"]).total_seconds())
        if dur < 0:
            dur = 0
        if dur > FOCUS_MAX_SECONDS:
            dur = FOCUS_MAX_SECONDS
        task_row = await conn.fetchrow(
            """
            SELECT id, title, status
            FROM tasks
            WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
            """,
            row["task_id"],
            int(user_id),
        )
    return {
        "is_focusing": True,
        "task": (
            {
                "id": str(task_row["id"]),
                "title": str(task_row["title"]),
                "status": str(task_row["status"]),
            }
            if task_row
            else {"id": str(row["task_id"])}
        ),
        "focus": {
            "start_time": row["start_time"].isoformat(),
            "duration_seconds": dur,
        },
    }


async def get_focus_today(pool: Any, user_id: int) -> dict[str, int]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            WITH bounds AS (
              SELECT date_trunc('day', NOW()) AS day_start,
                     date_trunc('day', NOW()) + interval '1 day' AS day_end
            )
            SELECT
              COALESCE(
                SUM(
                  GREATEST(
                    0,
                    EXTRACT(
                      epoch FROM (
                        LEAST(COALESCE(fl.end_at, NOW()), b.day_end)
                        - GREATEST(fl.start_time, b.day_start)
                      )
                    )
                  )
                ),
                0
              )::BIGINT AS seconds
            FROM focus_logs fl
            CROSS JOIN bounds b
            WHERE fl.user_id = $1
              AND fl.start_time < b.day_end
              AND COALESCE(fl.end_at, NOW()) > b.day_start
            """,
            int(user_id),
        )
    seconds = int((row or {}).get("seconds") or 0)
    if seconds < 0:
        seconds = 0
    return {"seconds": seconds, "minutes": seconds // 60}
