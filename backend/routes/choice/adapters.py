"""Adapter: read from existing content_banks + erc_sets and emit unified Choice DTOs."""
from __future__ import annotations

import json
import re
from typing import Any

import asyncpg

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


async def get_choice_filters(conn: asyncpg.Connection, *, bank_id: str) -> ChoiceFiltersOut:
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
    total_items = len(items)
    total_questions = 0

    for item in items:
        body = _json(item["body"])
        title = _str(item["title"])
        year = _extract_year_from_title_or_body(title, body)
        if year:
            years.add(year)
        subject = str(body.get("subject") or "").strip()
        if subject:
            subjects.add(subject)
        for t in _extract_tags_from_body(body):
            tags.add(t)

    q_count = await conn.fetchval(
        """
        SELECT COUNT(*)::int FROM content_questions cq
        JOIN content_items ci ON ci.id = cq.item_id
        WHERE ci.bank_id = $1::uuid
        """,
        bank_id,
    )
    total_questions = q_count or 0

    return ChoiceFiltersOut(
        years=sorted(years),
        subjects=sorted(subjects),
        tags=sorted(tags),
        total_items=total_items,
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


async def get_erc_choice_filters(conn: asyncpg.Connection, *, bank_id: str) -> ChoiceFiltersOut:
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
    total_items = len(rows)
    total_questions = 0

    for row in rows:
        y = _int(row["year"])
        if y:
            years.add(y)
        exam = _str(row["exam"])
        if exam:
            subjects.add(exam)

    q_count = await conn.fetchval(
        """
        SELECT COUNT(*)::int
        FROM erc_questions q
        JOIN erc_articles a ON a.id = q.article_pk
        WHERE a.set_id = $1::uuid
        """,
        bank_id,
    )
    total_questions = q_count or 0

    return ChoiceFiltersOut(
        years=sorted(years),
        subjects=sorted(subjects),
        tags=[],
        total_items=total_items,
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
            SELECT id::text AS question_pk, question_id, question_no, stem, options_json, answer
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
            questions.append(ChoiceQuestionOut(
                id=str(q["question_id"]),
                question_no=_int(q["question_no"]),
                stem_blocks=stem_blocks,
                options=options,
                answer=_str(q["answer"]),
                tags=[article_exam] if article_exam else [],
                sort_order=_int(q["question_no"]),
            ))

        result.append(ChoiceItemOut(
            id=str(article["article_id"]),
            bank_id=bank_id,
            title=_str(article["title"]) or f"Text {article['text_no']}",
            material_blocks=material_blocks,
            group_type="passage",
            subject_area=article_exam or None,
            tags=[article_exam] if article_exam else [],
            sort_order=_int(article["sort_order"]),
            question_count=len(questions),
            questions=questions,
        ))

    return result[offset: offset + limit]
