from __future__ import annotations

from datetime import UTC, datetime

import pytest

from routes.vocab import service as vocab_service


@pytest.mark.asyncio
async def test_get_today_summary_returns_daily_plan_counts(monkeypatch) -> None:
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

    async def fake_ensure_today_plan(_conn, *, user_id: int, deck_group: dict) -> dict:
        assert user_id == 1
        assert deck_group["member_deck_ids"] == ["deck-1-1", "deck-1-2"]
        return {"id": "plan-1"}

    async def fake_get_daily_plan_summary(_conn, *, plan_id: str) -> dict[str, int]:
        assert plan_id == "plan-1"
        return {"new_count": 12, "review_count": 5, "mistake_count": 2}

    monkeypatch.setattr(vocab_service, "list_vocab_decks", fake_list_vocab_decks)
    monkeypatch.setattr(vocab_service, "_ensure_today_plan", fake_ensure_today_plan)
    monkeypatch.setattr(vocab_service, "get_daily_plan_summary", fake_get_daily_plan_summary)

    summary = await vocab_service.get_today_summary(_Pool(), user_id=1, deck_id="cet4")

    assert summary == {"new_count": 12, "review_count": 5, "mistake_count": 2}


@pytest.mark.asyncio
async def test_get_study_queue_reads_pending_new_items_from_today_plan(monkeypatch) -> None:
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
        {
            "id": "word-1",
            "deck_id": "deck-1",
            "word": "abruptly",
            "us_pronunciation": None,
            "uk_pronunciation": None,
            "mastery_score": 0,
        },
        {
            "id": "word-2",
            "deck_id": "deck-1",
            "word": "absorb",
            "us_pronunciation": None,
            "uk_pronunciation": None,
            "mastery_score": 0,
        },
    ]
    seen_requests: list[tuple[str, str, int]] = []

    async def fake_ensure_today_plan(_conn, *, user_id: int, deck_group: dict) -> dict:
        assert user_id == 1
        assert deck_group["member_deck_ids"] == ["deck-1-1", "deck-1-2"]
        return {"id": "plan-1"}

    async def fake_list_daily_plan_queue_rows(_conn, *, plan_id: str, item_type: str, limit: int):
        seen_requests.append((plan_id, item_type, limit))
        return queue_rows[:limit]

    async def fake_list_word_translations(_conn, *, word_id: str):
        return [{"pos": "adv", "translation": f"{word_id}-translation"}]

    async def fake_list_word_phrases(_conn, *, word_id: str):
        return []

    async def fake_list_word_sentences(_conn, *, word_id: str):
        return []

    monkeypatch.setattr(vocab_service, "list_vocab_decks", fake_list_vocab_decks)
    monkeypatch.setattr(vocab_service, "_ensure_today_plan", fake_ensure_today_plan)
    monkeypatch.setattr(vocab_service, "list_daily_plan_queue_rows", fake_list_daily_plan_queue_rows)
    monkeypatch.setattr(vocab_service, "list_word_translations", fake_list_word_translations)
    monkeypatch.setattr(vocab_service, "list_word_phrases", fake_list_word_phrases)
    monkeypatch.setattr(vocab_service, "list_word_sentences", fake_list_word_sentences)

    items = await vocab_service.get_study_queue(_Pool(), user_id=1, deck_id="cet4", limit=10)

    assert seen_requests == [("plan-1", "new", 10)]
    assert [item["word"] for item in items] == ["abruptly", "absorb"]


@pytest.mark.parametrize(
    ("result_value", "expected_status", "expected_repeat"),
    [("again", "pending", True), ("easy", "done", False)],
)
@pytest.mark.asyncio
async def test_submit_review_updates_today_plan_item_status(
    monkeypatch,
    result_value: str,
    expected_status: str,
    expected_repeat: bool,
) -> None:
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
            {"id": "deck-1", "key": "cet6_1", "name": "CET6_1", "description": "", "word_count": 10, "created_at": stamp, "updated_at": stamp},
        ]

    async def fake_ensure_today_plan(_conn, *, user_id: int, deck_group: dict) -> dict:
        assert user_id == 1
        assert deck_group["id"] == "cet6"
        return {"id": "plan-1"}

    async def fake_get_daily_plan_item(_conn, *, plan_id: str, word_id: str):
        assert plan_id == "plan-1"
        assert word_id == "word-1"
        return {"plan_id": plan_id, "word_id": word_id, "item_type": "new", "status": "pending"}

    async def fake_get_word_detail_row(_conn, *, word_id: str):
        assert word_id == "word-1"
        return {"id": word_id, "deck_id": "deck-1", "word": "abandon", "us_pronunciation": None, "uk_pronunciation": None}

    async def fake_get_user_word_progress(_conn, *, user_id: int, deck_id: str, word_id: str):
        assert user_id == 1
        assert deck_id == "deck-1"
        assert word_id == "word-1"
        return {"fsrs_card_json": None, "mastery_score": 0, "correct_count": 0, "wrong_count": 0, "lapse_count": 0}

    def fake_schedule_fsrs_review(progress: dict, *, result: str, now: datetime) -> dict:
        assert result == result_value
        assert now.tzinfo == UTC
        return {
            "card_json": {"due": "2026-05-07T00:00:00+00:00", "state": "review"},
            "mastery_score": 1,
            "wrong_count": 0 if result == "easy" else 1,
            "correct_count": 1 if result != "again" else 0,
            "lapse_count": 0 if result == "easy" else 1,
            "interval_days": 5 if result == "easy" else 0,
            "next_review_at": datetime(2026, 5, 7, tzinfo=UTC),
            "result": result,
        }

    seen_progress_payloads: list[dict] = []
    seen_item_updates: list[dict] = []

    async def fake_upsert_user_word_progress(_conn, **kwargs):
        seen_progress_payloads.append(kwargs)

    async def fake_insert_review_log(_conn, **kwargs):
        assert kwargs["deck_id"] == "deck-1"
        assert kwargs["result"] == result_value

    async def fake_upsert_mistake_bucket(_conn, **kwargs):
        assert kwargs["deck_id"] == "deck-1"
        assert kwargs["is_active"] is (result_value == "again")

    async def fake_update_daily_plan_item(_conn, **kwargs):
        seen_item_updates.append(kwargs)

    monkeypatch.setattr(vocab_service, "list_vocab_decks", fake_list_vocab_decks)
    monkeypatch.setattr(vocab_service, "_ensure_today_plan", fake_ensure_today_plan)
    monkeypatch.setattr(vocab_service, "get_daily_plan_item", fake_get_daily_plan_item)
    monkeypatch.setattr(vocab_service, "get_word_detail_row", fake_get_word_detail_row)
    monkeypatch.setattr(vocab_service, "get_user_word_progress", fake_get_user_word_progress)
    monkeypatch.setattr(vocab_service, "_schedule_fsrs_review", fake_schedule_fsrs_review)
    monkeypatch.setattr(vocab_service, "upsert_user_word_progress", fake_upsert_user_word_progress)
    monkeypatch.setattr(vocab_service, "insert_review_log", fake_insert_review_log)
    monkeypatch.setattr(vocab_service, "upsert_mistake_bucket", fake_upsert_mistake_bucket)
    monkeypatch.setattr(vocab_service, "update_daily_plan_item", fake_update_daily_plan_item)

    result = await vocab_service.submit_review(
        _Pool(),
        user_id=1,
        deck_id="cet6",
        word_id="word-1",
        result=result_value,
        review_mode="study",
        prompt_type="en_to_zh",
        response_ms=None,
    )

    assert result["result"] == result_value
    assert result["should_repeat_today"] is expected_repeat
    assert seen_progress_payloads[0]["deck_id"] == "deck-1"
    assert seen_progress_payloads[0]["fsrs_card_json"] == {"due": "2026-05-07T00:00:00+00:00", "state": "review"}
    assert seen_item_updates == [
        {
            "plan_id": "plan-1",
            "word_id": "word-1",
            "status": expected_status,
            "last_result": result_value,
        }
    ]


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
    assert [deck["name"] for deck in decks] == ["CET6", "CET6（乱序版）"]
    assert decks[0]["word_count"] == 30
    assert decks[1]["word_count"] == 12


@pytest.mark.asyncio
async def test_list_decks_uses_human_friendly_display_names(monkeypatch) -> None:
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
            {"id": "1", "key": "beishigaozhong_1", "name": "BeiShiGaoZhong_1", "description": "", "word_count": 10, "created_at": stamp, "updated_at": stamp},
            {"id": "2", "key": "beishigaozhong_2", "name": "BeiShiGaoZhong_2", "description": "", "word_count": 20, "created_at": stamp, "updated_at": stamp},
            {"id": "3", "key": "gaozhongluan_1", "name": "GaoZhongluan_1", "description": "", "word_count": 5, "created_at": stamp, "updated_at": stamp},
        ]

    monkeypatch.setattr(vocab_service, "list_vocab_decks", fake_list_vocab_decks)

    decks = await vocab_service.list_decks(_Pool())

    assert [deck["name"] for deck in decks] == ["北师高中", "高中（乱序版）"]
    assert decks[0]["description"] == "北师高中 词书（2 册，共 30 个单词）"
    assert decks[1]["description"] == "高中（乱序版） 词书"


@pytest.mark.asyncio
async def test_submit_review_uses_actual_member_deck_id_for_grouped_deck(monkeypatch) -> None:
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
            {"id": "deck-1", "key": "cet6_1", "name": "CET6_1", "description": "", "word_count": 10, "created_at": stamp, "updated_at": stamp},
            {"id": "deck-2", "key": "cet6_2", "name": "CET6_2", "description": "", "word_count": 20, "created_at": stamp, "updated_at": stamp},
        ]

    async def fake_get_word_detail_row(_conn, *, word_id: str):
        assert word_id == "word-1"
        return {"id": word_id, "deck_id": "deck-2", "word": "abandon", "us_pronunciation": None, "uk_pronunciation": None}

    async def fake_ensure_today_plan(_conn, *, user_id: int, deck_group: dict) -> dict:
        assert user_id == 1
        assert deck_group["id"] == "cet6"
        return {"id": "plan-1"}

    async def fake_get_daily_plan_item(_conn, *, plan_id: str, word_id: str):
        assert plan_id == "plan-1"
        assert word_id == "word-1"
        return {"plan_id": plan_id, "word_id": word_id, "item_type": "new", "status": "pending"}

    seen_progress_deck_ids: list[str] = []
    seen_log_deck_ids: list[str] = []
    seen_mistake_deck_ids: list[str] = []

    async def fake_get_user_word_progress(_conn, *, user_id: int, deck_id: str, word_id: str):
        seen_progress_deck_ids.append(deck_id)
        return None

    async def fake_upsert_user_word_progress(_conn, **kwargs):
        seen_progress_deck_ids.append(kwargs["deck_id"])

    async def fake_insert_review_log(_conn, **kwargs):
        seen_log_deck_ids.append(kwargs["deck_id"])

    async def fake_upsert_mistake_bucket(_conn, **kwargs):
        seen_mistake_deck_ids.append(kwargs["deck_id"])

    async def fake_update_daily_plan_item(_conn, **kwargs):
        assert kwargs["plan_id"] == "plan-1"
        assert kwargs["word_id"] == "word-1"
        assert kwargs["status"] == "done"

    def fake_schedule_fsrs_review(progress: dict, *, result: str, now: datetime) -> dict:
        assert progress == {}
        assert result == "good"
        assert now.tzinfo == UTC
        return {
            "card_json": {"due": "2026-05-08T00:00:00+00:00", "state": "review"},
            "mastery_score": 2,
            "wrong_count": 0,
            "correct_count": 1,
            "lapse_count": 0,
            "interval_days": 2,
            "next_review_at": datetime(2026, 5, 8, tzinfo=UTC),
            "result": "good",
        }

    monkeypatch.setattr(vocab_service, "list_vocab_decks", fake_list_vocab_decks)
    monkeypatch.setattr(vocab_service, "_ensure_today_plan", fake_ensure_today_plan)
    monkeypatch.setattr(vocab_service, "get_daily_plan_item", fake_get_daily_plan_item)
    monkeypatch.setattr(vocab_service, "get_word_detail_row", fake_get_word_detail_row)
    monkeypatch.setattr(vocab_service, "get_user_word_progress", fake_get_user_word_progress)
    monkeypatch.setattr(vocab_service, "_schedule_fsrs_review", fake_schedule_fsrs_review)
    monkeypatch.setattr(vocab_service, "upsert_user_word_progress", fake_upsert_user_word_progress)
    monkeypatch.setattr(vocab_service, "insert_review_log", fake_insert_review_log)
    monkeypatch.setattr(vocab_service, "upsert_mistake_bucket", fake_upsert_mistake_bucket)
    monkeypatch.setattr(vocab_service, "update_daily_plan_item", fake_update_daily_plan_item)

    result = await vocab_service.submit_review(
        _Pool(),
        user_id=1,
        deck_id="cet6",
        word_id="word-1",
        result="good",
        review_mode="study",
        prompt_type="en_to_zh",
        response_ms=None,
    )

    assert result["result"] == "good"
    assert seen_progress_deck_ids == ["deck-2", "deck-2"]
    assert seen_log_deck_ids == ["deck-2"]
    assert seen_mistake_deck_ids == ["deck-2"]
