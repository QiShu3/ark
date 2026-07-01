from __future__ import annotations

import json
from typing import Any

import asyncpg

from .importer import ERCArticleSeed, ERCArticleWordSeed


async def init_choice(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 ERC 表")
    await init_tables(pool)


async def init_tables(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS choice_sets (
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
            CREATE TABLE IF NOT EXISTS choice_articles (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              set_id UUID NOT NULL REFERENCES choice_sets(id) ON DELETE CASCADE,
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
            CREATE TABLE IF NOT EXISTS choice_paragraphs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              article_pk UUID NOT NULL REFERENCES choice_articles(id) ON DELETE CASCADE,
              paragraph_no INTEGER NOT NULL,
              text TEXT NOT NULL,
              UNIQUE(article_pk, paragraph_no)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS choice_questions (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              article_pk UUID NOT NULL REFERENCES choice_articles(id) ON DELETE CASCADE,
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
            CREATE TABLE IF NOT EXISTS choice_article_words (
              article_pk UUID NOT NULL REFERENCES choice_articles(id) ON DELETE CASCADE,
              word TEXT NOT NULL,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              PRIMARY KEY (article_pk, word)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS choice_user_article_attempts (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              article_pk UUID NOT NULL REFERENCES choice_articles(id) ON DELETE CASCADE,
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
            CREATE TABLE IF NOT EXISTS choice_user_question_cards (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              question_pk UUID NOT NULL REFERENCES choice_questions(id) ON DELETE CASCADE,
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
            CREATE TABLE IF NOT EXISTS choice_review_logs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              article_pk UUID NOT NULL REFERENCES choice_articles(id) ON DELETE CASCADE,
              question_pk UUID NOT NULL REFERENCES choice_questions(id) ON DELETE CASCADE,
              attempt_id UUID NULL REFERENCES choice_user_article_attempts(id) ON DELETE SET NULL,
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
            CREATE TABLE IF NOT EXISTS choice_mistake_bucket (
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              article_pk UUID NOT NULL REFERENCES choice_articles(id) ON DELETE CASCADE,
              question_pk UUID NOT NULL REFERENCES choice_questions(id) ON DELETE CASCADE,
              wrong_count INTEGER NOT NULL DEFAULT 0,
              last_wrong_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              is_active BOOLEAN NOT NULL DEFAULT TRUE,
              PRIMARY KEY (user_id, question_pk)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS choice_user_settings (
              user_id BIGINT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
              daily_review_target INTEGER NOT NULL DEFAULT 20,
              same_article_cooldown_hours INTEGER NOT NULL DEFAULT 24,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_choice_articles_set_sort ON choice_articles(set_id, sort_order);")
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_choice_article_words_article_sort ON choice_article_words(article_pk, sort_order);"
        )
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_choice_cards_due ON choice_user_question_cards(user_id, due_at);")
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_choice_logs_user_created ON choice_review_logs(user_id, created_at DESC);"
        )
        # Migration: add is_published to choice_sets
        await conn.execute(
            "ALTER TABLE choice_sets ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE"
        )
        # Snapshot table
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS choice_set_snapshots (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              set_id UUID NOT NULL REFERENCES choice_sets(id) ON DELETE CASCADE,
              total_questions INTEGER NOT NULL,
              total_articles INTEGER NOT NULL,
              by_state JSONB NOT NULL,
              mastery JSONB NOT NULL,
              fsrs_stats JSONB NOT NULL,
              due_status JSONB NOT NULL,
              focus_stats JSONB NOT NULL,
              trigger_reason TEXT NOT NULL DEFAULT 'phase_end',
              focus_run_id UUID NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshots_user_set ON choice_set_snapshots(user_id, set_id, created_at DESC);"
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
        INSERT INTO choice_sets(key, name, description, exam, source_version)
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
        INSERT INTO choice_articles(set_id, article_id, exam, year, text_no, title, sort_order)
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
    await conn.execute("DELETE FROM choice_paragraphs WHERE article_pk = $1::uuid", article_pk)
    for paragraph in seed.paragraphs:
        await conn.execute(
            "INSERT INTO choice_paragraphs(article_pk, paragraph_no, text) VALUES ($1::uuid, $2, $3)",
            article_pk,
            paragraph.paragraph_no,
            paragraph.text,
        )
    for question in seed.questions:
        await conn.execute(
            """
            INSERT INTO choice_questions(
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
        UPDATE choice_sets
        SET article_count = (
              SELECT COUNT(*) FROM choice_articles WHERE set_id = $1::uuid
            ),
            question_count = (
              SELECT COUNT(*)
              FROM choice_questions q
              JOIN choice_articles a ON a.id = q.article_pk
              WHERE a.set_id = $1::uuid
            ),
            updated_at = NOW()
        WHERE id = $1::uuid
        """,
        set_id,
    )


async def replace_article_words(conn: asyncpg.Connection, *, seed: ERCArticleWordSeed) -> None:
    article_row = await conn.fetchrow("SELECT id::text AS article_pk FROM choice_articles WHERE article_id = $1", seed.article_id)
    if article_row is None:
        raise ValueError(f"article_id {seed.article_id} does not exist")

    article_pk = str(article_row["article_pk"])
    await conn.execute("DELETE FROM choice_article_words WHERE article_pk = $1::uuid", article_pk)
    for index, word in enumerate(seed.words, start=1):
        await conn.execute(
            """
            INSERT INTO choice_article_words(article_pk, word, sort_order)
            VALUES ($1::uuid, $2, $3)
            """,
            article_pk,
            word,
            index,
        )


async def list_set_rows(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id::text AS id, key, name, description, exam, article_count, question_count
        FROM choice_sets
        WHERE is_published = TRUE
        ORDER BY key ASC
        """
    )


async def toggle_set_published(conn: asyncpg.Connection, *, set_id: str) -> bool:
    row = await conn.fetchrow(
        """
        UPDATE choice_sets
        SET is_published = NOT is_published, updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING is_published
        """,
        set_id,
    )
    if row is None:
        raise ValueError(f"阅读集 {set_id} 不存在")
    return bool(row["is_published"])


async def delete_set(conn: asyncpg.Connection, *, set_id: str) -> str:
    """Hard-delete a set and all its articles/questions (CASCADE). Returns the set name."""
    row = await conn.fetchrow(
        "DELETE FROM choice_sets WHERE id = $1::uuid RETURNING name",
        set_id,
    )
    if row is None:
        raise ValueError(f"阅读集 {set_id} 不存在")
    return str(row["name"])


async def list_admin_articles(conn: asyncpg.Connection, *, set_id: str) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT
          a.id::text AS id,
          a.article_id,
          a.year,
          a.text_no,
          a.title,
          a.sort_order,
          COUNT(q.id)::int AS question_count
        FROM choice_articles a
        LEFT JOIN choice_questions q ON q.article_pk = a.id
        WHERE a.set_id = $1::uuid
        GROUP BY a.id
        ORDER BY a.sort_order ASC
        """,
        set_id,
    )


async def delete_article(conn: asyncpg.Connection, *, article_pk: str) -> str:
    """Hard-delete a single article (CASCADE). Returns the article_id."""
    row = await conn.fetchrow(
        "DELETE FROM choice_articles WHERE id = $1::uuid RETURNING article_id",
        article_pk,
    )
    if row is None:
        raise ValueError(f"文章 {article_pk} 不存在")
    return str(row["article_id"])


async def list_article_rows(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    set_id: str | None,
    exam: str | None,
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
        FROM choice_articles a
        JOIN choice_questions q ON q.article_pk = a.id
        LEFT JOIN choice_user_article_attempts attempt
          ON attempt.article_pk = a.id AND attempt.user_id = $1
        LEFT JOIN choice_user_question_cards c
          ON c.question_pk = q.id AND c.user_id = $1
        LEFT JOIN choice_mistake_bucket m
          ON m.question_pk = q.id AND m.user_id = $1 AND m.is_active = TRUE
        WHERE ($2::uuid IS NULL OR a.set_id = $2::uuid)
          AND ($3::text IS NULL OR a.exam = $3)
        GROUP BY a.id
        ORDER BY a.year DESC, a.text_no ASC
        """,
        user_id,
        set_id,
        exam,
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
        FROM choice_articles a
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
        FROM choice_user_article_attempts
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
        FROM choice_paragraphs
        WHERE article_pk = $1::uuid
        ORDER BY paragraph_no ASC
        """,
        article_pk,
    )


async def list_question_rows(conn: asyncpg.Connection, *, article_pk: str) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id::text AS question_pk, question_id, question_no, stem, options_json, answer
        FROM choice_questions
        WHERE article_pk = $1::uuid
        ORDER BY sort_order ASC
        """,
        article_pk,
    )


async def list_article_word_state_rows(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    article_pk: str,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT
          aw.word,
          CASE
            WHEN COUNT(v.id) = 0 THEN 'unknown'
            WHEN BOOL_OR(COALESCE(p.fsrs_card_json ->> 'state', '') IN ('2', 'review', 'Review')) THEN 'mastered'
            WHEN BOOL_OR(p.word_id IS NOT NULL) THEN 'learning'
            ELSE 'unstarted'
          END AS state
        FROM choice_article_words aw
        LEFT JOIN vocab_words v ON LOWER(v.word) = aw.word
        LEFT JOIN vocab_user_word_progress p
          ON p.user_id = $1
         AND p.word_id = v.id
        WHERE aw.article_pk = $2::uuid
        GROUP BY aw.word, aw.sort_order
        ORDER BY aw.sort_order ASC
        """,
        user_id,
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
        FROM choice_questions q
        JOIN choice_articles a ON a.id = q.article_pk
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
        INSERT INTO choice_user_article_attempts(
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
        FROM choice_user_question_cards
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
        INSERT INTO choice_user_question_cards(
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
        INSERT INTO choice_review_logs(
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
        INSERT INTO choice_mistake_bucket(user_id, article_pk, question_pk, wrong_count, last_wrong_at, is_active)
        VALUES ($1, $2::uuid, $3::uuid, CASE WHEN $4 THEN 1 ELSE 0 END, NOW(), $4)
        ON CONFLICT (user_id, question_pk)
        DO UPDATE SET
          wrong_count = CASE
            WHEN $4 THEN choice_mistake_bucket.wrong_count + 1
            ELSE choice_mistake_bucket.wrong_count
          END,
          last_wrong_at = CASE
            WHEN $4 THEN NOW()
            ELSE choice_mistake_bucket.last_wrong_at
          END,
          is_active = $4,
          article_pk = EXCLUDED.article_pk
        """,
        user_id,
        article_pk,
        question_pk,
        is_active,
    )


async def list_due_card_rows(conn: asyncpg.Connection, *, user_id: int, limit: int, set_id: str | None = None) -> list[asyncpg.Record]:
    set_filter = "AND a.set_id = $3::uuid" if set_id else ""
    params: list[Any] = [user_id, limit]
    if set_id:
        params.append(set_id)
    return await conn.fetch(
        f"""
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
        FROM choice_user_question_cards c
        JOIN choice_questions q ON q.id = c.question_pk
        JOIN choice_articles a ON a.id = q.article_pk
        LEFT JOIN choice_mistake_bucket m ON m.user_id = c.user_id AND m.question_pk = c.question_pk
        WHERE c.user_id = $1
          AND c.due_at IS NOT NULL
          AND c.due_at <= NOW()
        {set_filter}
        ORDER BY COALESCE(m.is_active, FALSE) DESC, c.lapse_count DESC, c.due_at ASC
        LIMIT $2
        """,
        *params,
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
        FROM choice_review_logs
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
        FROM choice_user_question_cards
        WHERE user_id = $1 AND due_at IS NOT NULL AND due_at > NOW()
        """,
        user_id,
    )
    return row["next_due_at"] if row else None


async def get_user_settings(conn: asyncpg.Connection, *, user_id: int) -> asyncpg.Record:
    return await conn.fetchrow(
        """
        INSERT INTO choice_user_settings(user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO UPDATE SET updated_at = choice_user_settings.updated_at
        RETURNING daily_review_target, same_article_cooldown_hours
        """,
        user_id,
    )


async def get_overview_counts(conn: asyncpg.Connection, *, user_id: int, set_id: str | None = None) -> dict[str, Any]:
    params: list[Any] = [user_id]
    if set_id:
        params.append(set_id)
    row = await conn.fetchrow(
        f"""
        SELECT
          (
            SELECT COUNT(DISTINCT attempt.article_pk)::int
            FROM choice_user_article_attempts attempt
            {'JOIN choice_articles a ON a.id = attempt.article_pk' if set_id else ''}
            WHERE attempt.user_id = $1 {'AND a.set_id = $2::uuid' if set_id else ''}
          ) AS practiced_article_count,
          (
            SELECT COUNT(*)::int
            FROM choice_review_logs rl
            {'JOIN choice_questions q_rl ON q_rl.id = rl.question_pk JOIN choice_articles a_rl ON a_rl.id = q_rl.article_pk' if set_id else ''}
            WHERE rl.user_id = $1 {'AND a_rl.set_id = $2::uuid' if set_id else ''}
          ) AS practiced_question_count,
          (
            SELECT COUNT(*)::int
            FROM choice_review_logs rl2
            {'JOIN choice_questions q_rl2 ON q_rl2.id = rl2.question_pk JOIN choice_articles a_rl2 ON a_rl2.id = q_rl2.article_pk' if set_id else ''}
            WHERE rl2.user_id = $1 AND rl2.is_correct = TRUE {'AND a_rl2.set_id = $2::uuid' if set_id else ''}
          ) AS correct_log_count,
          (
            SELECT COUNT(*)::int
            FROM choice_user_question_cards c
            JOIN choice_questions q_c ON q_c.id = c.question_pk
            JOIN choice_articles a_c ON a_c.id = q_c.article_pk
            WHERE c.user_id = $1 AND c.due_at IS NOT NULL AND c.due_at <= NOW() {'AND a_c.set_id = $2::uuid' if set_id else ''}
          ) AS due_review_count,
          (
            SELECT COUNT(*)::int
            FROM choice_mistake_bucket mb
            JOIN choice_questions q_mb ON q_mb.id = mb.question_pk
            JOIN choice_articles a_mb ON a_mb.id = q_mb.article_pk
            WHERE mb.user_id = $1 AND mb.is_active = TRUE {'AND a_mb.set_id = $2::uuid' if set_id else ''}
          ) AS mistake_count
        """,
        *params,
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


async def get_recommended_article(conn: asyncpg.Connection, *, user_id: int, set_id: str | None = None) -> asyncpg.Record | None:
    set_filter = "AND a.set_id = $2::uuid" if set_id else ""
    params: list[Any] = [user_id]
    if set_id:
        params.append(set_id)
    return await conn.fetchrow(
        f"""
        SELECT a.article_id, a.year, a.text_no, a.title
        FROM choice_articles a
        WHERE NOT EXISTS (
          SELECT 1
          FROM choice_user_article_attempts attempt
          WHERE attempt.user_id = $1 AND attempt.article_pk = a.id
        )
        {set_filter}
        ORDER BY a.year DESC, a.text_no ASC
        LIMIT 1
        """,
        *params,
    )


async def list_mistake_rows(conn: asyncpg.Connection, *, user_id: int, set_id: str | None = None) -> list[asyncpg.Record]:
    set_filter = "AND a.set_id = $4::uuid" if set_id else ""
    params: list[Any] = [user_id]
    if set_id:
        params.append(set_id)
    return await conn.fetch(
        f"""
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
        FROM choice_mistake_bucket m
        JOIN choice_questions q ON q.id = m.question_pk
        JOIN choice_articles a ON a.id = m.article_pk
        LEFT JOIN choice_user_question_cards c ON c.user_id = m.user_id AND c.question_pk = m.question_pk
        WHERE m.user_id = $1 AND m.is_active = TRUE {set_filter}
        ORDER BY m.last_wrong_at DESC, a.year DESC, a.text_no ASC, q.sort_order ASC
        """,
        *params,
    )


# ---- Set Snapshots ----


async def aggregate_set_snapshot(conn: asyncpg.Connection, *, user_id: int, set_id: str) -> dict[str, Any]:
    """Aggregate mastery data for a question set to build a snapshot."""
    # Total questions and articles
    totals = await conn.fetchrow(
        """
        SELECT
          (SELECT COUNT(*)::int FROM choice_questions q
           JOIN choice_articles a ON a.id = q.article_pk
           WHERE a.set_id = $1::uuid) AS total_questions,
          (SELECT COUNT(*)::int FROM choice_articles a
           WHERE a.set_id = $1::uuid) AS total_articles
        """,
        set_id,
    )

    # By FSRS state
    state_rows = await conn.fetch(
        """
        SELECT
          COALESCE(c.fsrs_card_json ->> 'state', '0') AS state,
          COUNT(*)::int AS count
        FROM choice_user_question_cards c
        JOIN choice_questions q ON q.id = c.question_pk
        JOIN choice_articles a ON a.id = q.article_pk
        WHERE c.user_id = $1 AND a.set_id = $2::uuid
        GROUP BY state
        """,
        user_id,
        set_id,
    )

    # Mastery tiers (from fsrs_card_json stability)
    mastery_rows = await conn.fetch(
        """
        SELECT
          CASE
            WHEN COALESCE((c.fsrs_card_json ->> 'stability')::float, 0) > 30 THEN 'mastered'
            WHEN COALESCE((c.fsrs_card_json ->> 'stability')::float, 0) > 7 THEN 'familiar'
            ELSE 'weak'
          END AS tier,
          COUNT(*)::int AS count
        FROM choice_user_question_cards c
        JOIN choice_questions q ON q.id = c.question_pk
        JOIN choice_articles a ON a.id = q.article_pk
        WHERE c.user_id = $1 AND a.set_id = $2::uuid
        GROUP BY tier
        """,
        user_id,
        set_id,
    )

    # Mistake count
    mistake_row = await conn.fetchrow(
        """
        SELECT COUNT(*)::int AS mistake_count
        FROM choice_mistake_bucket m
        JOIN choice_questions q ON q.id = m.question_pk
        JOIN choice_articles a ON a.id = m.article_pk
        WHERE m.user_id = $1 AND a.set_id = $2::uuid AND m.is_active = TRUE
        """,
        user_id,
        set_id,
    )

    # FSRS stats
    fsrs_row = await conn.fetchrow(
        """
        SELECT
          ROUND(AVG(COALESCE((c.fsrs_card_json ->> 'stability')::float, 0))::numeric, 2) AS avg_stability,
          ROUND(AVG(COALESCE((c.fsrs_card_json ->> 'difficulty')::float, 0))::numeric, 3) AS avg_difficulty,
          COALESCE(SUM(c.lapse_count), 0)::int AS total_lapses,
          ROUND(AVG(c.right_count + c.wrong_count)::numeric, 1) AS avg_reps
        FROM choice_user_question_cards c
        JOIN choice_questions q ON q.id = c.question_pk
        JOIN choice_articles a ON a.id = q.article_pk
        WHERE c.user_id = $1 AND a.set_id = $2::uuid
        """,
        user_id,
        set_id,
    )

    # Due status
    due_row = await conn.fetchrow(
        """
        SELECT
          COUNT(*)::int AS due_now,
          COUNT(*) FILTER (WHERE c.due_at < NOW() - INTERVAL '1 hour')::int AS overdue
        FROM choice_user_question_cards c
        JOIN choice_questions q ON q.id = c.question_pk
        JOIN choice_articles a ON a.id = q.article_pk
        WHERE c.user_id = $1 AND a.set_id = $2::uuid
          AND c.due_at IS NOT NULL AND c.due_at <= NOW()
        """,
        user_id,
        set_id,
    )

    total_q = (totals["total_questions"] or 0) if totals else 0
    total_a = (totals["total_articles"] or 0) if totals else 0

    by_state = {row["state"]: row["count"] for row in state_rows}
    mastered = sum(r["count"] for r in mastery_rows if r["tier"] == "mastered")
    familiar = sum(r["count"] for r in mastery_rows if r["tier"] == "familiar")
    weak = sum(r["count"] for r in mastery_rows if r["tier"] == "weak")
    mistakes = (mistake_row["mistake_count"] or 0) if mistake_row else 0

    return {
        "total_questions": total_q,
        "total_articles": total_a,
        "by_state": by_state,
        "mastery": {
            "mastered": mastered,
            "familiar": familiar,
            "weak": weak,
            "mistake": mistakes,
        },
        "fsrs_stats": {
            "avg_stability": float(fsrs_row["avg_stability"] or 0) if fsrs_row else 0,
            "avg_difficulty": float(fsrs_row["avg_difficulty"] or 0) if fsrs_row else 0,
            "total_lapses": (fsrs_row["total_lapses"] or 0) if fsrs_row else 0,
            "avg_reps": float(fsrs_row["avg_reps"] or 0) if fsrs_row else 0,
        },
        "due_status": {
            "due_now": (due_row["due_now"] or 0) if due_row else 0,
            "overdue": (due_row["overdue"] or 0) if due_row else 0,
        },
    }


async def aggregate_focus_stats(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    set_id: str,
) -> dict[str, Any]:
    """Aggregate focus work stats relevant to a question set."""
    row = await conn.fetchrow(
        """
        WITH scoped_runs AS (
          SELECT
            fwr.id,
            COALESCE(
              MAX(fl.duration),
              GREATEST(EXTRACT(EPOCH FROM (COALESCE(fwr.ended_at, NOW()) - fwr.started_at))::int, 0)
            )::int AS duration
          FROM focus_work_runs fwr
          LEFT JOIN focus_app_work_logs fl
            ON fl.user_id = fwr.user_id
           AND fl.workflow_id = fwr.workflow_id
           AND fl.end_at IS NOT NULL
          WHERE fwr.user_id = $1
            AND fwr.focus_work_type IN ('review', 'practice')
            AND fwr.status = 'completed'
            AND (
              fwr.config_snapshot->'choice_scope'->>'bank_id' = $2
              OR fwr.config_snapshot->>'set_id' = $2
              OR fwr.config_snapshot->>'article_set_id' = $2
            )
          GROUP BY fwr.id
        )
        SELECT
          COUNT(*)::int AS total_sessions,
          COALESCE(SUM(duration), 0)::int AS total_seconds
        FROM scoped_runs
        """,
        user_id,
        set_id,
    )
    if row is None or int(row["total_sessions"] or 0) == 0:
        row = await conn.fetchrow(
            """
            SELECT
              COUNT(*)::int AS total_sessions,
              COALESCE(SUM(duration), 0)::int AS total_seconds
            FROM focus_app_work_logs fl
            WHERE fl.user_id = $1
              AND fl.focus_work_type IN ('review', 'practice')
              AND fl.end_at IS NOT NULL
            """,
            user_id,
        )

    # Review accuracy from logs
    acc_row = await conn.fetchrow(
        """
        SELECT
          COUNT(*)::int AS total_answers,
          COUNT(*) FILTER (WHERE rl.is_correct = TRUE)::int AS correct_answers
        FROM choice_review_logs rl
        JOIN choice_questions q ON q.id = rl.question_pk
        JOIN choice_articles a ON a.id = q.article_pk
        WHERE rl.user_id = $1 AND a.set_id = $2::uuid
        """,
        user_id,
        set_id,
    )

    total = (row["total_sessions"] or 0) if row else 0
    seconds = (row["total_seconds"] or 0) if row else 0
    answers = (acc_row["total_answers"] or 0) if acc_row else 0
    correct = (acc_row["correct_answers"] or 0) if acc_row else 0

    return {
        "total_sessions": total,
        "total_minutes": round(seconds / 60),
        "total_answers": answers,
        "accuracy": round(correct / answers, 3) if answers > 0 else 0,
    }


async def insert_set_snapshot(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    set_id: str,
    data: dict[str, Any],
    trigger_reason: str,
    focus_run_id: str | None,
) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO choice_set_snapshots(
          user_id, set_id, total_questions, total_articles,
          by_state, mastery, fsrs_stats, due_status, focus_stats,
          trigger_reason, focus_run_id
        )
        VALUES ($1, $2::uuid, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11::uuid)
        RETURNING id::text
        """,
        user_id,
        set_id,
        data["total_questions"],
        data["total_articles"],
        _json_param(data["by_state"]),
        _json_param(data["mastery"]),
        _json_param(data["fsrs_stats"]),
        _json_param(data["due_status"]),
        _json_param(data["focus_stats"]),
        trigger_reason,
        focus_run_id,
    )
    return str(row["id"])


async def list_set_snapshots(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    set_id: str,
    limit: int = 20,
    offset: int = 0,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id::text, user_id, set_id::text, total_questions, total_articles,
               by_state, mastery, fsrs_stats, due_status, focus_stats,
               trigger_reason, focus_run_id::text, created_at
        FROM choice_set_snapshots
        WHERE user_id = $1 AND set_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4
        """,
        user_id,
        set_id,
        limit,
        offset,
    )


async def list_questions_by_set(
    conn: asyncpg.Connection,
    *,
    set_id: str,
    limit: int = 200,
    offset: int = 0,
    search: str | None = None,
) -> list[asyncpg.Record]:
    """批量获取 choice 题库中的题目，支持分页和搜索。"""
    if search:
        search_pattern = f"%{search}%"
        return await conn.fetch(
            """
            SELECT q.id::text AS question_pk, q.question_id, q.question_no, q.stem,
                   q.options_json, q.answer, q.explanation, q.question_type,
                   q.evidence_json,
                   a.article_id, a.exam, a.year, a.title AS article_title
            FROM choice_questions q
            JOIN choice_articles a ON a.id = q.article_pk
            WHERE a.set_id = $1::uuid
              AND (q.stem ILIKE $4 OR a.title ILIKE $4)
            ORDER BY a.sort_order ASC, q.sort_order ASC, q.question_no ASC
            LIMIT $2 OFFSET $3
            """,
            set_id,
            limit,
            offset,
            search_pattern,
        )
    else:
        return await conn.fetch(
            """
            SELECT q.id::text AS question_pk, q.question_id, q.question_no, q.stem,
                   q.options_json, q.answer, q.explanation, q.question_type,
                   q.evidence_json,
                   a.article_id, a.exam, a.year, a.title AS article_title
            FROM choice_questions q
            JOIN choice_articles a ON a.id = q.article_pk
            WHERE a.set_id = $1::uuid
            ORDER BY a.sort_order ASC, q.sort_order ASC, q.question_no ASC
            LIMIT $2 OFFSET $3
            """,
            set_id,
            limit,
            offset,
        )


async def count_questions_by_set(conn: asyncpg.Connection, *, set_id: str) -> int:
    """统计 choice 题库中的题目总数。"""
    row = await conn.fetchrow(
        """
        SELECT COUNT(*)::int AS total
        FROM choice_questions q
        JOIN choice_articles a ON a.id = q.article_pk
        WHERE a.set_id = $1::uuid
        """,
        set_id,
    )
    return int(row["total"]) if row else 0


async def get_subjects_by_set(conn: asyncpg.Connection, *, set_id: str) -> list[str]:
    """获取 choice 题库中涉及的科目/考试类型。"""
    rows = await conn.fetch(
        """
        SELECT DISTINCT exam
        FROM choice_articles
        WHERE set_id = $1::uuid AND exam != ''
        ORDER BY exam
        """,
        set_id,
    )
    return [row["exam"] for row in rows]
