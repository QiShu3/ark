from __future__ import annotations

import json

import asyncpg

# ---- input_sets ----

async def list_input_sets(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id::text AS id, name, question_count, exam
        FROM input_sets
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
