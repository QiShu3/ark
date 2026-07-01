from __future__ import annotations

import json
from dataclasses import dataclass

import pytest
import httpx
from fastapi import FastAPI

from routes.focus_work.input.routes import router


@dataclass
class _DummyUser:
    id: int = 7
    is_admin: bool = True


class _AcquireCtx:
    def __init__(self, conn: _FakeInputConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeInputConn:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _TxCtx:
    def __init__(self, conn: _FakeInputConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeInputConn:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _FakeInputConn:
    def __init__(self):
        self._sets: list[dict] = []
        self._articles: list[dict] = []
        self._questions: list[dict] = []
        self._next_id = 0

    def _new_id(self) -> str:
        self._next_id += 1
        return f"id-{self._next_id}"

    async def fetch(self, sql: str, *args):
        if "FROM input_sets" in sql:
            return [dict(r) for r in self._sets]
        if "FROM input_questions" in sql and "DISTINCT year" in sql:
            return [{"year": 2024}]
        if "FROM input_questions" in sql and "DISTINCT subject" in sql:
            return [{"subject": "数学"}]
        if "FROM input_questions" in sql:
            return [dict(r) for r in self._questions[:1]]
        return []

    async def fetchrow(self, sql: str, *args):
        if "INSERT INTO input_sets" in sql:
            rid = self._new_id()
            row = {"id": rid, "name": args[1] if len(args) > 1 else "test", "question_count": 0}
            self._sets.append(row)
            return row
        if "INSERT INTO input_articles" in sql:
            rid = self._new_id()
            row = {"id": rid, "article_id": args[1] if len(args) > 1 else "a1"}
            self._articles.append(row)
            return row
        if "INSERT INTO input_paragraphs" in sql:
            rid = self._new_id()
            return {"id": rid}
        if "INSERT INTO input_questions" in sql:
            rid = self._new_id()
            row = {"id": rid, "question_id": args[1] if len(args) > 1 else "q1"}
            self._questions.append(row)
            return row
        if "INSERT INTO input_user_answers" in sql:
            rid = self._new_id()
            return {"id": rid}
        if "set_id" in sql and "input_questions" in sql:
            if self._sets:
                return {"set_id": self._sets[0]["id"]}
            return None
        if "SELECT" in sql and "input_questions" in sql:
            if self._questions:
                return dict(self._questions[0])
            return None
        if "SELECT" in sql and "input_sets" in sql:
            if self._sets:
                return dict(self._sets[0])
            return None
        return None

    async def execute(self, sql: str, *args):
        if "INSERT" in sql:
            return "INSERT 0 1"
        if "UPDATE" in sql:
            return "UPDATE 1"
        if "DELETE" in sql:
            return "DELETE 1"
        return "OK"

    def transaction(self):
        return _TxCtx(self)


class _FakePool:
    def __init__(self, conn: _FakeInputConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def _build_app(pool: _FakePool) -> FastAPI:
    from routes.auth_routes import get_current_user

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _DummyUser()
    app.state.auth_pool = pool
    return app


@pytest.mark.asyncio
async def test_list_banks_empty():
    conn = _FakeInputConn()
    pool = _FakePool(conn)
    app = _build_app(pool)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/input/banks")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_upload_bank():
    conn = _FakeInputConn()
    pool = _FakePool(conn)
    app = _build_app(pool)
    transport = httpx.ASGITransport(app=app)
    payload = {
        "name": "测试题库",
        "questions": [
            {"stem": "1+1=?", "mode": "fill", "acceptedAnswers": ["2"]},
        ],
    }
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/input/banks",
            data={"name": "测试题库", "description": ""},
            files={"file": ("test.json", json.dumps(payload).encode(), "application/json")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["question_count"] == 1


@pytest.mark.asyncio
async def test_submit_fill_correct():
    conn = _FakeInputConn()
    conn._questions = [{
        "id": "q-1",
        "question_id": "q1",
        "question_no": 1,
        "stem": "1+1=?",
        "mode": "fill",
        "input_config": {},
        "accepted_answers": ["2"],
        "match_rule": "exact",
        "case_sensitive": False,
        "rubric": "",
        "reference_answer": "",
        "explanation": "基础加法",
        "sort_order": 1,
    }]
    pool = _FakePool(conn)
    app = _build_app(pool)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/input/submit",
            json={"question_id": "q1", "user_input": "2"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["correct"] is True


@pytest.mark.asyncio
async def test_submit_fill_wrong():
    conn = _FakeInputConn()
    conn._questions = [{
        "id": "q-1",
        "question_id": "q1",
        "question_no": 1,
        "stem": "1+1=?",
        "mode": "fill",
        "input_config": {},
        "accepted_answers": ["2"],
        "match_rule": "exact",
        "case_sensitive": False,
        "rubric": "",
        "reference_answer": "",
        "explanation": "",
        "sort_order": 1,
    }]
    pool = _FakePool(conn)
    app = _build_app(pool)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/input/submit",
            json={"question_id": "q1", "user_input": "3"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["correct"] is False
