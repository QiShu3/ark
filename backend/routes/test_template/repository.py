"""DB tables and queries for 模板子应用."""
import json
from datetime import datetime
from typing import Any

import asyncpg


async def init_tables(pool: asyncpg.Pool) -> None:
    """Create tables if not exist (questions + progress tables created by admin import)."""
    # tables created by admin import — this is a no-op placeholder
    pass


# ---- Sets ----

async def list_set_rows(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    return await conn.fetch(
        "SELECT id, key, name, item_count, is_published FROM test-template_sets WHERE is_published = TRUE ORDER BY name"
    )


# ---- Overview ----

async def get_overview_counts(conn: asyncpg.Connection, *, user_id: int, set_id: str | None = None) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT
          (SELECT COUNT(*)::int FROM test_template_review_logs WHERE user_id = $1) AS practiced_count,
          (SELECT COUNT(*)::int FROM test_template_review_logs WHERE user_id = $1 AND is_correct = TRUE) AS correct_count,
          (SELECT COUNT(*)::int FROM test_template_user_question_cards WHERE user_id = $1 AND due_at IS NOT NULL AND due_at <= NOW()) AS due_count,
          (SELECT COUNT(*)::int FROM test_template_mistake_bucket WHERE user_id = $1 AND is_active = TRUE) AS mistake_count
        """,
        user_id,
    )
    return dict(row) if row else {"practiced_count": 0, "correct_count": 0, "due_count": 0, "mistake_count": 0}


# ---- Review ----

async def list_due_card_rows(conn: asyncpg.Connection, *, user_id: int, limit: int, set_id: str | None = None) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT c.question_pk::text, c.due_at, c.fsrs_card_json, c.wrong_count, c.right_count, c.lapse_count,
               q.question_id, q.stem, q.options_json, q.answer, q.explanation, q.meta_json,
               COALESCE(m.is_active, FALSE) AS is_mistake
        FROM test_template_user_question_cards c
        JOIN test_template_questions q ON q.id = c.question_pk
        LEFT JOIN test_template_mistake_bucket m ON m.user_id = c.user_id AND m.question_pk = c.question_pk
        WHERE c.user_id = $1 AND c.due_at IS NOT NULL AND c.due_at <= NOW()
        ORDER BY COALESCE(m.is_active, FALSE) DESC, c.lapse_count DESC, c.due_at ASC
        LIMIT $2
        """,
        user_id, limit,
    )


async def get_next_due_at(conn: asyncpg.Connection, *, user_id: int) -> Any:
    row = await conn.fetchrow(
        "SELECT MIN(due_at) AS next_due_at FROM test_template_user_question_cards WHERE user_id = $1 AND due_at > NOW()",
        user_id,
    )
    return row["next_due_at"] if row else None


# ---- Submit ----

async def upsert_question_card(conn: asyncpg.Connection, *, user_id: int, question_pk: str, is_correct: bool, chosen_option: str, fsrs_json: dict, next_due: datetime) -> None:
    await conn.execute(
        """INSERT INTO test_template_user_question_cards (user_id, question_pk, due_at, fsrs_card_json, wrong_count, right_count, lapse_count, last_review_at, last_answer_correct, last_chosen_option)
            VALUES ($1, $2::uuid, $3, $4::jsonb, $5, $6, $7, NOW(), $8, $9)
            ON CONFLICT (user_id, question_pk) DO UPDATE SET
              due_at=EXCLUDED.due_at, fsrs_card_json=EXCLUDED.fsrs_card_json,
              wrong_count=test_template_user_question_cards.wrong_count + EXCLUDED.wrong_count,
              right_count=test_template_user_question_cards.right_count + EXCLUDED.right_count,
              lapse_count=test_template_user_question_cards.lapse_count + EXCLUDED.lapse_count,
              last_review_at=NOW(), last_answer_correct=EXCLUDED.last_answer_correct,
              last_chosen_option=EXCLUDED.last_chosen_option""",
        user_id, question_pk, next_due, json.dumps(fsrs_json, default=str),
        1 if not is_correct else 0, 1 if is_correct else 0, 1 if not is_correct else 0,
        is_correct, chosen_option,
    )


async def insert_review_log(conn: asyncpg.Connection, *, user_id: int, question_pk: str, chosen_option: str, is_correct: bool, rating: str | None = None) -> None:
    await conn.execute(
        "INSERT INTO test_template_review_logs (user_id, question_pk, chosen_option, is_correct, rating) VALUES ($1, $2::uuid, $3, $4, $5)",
        user_id, question_pk, chosen_option, is_correct, rating,
    )


async def upsert_mistake(conn: asyncpg.Connection, *, user_id: int, question_pk: str, is_correct: bool) -> None:
    if is_correct:
        await conn.execute(
            "UPDATE test_template_mistake_bucket SET is_active = FALSE WHERE user_id = $1 AND question_pk = $2::uuid",
            user_id, question_pk,
        )
    else:
        await conn.execute(
            """INSERT INTO test_template_mistake_bucket (user_id, question_pk, wrong_count, last_wrong_at, is_active)
                VALUES ($1, $2::uuid, 1, NOW(), TRUE)
                ON CONFLICT (user_id, question_pk) DO UPDATE SET wrong_count = test_template_mistake_bucket.wrong_count + 1, last_wrong_at = NOW(), is_active = TRUE""",
            user_id, question_pk,
        )


# ---- Mistakes ----

async def list_mistake_rows(conn: asyncpg.Connection, *, user_id: int, set_id: str | None = None) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT q.question_id, q.stem, q.answer AS correct_option, c.last_chosen_option,
               m.wrong_count, m.last_wrong_at, COALESCE(c.due_at <= NOW(), FALSE) AS is_due
        FROM test_template_mistake_bucket m
        JOIN test_template_questions q ON q.id = m.question_pk
        LEFT JOIN test_template_user_question_cards c ON c.user_id = m.user_id AND c.question_pk = m.question_pk
        WHERE m.user_id = $1 AND m.is_active = TRUE
        ORDER BY m.last_wrong_at DESC
        """,
        user_id,
    )
