from __future__ import annotations

from datetime import UTC, datetime, timedelta

from routes.erc.service import make_practice_wrong_immediately_due, rating_for_answer, should_skip_same_article


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
