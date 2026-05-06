from __future__ import annotations

from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.auth_routes import get_current_user
from routes.vocab.routes import router as vocab_router


class _User:
    id = 1
    username = "tester"
    is_active = True
    is_admin = False
    created_at = None


def test_vocab_router_exposes_decks_endpoint() -> None:
    app = FastAPI()
    app.include_router(vocab_router)
    client = TestClient(app)

    response = client.get("/api/vocab/decks")

    assert response.status_code == 401


def test_vocab_today_route_returns_counts(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(vocab_router)
    app.dependency_overrides[get_current_user] = lambda: _User()

    async def fake_get_today_summary(*_args, **_kwargs):
        return {
            "learning_count": 7,
            "new_count": 12,
            "review_count": 5,
            "mistake_count": 2,
            "total_count": 24,
            "pending_count": 17,
            "completed_count": 7,
            "daily_target_count": 24,
            "memorized_count": 88,
        }

    from routes.vocab import routes as vocab_routes

    monkeypatch.setattr(vocab_routes, "get_today_summary", fake_get_today_summary)
    monkeypatch.setattr(vocab_routes, "_pool_from_request", lambda _request: object())
    client = TestClient(app)

    response = client.get("/api/vocab/decks/deck-1/today")

    assert response.status_code == 200
    assert response.json() == {
        "learning_count": 7,
        "new_count": 12,
        "review_count": 5,
        "mistake_count": 2,
        "total_count": 24,
        "pending_count": 17,
        "completed_count": 7,
        "daily_target_count": 24,
        "memorized_count": 88,
    }


def test_vocab_overview_route_returns_global_snapshot(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(vocab_router)
    app.dependency_overrides[get_current_user] = lambda: _User()

    async def fake_get_overview(*_args, **_kwargs):
        return {
            "completed_deck_count": 3,
            "total_deck_count": 8,
            "mastered_word_count": 1450,
            "current_deck": {
                "deck_id": "cet6",
                "deck_name": "CET6",
                "total_word_count": 2000,
                "mastered_word_count": 1400,
                "learning_word_count": 300,
                "unstarted_word_count": 300,
            },
        }

    from routes.vocab import routes as vocab_routes

    monkeypatch.setattr(vocab_routes, "get_overview", fake_get_overview)
    monkeypatch.setattr(vocab_routes, "_pool_from_request", lambda _request: object())
    client = TestClient(app)

    response = client.get("/api/vocab/decks/cet6/overview")

    assert response.status_code == 200
    assert response.json()["completed_deck_count"] == 3
    assert response.json()["current_deck"]["mastered_word_count"] == 1400


def test_vocab_overview_mastered_words_route_returns_items(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(vocab_router)
    app.dependency_overrides[get_current_user] = lambda: _User()

    async def fake_list_overview_mastered_words(*_args, **_kwargs):
        return [
            {
                "id": "word-1",
                "word": "prosperity",
                "us_pronunciation": None,
                "uk_pronunciation": None,
                "translations": [{"pos": "n.", "translation": "繁荣"}],
                "source_deck_names": ["CET4", "CET6"],
            }
        ]

    from routes.vocab import routes as vocab_routes

    monkeypatch.setattr(vocab_routes, "list_overview_mastered_words", fake_list_overview_mastered_words)
    monkeypatch.setattr(vocab_routes, "_pool_from_request", lambda _request: object())
    client = TestClient(app)

    response = client.get("/api/vocab/decks/cet6/overview/mastered-words")

    assert response.status_code == 200
    assert response.json()[0]["word"] == "prosperity"
    assert response.json()[0]["source_deck_names"] == ["CET4", "CET6"]


def test_vocab_overview_current_words_route_returns_items(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(vocab_router)
    app.dependency_overrides[get_current_user] = lambda: _User()

    async def fake_list_overview_current_words(*_args, **_kwargs):
        return [
            {
                "id": "word-1",
                "deck_id": "cet6",
                "deck_name": "CET6",
                "word": "prosperity",
                "us_pronunciation": None,
                "uk_pronunciation": None,
                "mastery_state": "mastered",
                "translations": [{"pos": "n.", "translation": "繁荣"}],
            }
        ]

    from routes.vocab import routes as vocab_routes

    monkeypatch.setattr(vocab_routes, "list_overview_current_words", fake_list_overview_current_words)
    monkeypatch.setattr(vocab_routes, "_pool_from_request", lambda _request: object())
    client = TestClient(app)

    response = client.get("/api/vocab/decks/cet6/overview/current-words?state=mastered")

    assert response.status_code == 200
    assert response.json()[0]["deck_name"] == "CET6"
    assert response.json()[0]["mastery_state"] == "mastered"


def test_vocab_today_settings_route_updates_plan(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(vocab_router)
    app.dependency_overrides[get_current_user] = lambda: _User()

    async def fake_update_today_plan(*_args, **_kwargs):
        return {
            "learning_count": 6,
            "new_count": 12,
            "review_count": 2,
            "mistake_count": 1,
            "total_count": 20,
            "pending_count": 20,
            "completed_count": 0,
            "daily_target_count": 20,
            "memorized_count": 64,
        }

    from routes.vocab import routes as vocab_routes

    monkeypatch.setattr(vocab_routes, "update_today_plan", fake_update_today_plan)
    monkeypatch.setattr(vocab_routes, "_pool_from_request", lambda _request: object())
    client = TestClient(app)

    response = client.put("/api/vocab/decks/cet4/today/settings", json={"total_target_count": 20})

    assert response.status_code == 200
    assert response.json()["daily_target_count"] == 20
    assert response.json()["memorized_count"] == 64


def test_vocab_submit_review_route_returns_progress(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(vocab_router)
    app.dependency_overrides[get_current_user] = lambda: _User()

    async def fake_submit_review(*_args, **_kwargs):
        return {
            "mastery_score": 2,
            "next_review_at": datetime(2026, 5, 5, tzinfo=UTC),
            "wrong_count": 0,
            "correct_count": 3,
            "interval_days": 5,
            "result": "easy",
            "should_repeat_today": False,
        }

    from routes.vocab import routes as vocab_routes

    monkeypatch.setattr(vocab_routes, "submit_review", fake_submit_review)
    monkeypatch.setattr(vocab_routes, "_pool_from_request", lambda _request: object())
    client = TestClient(app)

    response = client.post(
        "/api/vocab/reviews",
        json={
            "deck_id": "deck-1",
            "word_id": "word-1",
            "result": "easy",
            "review_mode": "review",
            "prompt_type": "en_to_zh",
        },
    )

    assert response.status_code == 200
    assert response.json()["mastery_score"] == 2
    assert response.json()["wrong_count"] == 0
    assert response.json()["should_repeat_today"] is False


def test_vocab_word_detail_route_returns_nested_content(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(vocab_router)
    app.dependency_overrides[get_current_user] = lambda: _User()

    async def fake_get_word_detail(*_args, **_kwargs):
        return {
            "id": "word-1",
            "deck_id": "deck-1",
            "word": "talk",
            "us_pronunciation": "tɔk",
            "uk_pronunciation": "tɔːk",
            "translations": [{"pos": "v", "translation": "说话；谈话"}],
            "phrases": [{"phrase": "talk about", "translation": "谈论某事"}],
            "sentences": [{"sentence": "We talk daily.", "translation": "我们每天交谈。"}],
        }

    from routes.vocab import routes as vocab_routes

    monkeypatch.setattr(vocab_routes, "get_word_detail", fake_get_word_detail)
    monkeypatch.setattr(vocab_routes, "_pool_from_request", lambda _request: object())
    client = TestClient(app)

    response = client.get("/api/vocab/words/word-1")

    assert response.status_code == 200
    assert response.json()["word"] == "talk"
    assert response.json()["translations"][0]["translation"] == "说话；谈话"


def test_vocab_mistakes_route_returns_items(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(vocab_router)
    app.dependency_overrides[get_current_user] = lambda: _User()

    async def fake_list_mistakes(*_args, **_kwargs):
        return [
            {
                "id": "word-1",
                "deck_id": "deck-1",
                "word": "talk",
                "translations": [{"pos": "v", "translation": "说话；谈话"}],
                "phrases": [],
                "sentences": [],
                "last_wrong_at": datetime(2026, 5, 5, tzinfo=UTC),
                "wrong_count": 2,
            }
        ]

    from routes.vocab import routes as vocab_routes

    monkeypatch.setattr(vocab_routes, "list_mistakes", fake_list_mistakes)
    monkeypatch.setattr(vocab_routes, "_pool_from_request", lambda _request: object())
    client = TestClient(app)

    response = client.get("/api/vocab/decks/deck-1/mistakes")

    assert response.status_code == 200
    assert response.json()[0]["word"] == "talk"
