"""Adapter: read from existing content_banks + erc_sets and emit unified Choice DTOs."""
from __future__ import annotations

import json
import re
from typing import Any
from uuid import UUID

import asyncpg

from routes.erc.importer import ERCArticleSeed, ERCParagraphSeed, ERCQuestionSeed
from routes.erc.repository import refresh_set_counts, upsert_article_seed, upsert_set

from .schemas import (
    ChoiceBankOut,
    ChoiceFiltersOut,
    ChoiceItemOut,
    ChoiceQuestionOut,
    ContentBlock,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _str(val: Any, default: str = "") -> str:
    if val is None:
        return default
    return str(val).strip()


def _int(val: Any, default: int = 0) -> int:
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _json(val: Any) -> dict | list:
    if val is None:
        return {}
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return {}
    return {}


def _text_to_paragraph_blocks(text: str) -> list[ContentBlock]:
    if not text:
        return []
    chunks = [c.strip() for c in re.split(r"\n\s*\n", text) if c.strip()]
    if not chunks:
        chunks = [text]
    return [ContentBlock(type="paragraph", text=c) for c in chunks]


def _detect_table_block(text: str) -> ContentBlock | None:
    if "<table" in text.lower():
        return ContentBlock(type="html", text=text)
    return None


def _parse_options(raw: Any) -> list[dict[str, str]]:
    if isinstance(raw, str):
        return _parse_options(_json(raw))
    if isinstance(raw, dict):
        return [{"key": k, "text": str(v)} for k, v in sorted(raw.items())]
    if isinstance(raw, list):
        result = []
        for item in raw:
            if isinstance(item, dict):
                result.append({"key": str(item.get("key", "")), "text": str(item.get("text", ""))})
            elif isinstance(item, str):
                result.append({"key": str(len(result) + 1), "text": item})
        return result
    return []


def _extract_tags_from_body(body: dict) -> list[str]:
    tags: list[str] = []
    raw_tags = body.get("tags")
    if isinstance(raw_tags, list):
        tags.extend(str(t) for t in raw_tags if t)
    examination = str(body.get("examination") or "").strip()
    if examination:
        tags.append(examination)
    subject = str(body.get("subject") or "").strip()
    if subject:
        tags.append(subject)
    return tags


def _extract_year_from_title_or_body(title: str, body: dict) -> int:
    candidates = [title, str(body.get("examination") or "")]
    tags = body.get("tags")
    if isinstance(tags, list):
        candidates.extend(str(t) for t in tags)
    match = re.search(r"(?:19|20)\d{2}", " ".join(candidates))
    return int(match.group(0)) if match else 0


# ---------------------------------------------------------------------------
# Bank adapters
# ---------------------------------------------------------------------------

async def list_choice_banks(conn: asyncpg.Connection) -> list[ChoiceBankOut]:
    rows = await conn.fetch(
        """
        SELECT
          b.id::text AS id,
          b.name,
          b.fw_type AS source,
          b.item_type,
          (SELECT COUNT(*) FROM content_items WHERE bank_id = b.id)::int AS item_count,
          (SELECT COUNT(*) FROM content_questions cq
           JOIN content_items ci ON ci.id = cq.item_id
           WHERE ci.bank_id = b.id)::int AS question_count
        FROM content_banks b
        WHERE b.item_type = 'choice' AND b.is_published = TRUE
        ORDER BY b.name
        """
    )
    return [ChoiceBankOut(**dict(r)) for r in rows]


async def get_choice_filters(
    conn: asyncpg.Connection,
    *,
    bank_id: str,
    year: int | None = None,
    subject: str | None = None,
    tag: str | None = None,
) -> ChoiceFiltersOut:
    items = await conn.fetch(
        """
        SELECT ci.id, ci.title, ci.body
        FROM content_items ci
        WHERE ci.bank_id = $1::uuid
        ORDER BY ci.sort_order
        """,
        bank_id,
    )
    years: set[int] = set()
    subjects: set[str] = set()
    tags: set[str] = set()
    filtered_item_ids: list[str] = []

    for item in items:
        body = _json(item["body"])
        title = _str(item["title"])
        item_year = _extract_year_from_title_or_body(title, body)
        if item_year:
            years.add(item_year)
        item_subject = str(body.get("subject") or "").strip()
        if item_subject:
            subjects.add(item_subject)
        item_tags = _extract_tags_from_body(body)
        for t in item_tags:
            tags.add(t)
        if year and item_year != year:
            continue
        if subject and item_subject != subject:
            continue
        if tag and tag not in item_tags:
            continue
        filtered_item_ids.append(str(item["id"]))

    if filtered_item_ids:
        q_count = await conn.fetchval(
            "SELECT COUNT(*)::int FROM content_questions WHERE item_id = ANY($1::uuid[])",
            filtered_item_ids,
        )
        total_questions = q_count or 0
    else:
        total_questions = 0

    return ChoiceFiltersOut(
        years=sorted(years),
        subjects=sorted(subjects),
        tags=sorted(tags),
        total_items=len(filtered_item_ids),
        total_questions=total_questions,
    )


async def list_choice_items(
    conn: asyncpg.Connection,
    *,
    bank_id: str,
    year: int | None = None,
    subject: str | None = None,
    tag: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ChoiceItemOut]:
    items = await conn.fetch(
        """
        SELECT ci.id::text AS id, ci.title, ci.body, ci.sort_order
        FROM content_items ci
        WHERE ci.bank_id = $1::uuid
        ORDER BY ci.sort_order
        """,
        bank_id,
    )
    result: list[ChoiceItemOut] = []
    for item in items:
        body = _json(item["body"])
        title = _str(item["title"])
        item_year = _extract_year_from_title_or_body(title, body)
        item_subject = str(body.get("subject") or "").strip()
        item_tags = _extract_tags_from_body(body)

        if year and item_year != year:
            continue
        if subject and item_subject != subject:
            continue
        if tag and tag not in item_tags:
            continue

        passage = str(body.get("passage") or "").strip()
        material_blocks = _text_to_paragraph_blocks(passage) if passage else []

        q_rows = await conn.fetch(
            """
            SELECT id::text AS id, sort_order, question_text, options, correct_answer, analysis, image_url
            FROM content_questions
            WHERE item_id = $1::uuid
            ORDER BY sort_order
            """,
            item["id"],
        )
        questions: list[ChoiceQuestionOut] = []
        for q in q_rows:
            stem = _str(q["question_text"])
            table_block = _detect_table_block(stem)
            stem_blocks = [table_block] if table_block else [ContentBlock(type="paragraph", text=stem)]
            explanation = _str(q["analysis"])
            explanation_blocks = [ContentBlock(type="paragraph", text=explanation)] if explanation else []
            image_url = q.get("image_url")
            if image_url:
                stem_blocks.append(ContentBlock(type="image", src=str(image_url), alt="题目图片"))
            questions.append(ChoiceQuestionOut(
                id=str(q["id"]),
                question_no=_int(q["sort_order"]) + 1,
                stem_blocks=stem_blocks,
                options=_parse_options(q["options"]),
                answer=_str(q["correct_answer"]),
                explanation_blocks=explanation_blocks,
                tags=item_tags,
                sort_order=_int(q["sort_order"]),
            ))

        group_type = "passage" if passage and len(questions) > 1 else "single"
        result.append(ChoiceItemOut(
            id=str(item["id"]),
            bank_id=bank_id,
            title=title,
            material_blocks=material_blocks,
            group_type=group_type,
            subject_area=item_subject or None,
            tags=item_tags,
            sort_order=_int(item["sort_order"]),
            question_count=len(questions),
            questions=questions,
        ))

    return result[offset: offset + limit]


# ---------------------------------------------------------------------------
# ERC adapters — read from erc_sets and convert to unified DTOs
# ---------------------------------------------------------------------------

async def list_erc_as_choice_banks(conn: asyncpg.Connection) -> list[ChoiceBankOut]:
    rows = await conn.fetch(
        """
        SELECT
          s.id::text AS id,
          s.name,
          'erc' AS source,
          'passage' AS item_type,
          s.article_count AS item_count,
          s.question_count
        FROM erc_sets s
        WHERE s.is_published = TRUE
        ORDER BY s.name
        """
    )
    return [ChoiceBankOut(**dict(r)) for r in rows]


async def get_erc_choice_filters(
    conn: asyncpg.Connection,
    *,
    bank_id: str,
    year: int | None = None,
    subject: str | None = None,
) -> ChoiceFiltersOut:
    rows = await conn.fetch(
        """
        SELECT a.year, a.exam, a.title, a.id
        FROM erc_articles a
        WHERE a.set_id = $1::uuid
        """,
        bank_id,
    )
    years: set[int] = set()
    subjects: set[str] = set()
    filtered_article_ids: list[str] = []

    for row in rows:
        y = _int(row["year"])
        if y:
            years.add(y)
        exam = _str(row["exam"])
        if exam:
            subjects.add(exam)
        if year and y != year:
            continue
        if subject and exam != subject:
            continue
        filtered_article_ids.append(str(row["id"]))

    if filtered_article_ids:
        q_count = await conn.fetchval(
            "SELECT COUNT(*)::int FROM erc_questions WHERE article_pk = ANY($1::uuid[])",
            filtered_article_ids,
        )
        total_questions = q_count or 0
    else:
        total_questions = 0

    return ChoiceFiltersOut(
        years=sorted(years),
        subjects=sorted(subjects),
        tags=[],
        total_items=len(filtered_article_ids),
        total_questions=total_questions,
    )


async def list_erc_as_choice_items(
    conn: asyncpg.Connection,
    *,
    bank_id: str,
    year: int | None = None,
    subject: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ChoiceItemOut]:
    articles = await conn.fetch(
        """
        SELECT a.id::text AS article_pk, a.article_id, a.year, a.text_no, a.title, a.exam, a.sort_order
        FROM erc_articles a
        WHERE a.set_id = $1::uuid
        ORDER BY a.year DESC, a.text_no ASC
        """,
        bank_id,
    )
    result: list[ChoiceItemOut] = []
    for article in articles:
        article_year = _int(article["year"])
        article_exam = _str(article["exam"])

        if year and article_year != year:
            continue
        if subject and article_exam != subject:
            continue

        paragraphs = await conn.fetch(
            """
            SELECT paragraph_no, text
            FROM erc_paragraphs
            WHERE article_pk = $1::uuid
            ORDER BY paragraph_no
            """,
            article["article_pk"],
        )
        material_blocks = [
            ContentBlock(type="paragraph", text=p["text"])
            for p in paragraphs
        ]

        q_rows = await conn.fetch(
            """
            SELECT id::text AS question_pk, question_id, question_no, stem, options_json, answer, explanation
            FROM erc_questions
            WHERE article_pk = $1::uuid
            ORDER BY sort_order
            """,
            article["article_pk"],
        )
        questions: list[ChoiceQuestionOut] = []
        for q in q_rows:
            options = _parse_options(q["options_json"])
            stem = _str(q["stem"])
            table_block = _detect_table_block(stem)
            stem_blocks = [table_block] if table_block else [ContentBlock(type="paragraph", text=stem)]
            explanation = _str(q.get("explanation", ""))
            explanation_blocks = [ContentBlock(type="paragraph", text=explanation)] if explanation else []
            questions.append(ChoiceQuestionOut(
                id=str(q["question_id"]),
                question_no=_int(q["question_no"]),
                stem_blocks=stem_blocks,
                options=options,
                answer=_str(q["answer"]),
                explanation_blocks=explanation_blocks,
                tags=[article_exam] if article_exam else [],
                sort_order=_int(q["question_no"]),
            ))

        result.append(ChoiceItemOut(
            id=str(article["article_id"]),
            bank_id=bank_id,
            title=_str(article["title"]) or f"Text {article['text_no']}",
            material_blocks=material_blocks,
            group_type="passage" if len(questions) > 1 else "single",
            subject_area=article_exam or None,
            tags=[article_exam] if article_exam else [],
            sort_order=_int(article["sort_order"]),
            question_count=len(questions),
            questions=questions,
        ))

    return result[offset: offset + limit]


# ---------------------------------------------------------------------------
# ERC set resolver — maps content_banks UUID → erc_sets UUID
# ---------------------------------------------------------------------------

def _row_value(row: Any, key: str, default: Any = None) -> Any:
    if row is None:
        return default
    if hasattr(row, "get"):
        return row.get(key, default)
    try:
        return row[key]
    except (KeyError, IndexError, TypeError):
        return default


def _content_bank_article_seed(
    bank_id: UUID,
    bank_name: str,
    item: Any,
    questions: list[Any],
) -> ERCArticleSeed | None:
    body = _json(_row_value(item, "body"))
    title = _str(_row_value(item, "title"))
    passage = str(body.get("passage") or "").strip()
    exam = str(body.get("examination") or body.get("subject") or bank_name or "").strip()
    year = _extract_year_from_title_or_body(title, body)
    sort_order = _int(_row_value(item, "sort_order"))
    paragraphs = [
        ERCParagraphSeed(paragraph_no=i + 1, text=chunk)
        for i, chunk in enumerate(re.split(r"\n\s*\n", passage) if passage else [])
        if chunk.strip()
    ]
    if not paragraphs and passage:
        paragraphs = [ERCParagraphSeed(paragraph_no=1, text=passage)]
    erc_questions = []
    for q in questions:
        options = _parse_options(_row_value(q, "options"))
        erc_questions.append(ERCQuestionSeed(
            question_id=f"cb-{bank_id}-{sort_order}-{_int(_row_value(q, 'sort_order'))}",
            question_no=_int(_row_value(q, "sort_order")) + 1,
            stem=_str(_row_value(q, "question_text")),
            options={opt["key"]: opt["text"] for opt in options},
            answer=_str(_row_value(q, "correct_answer")),
            evidence={"paragraphs": [], "text": ""},
            explanation=_str(_row_value(q, "analysis")),
            question_type="practice",
            sort_order=_int(_row_value(q, "sort_order")) + 1,
        ))
    article_id = f"cb-{bank_id}-{sort_order}"
    return ERCArticleSeed(
        article_id=article_id,
        exam=exam,
        year=year,
        text_no=sort_order,
        title=title or f"Text {sort_order}",
        sort_order=sort_order,
        paragraphs=paragraphs,
        questions=erc_questions,
    )


async def sync_content_bank_to_erc_set(conn: Any, *, bank_id: UUID, bank_name: str) -> str | None:
    """Sync content_banks items into erc_sets/erc_articles/erc_questions. Returns erc_set_id."""
    item_rows = await conn.fetch(
        """
        SELECT id::text AS id, title, body, sort_order
        FROM content_items
        WHERE bank_id = $1
        ORDER BY sort_order ASC, created_at ASC
        """,
        bank_id,
    )
    if not item_rows:
        return None
    question_rows = await conn.fetch(
        """
        SELECT id::text AS id, item_id::text AS item_id, sort_order, question_text, options, correct_answer, analysis
        FROM content_questions
        WHERE item_id = ANY($1::uuid[])
        ORDER BY sort_order ASC, created_at ASC
        """,
        [UUID(str(_row_value(row, "id"))) for row in item_rows],
    )
    questions_by_item: dict[str, list[Any]] = {}
    for question in question_rows:
        questions_by_item.setdefault(str(_row_value(question, "item_id")), []).append(question)
    article_seeds = [
        seed
        for item in item_rows
        if (seed := _content_bank_article_seed(bank_id, bank_name, item, questions_by_item.get(str(_row_value(item, "id")), []))) is not None
    ]
    if not article_seeds:
        return None
    set_id = await upsert_set(
        conn,
        key=f"content-bank-{bank_id}",
        name=bank_name,
        description="由内容银行同步",
        exam=bank_name,
        source_version="content-bank-sync",
    )
    for seed in article_seeds:
        await upsert_article_seed(conn, set_id=set_id, seed=seed)
    await refresh_set_counts(conn, set_id=set_id)
    return set_id


async def resolve_erc_set_id(conn: Any, bank_id: str) -> str | None:
    """Find the erc_sets UUID for a bank_id (content_bank or erc_set UUID). Returns erc_set_id or None."""
    try:
        bank_uuid = UUID(bank_id)
    except ValueError:
        return None
    erc_row = await conn.fetchrow("SELECT id FROM erc_sets WHERE id = $1", bank_uuid)
    if erc_row is not None:
        return str(bank_uuid)
    bank_row = await conn.fetchrow("SELECT name FROM content_banks WHERE id = $1", bank_uuid)
    if bank_row is not None:
        mapped_row = await conn.fetchrow(
            "SELECT id FROM erc_sets WHERE key = $1 OR name = $2 ORDER BY CASE WHEN key = $1 THEN 0 ELSE 1 END LIMIT 1",
            f"content-bank-{bank_uuid}",
            str(bank_row["name"]),
        )
        if mapped_row is not None:
            return str(mapped_row["id"])
        return await sync_content_bank_to_erc_set(conn, bank_id=bank_uuid, bank_name=str(bank_row["name"]))
    return None


async def ensure_erc_set_synced(conn: Any, bank_id: str) -> str:
    """Resolve bank_id to erc_set_id, raising HTTPException if not found."""
    from fastapi import HTTPException

    result = await resolve_erc_set_id(conn, bank_id)
    if result is None:
        raise HTTPException(status_code=422, detail="题库不存在")
    return result
