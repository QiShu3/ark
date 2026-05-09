from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import asyncpg
from fastapi import HTTPException

from .repository import (
    get_article_row,
    get_last_article_attempt_at,
    get_next_due_at,
    get_overview_counts,
    get_question_row_by_public_id,
    get_recommended_article,
    get_user_question_card,
    get_user_settings,
    insert_article_attempt,
    insert_review_log,
    list_article_rows,
    list_due_card_rows,
    list_mistake_rows,
    list_paragraph_rows,
    list_question_rows,
    list_recent_review_article_rows,
    list_set_rows,
    upsert_mistake,
    upsert_user_question_card,
)


def rating_for_answer(*, is_correct: bool) -> str:
    return "good" if is_correct else "again"


def should_skip_same_article(
    article_pk: str,
    *,
    recent_logs: list[dict],
    now: datetime,
    cooldown_hours: int,
) -> bool:
    threshold = now - timedelta(hours=cooldown_hours)
    return any(str(item["article_pk"]) == article_pk and item["created_at"] >= threshold for item in recent_logs)


def _as_dict(row: asyncpg.Record | dict) -> dict:
    return dict(row)


def _json_dict(raw_value: object) -> dict:
    if raw_value is None:
        return {}
    if isinstance(raw_value, str):
        return json.loads(raw_value)
    return dict(raw_value)


def _serialize_fsrs_card(card: object) -> dict:
    if hasattr(card, "to_dict"):
        return dict(card.to_dict())
    if hasattr(card, "to_json"):
        raw_payload = card.to_json()
        if isinstance(raw_payload, str):
            return json.loads(raw_payload)
        return dict(raw_payload)
    if hasattr(card, "model_dump"):
        return dict(card.model_dump(mode="json"))

    payload: dict[str, object] = {}
    for field in ("due", "stability", "difficulty", "elapsed_days", "scheduled_days", "reps", "lapses", "state", "last_review"):
        value = getattr(card, field, None)
        if value is not None:
            payload[field] = value
    return payload


def _deserialize_fsrs_card(raw_payload: object) -> object | None:
    if raw_payload is None:
        return None
    payload = json.loads(raw_payload) if isinstance(raw_payload, str) else dict(raw_payload)

    from fsrs import Card

    if hasattr(Card, "from_dict"):
        return Card.from_dict(payload)
    if hasattr(Card, "from_json"):
        return Card.from_json(payload)
    return Card(**payload)


def _schedule_review(card_row: dict | None, *, rating: str, now: datetime) -> dict:
    from fsrs import Card, Rating, Scheduler

    rating_name = {"again": "Again", "hard": "Hard", "good": "Good", "easy": "Easy"}[rating]
    current_card = _deserialize_fsrs_card(card_row.get("fsrs_card_json") if card_row else None) or Card()
    reviewed_card, _review_log = Scheduler().review_card(
        current_card,
        getattr(Rating, rating_name),
        review_datetime=now,
    )
    next_review_at = getattr(reviewed_card, "due", now)

    wrong_count = int(card_row.get("wrong_count", 0)) if card_row else 0
    right_count = int(card_row.get("right_count", 0)) if card_row else 0
    lapse_count = int(card_row.get("lapse_count", 0)) if card_row else 0
    if rating == "again":
        wrong_count += 1
        lapse_count += 1
    else:
        right_count += 1

    return {
        "due_at": next_review_at,
        "fsrs_card_json": _serialize_fsrs_card(reviewed_card),
        "wrong_count": wrong_count,
        "right_count": right_count,
        "lapse_count": lapse_count,
    }


def _question_payload(row: dict, *, include_answer: bool) -> dict:
    payload = {
        "question_id": str(row["question_id"]),
        "question_no": int(row["question_no"]),
        "stem": str(row["stem"]),
        "options": _json_dict(row["options_json"]),
    }
    if include_answer:
        payload["answer"] = str(row["answer"])
    return payload


async def list_sets(pool: asyncpg.Pool) -> list[dict]:
    async with pool.acquire() as conn:
        return [_as_dict(row) for row in await list_set_rows(conn)]


async def get_overview(pool: asyncpg.Pool, *, user_id: int) -> dict:
    async with pool.acquire() as conn:
        counts = await get_overview_counts(conn, user_id=user_id)
        recommended = await get_recommended_article(conn, user_id=user_id)
    practiced_question_count = int(counts.get("practiced_question_count") or 0)
    correct_log_count = int(counts.get("correct_log_count") or 0)
    return {
        "due_review_count": int(counts.get("due_review_count") or 0),
        "practiced_article_count": int(counts.get("practiced_article_count") or 0),
        "practiced_question_count": practiced_question_count,
        "accuracy": correct_log_count / practiced_question_count if practiced_question_count else 0.0,
        "mistake_count": int(counts.get("mistake_count") or 0),
        "recommended_article": dict(recommended) if recommended is not None else None,
    }


async def list_articles(pool: asyncpg.Pool, *, user_id: int, set_id: str | None = None) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await list_article_rows(conn, user_id=user_id, set_id=set_id)
    items: list[dict] = []
    for raw_row in rows:
        row = dict(raw_row)
        if bool(row.get("has_due_review")):
            status = "has_due_review"
        elif row.get("last_attempt_at") is not None:
            status = "practiced"
        else:
            status = "unstarted"
        items.append(
            {
                "article_id": row["article_id"],
                "set_id": row["set_id"],
                "year": row["year"],
                "text_no": row["text_no"],
                "title": row["title"],
                "status": status,
                "question_count": row["question_count"],
                "mistake_count": row["mistake_count"],
                "last_attempt_at": row["last_attempt_at"],
            }
        )
    return items


async def get_article_detail(pool: asyncpg.Pool, *, user_id: int, article_id: str) -> dict:
    async with pool.acquire() as conn:
        article = await get_article_row(conn, article_id=article_id)
        if article is None:
            raise HTTPException(status_code=404, detail="阅读文章不存在")
        article_dict = dict(article)
        paragraphs = await list_paragraph_rows(conn, article_pk=article_dict["article_pk"])
        questions = await list_question_rows(conn, article_pk=article_dict["article_pk"])
        last_attempt_at = await get_last_article_attempt_at(
            conn,
            user_id=user_id,
            article_pk=article_dict["article_pk"],
        )

    return {
        "article_id": article_dict["article_id"],
        "set_id": article_dict["set_id"],
        "exam": article_dict["exam"],
        "year": article_dict["year"],
        "text_no": article_dict["text_no"],
        "title": article_dict["title"],
        "paragraphs": [dict(row) for row in paragraphs],
        "questions": [_question_payload(dict(row), include_answer=False) for row in questions],
        "last_attempt_at": last_attempt_at,
    }


async def submit_article_practice(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    article_id: str,
    answers: list[dict[str, Any]],
    time_spent_ms: int | None,
    started_at: Any,
) -> dict:
    answer_map = {str(item["question_id"]): str(item["chosen_option"]) for item in answers}
    answer_time_map = {str(item["question_id"]): item.get("time_spent_ms") for item in answers}
    now = datetime.now(UTC)

    async with pool.acquire() as conn:
        async with conn.transaction():
            article = await get_article_row(conn, article_id=article_id)
            if article is None:
                raise HTTPException(status_code=404, detail="阅读文章不存在")
            article_dict = dict(article)
            question_rows = [dict(row) for row in await list_question_rows(conn, article_pk=article_dict["article_pk"])]
            missing_ids = [row["question_id"] for row in question_rows if row["question_id"] not in answer_map]
            if missing_ids:
                raise HTTPException(status_code=400, detail=f"缺少题目答案: {', '.join(missing_ids)}")

            correct_count = sum(1 for row in question_rows if answer_map[row["question_id"]] == row["answer"])
            attempt_id = await insert_article_attempt(
                conn,
                user_id=user_id,
                article_pk=article_dict["article_pk"],
                correct_count=correct_count,
                question_count=len(question_rows),
                time_spent_ms=time_spent_ms,
                started_at=started_at,
            )

            items: list[dict] = []
            for row in question_rows:
                chosen_option = answer_map[row["question_id"]]
                is_correct = chosen_option == row["answer"]
                rating = rating_for_answer(is_correct=is_correct)
                card_row = await get_user_question_card(conn, user_id=user_id, question_pk=row["question_pk"])
                scheduled = _schedule_review(dict(card_row) if card_row else None, rating=rating, now=now)
                await upsert_user_question_card(
                    conn,
                    user_id=user_id,
                    question_pk=row["question_pk"],
                    due_at=scheduled["due_at"],
                    fsrs_card_json=scheduled["fsrs_card_json"],
                    wrong_count=scheduled["wrong_count"],
                    right_count=scheduled["right_count"],
                    lapse_count=scheduled["lapse_count"],
                    last_answer_correct=is_correct,
                    last_chosen_option=chosen_option,
                )
                await insert_review_log(
                    conn,
                    user_id=user_id,
                    article_pk=article_dict["article_pk"],
                    question_pk=row["question_pk"],
                    attempt_id=attempt_id,
                    mode="practice",
                    chosen_option=chosen_option,
                    correct_option=row["answer"],
                    is_correct=is_correct,
                    rating=rating,
                    time_spent_ms=answer_time_map.get(row["question_id"]),
                )
                await upsert_mistake(
                    conn,
                    user_id=user_id,
                    article_pk=article_dict["article_pk"],
                    question_pk=row["question_pk"],
                    is_active=not is_correct,
                )
                items.append(
                    {
                        "question_id": row["question_id"],
                        "question_no": row["question_no"],
                        "chosen_option": chosen_option,
                        "correct_option": row["answer"],
                        "is_correct": is_correct,
                        "rating": rating,
                        "next_review_at": scheduled["due_at"],
                        "entered_mistakes": not is_correct,
                    }
                )

    return {
        "attempt_id": attempt_id,
        "article_id": article_id,
        "correct_count": correct_count,
        "question_count": len(question_rows),
        "items": items,
    }


async def get_next_review(pool: asyncpg.Pool, *, user_id: int) -> dict:
    now = datetime.now(UTC)
    async with pool.acquire() as conn:
        settings = await get_user_settings(conn, user_id=user_id)
        cooldown_hours = int(settings["same_article_cooldown_hours"])
        due_rows = [dict(row) for row in await list_due_card_rows(conn, user_id=user_id, limit=50)]
        recent_logs = [
            dict(row)
            for row in await list_recent_review_article_rows(
                conn,
                user_id=user_id,
                since=now - timedelta(hours=cooldown_hours),
            )
        ]
        chosen = next(
            (
                row
                for row in due_rows
                if not should_skip_same_article(
                    str(row["article_pk"]),
                    recent_logs=recent_logs,
                    now=now,
                    cooldown_hours=cooldown_hours,
                )
            ),
            due_rows[0] if due_rows else None,
        )
        if chosen is None:
            return {"has_item": False, "next_due_at": await get_next_due_at(conn, user_id=user_id)}
        paragraphs = await list_paragraph_rows(conn, article_pk=chosen["article_pk"])

    return {
        "has_item": True,
        "next_due_at": chosen["due_at"],
        "article": {
            "article_id": chosen["article_id"],
            "year": chosen["year"],
            "text_no": chosen["text_no"],
            "title": chosen["title"],
        },
        "paragraphs": [dict(row) for row in paragraphs],
        "question": _question_payload(chosen, include_answer=False),
    }


async def submit_review(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    question_id: str,
    chosen_option: str,
    time_spent_ms: int | None,
) -> dict:
    now = datetime.now(UTC)
    async with pool.acquire() as conn:
        async with conn.transaction():
            question = await get_question_row_by_public_id(conn, question_id=question_id)
            if question is None:
                raise HTTPException(status_code=404, detail="阅读题目不存在")
            row = dict(question)
            is_correct = chosen_option == row["answer"]
            rating = rating_for_answer(is_correct=is_correct)
            card_row = await get_user_question_card(conn, user_id=user_id, question_pk=row["question_pk"])
            scheduled = _schedule_review(dict(card_row) if card_row else None, rating=rating, now=now)
            await upsert_user_question_card(
                conn,
                user_id=user_id,
                question_pk=row["question_pk"],
                due_at=scheduled["due_at"],
                fsrs_card_json=scheduled["fsrs_card_json"],
                wrong_count=scheduled["wrong_count"],
                right_count=scheduled["right_count"],
                lapse_count=scheduled["lapse_count"],
                last_answer_correct=is_correct,
                last_chosen_option=chosen_option,
            )
            await insert_review_log(
                conn,
                user_id=user_id,
                article_pk=row["article_pk"],
                question_pk=row["question_pk"],
                attempt_id=None,
                mode="review",
                chosen_option=chosen_option,
                correct_option=row["answer"],
                is_correct=is_correct,
                rating=rating,
                time_spent_ms=time_spent_ms,
            )
            await upsert_mistake(
                conn,
                user_id=user_id,
                article_pk=row["article_pk"],
                question_pk=row["question_pk"],
                is_active=not is_correct,
            )
    return {
        "question_id": question_id,
        "chosen_option": chosen_option,
        "correct_option": row["answer"],
        "is_correct": is_correct,
        "rating": rating,
        "next_review_at": scheduled["due_at"],
    }


async def list_mistakes(pool: asyncpg.Pool, *, user_id: int) -> list[dict]:
    async with pool.acquire() as conn:
        return [dict(row) for row in await list_mistake_rows(conn, user_id=user_id)]
