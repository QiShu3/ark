from __future__ import annotations

import json
import random
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import asyncpg
from fastapi import HTTPException

from routes.vocab.repository import (
    get_user_word_progress,
    list_word_phrases,
    list_word_sentences,
    list_word_translations,
    upsert_mistake_bucket,
    upsert_user_word_progress,
)
from routes.vocab.repository import (
    insert_review_log as insert_vocab_review_log,
)
from routes.vocab.service import _detail_payload as _vocab_detail_payload
from routes.vocab.service import _schedule_fsrs_review as _schedule_vocab_review

from .repository import (
    get_article_row,
    get_article_vocabulary_word_row,
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
    list_article_vocabulary_preheat_rows,
    list_article_word_state_rows,
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


def due_review_weight(row: dict, *, now: datetime) -> float:
    due_at = row.get("due_at")
    overdue_hours = 0.0
    if isinstance(due_at, datetime) and due_at < now:
        overdue_hours = min((now - due_at).total_seconds() / 3600, 72)
    lapse_count = max(int(row.get("lapse_count") or 0), 0)
    mistake_bonus = 4.0 if bool(row.get("is_mistake")) else 0.0
    return 1.0 + mistake_bonus + min(lapse_count, 6) * 1.5 + overdue_hours / 24


def choose_due_review_candidate(
    due_rows: list[dict],
    *,
    recent_logs: list[dict],
    now: datetime,
    cooldown_hours: int,
    random_value: Callable[[], float] = random.random,
) -> dict | None:
    if not due_rows:
        return None

    candidates = [
        row
        for row in due_rows
        if not should_skip_same_article(
            str(row["article_pk"]),
            recent_logs=recent_logs,
            now=now,
            cooldown_hours=cooldown_hours,
        )
    ]
    if not candidates:
        candidates = due_rows

    weighted_candidates = [(row, due_review_weight(row, now=now)) for row in candidates]
    total_weight = sum(weight for _row, weight in weighted_candidates)
    threshold = random_value() * total_weight
    running = 0.0
    for row, weight in weighted_candidates:
        running += weight
        if threshold <= running:
            return row
    return weighted_candidates[-1][0]


def make_practice_wrong_immediately_due(scheduled: dict, *, rating: str, now: datetime) -> dict:
    if rating != "again":
        return scheduled
    adjusted = dict(scheduled)
    card_json = dict(adjusted.get("fsrs_card_json") or {})
    card_json["due"] = now.isoformat()
    adjusted["due_at"] = now
    adjusted["fsrs_card_json"] = card_json
    return adjusted


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


def _vocabulary_summary(rows: list[dict], *, preview_limit: int = 12) -> dict:
    total = len(rows)
    mastered_count = sum(1 for row in rows if row["state"] == "mastered")
    learning_count = sum(1 for row in rows if row["state"] == "learning")
    unstarted_count = sum(1 for row in rows if row["state"] == "unstarted")
    unknown_count = sum(1 for row in rows if row["state"] == "unknown")
    unfamiliar_rows = [row for row in rows if row["state"] != "mastered"]
    return {
        "total_word_count": total,
        "mastered_count": mastered_count,
        "learning_count": learning_count,
        "unstarted_count": unstarted_count,
        "unknown_count": unknown_count,
        "unfamiliar_count": len(unfamiliar_rows),
        "mastery_rate": mastered_count / total if total else 0.0,
        "preview_words": unfamiliar_rows[:preview_limit],
    }


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


async def list_articles(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    set_id: str | None = None,
    exam: str | None = None,
) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await list_article_rows(conn, user_id=user_id, set_id=set_id, exam=exam)
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
        vocabulary_rows = [
            dict(row)
            for row in await list_article_word_state_rows(
                conn,
                user_id=user_id,
                article_pk=article_dict["article_pk"],
            )
        ]
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
        "vocabulary_summary": _vocabulary_summary(vocabulary_rows),
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
                scheduled = make_practice_wrong_immediately_due(scheduled, rating=rating, now=now)
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
        chosen = choose_due_review_candidate(
            due_rows,
            recent_logs=recent_logs,
            now=now,
            cooldown_hours=cooldown_hours,
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


async def get_vocabulary_preheat(pool: asyncpg.Pool, *, user_id: int, article_id: str, limit: int = 12) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await list_article_vocabulary_preheat_rows(
            conn,
            user_id=user_id,
            article_id=article_id,
            limit=limit,
        )
        items: list[dict] = []
        for row in rows:
            word_id = str(row["id"])
            translations = await list_word_translations(conn, word_id=word_id)
            phrases = await list_word_phrases(conn, word_id=word_id)
            sentences = await list_word_sentences(conn, word_id=word_id)
            payload = _vocab_detail_payload(row, translations=translations, phrases=phrases, sentences=sentences)
            payload["prompt_type"] = "en_to_zh"
            payload["review_mode"] = "erc_preheat"
            items.append(payload)
    return items


async def submit_vocabulary_preheat(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    article_id: str,
    deck_id: str,
    word_id: str,
    result: str,
    prompt_type: str,
    response_ms: int | None,
) -> dict:
    async with pool.acquire() as conn:
        word_row = await get_article_vocabulary_word_row(
            conn,
            article_id=article_id,
            deck_id=deck_id,
            word_id=word_id,
        )
        if word_row is None:
            raise HTTPException(status_code=404, detail="预热单词不存在")

        progress_row = await get_user_word_progress(conn, user_id=user_id, deck_id=deck_id, word_id=word_id)
        current_progress = dict(progress_row) if progress_row is not None else {}
        updated = _schedule_vocab_review(current_progress, result=result, now=datetime.now(UTC))
        await upsert_user_word_progress(
            conn,
            user_id=user_id,
            deck_id=deck_id,
            word_id=word_id,
            mastery_score=int(updated["mastery_score"]),
            correct_count=int(updated["correct_count"]),
            wrong_count=int(updated["wrong_count"]),
            lapse_count=int(updated["lapse_count"]),
            interval_days=int(updated["interval_days"]),
            next_review_at=updated["next_review_at"],
            fsrs_card_json=updated["card_json"],
            last_result=str(updated["result"]),
        )
        await insert_vocab_review_log(
            conn,
            user_id=user_id,
            deck_id=deck_id,
            word_id=word_id,
            review_mode="erc_preheat",
            prompt_type=prompt_type,
            result=str(updated["result"]),
            response_ms=response_ms,
        )
        await upsert_mistake_bucket(
            conn,
            user_id=user_id,
            deck_id=deck_id,
            word_id=word_id,
            is_active=str(updated["result"]) == "again",
        )
    return {
        "mastery_score": int(updated["mastery_score"]),
        "next_review_at": updated["next_review_at"],
        "wrong_count": int(updated["wrong_count"]),
        "correct_count": int(updated["correct_count"]),
        "interval_days": int(updated["interval_days"]),
        "result": str(updated["result"]),
        "should_repeat_today": str(updated["result"]) == "again",
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
