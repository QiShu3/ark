import random
import string
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import app
from routes.arxiv_routes import ArxivPaperOut
import routes.arxiv_routes as arxiv_routes


class _FakeConn:
    def __init__(self) -> None:
        self._rows: dict[tuple[int, str], dict[str, object]] = {}

    async def fetchrow(self, sql: str, *args):
        if "INSERT INTO papers" not in sql:
            return None
        user_id = int(args[0])
        arxiv_id = str(args[1])
        row = {
            "user_id": user_id,
            "arxiv_id": arxiv_id,
            "is_favorite": bool(args[2]),
            "is_read": bool(args[3]),
        }
        self._rows[(user_id, arxiv_id)] = row
        return row

    async def fetch(self, sql: str, *args):
        user_id = int(args[0])
        rows = [row for (uid, _), row in self._rows.items() if uid == user_id]
        if "is_favorite =" in sql:
            rows = [row for row in rows if row["is_favorite"] == bool(args[1])]
        if "is_read =" in sql:
            idx = 2 if "is_favorite =" in sql else 1
            rows = [row for row in rows if row["is_read"] == bool(args[idx])]
        return rows


class _AcquireCtx:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, exc_type, exc, tb):
        return None


class _FakePool:
    def __init__(self) -> None:
        self._conn = _FakeConn()

    def acquire(self):
        return _AcquireCtx(self._conn)


def _rand_username(prefix: str = "u") -> str:
    return prefix + "".join(random.choices(string.ascii_lowercase + string.digits, k=10))


def _run() -> int:
    username = _rand_username()
    password = "P@ssw0rd!" + "".join(random.choices(string.ascii_letters, k=8))

    async def _fake_search(_):
        return [
            ArxivPaperOut(
                arxiv_id="2501.00001",
                title="Paper A",
                authors=["Alice", "Bob"],
                published=datetime(2026, 1, 1, tzinfo=timezone.utc).isoformat(),
                summary="Summary",
            )
        ]

    original_search = arxiv_routes._search_arxiv
    original_pool_from_request = arxiv_routes._pool_from_request
    arxiv_routes._search_arxiv = _fake_search
    fake_pool = _FakePool()
    arxiv_routes._pool_from_request = lambda _: fake_pool
    try:
        with TestClient(app) as c:
            r = c.post("/auth/register", json={"username": username, "password": password})
            if r.status_code != 200:
                print("register failed:", r.status_code, r.text)
                return 1

            r = c.post("/auth/login", json={"username": username, "password": password})
            if r.status_code != 200:
                print("login failed:", r.status_code, r.text)
                return 1
            token = (r.json() or {}).get("access_token")
            if not token:
                print("missing token:", r.text)
                return 1

            headers = {"Authorization": f"Bearer {token}"}

            r = c.get("/arxiv/health")
            if r.status_code != 200:
                print("arxiv health failed:", r.status_code, r.text)
                return 1

            r = c.post(
                "/arxiv/search",
                headers=headers,
                json={"keywords": "llm", "limit": 1, "sort_by": "submitted_date", "sort_order": "descending"},
            )
            if r.status_code != 200:
                print("arxiv search failed:", r.status_code, r.text)
                return 1
            papers = r.json() or []
            if not papers or papers[0].get("arxiv_id") != "2501.00001":
                print("unexpected search payload:", r.text)
                return 1

            r = c.put(
                "/arxiv/papers/state",
                headers=headers,
                json={"arxiv_id": "2501.00001", "is_favorite": True, "is_read": False},
            )
            if r.status_code != 200:
                print("upsert state failed:", r.status_code, r.text)
                return 1

            r = c.get("/arxiv/papers", headers=headers)
            if r.status_code != 200:
                print("list papers failed:", r.status_code, r.text)
                return 1
            rows = r.json() or []
            if not rows or rows[0].get("arxiv_id") != "2501.00001":
                print("unexpected papers list:", r.text)
                return 1

            r = c.get("/arxiv/papers", headers=headers, params={"is_favorite": "true"})
            if r.status_code != 200:
                print("list papers with filter failed:", r.status_code, r.text)
                return 1
            rows = r.json() or []
            if not rows:
                print("favorite filter returned empty:", r.text)
                return 1

            print("ok")
            return 0
    finally:
        arxiv_routes._search_arxiv = original_search
        arxiv_routes._pool_from_request = original_pool_from_request


if __name__ == "__main__":
    raise SystemExit(_run())
