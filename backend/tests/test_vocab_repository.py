from __future__ import annotations

from datetime import UTC, datetime

import pytest

from routes.focus_work.flash.repository import upsert_user_word_progress


@pytest.mark.asyncio
async def test_upsert_user_word_progress_passes_last_result_before_fsrs_json() -> None:
    class _Conn:
        def __init__(self) -> None:
            self.args = None

        async def execute(self, _query: str, *args) -> None:
            self.args = args

    conn = _Conn()
    next_review_at = datetime(2026, 5, 7, tzinfo=UTC)

    await upsert_user_word_progress(
        conn,
        user_id=1,
        deck_id="deck-1",
        word_id="word-1",
        mastery_score=0,
        correct_count=0,
        wrong_count=1,
        lapse_count=1,
        interval_days=0,
        next_review_at=next_review_at,
        fsrs_card_json={"due": "2026-05-07T00:00:00+00:00", "state": "review"},
        last_result="again",
    )

    assert conn.args is not None
    assert conn.args[9] == "again"
    assert conn.args[10] == '{"due": "2026-05-07T00:00:00+00:00", "state": "review"}'
