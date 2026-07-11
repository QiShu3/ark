from __future__ import annotations

import json
from typing import Any

import asyncpg

# ---- input_sets ----

async def list_input_sets(conn: asyncpg.Connection, *, is_guest: bool = False) -> list[asyncpg.Record]:
    guest_filter = "WHERE is_guest_only = TRUE" if is_guest else "WHERE is_guest_only = FALSE"
    return await conn.fetch(
        f"""
        SELECT id::text AS id, name, question_count, exam
        FROM input_sets
        {guest_filter}
        ORDER BY created_at DESC
        """
    )


async def get_input_set(conn: asyncpg.Connection, set_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        "SELECT id::text AS id, name, question_count, exam FROM input_sets WHERE id = $1::uuid",
        set_id,
    )


async def insert_input_set(
    conn: asyncpg.Connection,
    *,
    key: str,
    name: str,
    description: str,
    exam: str,
) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO input_sets (key, name, description, exam)
        VALUES ($1, $2, $3, $4)
        RETURNING id::text
        """,
        key, name, description, exam,
    )
    return str(row["id"])


async def refresh_set_counts(conn: asyncpg.Connection, set_id: str) -> None:
    await conn.execute(
        """
        UPDATE input_sets
        SET article_count = (
          SELECT COUNT(*)::int FROM input_articles WHERE set_id = $1::uuid
        ),
        question_count = (
          SELECT COUNT(*)::int FROM input_questions q
          JOIN input_articles a ON a.id = q.article_pk
          WHERE a.set_id = $1::uuid
        ),
        updated_at = NOW()
        WHERE id = $1::uuid
        """,
        set_id,
    )


async def delete_input_set(conn: asyncpg.Connection, set_id: str) -> bool:
    result = await conn.execute("DELETE FROM input_sets WHERE id = $1::uuid", set_id)
    return result == "DELETE 1"


# ---- input_articles ----

async def insert_input_article(
    conn: asyncpg.Connection,
    *,
    set_id: str,
    article_id: str,
    title: str,
    sort_order: int,
) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO input_articles (set_id, article_id, title, sort_order)
        VALUES ($1::uuid, $2, $3, $4)
        RETURNING id::text
        """,
        set_id, article_id, title, sort_order,
    )
    return str(row["id"])


async def list_articles_by_set(conn: asyncpg.Connection, set_id: str) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id::text AS id, article_id, title, sort_order
        FROM input_articles
        WHERE set_id = $1::uuid
        ORDER BY sort_order ASC
        """,
        set_id,
    )


# ---- input_paragraphs ----

async def insert_input_paragraph(
    conn: asyncpg.Connection,
    *,
    article_pk: str,
    paragraph_no: int,
    text: str,
) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO input_paragraphs (article_pk, paragraph_no, text)
        VALUES ($1::uuid, $2, $3)
        RETURNING id::text
        """,
        article_pk, paragraph_no, text,
    )
    return str(row["id"])


async def list_paragraphs_by_article(conn: asyncpg.Connection, article_pk: str) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id::text AS id, paragraph_no, text
        FROM input_paragraphs
        WHERE article_pk = $1::uuid
        ORDER BY paragraph_no ASC
        """,
        article_pk,
    )


# ---- input_questions ----

async def insert_input_question(
    conn: asyncpg.Connection,
    *,
    article_pk: str,
    question_id: str,
    question_no: int,
    stem: str,
    mode: str,
    input_config: dict,
    accepted_answers: list[str],
    match_rule: str,
    case_sensitive: bool,
    rubric: str,
    reference_answer: str,
    explanation: str,
    sort_order: int,
) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO input_questions (
          article_pk, question_id, question_no, stem, mode, input_config,
          accepted_answers, match_rule, case_sensitive, rubric, reference_answer,
          explanation, sort_order
        ) VALUES (
          $1::uuid, $2, $3, $4, $5, $6::jsonb,
          $7::jsonb, $8, $9, $10, $11,
          $12, $13
        )
        RETURNING id::text
        """,
        article_pk, question_id, question_no, stem, mode,
        json.dumps(input_config), json.dumps(accepted_answers),
        match_rule, case_sensitive, rubric, reference_answer,
        explanation, sort_order,
    )
    return str(row["id"])


async def get_question_by_id(conn: asyncpg.Connection, question_id: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT q.id::text AS id, q.question_id, q.question_no, q.stem, q.mode,
               q.input_config, q.accepted_answers, q.match_rule, q.case_sensitive,
               q.rubric, q.reference_answer, q.explanation, q.sort_order,
               a.id::text AS article_pk, a.article_id, a.title AS article_title
        FROM input_questions q
        JOIN input_articles a ON a.id = q.article_pk
        WHERE q.question_id = $1
        """,
        question_id,
    )


async def get_paragraphs_for_question(conn: asyncpg.Connection, article_pk: str) -> list[asyncpg.Record]:
    return await list_paragraphs_by_article(conn, article_pk)


async def list_all_questions_by_set(
    conn: asyncpg.Connection, set_id: str, limit: int = 200, offset: int = 0
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT q.id::text AS id, q.question_id, q.question_no, q.stem, q.mode,
               q.input_config, q.accepted_answers, q.match_rule, q.case_sensitive,
               q.rubric, q.reference_answer, q.explanation, q.sort_order,
               a.id::text AS article_pk, a.article_id, a.title AS article_title
        FROM input_questions q
        JOIN input_articles a ON a.id = q.article_pk
        WHERE a.set_id = $1::uuid
        ORDER BY a.sort_order ASC, q.sort_order ASC, q.question_no ASC
        LIMIT $2 OFFSET $3
        """,
        set_id, limit, offset,
    )


async def delete_input_set_cascade(conn: asyncpg.Connection, set_id: str) -> bool:
    result = await conn.execute("DELETE FROM input_sets WHERE id = $1::uuid", set_id)
    return result == "DELETE 1"


# ---- input_set_snapshots ----

async def aggregate_input_snapshot(
    conn: asyncpg.Connection, *, user_id: int, set_id: str
) -> dict[str, Any]:
    total_row = await conn.fetchrow(
        """
        SELECT COUNT(*)::int AS total
        FROM input_questions q
        JOIN input_articles a ON a.id = q.article_pk
        WHERE a.set_id = $1::uuid
        """,
        set_id,
    )
    total = (total_row["total"] or 0) if total_row else 0

    mode_rows = await conn.fetch(
        """
        SELECT q.mode, COUNT(*)::int AS count
        FROM input_questions q
        JOIN input_articles a ON a.id = q.article_pk
        WHERE a.set_id = $1::uuid
        GROUP BY q.mode
        """,
        set_id,
    )
    mode_breakdown = {r["mode"]: r["count"] for r in mode_rows}

    # Get user answer statistics
    answer_stats = await conn.fetchrow(
        """
        SELECT
          COUNT(*)::int AS answered_count,
          COUNT(*) FILTER (WHERE is_correct = TRUE)::int AS correct_count,
          COALESCE(AVG(score), 0)::numeric AS avg_score,
          COALESCE(SUM(time_spent_ms), 0)::int AS total_time_ms
        FROM input_user_answers
        WHERE user_id = $1 AND set_id = $2::uuid
        """,
        user_id,
        set_id,
    )

    # Get wrong question IDs
    wrong_rows = await conn.fetch(
        """
        SELECT DISTINCT question_id
        FROM input_user_answers
        WHERE user_id = $1 AND set_id = $2::uuid AND is_correct = FALSE
        ORDER BY question_id
        """,
        user_id,
        set_id,
    )
    wrong_question_ids = [r["question_id"] for r in wrong_rows]

    return {
        "total_questions": total,
        "mode_breakdown": mode_breakdown,
        "answered_count": answer_stats["answered_count"] if answer_stats else 0,
        "correct_count": answer_stats["correct_count"] if answer_stats else 0,
        "avg_score": float(answer_stats["avg_score"]) if answer_stats else None,
        "total_time_ms": answer_stats["total_time_ms"] if answer_stats else 0,
        "wrong_question_ids": wrong_question_ids,
    }


async def aggregate_input_focus_stats(
    conn: asyncpg.Connection, *, user_id: int, set_id: str
) -> dict[str, Any]:
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
            AND fwr.focus_work_type = 'input'
            AND fwr.status IN ('completed', 'content_completed')
            AND (
              fwr.config_snapshot->>'input_bank_id' = $2
              OR fwr.config_snapshot->>'bank_id' = $2
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
              AND fl.focus_work_type = 'input'
              AND fl.end_at IS NOT NULL
            """,
            user_id,
        )

    total_sessions = (row["total_sessions"] or 0) if row else 0
    seconds = (row["total_seconds"] or 0) if row else 0

    return {
        "total_sessions": total_sessions,
        "total_minutes": round(seconds / 60),
    }


async def insert_input_snapshot(
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
        INSERT INTO input_set_snapshots (
          user_id, set_id, total_questions, answered_count, correct_count,
          avg_score, total_time_ms, mode_breakdown, wrong_question_ids,
          focus_stats, trigger_reason, focus_run_id
        ) VALUES (
          $1, $2::uuid, $3, $4, $5,
          $6, $7, $8::jsonb, $9::jsonb,
          $10::jsonb, $11, $12::uuid
        )
        RETURNING id::text
        """,
        user_id,
        set_id,
        data.get("total_questions", 0),
        data.get("answered_count", 0),
        data.get("correct_count", 0),
        data.get("avg_score"),
        data.get("total_time_ms", 0),
        json.dumps(data.get("mode_breakdown", {})),
        json.dumps(data.get("wrong_question_ids", [])),
        json.dumps(data.get("focus_stats", {})),
        trigger_reason,
        focus_run_id,
    )
    return str(row["id"])


async def list_input_snapshots(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    set_id: str,
    limit: int = 20,
    offset: int = 0,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id::text, user_id, set_id::text, total_questions, answered_count,
               correct_count, avg_score, total_time_ms, mode_breakdown,
               wrong_question_ids, focus_stats, trigger_reason, focus_run_id::text, created_at
        FROM input_set_snapshots
        WHERE user_id = $1 AND set_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4
        """,
        user_id,
        set_id,
        limit,
        offset,
    )


async def insert_input_user_answer(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    question_id: str,
    set_id: str,
    user_input: str,
    is_correct: bool | None,
    score: float | None,
    time_spent_ms: int | None,
) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO input_user_answers (user_id, question_id, set_id, user_input, is_correct, score, time_spent_ms)
        VALUES ($1, $2, $3::uuid, $4, $5, $6, $7)
        RETURNING id::text
        """,
        user_id,
        question_id,
        set_id,
        user_input,
        is_correct,
        score,
        time_spent_ms,
    )
    return str(row["id"])


async def get_input_set_id_by_question(conn: asyncpg.Connection, question_id: str) -> str | None:
    row = await conn.fetchrow(
        """
        SELECT a.set_id::text AS set_id
        FROM input_questions q
        JOIN input_articles a ON a.id = q.article_pk
        WHERE q.question_id = $1
        """,
        question_id,
    )
    return row["set_id"] if row else None
