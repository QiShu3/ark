from __future__ import annotations

from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.auth_routes import get_current_user
from routes.erc.routes import router as erc_router


class _User:
    id = 1
    username = "tester"
    is_active = True
    is_admin = False
    created_at = None


def _app(monkeypatch) -> TestClient:
    app = FastAPI()
    app.include_router(erc_router)
    app.dependency_overrides[get_current_user] = lambda: _User()
    from routes.erc import routes as erc_routes

    monkeypatch.setattr(erc_routes, "_pool_from_request", lambda _request: object())
    return TestClient(app)


def test_erc_overview_requires_auth() -> None:
    app = FastAPI()
    app.include_router(erc_router)
    client = TestClient(app)

    response = client.get("/api/erc/overview")

    assert response.status_code == 401


def test_erc_overview_returns_summary(monkeypatch) -> None:
    async def fake_get_overview(*_args, **_kwargs):
        return {
            "due_review_count": 3,
            "practiced_article_count": 2,
            "practiced_question_count": 10,
            "accuracy": 0.7,
            "mistake_count": 4,
            "recommended_article": None,
        }

    from routes.erc import routes as erc_routes

    monkeypatch.setattr(erc_routes, "get_overview", fake_get_overview)
    client = _app(monkeypatch)

    response = client.get("/api/erc/overview")

    assert response.status_code == 200
    assert response.json()["due_review_count"] == 3


def test_erc_article_submit_returns_result(monkeypatch) -> None:
    async def fake_submit_article_practice(*_args, **_kwargs):
        return {
            "attempt_id": "attempt-1",
            "article_id": "kaoyan2_2025_text1",
            "correct_count": 1,
            "question_count": 1,
            "items": [
                {
                    "question_id": "kaoyan2_2025_text1_q21",
                    "question_no": 21,
                    "chosen_option": "A",
                    "correct_option": "B",
                    "is_correct": False,
                    "rating": "again",
                    "next_review_at": datetime(2026, 5, 10, tzinfo=UTC),
                    "entered_mistakes": True,
                }
            ],
        }

    from routes.erc import routes as erc_routes

    monkeypatch.setattr(erc_routes, "submit_article_practice", fake_submit_article_practice)
    client = _app(monkeypatch)

    response = client.post(
        "/api/erc/articles/kaoyan2_2025_text1/submit",
        json={"answers": [{"question_id": "kaoyan2_2025_text1_q21", "chosen_option": "A"}]},
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["rating"] == "again"


def test_erc_vocabulary_preheat_returns_article_words(monkeypatch) -> None:
    async def fake_get_vocabulary_preheat(*_args, **_kwargs):
        return [
            {
                "id": "word-1",
                "deck_id": "deck-1",
                "word": "paradoxical",
                "us_pronunciation": None,
                "uk_pronunciation": None,
                "translations": [{"pos": "adj.", "translation": "矛盾的"}],
                "phrases": [],
                "sentences": [],
                "prompt_type": "en_to_zh",
                "review_mode": "erc_preheat",
                "mastery_score": 0,
            }
        ]

    from routes.erc import routes as erc_routes

    monkeypatch.setattr(erc_routes, "get_vocabulary_preheat", fake_get_vocabulary_preheat, raising=False)
    client = _app(monkeypatch)

    response = client.get("/api/erc/articles/kaoyan2_2023_text4/vocabulary/preheat")

    assert response.status_code == 200
    assert response.json()[0]["word"] == "paradoxical"
    assert response.json()[0]["review_mode"] == "erc_preheat"


def test_erc_vocabulary_preheat_submit_records_review(monkeypatch) -> None:
    async def fake_submit_vocabulary_preheat(*_args, **_kwargs):
        return {
            "mastery_score": 2,
            "next_review_at": datetime(2026, 5, 10, tzinfo=UTC),
            "wrong_count": 0,
            "correct_count": 1,
            "interval_days": 1,
            "result": "good",
            "should_repeat_today": False,
        }

    from routes.erc import routes as erc_routes

    monkeypatch.setattr(erc_routes, "submit_vocabulary_preheat", fake_submit_vocabulary_preheat, raising=False)
    client = _app(monkeypatch)

    response = client.post(
        "/api/erc/articles/kaoyan2_2023_text4/vocabulary/reviews",
        json={"deck_id": "deck-1", "word_id": "word-1", "result": "good", "prompt_type": "en_to_zh"},
    )

    assert response.status_code == 200
    assert response.json()["result"] == "good"
