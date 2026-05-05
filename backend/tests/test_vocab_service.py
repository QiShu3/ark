from __future__ import annotations

from datetime import UTC, datetime

import pytest

from routes.vocab import service as vocab_service
from routes.vocab.service import apply_review_result


@pytest.mark.asyncio
async def test_apply_review_result_marks_wrong_answer_due_soon() -> None:
    progress = {
        "mastery_score": 3,
        "wrong_count": 1,
        "correct_count": 2,
        "lapse_count": 0,
    }

    updated = apply_review_result(progress, result="wrong")

    assert updated["mastery_score"] == 2
    assert updated["wrong_count"] == 2
    assert updated["lapse_count"] == 1
    assert updated["interval_days"] == 1


@pytest.mark.asyncio
async def test_get_today_summary_returns_remaining_new_quota(monkeypatch) -> None:
    class _PoolAcquire:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class _Pool:
        def acquire(self):
            return _PoolAcquire()

    async def fake_list_vocab_decks(_conn):
        return [
            {
                "id": "deck-1-1",
                "key": "cet4_1",
                "name": "CET4_1",
                "description": "CET4_1 词书",
                "word_count": 100,
                "created_at": datetime(2026, 5, 5, tzinfo=UTC),
                "updated_at": datetime(2026, 5, 5, tzinfo=UTC),
            },
            {
                "id": "deck-1-2",
                "key": "cet4_2",
                "name": "CET4_2",
                "description": "CET4_2 词书",
                "word_count": 120,
                "created_at": datetime(2026, 5, 5, tzinfo=UTC),
                "updated_at": datetime(2026, 5, 5, tzinfo=UTC),
            },
        ]

    async def fake_get_daily_new_limit(_conn, *, user_id: int, deck_ids: list[str]) -> int:
        assert user_id == 1
        assert deck_ids == ["deck-1-1", "deck-1-2"]
        return 20

    async def fake_count_new_words(_conn, *, user_id: int, deck_ids: list[str]) -> int:
        assert user_id == 1
        assert deck_ids == ["deck-1-1", "deck-1-2"]
        return 42

    async def fake_count_studied_new_words_today(_conn, *, user_id: int, deck_ids: list[str]) -> int:
        assert user_id == 1
        assert deck_ids == ["deck-1-1", "deck-1-2"]
        return 3

    async def fake_count_due_reviews(_conn, *, user_id: int, deck_ids: list[str]) -> int:
        return 5

    async def fake_count_active_mistakes(_conn, *, user_id: int, deck_ids: list[str]) -> int:
        return 2

    monkeypatch.setattr(vocab_service, "list_vocab_decks", fake_list_vocab_decks)
    monkeypatch.setattr(vocab_service, "get_daily_new_limit", fake_get_daily_new_limit)
    monkeypatch.setattr(vocab_service, "count_new_words", fake_count_new_words)
    monkeypatch.setattr(vocab_service, "count_studied_new_words_today", fake_count_studied_new_words_today)
    monkeypatch.setattr(vocab_service, "count_due_reviews", fake_count_due_reviews)
    monkeypatch.setattr(vocab_service, "count_active_mistakes", fake_count_active_mistakes)

    summary = await vocab_service.get_today_summary(_Pool(), user_id=1, deck_id="cet4")

    assert summary == {"new_count": 17, "review_count": 5, "mistake_count": 2}


@pytest.mark.asyncio
async def test_get_study_queue_respects_remaining_daily_quota(monkeypatch) -> None:
    class _PoolAcquire:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class _Pool:
        def acquire(self):
            return _PoolAcquire()

    async def fake_list_vocab_decks(_conn):
        return [
            {
                "id": "deck-1-1",
                "key": "cet4_1",
                "name": "CET4_1",
                "description": "CET4_1 词书",
                "word_count": 100,
                "created_at": datetime(2026, 5, 5, tzinfo=UTC),
                "updated_at": datetime(2026, 5, 5, tzinfo=UTC),
            },
            {
                "id": "deck-1-2",
                "key": "cet4_2",
                "name": "CET4_2",
                "description": "CET4_2 词书",
                "word_count": 120,
                "created_at": datetime(2026, 5, 5, tzinfo=UTC),
                "updated_at": datetime(2026, 5, 5, tzinfo=UTC),
            },
        ]

    queue_rows = [
        {"id": "word-1", "deck_id": "deck-1", "word": "abruptly", "us_pronunciation": None, "uk_pronunciation": None, "mastery_score": 0},
        {"id": "word-2", "deck_id": "deck-1", "word": "absorb", "us_pronunciation": None, "uk_pronunciation": None, "mastery_score": 0},
    ]
    seen_requests: list[tuple[str, int]] = []

    async def fake_get_daily_new_limit(_conn, *, user_id: int, deck_ids: list[str]) -> int:
        return 20

    async def fake_count_studied_new_words_today(_conn, *, user_id: int, deck_ids: list[str]) -> int:
        return 18

    async def fake_list_study_queue_rows(_conn, *, user_id: int, deck_id: str, limit: int):
        seen_requests.append((deck_id, limit))
        return queue_rows[:limit]

    async def fake_list_word_translations(_conn, *, word_id: str):
        return [{"pos": "adv", "translation": f"{word_id}-translation"}]

    async def fake_list_word_phrases(_conn, *, word_id: str):
        return []

    async def fake_list_word_sentences(_conn, *, word_id: str):
        return []

    monkeypatch.setattr(vocab_service, "list_vocab_decks", fake_list_vocab_decks)
    monkeypatch.setattr(vocab_service, "get_daily_new_limit", fake_get_daily_new_limit)
    monkeypatch.setattr(vocab_service, "count_studied_new_words_today", fake_count_studied_new_words_today)
    monkeypatch.setattr(vocab_service, "list_study_queue_rows", fake_list_study_queue_rows)
    monkeypatch.setattr(vocab_service, "list_word_translations", fake_list_word_translations)
    monkeypatch.setattr(vocab_service, "list_word_phrases", fake_list_word_phrases)
    monkeypatch.setattr(vocab_service, "list_word_sentences", fake_list_word_sentences)

    items = await vocab_service.get_study_queue(_Pool(), user_id=1, deck_id="cet4", limit=10)

    assert seen_requests == [("deck-1-1", 2)]
    assert [item["word"] for item in items] == ["abruptly", "absorb"]


@pytest.mark.asyncio
async def test_list_decks_groups_serial_parts_but_keeps_luan_separate(monkeypatch) -> None:
    class _PoolAcquire:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class _Pool:
        def acquire(self):
            return _PoolAcquire()

    async def fake_list_vocab_decks(_conn):
        stamp = datetime(2026, 5, 5, tzinfo=UTC)
        return [
            {"id": "1", "key": "cet6_1", "name": "CET6_1", "description": "", "word_count": 10, "created_at": stamp, "updated_at": stamp},
            {"id": "2", "key": "cet6_2", "name": "CET6_2", "description": "", "word_count": 20, "created_at": stamp, "updated_at": stamp},
            {"id": "3", "key": "cet6luan_1", "name": "CET6luan_1", "description": "", "word_count": 5, "created_at": stamp, "updated_at": stamp},
            {"id": "4", "key": "cet6luan_2", "name": "CET6luan_2", "description": "", "word_count": 7, "created_at": stamp, "updated_at": stamp},
        ]

    monkeypatch.setattr(vocab_service, "list_vocab_decks", fake_list_vocab_decks)

    decks = await vocab_service.list_decks(_Pool())

    assert [deck["key"] for deck in decks] == ["cet6", "cet6luan"]
    assert decks[0]["word_count"] == 30
    assert decks[1]["word_count"] == 12
