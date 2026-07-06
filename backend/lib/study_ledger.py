from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import asyncpg

from lib.focus_work_types import CHOICE_KIND, FLASH_CARD_KIND, INPUT_KIND
from lib.fsrs_scheduler import card_from_json
from lib.fsrs_scheduler import review as fsrs_review

BackflowRule = Literal["none", "wrong_to_end", "wrong_retry"]
FlashcardRating = Literal["again", "hard", "good", "easy"]
SchedulingMode = Literal["manual", "fsrs"]


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
    rating: FlashcardRating | None = None,
    scheduling_mode: SchedulingMode = "manual",
    fsrs_config: dict[str, Any] | None = None,
) -> tuple[str | None, dict[str, Any]]:
    """Record an answer and update the study ledger.

    Returns (backflow_action, updated_state) where backflow_action is:
      - None: no backflow needed
      - 'requeue': add to end of current session
      - 'retry': retry immediately

    当 ``scheduling_mode="fsrs"`` 时,通过 ``lib.fsrs_scheduler`` 调用 fsrs 库计算新状态;
    回流由 ``should_repeat_today`` 决定(``again`` 或新 ``due_at <= now`` 时为 True,等价 requeue)。
    旧的 ``use_fsrs`` 参数仅作向后兼容:若为 True 且 ``scheduling_mode="manual"``,内部映射为 fsrs。
    """
    # 向后兼容:旧调用方只传 use_fsrs=True
    if scheduling_mode == "manual" and use_fsrs:
        scheduling_mode = "fsrs"

    now = datetime.now(UTC)

    if kind == FLASH_CARD_KIND:
        backflow_action, should_repeat_today = await _record_vocab(
            conn, user_id=user_id, bank_id=bank_id, question_pk=question_pk,
            is_correct=is_correct, use_fsrs=use_fsrs, now=now,
            time_spent_ms=time_spent_ms, detail=detail,
            rating=rating,
            scheduling_mode=scheduling_mode, fsrs_config=fsrs_config,
        )
    elif kind == CHOICE_KIND:
        backflow_action, should_repeat_today = await _record_choice(
            conn, user_id=user_id, bank_id=bank_id, question_pk=question_pk,
            is_correct=is_correct, use_fsrs=use_fsrs, now=now,
            time_spent_ms=time_spent_ms, detail=detail,
            scheduling_mode=scheduling_mode, fsrs_config=fsrs_config,
        )
    elif kind == INPUT_KIND:
        # input 题型暂不支持 FSRS,强制 manual
        backflow_action = await _record_input(
            conn, user_id=user_id, bank_id=bank_id, question_pk=question_pk,
            is_correct=is_correct, use_fsrs=False, now=now,
            time_spent_ms=time_spent_ms, detail=detail,
        )
        should_repeat_today = False
    else:
        backflow_action = None
        should_repeat_today = False

    triggered: str | None = None
    if scheduling_mode == "fsrs":
        # FSRS 模式回流由 should_repeat_today 决定(等价 wrong_to_end 语义)
        if should_repeat_today:
            triggered = "requeue"
    else:
        if backflow_action == "wrong_to_end" and not is_correct:
            triggered = "requeue"
        elif backflow_action == "wrong_retry" and not is_correct:
            triggered = "retry"

    return triggered, {
        "is_correct": is_correct,
        "answered_at": now.isoformat(),
        "rating": rating,
        "should_repeat_today": should_repeat_today,
    }


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
    rating: FlashcardRating | None = None,
    scheduling_mode: SchedulingMode = "manual",
    fsrs_config: dict[str, Any] | None = None,
) -> tuple[str | None, bool]:
    backflow_rule = (detail or {}).get("backflow_rule", "none")

    # Normalize: if rating is provided, derive is_correct from it;
    # if rating is None (legacy callers), keep the provided is_correct.
    if rating is not None:
        is_correct = rating != "again"
    else:
        # Back-compat: map legacy boolean to rating label for storage
        rating = "good" if is_correct else "again"  # type: ignore[assignment]

    # Mastery score delta per rating (aligned with flash service)
    mastery_deltas = {"again": -1, "hard": 1, "good": 2, "easy": 3}
    mastery_delta = mastery_deltas[rating]  # type: ignore[index]
    is_again = rating == "again"

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

    fsrs_active = scheduling_mode == "fsrs"
    should_repeat_today = False

    if row is None:
        # First review for this word
        initial_mastery = mastery_delta
        initial_correct = 0 if is_again else 1
        initial_wrong = 1 if is_again else 0
        initial_lapse = 1 if is_again else 0

        if fsrs_active:
            existing_card = card_from_json(None)
            result = fsrs_review(existing_card, rating, fsrs_config, now=now)  # type: ignore[arg-type]
            initial_next = result.new_due_at
            initial_interval = int(result.interval_days)
            should_repeat_today = result.should_repeat_today
            await conn.execute(
                """
                INSERT INTO vocab_user_word_progress
                    (user_id, deck_id, word_id, mastery_score, correct_count, wrong_count,
                     lapse_count, last_result, last_review_at, next_review_at,
                     interval_days, fsrs_card_json)
                VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
                """,
                user_id,
                bank_id,
                question_pk,
                initial_mastery,
                initial_correct,
                initial_wrong,
                initial_lapse,
                rating,
                now,
                initial_next,
                initial_interval,
                result.new_card_json,
            )
        else:
            # Simple fixed interval for first review (non-FSRS path)
            if is_again:
                initial_next = now + timedelta(hours=1)
            elif rating == "hard":
                initial_next = now + timedelta(days=1)
            elif rating == "easy":
                initial_next = now + timedelta(days=4)
            else:  # good
                initial_next = now + timedelta(days=3)

            await conn.execute(
                """
                INSERT INTO vocab_user_word_progress
                    (user_id, deck_id, word_id, mastery_score, correct_count, wrong_count,
                     lapse_count, last_result, last_review_at, next_review_at)
                VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10)
                """,
                user_id,
                bank_id,
                question_pk,
                initial_mastery,
                initial_correct,
                initial_wrong,
                initial_lapse,
                rating,
                now,
                initial_next,
            )
    else:
        correct_count = row["correct_count"] + (0 if is_again else 1)
        wrong_count = row["wrong_count"] + (1 if is_again else 0)
        lapse_count = row["lapse_count"] + (1 if is_again else 0)
        mastery = max(-5, min(5, row["mastery_score"] + mastery_delta))

        if fsrs_active:
            existing_card = card_from_json(row["fsrs_card_json"])
            result = fsrs_review(existing_card, rating, fsrs_config, now=now)  # type: ignore[arg-type]
            next_review = result.new_due_at
            interval_days = int(result.interval_days)
            should_repeat_today = result.should_repeat_today
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
                mastery, rating, now,
                next_review, interval_days,
                result.new_card_json,
                user_id, question_pk,
            )
        else:
            # Default non-FSRS interval calculation
            next_review = now
            interval_days = 0
            if is_again:
                next_review = now + timedelta(hours=1)
            else:
                base_interval = row["interval_days"] or 1
                if rating == "hard":
                    interval_days = max(1, int(base_interval * 1.2))
                elif rating == "easy":
                    interval_days = min(int(base_interval * 2.5), 365)
                else:  # good
                    interval_days = min(base_interval + 1, 365)
                next_review = now + timedelta(days=interval_days)

            await conn.execute(
                """
                UPDATE vocab_user_word_progress
                SET correct_count = $1, wrong_count = $2, lapse_count = $3,
                    mastery_score = $4, last_result = $5, last_review_at = $6,
                    next_review_at = $7, interval_days = $8
                WHERE user_id = $9 AND word_id = $10::uuid
                """,
                correct_count, wrong_count, lapse_count,
                mastery, rating, now,
                next_review, interval_days,
                user_id, question_pk,
            )

    await conn.execute(
        """
        INSERT INTO vocab_review_logs (user_id, deck_id, word_id, review_mode, prompt_type, result, response_ms, created_at)
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)
        """,
        user_id, bank_id, question_pk,
        "practice", "recall",
        rating,
        int(time_spent_ms), now,
    )

    return backflow_rule, should_repeat_today


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
    scheduling_mode: SchedulingMode = "manual",
    fsrs_config: dict[str, Any] | None = None,
) -> tuple[str | None, bool]:
    backflow_rule = (detail or {}).get("backflow_rule", "none")
    chosen_option = str((detail or {}).get("user_input", ""))
    rating = "good" if is_correct else "again"

    question_row = await conn.fetchrow(
        """
        SELECT q.article_pk, q.answer
        FROM choice_questions q
        JOIN choice_articles a ON a.id = q.article_pk
        WHERE q.id = $1::uuid AND a.set_id = $2::uuid
        """,
        question_pk,
        bank_id,
    )
    if question_row is None:
        raise ValueError(f"Choice question {question_pk} not found in bank {bank_id}")

    article_pk = str(question_row["article_pk"])
    correct_option = str(question_row["answer"])

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

    fsrs_active = scheduling_mode == "fsrs"
    should_repeat_today = False

    if row is None:
        if fsrs_active:
            existing_card = card_from_json(None)
            result = fsrs_review(existing_card, rating, fsrs_config, now=now)  # type: ignore[arg-type]
            due_at = result.new_due_at
            should_repeat_today = result.should_repeat_today
            await conn.execute(
                """
                INSERT INTO choice_user_question_cards
                    (user_id, question_pk, wrong_count, right_count, due_at,
                     last_review_at, last_answer_correct, last_chosen_option,
                     fsrs_card_json)
                VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9::jsonb)
                """,
                user_id, question_pk,
                0 if is_correct else 1,
                1 if is_correct else 0,
                due_at, now, is_correct, chosen_option or None,
                result.new_card_json,
            )
        else:
            due_at = now if not is_correct else now + timedelta(days=3)
            await conn.execute(
                """
                INSERT INTO choice_user_question_cards
                    (user_id, question_pk, wrong_count, right_count, due_at,
                     last_review_at, last_answer_correct, last_chosen_option)
                VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8)
                """,
                user_id, question_pk,
                0 if is_correct else 1,
                1 if is_correct else 0,
                due_at, now, is_correct, chosen_option or None,
            )
    else:
        wrong_count = row["wrong_count"] + (0 if is_correct else 1)
        right_count = row["right_count"] + (1 if is_correct else 0)
        lapse_count = row["lapse_count"] + (0 if is_correct else 1)

        if fsrs_active:
            existing_card = card_from_json(row["fsrs_card_json"])
            result = fsrs_review(existing_card, rating, fsrs_config, now=now)  # type: ignore[arg-type]
            due_at = result.new_due_at
            should_repeat_today = result.should_repeat_today
            await conn.execute(
                """
                UPDATE choice_user_question_cards
                SET wrong_count = $1, right_count = $2, lapse_count = $3,
                    last_review_at = $4, last_answer_correct = $5,
                    due_at = $6, fsrs_card_json = $7::jsonb, last_chosen_option = $8
                WHERE user_id = $9 AND question_pk = $10::uuid
                """,
                wrong_count, right_count, lapse_count,
                now, is_correct, due_at,
                result.new_card_json,
                chosen_option or None,
                user_id, question_pk,
            )
        else:
            due_at = now if not is_correct else now + timedelta(days=3)
            await conn.execute(
                """
                UPDATE choice_user_question_cards
                SET wrong_count = $1, right_count = $2, lapse_count = $3,
                    last_review_at = $4, last_answer_correct = $5, due_at = $6,
                    last_chosen_option = $7
                WHERE user_id = $8 AND question_pk = $9::uuid
                """,
                wrong_count, right_count, lapse_count,
                now, is_correct, due_at,
                chosen_option or None,
                user_id, question_pk,
            )

    await conn.execute(
        """
        INSERT INTO choice_review_logs (
            user_id, article_pk, question_pk, attempt_id, mode, chosen_option,
            correct_option, is_correct, rating, time_spent_ms, created_at
        )
        VALUES ($1, $2::uuid, $3::uuid, NULL, $4, $5, $6, $7, $8, $9, $10)
        """,
        user_id, article_pk, question_pk, "practice", chosen_option,
        correct_option,
        is_correct, rating, time_spent_ms, now,
    )

    await conn.execute(
        """
        INSERT INTO choice_mistake_bucket(user_id, article_pk, question_pk, wrong_count, last_wrong_at, is_active)
        VALUES ($1, $2::uuid, $3::uuid, CASE WHEN $4 THEN 0 ELSE 1 END, NOW(), NOT $4)
        ON CONFLICT (user_id, question_pk)
        DO UPDATE SET
          wrong_count = CASE
            WHEN $4 THEN choice_mistake_bucket.wrong_count
            ELSE choice_mistake_bucket.wrong_count + 1
          END,
          last_wrong_at = CASE
            WHEN $4 THEN choice_mistake_bucket.last_wrong_at
            ELSE NOW()
          END,
          is_active = NOT $4,
          article_pk = EXCLUDED.article_pk
        """,
        user_id, article_pk, question_pk, is_correct,
    )

    return backflow_rule, should_repeat_today


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
