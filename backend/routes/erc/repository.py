from __future__ import annotations

import json
from typing import Any

import asyncpg

from .importer import ERCArticleSeed


async def init_erc(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 ERC 表")
    await init_tables(pool)


async def init_tables(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_sets (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              key TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL,
              description TEXT NOT NULL DEFAULT '',
              exam TEXT NOT NULL DEFAULT '',
              source_version TEXT NOT NULL DEFAULT '',
              article_count INTEGER NOT NULL DEFAULT 0,
              question_count INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_articles (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              set_id UUID NOT NULL REFERENCES erc_sets(id) ON DELETE CASCADE,
              article_id TEXT NOT NULL UNIQUE,
              exam TEXT NOT NULL,
              year INTEGER NOT NULL,
              text_no INTEGER NOT NULL,
              title TEXT NOT NULL DEFAULT '',
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_paragraphs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              article_pk UUID NOT NULL REFERENCES erc_articles(id) ON DELETE CASCADE,
              paragraph_no INTEGER NOT NULL,
              text TEXT NOT NULL,
              UNIQUE(article_pk, paragraph_no)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_questions (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              article_pk UUID NOT NULL REFERENCES erc_articles(id) ON DELETE CASCADE,
              question_id TEXT NOT NULL UNIQUE,
              question_no INTEGER NOT NULL,
              stem TEXT NOT NULL,
              options_json JSONB NOT NULL,
              answer TEXT NOT NULL,
              evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              explanation TEXT NOT NULL DEFAULT '',
              question_type TEXT NOT NULL DEFAULT '',
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_user_article_attempts (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              article_pk UUID NOT NULL REFERENCES erc_articles(id) ON DELETE CASCADE,
              correct_count INTEGER NOT NULL,
              question_count INTEGER NOT NULL,
              time_spent_ms INTEGER NULL,
              started_at TIMESTAMPTZ NULL,
              submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_user_question_cards (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              question_pk UUID NOT NULL REFERENCES erc_questions(id) ON DELETE CASCADE,
              due_at TIMESTAMPTZ NULL,
              fsrs_card_json JSONB NULL,
              wrong_count INTEGER NOT NULL DEFAULT 0,
              right_count INTEGER NOT NULL DEFAULT 0,
              lapse_count INTEGER NOT NULL DEFAULT 0,
              last_review_at TIMESTAMPTZ NULL,
              last_answer_correct BOOLEAN NULL,
              last_chosen_option TEXT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(user_id, question_pk)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_review_logs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              article_pk UUID NOT NULL REFERENCES erc_articles(id) ON DELETE CASCADE,
              question_pk UUID NOT NULL REFERENCES erc_questions(id) ON DELETE CASCADE,
              attempt_id UUID NULL REFERENCES erc_user_article_attempts(id) ON DELETE SET NULL,
              mode TEXT NOT NULL,
              chosen_option TEXT NOT NULL,
              correct_option TEXT NOT NULL,
              is_correct BOOLEAN NOT NULL,
              rating TEXT NOT NULL,
              time_spent_ms INTEGER NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_mistake_bucket (
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              article_pk UUID NOT NULL REFERENCES erc_articles(id) ON DELETE CASCADE,
              question_pk UUID NOT NULL REFERENCES erc_questions(id) ON DELETE CASCADE,
              wrong_count INTEGER NOT NULL DEFAULT 0,
              last_wrong_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              is_active BOOLEAN NOT NULL DEFAULT TRUE,
              PRIMARY KEY (user_id, question_pk)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_user_settings (
              user_id BIGINT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
              daily_review_target INTEGER NOT NULL DEFAULT 20,
              same_article_cooldown_hours INTEGER NOT NULL DEFAULT 24,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_erc_articles_set_sort ON erc_articles(set_id, sort_order);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_erc_cards_due ON erc_user_question_cards(user_id, due_at);")
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_erc_logs_user_created ON erc_review_logs(user_id, created_at DESC);"
        )


def _json_param(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


async def upsert_set(
    conn: asyncpg.Connection,
    *,
    key: str,
    name: str,
    description: str,
    exam: str,
    source_version: str,
) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO erc_sets(key, name, description, exam, source_version)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (key) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            exam = EXCLUDED.exam,
            source_version = EXCLUDED.source_version,
            updated_at = NOW()
        RETURNING id::text
        """,
        key,
        name,
        description,
        exam,
        source_version,
    )
    return str(row["id"])


async def upsert_article_seed(conn: asyncpg.Connection, *, set_id: str, seed: ERCArticleSeed) -> None:
    article_row = await conn.fetchrow(
        """
        INSERT INTO erc_articles(set_id, article_id, exam, year, text_no, title, sort_order)
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (article_id) DO UPDATE
        SET set_id = EXCLUDED.set_id,
            exam = EXCLUDED.exam,
            year = EXCLUDED.year,
            text_no = EXCLUDED.text_no,
            title = EXCLUDED.title,
            sort_order = EXCLUDED.sort_order,
            updated_at = NOW()
        RETURNING id::text
        """,
        set_id,
        seed.article_id,
        seed.exam,
        seed.year,
        seed.text_no,
        seed.title,
        seed.sort_order,
    )
    article_pk = str(article_row["id"])
    await conn.execute("DELETE FROM erc_paragraphs WHERE article_pk = $1::uuid", article_pk)
    for paragraph in seed.paragraphs:
        await conn.execute(
            "INSERT INTO erc_paragraphs(article_pk, paragraph_no, text) VALUES ($1::uuid, $2, $3)",
            article_pk,
            paragraph.paragraph_no,
            paragraph.text,
        )
    for question in seed.questions:
        await conn.execute(
            """
            INSERT INTO erc_questions(
              article_pk, question_id, question_no, stem, options_json, answer,
              evidence_json, explanation, question_type, sort_order
            )
            VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10)
            ON CONFLICT (question_id) DO UPDATE
            SET article_pk = EXCLUDED.article_pk,
                question_no = EXCLUDED.question_no,
                stem = EXCLUDED.stem,
                options_json = EXCLUDED.options_json,
                answer = EXCLUDED.answer,
                evidence_json = EXCLUDED.evidence_json,
                explanation = EXCLUDED.explanation,
                question_type = EXCLUDED.question_type,
                sort_order = EXCLUDED.sort_order,
                updated_at = NOW()
            """,
            article_pk,
            question.question_id,
            question.question_no,
            question.stem,
            _json_param(question.options),
            question.answer,
            _json_param(question.evidence),
            question.explanation,
            question.question_type,
            question.sort_order,
        )


async def refresh_set_counts(conn: asyncpg.Connection, *, set_id: str) -> None:
    await conn.execute(
        """
        UPDATE erc_sets
        SET article_count = (
              SELECT COUNT(*) FROM erc_articles WHERE set_id = $1::uuid
            ),
            question_count = (
              SELECT COUNT(*)
              FROM erc_questions q
              JOIN erc_articles a ON a.id = q.article_pk
              WHERE a.set_id = $1::uuid
            ),
            updated_at = NOW()
        WHERE id = $1::uuid
        """,
        set_id,
    )
