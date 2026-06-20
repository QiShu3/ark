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


def test_erc_articles_accepts_exam_filter(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def fake_list_articles(*_args, **kwargs):
        captured.update(kwargs)
        return [
            {
                "article_id": "kaoyan2_2025_text1",
                "set_id": "set-1",
                "year": 2025,
                "text_no": 1,
                "title": "",
                "status": "unstarted",
                "question_count": 5,
                "mistake_count": 0,
                "last_attempt_at": None,
            }
        ]

    from routes.erc import routes as erc_routes

    monkeypatch.setattr(erc_routes, "list_articles", fake_list_articles)
    client = _app(monkeypatch)

    response = client.get("/api/erc/articles?exam=考研英语二")

    assert response.status_code == 200
    assert captured["exam"] == "考研英语二"


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
