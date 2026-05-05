from __future__ import annotations

from typing import Any

import asyncpg

from .importer import DeckSeed, WordSeed


async def init_vocab(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 vocab 表")
    await init_tables(pool)


async def init_tables(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocab_decks (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              key TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL,
              description TEXT NOT NULL DEFAULT '',
              source_version TEXT NOT NULL DEFAULT '',
              word_count INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocab_words (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              deck_id UUID NOT NULL REFERENCES vocab_decks(id) ON DELETE CASCADE,
              word TEXT NOT NULL,
              us_pronunciation TEXT NULL,
              uk_pronunciation TEXT NULL,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(deck_id, word)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocab_word_translations (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              word_id UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
              sort_order INTEGER NOT NULL DEFAULT 0,
              pos TEXT NULL,
              translation TEXT NOT NULL
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocab_word_phrases (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              word_id UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
              sort_order INTEGER NOT NULL DEFAULT 0,
              phrase TEXT NOT NULL,
              translation TEXT NOT NULL
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocab_word_sentences (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              word_id UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
              sort_order INTEGER NOT NULL DEFAULT 0,
              sentence TEXT NOT NULL,
              translation TEXT NOT NULL
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocab_user_deck_settings (
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              deck_id UUID NOT NULL REFERENCES vocab_decks(id) ON DELETE CASCADE,
              daily_new_limit INTEGER NOT NULL DEFAULT 20,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              PRIMARY KEY (user_id, deck_id)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocab_user_word_progress (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              deck_id UUID NOT NULL REFERENCES vocab_decks(id) ON DELETE CASCADE,
              word_id UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
              mastery_score INTEGER NOT NULL DEFAULT 0,
              correct_count INTEGER NOT NULL DEFAULT 0,
              wrong_count INTEGER NOT NULL DEFAULT 0,
              lapse_count INTEGER NOT NULL DEFAULT 0,
              interval_days INTEGER NOT NULL DEFAULT 0,
              next_review_at TIMESTAMPTZ NULL,
              last_review_at TIMESTAMPTZ NULL,
              last_result TEXT NULL,
              is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(user_id, word_id)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocab_review_logs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              deck_id UUID NOT NULL REFERENCES vocab_decks(id) ON DELETE CASCADE,
              word_id UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
              review_mode TEXT NOT NULL,
              prompt_type TEXT NOT NULL,
              result TEXT NOT NULL,
              response_ms INTEGER NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocab_learning_sessions (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              deck_id UUID NOT NULL REFERENCES vocab_decks(id) ON DELETE CASCADE,
              started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ended_at TIMESTAMPTZ NULL
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocab_mistake_bucket (
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              deck_id UUID NOT NULL REFERENCES vocab_decks(id) ON DELETE CASCADE,
              word_id UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
              wrong_count INTEGER NOT NULL DEFAULT 0,
              last_wrong_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              is_active BOOLEAN NOT NULL DEFAULT TRUE,
              PRIMARY KEY (user_id, word_id)
            );
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_vocab_words_deck_sort ON vocab_words(deck_id, sort_order ASC);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_vocab_progress_due ON vocab_user_word_progress(user_id, deck_id, next_review_at);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_vocab_mistakes_active ON vocab_mistake_bucket(user_id, deck_id, is_active);"
        )


async def upsert_vocab_deck(
    conn: asyncpg.Connection,
    *,
    key: str,
    name: str,
    description: str,
    source_version: str,
) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO vocab_decks(key, name, description, source_version)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (key) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            source_version = EXCLUDED.source_version,
            updated_at = NOW()
        RETURNING id::text
        """,
        key,
        name,
        description,
        source_version,
    )
    return str(row["id"])


async def replace_deck_words(conn: asyncpg.Connection, *, deck_id: str, words: list[WordSeed]) -> None:
    await conn.execute("DELETE FROM vocab_words WHERE deck_id = $1::uuid", deck_id)
    for word in words:
        word_row = await conn.fetchrow(
            """
            INSERT INTO vocab_words(deck_id, word, us_pronunciation, uk_pronunciation, sort_order)
            VALUES ($1::uuid, $2, $3, $4, $5)
            RETURNING id::text
            """,
            deck_id,
            word.word,
            word.us_pronunciation,
            word.uk_pronunciation,
            word.sort_order,
        )
        word_id = str(word_row["id"])
        for index, translation in enumerate(word.translations, start=1):
            await conn.execute(
                """
                INSERT INTO vocab_word_translations(word_id, sort_order, pos, translation)
                VALUES ($1::uuid, $2, $3, $4)
                """,
                word_id,
                index,
                translation.pos,
                translation.translation,
            )
        for index, phrase in enumerate(word.phrases, start=1):
            await conn.execute(
                """
                INSERT INTO vocab_word_phrases(word_id, sort_order, phrase, translation)
                VALUES ($1::uuid, $2, $3, $4)
                """,
                word_id,
                index,
                phrase.phrase,
                phrase.translation,
            )
        for index, sentence in enumerate(word.sentences, start=1):
            await conn.execute(
                """
                INSERT INTO vocab_word_sentences(word_id, sort_order, sentence, translation)
                VALUES ($1::uuid, $2, $3, $4)
                """,
                word_id,
                index,
                sentence.sentence,
                sentence.translation,
            )
    await conn.execute(
        "UPDATE vocab_decks SET word_count = $2, updated_at = NOW() WHERE id = $1::uuid",
        deck_id,
        len(words),
    )


async def import_deck(conn: asyncpg.Connection, deck: DeckSeed) -> str:
    deck_id = await upsert_vocab_deck(
        conn,
        key=deck.key,
        name=deck.name,
        description=deck.description,
        source_version=deck.source_version,
    )
    await replace_deck_words(conn, deck_id=deck_id, words=deck.words)
    return deck_id


async def sync_vocab_deck_word_counts(conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
        UPDATE vocab_decks d
        SET word_count = COALESCE(stats.actual_word_count, 0),
            updated_at = NOW()
        FROM (
          SELECT d2.id AS deck_id, COUNT(w.id)::int AS actual_word_count
          FROM vocab_decks d2
          LEFT JOIN vocab_words w ON w.deck_id = d2.id
          GROUP BY d2.id
        ) stats
        WHERE d.id = stats.deck_id
          AND d.word_count IS DISTINCT FROM COALESCE(stats.actual_word_count, 0)
        """
    )


async def list_vocab_decks(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT
          d.id::text AS id,
          d.key,
          d.name,
          d.description,
          COALESCE(stats.actual_word_count, 0) AS word_count,
          d.created_at,
          d.updated_at
        FROM vocab_decks d
        LEFT JOIN (
          SELECT deck_id, COUNT(*)::int AS actual_word_count
          FROM vocab_words
          GROUP BY deck_id
        ) stats ON stats.deck_id = d.id
        ORDER BY d.name ASC
        """
    )


async def get_daily_new_limit(conn: asyncpg.Connection, *, user_id: int, deck_ids: list[str]) -> int:
    row = await conn.fetchrow(
        """
        SELECT MIN(daily_new_limit) AS daily_new_limit
        FROM vocab_user_deck_settings
        WHERE user_id = $1 AND deck_id = ANY($2::uuid[])
        """,
        user_id,
        deck_ids,
    )
    return int(row["daily_new_limit"]) if row and row["daily_new_limit"] is not None else 20


async def count_new_words(conn: asyncpg.Connection, *, user_id: int, deck_ids: list[str]) -> int:
    row = await conn.fetchrow(
        """
        SELECT COUNT(*) AS total
        FROM vocab_words w
        LEFT JOIN vocab_user_word_progress p
          ON p.user_id = $1 AND p.word_id = w.id
        WHERE w.deck_id = ANY($2::uuid[])
          AND p.word_id IS NULL
        """,
        user_id,
        deck_ids,
    )
    return int(row["total"])


async def count_studied_new_words_today(conn: asyncpg.Connection, *, user_id: int, deck_ids: list[str]) -> int:
    row = await conn.fetchrow(
        """
        SELECT COUNT(DISTINCT word_id) AS total
        FROM vocab_review_logs
        WHERE user_id = $1
          AND deck_id = ANY($2::uuid[])
          AND review_mode = 'study'
          AND created_at >= date_trunc('day', NOW())
          AND created_at < date_trunc('day', NOW()) + INTERVAL '1 day'
        """,
        user_id,
        deck_ids,
    )
    return int(row["total"])


async def count_due_reviews(conn: asyncpg.Connection, *, user_id: int, deck_ids: list[str]) -> int:
    row = await conn.fetchrow(
        """
        SELECT COUNT(*) AS total
        FROM vocab_user_word_progress
        WHERE user_id = $1
          AND deck_id = ANY($2::uuid[])
          AND next_review_at IS NOT NULL
          AND next_review_at <= NOW()
          AND is_suspended = FALSE
        """,
        user_id,
        deck_ids,
    )
    return int(row["total"])


async def count_active_mistakes(conn: asyncpg.Connection, *, user_id: int, deck_ids: list[str]) -> int:
    row = await conn.fetchrow(
        """
        SELECT COUNT(*) AS total
        FROM vocab_mistake_bucket
        WHERE user_id = $1
          AND deck_id = ANY($2::uuid[])
          AND is_active = TRUE
        """,
        user_id,
        deck_ids,
    )
    return int(row["total"])


async def get_word_detail_row(conn: asyncpg.Connection, *, word_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT id::text AS id, deck_id::text AS deck_id, word, us_pronunciation, uk_pronunciation
        FROM vocab_words
        WHERE id = $1::uuid
        """,
        word_id,
    )


async def list_word_translations(conn: asyncpg.Connection, *, word_id: str) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT pos, translation
        FROM vocab_word_translations
        WHERE word_id = $1::uuid
        ORDER BY sort_order ASC
        """,
        word_id,
    )


async def list_word_phrases(conn: asyncpg.Connection, *, word_id: str) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT phrase, translation
        FROM vocab_word_phrases
        WHERE word_id = $1::uuid
        ORDER BY sort_order ASC
        """,
        word_id,
    )


async def list_word_sentences(conn: asyncpg.Connection, *, word_id: str) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT sentence, translation
        FROM vocab_word_sentences
        WHERE word_id = $1::uuid
        ORDER BY sort_order ASC
        """,
        word_id,
    )


async def get_user_word_progress(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    deck_id: str,
    word_id: str,
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT mastery_score, correct_count, wrong_count, lapse_count, interval_days
        FROM vocab_user_word_progress
        WHERE user_id = $1 AND deck_id = $2::uuid AND word_id = $3::uuid
        """,
        user_id,
        deck_id,
        word_id,
    )


async def upsert_user_word_progress(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    deck_id: str,
    word_id: str,
    mastery_score: int,
    correct_count: int,
    wrong_count: int,
    lapse_count: int,
    interval_days: int,
    next_review_at: Any,
    last_result: str,
) -> None:
    await conn.execute(
        """
        INSERT INTO vocab_user_word_progress(
          user_id, deck_id, word_id, mastery_score, correct_count, wrong_count, lapse_count,
          interval_days, next_review_at, last_review_at, last_result, updated_at
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, NOW(), $10, NOW())
        ON CONFLICT (user_id, word_id)
        DO UPDATE SET
          mastery_score = EXCLUDED.mastery_score,
          correct_count = EXCLUDED.correct_count,
          wrong_count = EXCLUDED.wrong_count,
          lapse_count = EXCLUDED.lapse_count,
          interval_days = EXCLUDED.interval_days,
          next_review_at = EXCLUDED.next_review_at,
          last_review_at = NOW(),
          last_result = EXCLUDED.last_result,
          updated_at = NOW(),
          deck_id = EXCLUDED.deck_id
        """,
        user_id,
        deck_id,
        word_id,
        mastery_score,
        correct_count,
        wrong_count,
        lapse_count,
        interval_days,
        next_review_at,
        last_result,
    )


async def insert_review_log(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    deck_id: str,
    word_id: str,
    review_mode: str,
    prompt_type: str,
    result: str,
    response_ms: int | None,
) -> None:
    await conn.execute(
        """
        INSERT INTO vocab_review_logs(user_id, deck_id, word_id, review_mode, prompt_type, result, response_ms)
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7)
        """,
        user_id,
        deck_id,
        word_id,
        review_mode,
        prompt_type,
        result,
        response_ms,
    )


async def upsert_mistake_bucket(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    deck_id: str,
    word_id: str,
    is_active: bool,
) -> None:
    await conn.execute(
        """
        INSERT INTO vocab_mistake_bucket(user_id, deck_id, word_id, wrong_count, last_wrong_at, is_active)
        VALUES ($1, $2::uuid, $3::uuid, CASE WHEN $4 THEN 1 ELSE 0 END, NOW(), $4)
        ON CONFLICT (user_id, word_id)
        DO UPDATE SET
          wrong_count = CASE
            WHEN $4 THEN vocab_mistake_bucket.wrong_count + 1
            ELSE vocab_mistake_bucket.wrong_count
          END,
          last_wrong_at = CASE
            WHEN $4 THEN NOW()
            ELSE vocab_mistake_bucket.last_wrong_at
          END,
          is_active = $4,
          deck_id = EXCLUDED.deck_id
        """,
        user_id,
        deck_id,
        word_id,
        is_active,
    )


async def list_review_queue_rows(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    deck_ids: list[str],
    limit: int,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT
          w.id::text AS id,
          w.deck_id::text AS deck_id,
          w.word,
          w.us_pronunciation,
          w.uk_pronunciation,
          COALESCE(p.mastery_score, 0) AS mastery_score
        FROM vocab_words w
        JOIN vocab_user_word_progress p
          ON p.word_id = w.id
         AND p.user_id = $1
        WHERE w.deck_id = ANY($2::uuid[])
          AND p.next_review_at IS NOT NULL
          AND p.next_review_at <= NOW()
          AND p.is_suspended = FALSE
        ORDER BY p.next_review_at ASC, w.sort_order ASC
        LIMIT $3
        """,
        user_id,
        deck_ids,
        limit,
    )


async def list_study_queue_rows(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    deck_id: str,
    limit: int,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT
          w.id::text AS id,
          w.deck_id::text AS deck_id,
          w.word,
          w.us_pronunciation,
          w.uk_pronunciation,
          0 AS mastery_score
        FROM vocab_words w
        LEFT JOIN vocab_user_word_progress p
          ON p.user_id = $1 AND p.word_id = w.id
        WHERE w.deck_id = $2::uuid
          AND p.word_id IS NULL
        ORDER BY w.sort_order ASC
        LIMIT $3
        """,
        user_id,
        deck_id,
        limit,
    )


async def list_mistake_rows(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    deck_ids: list[str],
    limit: int,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT
          w.id::text AS id,
          w.deck_id::text AS deck_id,
          w.word,
          w.us_pronunciation,
          w.uk_pronunciation,
          m.last_wrong_at,
          m.wrong_count
        FROM vocab_mistake_bucket m
        JOIN vocab_words w ON w.id = m.word_id
        WHERE m.user_id = $1
          AND m.deck_id = ANY($2::uuid[])
          AND m.is_active = TRUE
        ORDER BY m.last_wrong_at DESC, w.sort_order ASC
        LIMIT $3
        """,
        user_id,
        deck_ids,
        limit,
    )
