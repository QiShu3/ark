from __future__ import annotations

from datetime import UTC, datetime, timedelta
from inspect import getsource

import pytest

from routes.focus_work.choice.repository import get_overview_counts
from routes.focus_work.choice.service import (
    _vocabulary_summary,
    choose_due_review_candidate,
    make_practice_wrong_immediately_due,
    rating_for_answer,
    should_skip_same_article,
)


def test_rating_for_answer_maps_wrong_to_again_and_correct_to_good() -> None:
    assert rating_for_answer(is_correct=False) == "again"
    assert rating_for_answer(is_correct=True) == "good"


def test_should_skip_same_article_respects_cooldown_window() -> None:
    now = datetime(2026, 5, 9, 12, tzinfo=UTC)
    recent = [{"article_pk": "article-1", "created_at": now - timedelta(hours=3)}]
    old = [{"article_pk": "article-1", "created_at": now - timedelta(hours=25)}]

    assert should_skip_same_article("article-1", recent_logs=recent, now=now, cooldown_hours=24)
    assert not should_skip_same_article("article-1", recent_logs=old, now=now, cooldown_hours=24)


def test_make_practice_wrong_immediately_due_overrides_again_delay() -> None:
    now = datetime(2026, 5, 9, 12, tzinfo=UTC)
    scheduled = {
        "due_at": now + timedelta(minutes=1),
        "fsrs_card_json": {"due": (now + timedelta(minutes=1)).isoformat(), "state": "learning"},
    }

    adjusted = make_practice_wrong_immediately_due(scheduled, rating="again", now=now)

    assert adjusted["due_at"] == now
    assert adjusted["fsrs_card_json"]["due"] == now.isoformat()


def test_make_practice_wrong_immediately_due_keeps_correct_due_time() -> None:
    now = datetime(2026, 5, 9, 12, tzinfo=UTC)
    due_at = now + timedelta(minutes=10)
    scheduled = {"due_at": due_at, "fsrs_card_json": {"due": due_at.isoformat()}}

    adjusted = make_practice_wrong_immediately_due(scheduled, rating="good", now=now)

    assert adjusted["due_at"] == due_at


def test_overview_counts_do_not_join_independent_count_sources() -> None:
    source = getsource(get_overview_counts)

    assert "LEFT JOIN choice_review_logs" not in source
    assert "LEFT JOIN choice_user_question_cards" not in source
    assert "LEFT JOIN choice_mistake_bucket" not in source


def test_choose_due_review_candidate_uses_weighted_random_within_due_candidates() -> None:
    now = datetime(2026, 5, 9, 12, tzinfo=UTC)
    rows = [
        {"question_id": "q1", "article_pk": "a1", "due_at": now - timedelta(hours=1), "lapse_count": 0, "is_mistake": False},
        {"question_id": "q2", "article_pk": "a2", "due_at": now - timedelta(hours=1), "lapse_count": 4, "is_mistake": True},
    ]

    chosen = choose_due_review_candidate(rows, recent_logs=[], now=now, cooldown_hours=24, random_value=lambda: 0.99)

    assert chosen["question_id"] == "q2"


def test_choose_due_review_candidate_respects_same_article_cooldown_before_random_choice() -> None:
    now = datetime(2026, 5, 9, 12, tzinfo=UTC)
    rows = [
        {"question_id": "q1", "article_pk": "a1", "due_at": now - timedelta(hours=1), "lapse_count": 0, "is_mistake": False},
        {"question_id": "q2", "article_pk": "a2", "due_at": now - timedelta(hours=1), "lapse_count": 0, "is_mistake": False},
    ]
    recent_logs = [{"article_pk": "a1", "created_at": now - timedelta(minutes=5)}]

    chosen = choose_due_review_candidate(rows, recent_logs=recent_logs, now=now, cooldown_hours=24, random_value=lambda: 0)

    assert chosen["question_id"] == "q2"


def test_vocabulary_summary_counts_user_word_states() -> None:
    summary = _vocabulary_summary(
        [
            {"word": "paradoxical", "state": "mastered"},
            {"word": "detached", "state": "learning"},
            {"word": "adolescence", "state": "unstarted"},
            {"word": "prosociality", "state": "unknown"},
        ],
        preview_limit=2,
    )

    assert summary["total_word_count"] == 4
    assert summary["mastered_count"] == 1
    assert summary["learning_count"] == 1
    assert summary["unstarted_count"] == 1
    assert summary["unknown_count"] == 1
    assert summary["unfamiliar_count"] == 3
    assert summary["mastery_rate"] == 0.25
    assert summary["preview_words"] == [
        {"word": "detached", "state": "learning"},
        {"word": "adolescence", "state": "unstarted"},
    ]


# ---- study_ledger.record_answer FSRS 路径(choice 题型)----


class _FakeConn:
    """最小化的 asyncpg.Connection 替身,按 SQL 关键字返回 fetchrow 结果。"""

    def __init__(self, fetchrow_map: dict[str, dict | None] | None = None) -> None:
        self._fetchrow_map = fetchrow_map or {}
        self.execute_calls: list[tuple[str, tuple]] = []

    async def fetchrow(self, sql: str, *args: object) -> dict | None:
        for keyword, result in self._fetchrow_map.items():
            if keyword in sql:
                return result
        return None

    async def execute(self, sql: str, *args: object) -> str:
        self.execute_calls.append((sql, args))
        return "OK"


@pytest.mark.asyncio
async def test_record_answer_fsrs_choice_correct_advances_due_at_and_writes_card_json() -> None:
    """FSRS 模式下 choice 题答对:due_at 推进,fsrs_card_json 写入,should_repeat_today=False。"""
    from lib.study_ledger import record_answer

    question_row = {"article_pk": "art-1", "answer": "A"}
    conn = _FakeConn(fetchrow_map={"FROM choice_questions": question_row})

    triggered, state = await record_answer(
        conn,
        kind="choice",
        user_id=1,
        bank_id="set-1",
        question_pk="q-1",
        is_correct=True,
        scheduling_mode="fsrs",
        fsrs_config={"desired_retention": 0.9, "max_interval_days": 365},
        detail={"user_input": "A"},
    )

    insert_calls = [c for c in conn.execute_calls if "INSERT INTO choice_user_question_cards" in c[0]]
    assert len(insert_calls) == 1
    sql, args = insert_calls[0]
    # INSERT 参数: user_id, question_pk, wrong, right, due_at, now, is_correct, chosen_option, fsrs_card_json
    fsrs_card_json = args[8]
    due_at = args[4]
    assert isinstance(fsrs_card_json, str)
    assert '"state"' in fsrs_card_json
    assert due_at is not None
    assert state["should_repeat_today"] is False
    assert triggered is None


@pytest.mark.asyncio
async def test_record_answer_fsrs_choice_wrong_returns_should_repeat_today_true() -> None:
    """FSRS 模式下 choice 题答错(again):should_repeat_today=True,triggered='requeue'。"""
    from lib.study_ledger import record_answer

    question_row = {"article_pk": "art-1", "answer": "A"}
    conn = _FakeConn(fetchrow_map={"FROM choice_questions": question_row})

    triggered, state = await record_answer(
        conn,
        kind="choice",
        user_id=1,
        bank_id="set-1",
        question_pk="q-1",
        is_correct=False,
        scheduling_mode="fsrs",
        fsrs_config={"desired_retention": 0.9, "max_interval_days": 365},
        detail={"user_input": "B"},
    )

    assert state["should_repeat_today"] is True
    assert triggered == "requeue"
    insert_calls = [c for c in conn.execute_calls if "INSERT INTO choice_user_question_cards" in c[0]]
    assert len(insert_calls) == 1
    assert isinstance(insert_calls[0][1][8], str)


@pytest.mark.asyncio
async def test_record_answer_fsrs_choice_existing_card_updates_card_json() -> None:
    """已有 fsrs_card_json 的 choice 卡:UPDATE 写入新状态。"""
    from lib.study_ledger import record_answer

    question_row = {"article_pk": "art-1", "answer": "A"}
    existing_card = {
        "card_id": 999,
        "state": 1,
        "step": 0,
        "stability": 0.4,
        "difficulty": 5.5,
        "due": "2026-07-05T00:00:00+00:00",
        "last_review": "2026-07-04T23:00:00+00:00",
    }
    card_row = {
        "wrong_count": 1,
        "right_count": 0,
        "lapse_count": 1,
        "last_review_at": datetime(2026, 7, 4, tzinfo=UTC),
        "last_answer_correct": False,
        "due_at": datetime(2026, 7, 5, tzinfo=UTC),
        "fsrs_card_json": existing_card,
    }
    conn = _FakeConn(fetchrow_map={
        "FROM choice_questions": question_row,
        "FROM choice_user_question_cards": card_row,
    })

    triggered, state = await record_answer(
        conn,
        kind="choice",
        user_id=1,
        bank_id="set-1",
        question_pk="q-1",
        is_correct=True,
        scheduling_mode="fsrs",
        fsrs_config={"desired_retention": 0.9, "max_interval_days": 365},
        detail={"user_input": "A"},
    )

    update_calls = [c for c in conn.execute_calls if "UPDATE choice_user_question_cards" in c[0]]
    assert len(update_calls) == 1
    sql, args = update_calls[0]
    # UPDATE 参数: wrong, right, lapse, now, is_correct, due_at, fsrs_card_json, chosen_option, user_id, question_pk
    new_card_json = args[6]
    assert isinstance(new_card_json, str)
    assert '"state"' in new_card_json
    assert state["should_repeat_today"] is False
    assert triggered is None
