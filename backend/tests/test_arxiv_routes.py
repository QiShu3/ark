from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

import routes.arxiv_service as arxiv_service
from routes.arxiv_routes import (
    ArxivSearchRequest,
    router,
)
from routes.arxiv_service import _build_query_candidates, parse_daily_time
from routes.auth_routes import get_current_user


@dataclass
class _DummyUser:
    id: int = 7


class _FakeConn:
    def __init__(self) -> None:
        self._rows: dict[tuple[int, str], dict[str, Any]] = {}

    async def fetchrow(self, sql: str, *args: Any) -> dict[str, Any] | None:
        if "INSERT INTO papers" in sql:
            user_id = int(args[0])
            arxiv_id = str(args[1])
            row = {
                "user_id": user_id,
                "arxiv_id": arxiv_id,
                "is_favorite": bool(args[3]),
                "is_read": bool(args[4]),
                "is_skipped": bool(args[5]),
            }
            self._rows[(user_id, arxiv_id)] = row
            return row
        return None

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        user_id = int(args[0])
        rows = [v for (uid, _), v in self._rows.items() if uid == user_id]
        if "is_favorite =" in sql:
            rows = [r for r in rows if r["is_favorite"] == bool(args[1])]
        if "is_read =" in sql:
            idx = 2 if "is_favorite =" in sql else 1
            rows = [r for r in rows if r["is_read"] == bool(args[idx])]
        return rows

    def transaction(self):
        return _TxCtx()

    async def execute(self, sql: str, *args: Any) -> str:
        _ = sql
        _ = args
        return "UPDATE 1"


class _TxCtx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None


class _AcquireCtx:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeConn:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _FakePool:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _DummyUser()
    return app


def _build_query_candidates_wrapper(payload: ArxivSearchRequest) -> list[str]:
    return _build_query_candidates(
        keywords=payload.keywords,
        category=payload.category,
        author=payload.author,
        search_field=payload.search_field,
    )


def test_build_query_candidates_for_single_keyword() -> None:
    payload = ArxivSearchRequest(
        keywords="llm",
        category="cs.CL",
        author="tom",
        limit=5,
        sort_by="submitted_date",
        sort_order="descending",
        search_field="all",
    )
    assert _build_query_candidates_wrapper(payload) == ["all:llm AND cat:cs.CL AND au:tom"]


def test_build_query_candidates_for_title_default() -> None:
    payload = ArxivSearchRequest(
        keywords="llm",
        category="cs.CL",
        author="tom",
        limit=5,
        sort_by="submitted_date",
        sort_order="descending",
    )
    assert _build_query_candidates_wrapper(payload) == ["ti:llm AND cat:cs.CL AND au:tom"]


def test_build_query_candidates_for_phrase_keyword() -> None:
    payload = ArxivSearchRequest(
        keywords="Attention Is All You Need",
        category="cs.CL",
        author="",
        limit=5,
        sort_by="submitted_date",
        sort_order="descending",
        search_field="all",
    )
    assert _build_query_candidates_wrapper(payload) == [
        'ti:"Attention Is All You Need" AND cat:cs.CL',
        'all:"Attention Is All You Need" AND cat:cs.CL',
        "all:Attention Is All You Need AND cat:cs.CL",
    ]


def test_build_query_candidates_for_summary() -> None:
    payload = ArxivSearchRequest(
        keywords="diffusion",
        category="cs.CV",
        limit=5,
        search_field="summary",
    )
    assert _build_query_candidates_wrapper(payload) == ["abs:diffusion AND cat:cs.CV"]


def test_build_query_candidates_for_title_phrase() -> None:
    payload = ArxivSearchRequest(
        keywords="foo bar",
        search_field="title",
    )
    assert _build_query_candidates_wrapper(payload) == [
        'ti:"foo bar"',
        "ti:foo bar",
    ]


def test_search_endpoint_returns_mapped_results(monkeypatch) -> None:
    async def _fake_search(**kwargs) -> list[dict[str, Any]]:
        return [
            {
                "arxiv_id": "2501.00001",
                "title": "Paper A",
                "authors": ["Alice", "Bob"],
                "published": datetime(2026, 1, 1, tzinfo=UTC).isoformat(),
                "summary": "Summary",
            }
        ]

    monkeypatch.setattr("routes.arxiv_routes.search_arxiv_papers", _fake_search)
    app = _build_app()
    client = TestClient(app)
    resp = client.post(
        "/api/arxiv/search",
        json={
            "keywords": "llm",
            "limit": 1,
            "sort_by": "submitted_date",
            "sort_order": "descending",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["arxiv_id"] == "2501.00001"


def test_state_upsert_and_list_flow(monkeypatch) -> None:
    conn = _FakeConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.arxiv_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    upsert_resp = client.put(
        "/api/arxiv/papers/state",
        json={
            "arxiv_id": "2501.00001",
            "is_favorite": True,
            "is_read": False,
            "is_skipped": True,
        },
    )
    assert upsert_resp.status_code == 200
    assert upsert_resp.json()["is_favorite"] is True
    assert upsert_resp.json()["is_skipped"] is True

    list_resp = client.get("/api/arxiv/papers")
    assert list_resp.status_code == 200
    rows = list_resp.json()
    assert len(rows) == 1
    assert rows[0]["arxiv_id"] == "2501.00001"
    assert rows[0]["is_skipped"] is True


def test_arxiv_health_smoke() -> None:
    app = _build_app()
    client = TestClient(app)
    resp = client.get("/api/arxiv/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_search_uses_stale_cache_when_429(monkeypatch) -> None:
    payload = ArxivSearchRequest(
        keywords="llm",
        category="cs.CL",
        author="",
        limit=1,
        sort_by="submitted_date",
        sort_order="descending",
    )
    key = arxiv_service._search_cache_key(
        keywords=payload.keywords,
        category=payload.category,
        author=payload.author,
        limit=payload.limit,
        offset=payload.offset,
        sort_by=payload.sort_by,
        sort_order=payload.sort_order,
    )
    arxiv_service._SEARCH_CACHE.clear()
    arxiv_service._cache_set(
        key,
        [
            {
                "arxiv_id": "2501.00001",
                "title": "Cached",
                "authors": ["Alice"],
                "published": datetime(2026, 1, 1, tzinfo=UTC).isoformat(),
                "summary": "cached summary",
            }
        ],
    )

    def _raise_429(**kwargs) -> list[dict[str, Any]]:
        raise RuntimeError("Page request resulted in HTTP 429")

    monkeypatch.setattr("routes.arxiv_service._search_sync", _raise_429)
    result = TestClient(_build_app()).post(
        "/api/arxiv/search",
        json={
            "keywords": "llm",
            "category": "cs.CL",
            "author": "",
            "limit": 1,
            "sort_by": "submitted_date",
            "sort_order": "descending",
        },
    )
    assert result.status_code == 200
    body = result.json()
    assert len(body) == 1
    assert body[0]["title"] == "Cached"


def test_refresh_daily_candidates_filters_skipped(monkeypatch) -> None:
    class _RefreshConn:
        def __init__(self) -> None:
            self.inserted_ids: list[str] = []

        async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
            _ = args
            if "FROM papers" in sql:
                return [{"arxiv_id": "2501.00002"}]
            return []

        async def execute(self, sql: str, *args: Any) -> str:
            if "INSERT INTO arxiv_daily_candidates" in sql:
                self.inserted_ids.append(str(args[2]))
            return "OK"

    async def _fake_search(**kwargs) -> list[dict[str, Any]]:
        return [
            {
                "arxiv_id": "2501.00001",
                "title": "A",
                "authors": ["Alice"],
                "published": datetime(2026, 1, 1, tzinfo=UTC).isoformat(),
                "summary": "s1",
            },
            {
                "arxiv_id": "2501.00002",
                "title": "B",
                "authors": ["Bob"],
                "published": datetime(2026, 1, 2, tzinfo=UTC).isoformat(),
                "summary": "s2",
            },
        ]

    monkeypatch.setattr("routes.arxiv_service.search_arxiv_papers", _fake_search)
    conn = _RefreshConn()
    config_row = {
        "keywords": "llm",
        "category": None,
        "author": None,
        "limit_count": 1,
        "sort_by": "submitted_date",
        "sort_order": "descending",
        "search_field": "title",
    }
    result = asyncio.run(
        arxiv_service.refresh_daily_candidates_for_user(
            conn,
            user_id=7,
            candidate_day=date(2026, 3, 13),
            config_row=config_row,
        )
    )
    assert len(result) == 1
    assert result[0]["arxiv_id"] == "2501.00001"
    assert conn.inserted_ids == ["2501.00001"]


def test_search_429_without_cache_returns_429(monkeypatch) -> None:
    arxiv_service._SEARCH_CACHE.clear()

    async def _raise_429(**kwargs) -> list[dict[str, Any]]:
        from fastapi import HTTPException

        raise HTTPException(status_code=429, detail="ArXiv 当前限流，请 30-60 秒后重试")

    monkeypatch.setattr("routes.arxiv_routes.search_arxiv_papers", _raise_429)
    resp = TestClient(_build_app()).post(
        "/api/arxiv/search",
        json={
            "keywords": "llm",
            "limit": 1,
            "sort_by": "submitted_date",
            "sort_order": "descending",
        },
    )
    assert resp.status_code == 429
    assert "限流" in (resp.json() or {}).get("detail", "")


def test_parse_daily_time_success() -> None:
    parsed = parse_daily_time("09:30")
    assert parsed.hour == 9
    assert parsed.minute == 30


def test_prepare_daily_tasks_action_returns_confirm_payload() -> None:
    app = _build_app()
    client = TestClient(app)
    resp = client.post(
        "/api/arxiv/daily/tasks/prepare",
        json={"arxiv_ids": ["2501.00001", "2501.00002"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["action"] == "confirm"
    assert body["operation"] == "daily_batch_create_tasks"
    assert body["request"]["url"] == "/api/arxiv/daily/tasks/commit"
