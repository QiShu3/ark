from __future__ import annotations

import pytest

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
