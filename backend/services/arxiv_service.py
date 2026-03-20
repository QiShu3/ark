from datetime import UTC, datetime
from typing import Any


async def get_daily_candidates(pool: Any, user_id: int) -> list[dict[str, Any]]:
    today = datetime.now(UTC).date()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT arxiv_id, title, summary
            FROM arxiv_daily_candidates
            WHERE user_id = $1 AND candidate_date = $2
            ORDER BY created_at DESC
            LIMIT 50
            """,
            int(user_id),
            today,
        )
    return [
        {
            "arxiv_id": str(r["arxiv_id"]),
            "title": str(r["title"]),
            "summary": str(r["summary"]),
        }
        for r in rows
    ]


async def get_daily_candidates_for_tasks(pool: Any, user_id: int, arxiv_ids: list[str]) -> list[str]:
    today = datetime.now(UTC).date()
    async with pool.acquire() as conn:
        if arxiv_ids:
            rows = await conn.fetch(
                """
                SELECT arxiv_id, title, summary
                FROM arxiv_daily_candidates
                WHERE user_id = $1 AND candidate_date = $2 AND arxiv_id = ANY($3::text[])
                ORDER BY created_at DESC
                LIMIT 50
                """,
                int(user_id),
                today,
                arxiv_ids,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT arxiv_id, title, summary
                FROM arxiv_daily_candidates
                WHERE user_id = $1 AND candidate_date = $2
                ORDER BY created_at DESC
                LIMIT 10
                """,
                int(user_id),
                today,
            )
    return [str(r["arxiv_id"]) for r in rows]
