from __future__ import annotations

from typing import Any

import asyncpg


async def init_content_bank(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 content bank 表")
    await init_tables(pool)


async def init_tables(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS content_banks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                fw_type TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                item_type TEXT NOT NULL CHECK (item_type IN ('choice', 'word')),
                is_published BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS content_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                bank_id UUID NOT NULL REFERENCES content_banks(id) ON DELETE CASCADE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                title TEXT,
                body JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS content_questions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                paragraph_no INTEGER,
                question_text TEXT NOT NULL,
                options JSONB NOT NULL DEFAULT '{}',
                correct_answer TEXT NOT NULL,
                analysis TEXT,
                image_url TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_content_items_bank_sort ON content_items(bank_id, sort_order ASC);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_content_questions_item_sort ON content_questions(item_id, sort_order ASC);"
        )
