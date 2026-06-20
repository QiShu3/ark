"""Business logic for 模板子应用."""
import json

import asyncpg
from fsrs import Card, Rating, Scheduler

_scheduler = Scheduler()


def _fsrs_rating(label: str | None) -> Rating:
    if label == "again":
        return Rating.Again
    if label == "hard":
        return Rating.Hard
    if label == "good":
        return Rating.Good
    if label == "easy":
        return Rating.Easy
    return Rating.Good


async def list_sets(pool: asyncpg.Pool) -> list[dict]:
    from .repository import list_set_rows
    async with pool.acquire() as conn:
        return [dict(r) for r in await list_set_rows(conn)]


async def get_overview(pool: asyncpg.Pool, *, user_id: int, set_id: str | None = None) -> dict:
    from .repository import get_overview_counts
    async with pool.acquire() as conn:
        counts = await get_overview_counts(conn, user_id=user_id, set_id=set_id)
    practiced = int(counts.get("practiced_count") or 0)
    correct = int(counts.get("correct_count") or 0)
    return {
        "practiced_count": practiced,
        "correct_count": correct,
        "accuracy": correct / practiced if practiced else 0.0,
        "due_count": int(counts.get("due_count") or 0),
        "mistake_count": int(counts.get("mistake_count") or 0),
    }


async def get_next_review(pool: asyncpg.Pool, *, user_id: int, set_id: str | None = None) -> dict:
    from .repository import get_next_due_at, list_due_card_rows
    async with pool.acquire() as conn:
        rows = await list_due_card_rows(conn, user_id=user_id, limit=1, set_id=set_id)
    if not rows:
        async with pool.acquire() as conn:
            next_due = await get_next_due_at(conn, user_id=user_id)
        return {"has_item": False, "next_due_at": next_due}
    row = dict(rows[0])
    options = json.loads(row.get("options_json") or "[]")
    meta = json.loads(row.get("meta_json") or "{}")
    return {
        "has_item": True,
        "next_due_at": row["due_at"],
        "question": {
            "question_id": row["question_id"],
            "stem": row["stem"],
            "options": options,
            "meta": meta,
        },
    }


async def submit_review(pool: asyncpg.Pool, *, user_id: int, question_id: str, chosen_option: str, rating: str | None = None) -> dict:
    from .repository import insert_review_log, upsert_mistake, upsert_question_card
    async with pool.acquire() as conn:
        q = await conn.fetchrow(
            "SELECT id, answer FROM test-template_questions WHERE question_id = $1", question_id,
        )
        if not q:
            raise ValueError(f"Question not found: {question_id}")

        question_pk = str(q["id"])
        correct_answer = q["answer"]
        is_correct = (chosen_option == correct_answer)

        # FSRS scheduling
        old_card = await conn.fetchrow(
            "SELECT fsrs_card_json FROM test-template_user_question_cards WHERE user_id = $1 AND question_pk = $2::uuid",
            user_id, question_pk,
        )
        old_fsrs = json.loads(old_card["fsrs_card_json"]) if old_card else {}
        card = Card.from_dict(old_fsrs) if old_fsrs else Card()
        fsrs_rating = _fsrs_rating(rating if is_correct else "again")
        new_card, _ = _scheduler.review_card(card, fsrs_rating)
        next_due = new_card.due

        await upsert_question_card(
            conn, user_id=user_id, question_pk=question_pk,
            is_correct=is_correct, chosen_option=chosen_option,
            fsrs_json=new_card.to_dict(), next_due=next_due,
        )
        await insert_review_log(conn, user_id=user_id, question_pk=question_pk, chosen_option=chosen_option, is_correct=is_correct, rating=rating)
        await upsert_mistake(conn, user_id=user_id, question_pk=question_pk, is_correct=is_correct)

    return {"is_correct": is_correct, "next_due_at": next_due}


async def list_mistakes(pool: asyncpg.Pool, *, user_id: int, set_id: str | None = None) -> list[dict]:
    from .repository import list_mistake_rows
    async with pool.acquire() as conn:
        return [dict(r) for r in await list_mistake_rows(conn, user_id=user_id, set_id=set_id)]
