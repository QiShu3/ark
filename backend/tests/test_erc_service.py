from __future__ import annotations

from datetime import UTC, datetime, timedelta
from inspect import getsource

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
