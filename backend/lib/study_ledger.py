from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import asyncpg

from lib.focus_work_types import CHOICE_KIND, FLASH_CARD_KIND, INPUT_KIND

BackflowRule = Literal["none", "wrong_to_end", "wrong_retry"]


async def record_answer(
    conn: asyncpg.Connection,
    *,
    kind: str,
    user_id: int,
    bank_id: str,
    question_pk: str,
    is_correct: bool,
    use_fsrs: bool = False,
    backflow_rule: BackflowRule = "none",
    time_spent_ms: int = 0,
    detail: dict[str, Any] | None = None,
) -> tuple[str | None, dict[str, Any]]:
    """Record an answer and update the study ledger.

    Returns (backflow_action, updated_state) where backflow_action is:
      - None: no backflow needed
      - 'requeue': add to end of current session
      - 'retry': retry immediately
    """
    now = datetime.now(UTC)

    if kind == FLASH_CARD_KIND:
        backflow_action = await _record_vocab(
            conn, user_id=user_id, bank_id=bank_id, question_pk=question_pk,
            is_correct=is_correct, use_fsrs=use_fsrs, now=now,
            time_spent_ms=time_spent_ms, detail=detail,
        )
    elif kind == CHOICE_KIND:
        backflow_action = await _record_choice(
            conn, user_id=user_id, bank_id=bank_id, question_pk=question_pk,
            is_correct=is_correct, use_fsrs=use_fsrs, now=now,
            time_spent_ms=time_spent_ms, detail=detail,
        )
    elif kind == INPUT_KIND:
        backflow_action = await _record_input(
            conn, user_id=user_id, bank_id=bank_id, question_pk=question_pk,
            is_correct=is_correct, use_fsrs=False, now=now,
            time_spent_ms=time_spent_ms, detail=detail,
        )
    else:
        backflow_action = None

    triggered: str | None = None
    if backflow_action == "wrong_to_end" and not is_correct:
        triggered = "requeue"
    elif backflow_action == "wrong_retry" and not is_correct:
        triggered = "retry"

    return triggered, {"is_correct": is_correct, "answered_at": now.isoformat()}


async def _record_vocab(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    bank_id: str,
    question_pk: str,
    is_correct: bool,
    use_fsrs: bool,
    now: datetime,
    time_spent_ms: int,
    detail: dict[str, Any] | None,
) -> str | None:
    backflow_rule = (detail or {}).get("backflow_rule", "none")

    row = await conn.fetchrow(
        """
        SELECT id, user_id, word_id, mastery_score, correct_count, wrong_count,
               lapse_count, interval_days, next_review_at, last_review_at,
               last_result, fsrs_card_json
        FROM vocab_user_word_progress
        WHERE user_id = $1 AND word_id = $2::uuid
        """,
        user_id,
        question_pk,
    )

    if row is None:
        await conn.execute(
            """
            INSERT INTO vocab_user_word_progress
                (user_id, deck_id, word_id, mastery_score, correct_count, wrong_count,
                 last_result, last_review_at, next_review_at)
            VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9)
            """,
            user_id,
            bank_id,
            question_pk,
            1 if is_correct else -1,
            1 if is_correct else 0,
            0 if is_correct else 1,
            "good" if is_correct else "again",
            now,
            now + timedelta(days=1) if not is_correct else now + timedelta(days=3),
        )
    else:
        correct_count = row["correct_count"] + (1 if is_correct else 0)
        wrong_count = row["wrong_count"] + (0 if is_correct else 1)
        lapse_count = row["lapse_count"] + (0 if is_correct else 1)
        mastery = max(-5, min(5, row["mastery_score"] + (1 if is_correct else -1)))

        next_review = now
        if is_correct:
            next_review = now + timedelta(days=min(row["interval_days"] + 1, 365) if row["interval_days"] else 1)
        else:
            next_review = now + timedelta(hours=1)

        if use_fsrs:
            try:
                from fsrs import Card, Rating, Scheduler
                card_json = row["fsrs_card_json"]
                card = Card.from_dict(card_json) if card_json and isinstance(card_json, dict) else Card()
                scheduler = Scheduler()
                rating = Rating.Good if is_correct else Rating.Again
                card, _ = scheduler.review_card(card, rating, review_datetime=now)
                next_review = card.due
                await conn.execute(
                    """
                    UPDATE vocab_user_word_progress
                    SET correct_count = $1, wrong_count = $2, lapse_count = $3,
                        mastery_score = $4, last_result = $5, last_review_at = $6,
                        next_review_at = $7, interval_days = $8,
                        fsrs_card_json = $9::jsonb
                    WHERE user_id = $10 AND word_id = $11::uuid
                    """,
                    correct_count, wrong_count, lapse_count,
                    mastery, "good" if is_correct else "again", now,
                    next_review, card.due - now if card.due else 0,
                    card.to_dict(),
                    user_id, question_pk,
                )
            except ImportError:
                use_fsrs = False

        if not use_fsrs:
            await conn.execute(
                """
                UPDATE vocab_user_word_progress
                SET correct_count = $1, wrong_count = $2, lapse_count = $3,
                    mastery_score = $4, last_result = $5, last_review_at = $6,
                    next_review_at = $7, interval_days = $8
                WHERE user_id = $9 AND word_id = $10::uuid
                """,
                correct_count, wrong_count, lapse_count,
                mastery, "good" if is_correct else "again", now,
                next_review, 0,
                user_id, question_pk,
            )

    await conn.execute(
        """
        INSERT INTO vocab_review_logs (user_id, word_id, result, time_spent_ms, created_at)
        VALUES ($1, $2::uuid, $3, $4, $5)
        """,
        user_id, question_pk, "correct" if is_correct else "wrong",
        time_spent_ms, now,
    )

    return backflow_rule


async def _record_choice(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    bank_id: str,
    question_pk: str,
    is_correct: bool,
    use_fsrs: bool,
    now: datetime,
    time_spent_ms: int,
    detail: dict[str, Any] | None,
) -> str | None:
    backflow_rule = (detail or {}).get("backflow_rule", "none")

    row = await conn.fetchrow(
        """
        SELECT wrong_count, right_count, lapse_count, last_review_at,
               last_answer_correct, due_at, fsrs_card_json
        FROM choice_user_question_cards
        WHERE user_id = $1 AND question_pk = $2::uuid
        """,
        user_id,
        question_pk,
    )

    if row is None:
        due_at = now if not is_correct else now + timedelta(days=3)
        await conn.execute(
            """
            INSERT INTO choice_user_question_cards
                (user_id, question_pk, wrong_count, right_count, due_at,
                 last_review_at, last_answer_correct)
            VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
            """,
            user_id, question_pk,
            0 if is_correct else 1,
            1 if is_correct else 0,
            due_at, now, is_correct,
        )
    else:
        wrong_count = row["wrong_count"] + (0 if is_correct else 1)
        right_count = row["right_count"] + (1 if is_correct else 0)
        lapse_count = row["lapse_count"] + (0 if is_correct else 1)
        due_at = now if not is_correct else now + timedelta(days=3)

        if use_fsrs:
            try:
                from fsrs import Card, Rating, Scheduler
                card_json = row["fsrs_card_json"]
                card = Card.from_dict(card_json) if card_json and isinstance(card_json, dict) else Card()
                scheduler = Scheduler()
                rating = Rating.Good if is_correct else Rating.Again
                card, _ = scheduler.review_card(card, rating, review_datetime=now)
                due_at = card.due
                await conn.execute(
                    """
                    UPDATE choice_user_question_cards
                    SET wrong_count = $1, right_count = $2, lapse_count = $3,
                        last_review_at = $4, last_answer_correct = $5,
                        due_at = $6, fsrs_card_json = $7::jsonb
                    WHERE user_id = $8 AND question_pk = $9::uuid
                    """,
                    wrong_count, right_count, lapse_count,
                    now, is_correct, due_at,
                    card.to_dict(),
                    user_id, question_pk,
                )
            except ImportError:
                use_fsrs = False

        if not use_fsrs:
            await conn.execute(
                """
                UPDATE choice_user_question_cards
                SET wrong_count = $1, right_count = $2, lapse_count = $3,
                    last_review_at = $4, last_answer_correct = $5, due_at = $6
                WHERE user_id = $7 AND question_pk = $8::uuid
                """,
                wrong_count, right_count, lapse_count,
                now, is_correct, due_at,
                user_id, question_pk,
            )

    await conn.execute(
        """
        INSERT INTO choice_review_logs (user_id, question_pk, result, time_spent_ms, created_at)
        VALUES ($1, $2::uuid, $3, $4, $5)
        """,
        user_id, question_pk, "correct" if is_correct else "wrong",
        time_spent_ms, now,
    )

    return backflow_rule


async def _record_input(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    bank_id: str,
    question_pk: str,
    is_correct: bool,
    use_fsrs: bool,
    now: datetime,
    time_spent_ms: int,
    detail: dict[str, Any] | None,
) -> str | None:
    backflow_rule = (detail or {}).get("backflow_rule", "none")

    await conn.execute(
        """
        INSERT INTO input_user_answers (user_id, question_id, set_id, user_input, is_correct, time_spent_ms, created_at)
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7)
        """,
        user_id, question_pk, bank_id,
        (detail or {}).get("user_input", ""),
        is_correct, time_spent_ms, now,
    )

    return backflow_rule
