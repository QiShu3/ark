
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

# Import the module to be tested
from routes import arxiv_routes
from routes.arxiv_routes import DailyCandidateOut

# Mock user dependency
from routes.auth_routes import get_current_user


@pytest.mark.asyncio
async def test_lazy_generation(monkeypatch):
    # Mock database pool and connection
    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # Mock methods on connection
    mock_conn.fetchrow = AsyncMock()
    mock_conn.execute = AsyncMock()

    # Mock transaction context manager
    mock_transaction_ctx = AsyncMock()
    mock_transaction_ctx.__aenter__.return_value = None
    mock_transaction_ctx.__aexit__.return_value = None
    mock_conn.transaction.return_value = mock_transaction_ctx

    # Mock _pool_from_request to return our mock pool
    monkeypatch.setattr("routes.arxiv_routes._pool_from_request", lambda r: mock_pool)

    # Mock _fetch_daily_candidates
    # First call returns empty list, second call returns a list with one candidate
    async def mock_fetch(conn, user_id, candidate_day):
        if not hasattr(mock_fetch, "called"):
            mock_fetch.called = True
            return []
        return [
            DailyCandidateOut(
                arxiv_id="1234.5678",
                title="Test Paper",
                authors=["Author A"],
                published="2023-01-01",
                summary="Test Summary",
                is_read=False
            )
        ]

    monkeypatch.setattr("routes.arxiv_routes._fetch_daily_candidates", mock_fetch)

    # Mock _refresh_daily_candidates_for_user
    mock_refresh = AsyncMock()
    monkeypatch.setattr("routes.arxiv_routes._refresh_daily_candidates_for_user", mock_refresh)

    # Mock config fetch result
    # We need to mock conn.fetchrow to return a config
    mock_conn.fetchrow.return_value = {
        "user_id": 1,
        "keywords": "test",
        "category": "cs.AI",
        "author": None,
        "limit_count": 10,
        "sort_by": "submitted_date",
        "sort_order": "descending",
        "search_field": "title",
        "update_time": "09:00",
        "updated_at": "2023-01-01",
        "last_run_on": None
    }

    # Setup FastAPI app
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(arxiv_routes.router)
    app.dependency_overrides[get_current_user] = lambda: MagicMock(id=1)
    client = TestClient(app)

    # Make the request
    response = client.get("/api/arxiv/daily/candidates")

    # Assertions
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["arxiv_id"] == "1234.5678"

    # Verify _refresh_daily_candidates_for_user was called
    mock_refresh.assert_called_once()

    # Verify transaction was used
    mock_conn.transaction.assert_called_once()

@pytest.mark.asyncio
async def test_no_lazy_generation_if_no_config(monkeypatch):
    # Mock database pool and connection
    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # Mock methods on connection
    mock_conn.fetchrow = AsyncMock()
    mock_conn.execute = AsyncMock()

    # Mock transaction context manager
    mock_transaction_ctx = AsyncMock()
    mock_transaction_ctx.__aenter__.return_value = None
    mock_transaction_ctx.__aexit__.return_value = None
    mock_conn.transaction.return_value = mock_transaction_ctx

    monkeypatch.setattr("routes.arxiv_routes._pool_from_request", lambda r: mock_pool)

    # Mock _fetch_daily_candidates to always return empty
    monkeypatch.setattr("routes.arxiv_routes._fetch_daily_candidates", AsyncMock(return_value=[]))

    # Mock _refresh_daily_candidates_for_user
    mock_refresh = AsyncMock()
    monkeypatch.setattr("routes.arxiv_routes._refresh_daily_candidates_for_user", mock_refresh)

    # Mock config fetch result to return None
    mock_conn.fetchrow.return_value = None

    # Setup FastAPI app
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(arxiv_routes.router)
    app.dependency_overrides[get_current_user] = lambda: MagicMock(id=1)
    client = TestClient(app)

    # Make the request
    response = client.get("/api/arxiv/daily/candidates")

    # Assertions
    assert response.status_code == 200
    assert response.json() == []

    # Verify _refresh_daily_candidates_for_user was NOT called
    mock_refresh.assert_not_called()
