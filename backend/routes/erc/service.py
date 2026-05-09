from __future__ import annotations

from typing import Any

import asyncpg


async def get_overview(pool: asyncpg.Pool, *, user_id: int) -> dict:
    raise NotImplementedError


async def list_sets(pool: asyncpg.Pool) -> list[dict]:
    raise NotImplementedError


async def list_articles(pool: asyncpg.Pool, *, user_id: int, set_id: str | None = None) -> list[dict]:
    raise NotImplementedError


async def get_article_detail(pool: asyncpg.Pool, *, user_id: int, article_id: str) -> dict:
    raise NotImplementedError


async def submit_article_practice(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    article_id: str,
    answers: list[dict[str, Any]],
    time_spent_ms: int | None,
    started_at: Any,
) -> dict:
    raise NotImplementedError


async def get_next_review(pool: asyncpg.Pool, *, user_id: int) -> dict:
    raise NotImplementedError


async def submit_review(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    question_id: str,
    chosen_option: str,
    time_spent_ms: int | None,
) -> dict:
    raise NotImplementedError


async def list_mistakes(pool: asyncpg.Pool, *, user_id: int) -> list[dict]:
    raise NotImplementedError
