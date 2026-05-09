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
    return json.dumps(value, ensure_ascii=False, default=str)


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


async def list_set_rows(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id::text AS id, key, name, description, exam, article_count, question_count
        FROM erc_sets
        ORDER BY key ASC
        """
    )


async def list_article_rows(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    set_id: str | None,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT
          a.id::text AS article_pk,
          a.article_id,
          a.set_id::text AS set_id,
          a.year,
          a.text_no,
          a.title,
          COUNT(DISTINCT q.id)::int AS question_count,
          COUNT(DISTINCT m.question_pk)::int AS mistake_count,
          MAX(attempt.submitted_at) AS last_attempt_at,
          BOOL_OR(c.due_at IS NOT NULL AND c.due_at <= NOW()) AS has_due_review
        FROM erc_articles a
        JOIN erc_questions q ON q.article_pk = a.id
        LEFT JOIN erc_user_article_attempts attempt
          ON attempt.article_pk = a.id AND attempt.user_id = $1
        LEFT JOIN erc_user_question_cards c
          ON c.question_pk = q.id AND c.user_id = $1
        LEFT JOIN erc_mistake_bucket m
          ON m.question_pk = q.id AND m.user_id = $1 AND m.is_active = TRUE
        WHERE ($2::uuid IS NULL OR a.set_id = $2::uuid)
        GROUP BY a.id
        ORDER BY a.year DESC, a.text_no ASC
        """,
        user_id,
        set_id,
    )


async def get_article_row(conn: asyncpg.Connection, *, article_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT
          a.id::text AS article_pk,
          a.article_id,
          a.set_id::text AS set_id,
          a.exam,
          a.year,
          a.text_no,
          a.title
        FROM erc_articles a
        WHERE a.article_id = $1
        """,
        article_id,
    )


async def get_last_article_attempt_at(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    article_pk: str,
) -> Any:
    row = await conn.fetchrow(
        """
        SELECT MAX(submitted_at) AS last_attempt_at
        FROM erc_user_article_attempts
        WHERE user_id = $1 AND article_pk = $2::uuid
        """,
        user_id,
        article_pk,
    )
    return row["last_attempt_at"] if row else None


async def list_paragraph_rows(conn: asyncpg.Connection, *, article_pk: str) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT paragraph_no, text
        FROM erc_paragraphs
        WHERE article_pk = $1::uuid
        ORDER BY paragraph_no ASC
        """,
        article_pk,
    )


async def list_question_rows(conn: asyncpg.Connection, *, article_pk: str) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id::text AS question_pk, question_id, question_no, stem, options_json, answer
        FROM erc_questions
        WHERE article_pk = $1::uuid
        ORDER BY sort_order ASC
        """,
        article_pk,
    )


async def get_question_row_by_public_id(conn: asyncpg.Connection, *, question_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT
          q.id::text AS question_pk,
          q.question_id,
          q.question_no,
          q.stem,
          q.options_json,
          q.answer,
          a.id::text AS article_pk,
          a.article_id,
          a.year,
          a.text_no,
          a.title
        FROM erc_questions q
        JOIN erc_articles a ON a.id = q.article_pk
        WHERE q.question_id = $1
        """,
        question_id,
    )


async def insert_article_attempt(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    article_pk: str,
    correct_count: int,
    question_count: int,
    time_spent_ms: int | None,
    started_at: Any,
) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO erc_user_article_attempts(
          user_id, article_pk, correct_count, question_count, time_spent_ms, started_at
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6)
        RETURNING id::text
        """,
        user_id,
        article_pk,
        correct_count,
        question_count,
        time_spent_ms,
        started_at,
    )
    return str(row["id"])


async def get_user_question_card(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    question_pk: str,
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT due_at, fsrs_card_json, wrong_count, right_count, lapse_count
        FROM erc_user_question_cards
        WHERE user_id = $1 AND question_pk = $2::uuid
        """,
        user_id,
        question_pk,
    )


async def upsert_user_question_card(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    question_pk: str,
    due_at: Any,
    fsrs_card_json: Any,
    wrong_count: int,
    right_count: int,
    lapse_count: int,
    last_answer_correct: bool,
    last_chosen_option: str,
) -> None:
    await conn.execute(
        """
        INSERT INTO erc_user_question_cards(
          user_id, question_pk, due_at, fsrs_card_json, wrong_count, right_count, lapse_count,
          last_review_at, last_answer_correct, last_chosen_option, updated_at
        )
        VALUES ($1, $2::uuid, $3, $4::jsonb, $5, $6, $7, NOW(), $8, $9, NOW())
        ON CONFLICT (user_id, question_pk)
        DO UPDATE SET
          due_at = EXCLUDED.due_at,
          fsrs_card_json = EXCLUDED.fsrs_card_json,
          wrong_count = EXCLUDED.wrong_count,
          right_count = EXCLUDED.right_count,
          lapse_count = EXCLUDED.lapse_count,
          last_review_at = NOW(),
          last_answer_correct = EXCLUDED.last_answer_correct,
          last_chosen_option = EXCLUDED.last_chosen_option,
          updated_at = NOW()
        """,
        user_id,
        question_pk,
        due_at,
        _json_param(fsrs_card_json),
        wrong_count,
        right_count,
        lapse_count,
        last_answer_correct,
        last_chosen_option,
    )


async def insert_review_log(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    article_pk: str,
    question_pk: str,
    attempt_id: str | None,
    mode: str,
    chosen_option: str,
    correct_option: str,
    is_correct: bool,
    rating: str,
    time_spent_ms: int | None,
) -> None:
    await conn.execute(
        """
        INSERT INTO erc_review_logs(
          user_id, article_pk, question_pk, attempt_id, mode, chosen_option,
          correct_option, is_correct, rating, time_spent_ms
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10)
        """,
        user_id,
        article_pk,
        question_pk,
        attempt_id,
        mode,
        chosen_option,
        correct_option,
        is_correct,
        rating,
        time_spent_ms,
    )


async def upsert_mistake(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    article_pk: str,
    question_pk: str,
    is_active: bool,
) -> None:
    await conn.execute(
        """
        INSERT INTO erc_mistake_bucket(user_id, article_pk, question_pk, wrong_count, last_wrong_at, is_active)
        VALUES ($1, $2::uuid, $3::uuid, CASE WHEN $4 THEN 1 ELSE 0 END, NOW(), $4)
        ON CONFLICT (user_id, question_pk)
        DO UPDATE SET
          wrong_count = CASE
            WHEN $4 THEN erc_mistake_bucket.wrong_count + 1
            ELSE erc_mistake_bucket.wrong_count
          END,
          last_wrong_at = CASE
            WHEN $4 THEN NOW()
            ELSE erc_mistake_bucket.last_wrong_at
          END,
          is_active = $4,
          article_pk = EXCLUDED.article_pk
        """,
        user_id,
        article_pk,
        question_pk,
        is_active,
    )


async def list_due_card_rows(conn: asyncpg.Connection, *, user_id: int, limit: int) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT
          c.question_pk::text AS question_pk,
          c.due_at,
          c.fsrs_card_json,
          c.wrong_count,
          c.right_count,
          c.lapse_count,
          q.question_id,
          q.question_no,
          q.stem,
          q.options_json,
          q.answer,
          a.id::text AS article_pk,
          a.article_id,
          a.year,
          a.text_no,
          a.title,
          COALESCE(m.is_active, FALSE) AS is_mistake
        FROM erc_user_question_cards c
        JOIN erc_questions q ON q.id = c.question_pk
        JOIN erc_articles a ON a.id = q.article_pk
        LEFT JOIN erc_mistake_bucket m ON m.user_id = c.user_id AND m.question_pk = c.question_pk
        WHERE c.user_id = $1
          AND c.due_at IS NOT NULL
          AND c.due_at <= NOW()
        ORDER BY COALESCE(m.is_active, FALSE) DESC, c.lapse_count DESC, c.due_at ASC
        LIMIT $2
        """,
        user_id,
        limit,
    )


async def list_recent_review_article_rows(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    since: Any,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT DISTINCT article_pk::text AS article_pk, created_at
        FROM erc_review_logs
        WHERE user_id = $1 AND created_at >= $2
        ORDER BY created_at DESC
        """,
        user_id,
        since,
    )


async def get_next_due_at(conn: asyncpg.Connection, *, user_id: int) -> Any:
    row = await conn.fetchrow(
        """
        SELECT MIN(due_at) AS next_due_at
        FROM erc_user_question_cards
        WHERE user_id = $1 AND due_at IS NOT NULL AND due_at > NOW()
        """,
        user_id,
    )
    return row["next_due_at"] if row else None


async def get_user_settings(conn: asyncpg.Connection, *, user_id: int) -> asyncpg.Record:
    return await conn.fetchrow(
        """
        INSERT INTO erc_user_settings(user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO UPDATE SET updated_at = erc_user_settings.updated_at
        RETURNING daily_review_target, same_article_cooldown_hours
        """,
        user_id,
    )


async def get_overview_counts(conn: asyncpg.Connection, *, user_id: int) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT
          COUNT(DISTINCT attempt.article_pk)::int AS practiced_article_count,
          COUNT(log.id)::int AS practiced_question_count,
          COUNT(log.id) FILTER (WHERE log.is_correct)::int AS correct_log_count,
          COUNT(card.id) FILTER (WHERE card.due_at IS NOT NULL AND card.due_at <= NOW())::int AS due_review_count,
          COUNT(m.question_pk) FILTER (WHERE m.is_active)::int AS mistake_count
        FROM auth_users u
        LEFT JOIN erc_user_article_attempts attempt ON attempt.user_id = u.id
        LEFT JOIN erc_review_logs log ON log.user_id = u.id
        LEFT JOIN erc_user_question_cards card ON card.user_id = u.id
        LEFT JOIN erc_mistake_bucket m ON m.user_id = u.id
        WHERE u.id = $1
        """,
        user_id,
    )
    if row is None:
        return {
            "practiced_article_count": 0,
            "practiced_question_count": 0,
            "correct_log_count": 0,
            "due_review_count": 0,
            "mistake_count": 0,
        }
    return dict(row)


async def get_recommended_article(conn: asyncpg.Connection, *, user_id: int) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT a.article_id, a.year, a.text_no, a.title
        FROM erc_articles a
        WHERE NOT EXISTS (
          SELECT 1
          FROM erc_user_article_attempts attempt
          WHERE attempt.user_id = $1 AND attempt.article_pk = a.id
        )
        ORDER BY a.year DESC, a.text_no ASC
        LIMIT 1
        """,
        user_id,
    )


async def list_mistake_rows(conn: asyncpg.Connection, *, user_id: int) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT
          a.article_id,
          a.year,
          a.text_no,
          q.question_id,
          q.question_no,
          q.stem,
          q.answer AS correct_option,
          c.last_chosen_option,
          m.wrong_count,
          m.last_wrong_at,
          COALESCE(c.due_at <= NOW(), FALSE) AS is_due
        FROM erc_mistake_bucket m
        JOIN erc_questions q ON q.id = m.question_pk
        JOIN erc_articles a ON a.id = m.article_pk
        LEFT JOIN erc_user_question_cards c ON c.user_id = m.user_id AND c.question_pk = m.question_pk
        WHERE m.user_id = $1 AND m.is_active = TRUE
        ORDER BY m.last_wrong_at DESC, a.year DESC, a.text_no ASC, q.sort_order ASC
        """,
        user_id,
    )
