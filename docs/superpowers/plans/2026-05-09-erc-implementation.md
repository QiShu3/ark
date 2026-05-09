# ERC 阅读训练 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first multi-user ERC 阅读训练 product loop: import static reading-comprehension JSON, browse articles, practice a full article, generate user question cards, review due questions, and inspect mistakes.

**Architecture:** Add a new `routes/erc` backend domain that mirrors the existing `routes/vocab` layering: importer, repository, service, schemas, and routes. Add a frontend `ERC` namespace with API/types/hooks/pages that mirrors the existing Vocab product structure while keeping reading-specific article/question UX separate.

**Tech Stack:** FastAPI, asyncpg, Pydantic, fsrs Python package, PostgreSQL, React, TypeScript, Vite, Vitest, Testing Library.

---

## File Structure

Create backend files:

- `backend/routes/erc/__init__.py`: exports router and `init_erc`.
- `backend/routes/erc/importer.py`: parses and validates one-article JSON files into typed seed objects.
- `backend/routes/erc/repository.py`: owns table creation and SQL persistence/query helpers.
- `backend/routes/erc/service.py`: owns product logic: overview, lists, article detail, practice submit, review submit, mistakes.
- `backend/routes/erc/schemas.py`: Pydantic request/response models for `/api/erc`.
- `backend/routes/erc/routes.py`: FastAPI routes and auth dependency wiring.
- `backend/scripts/import_erc.py`: CLI script to import a directory of ERC JSON files.
- `backend/tests/test_erc_importer.py`: importer parsing and validation tests.
- `backend/tests/test_erc_routes.py`: route contract tests with monkeypatched services.
- `backend/tests/test_erc_service.py`: pure service helper tests for rating, FSRS fallback shape, and selection rules where possible.

Modify backend files:

- `backend/main.py`: initialize ERC and include ERC router.

Create frontend files:

- `frontend/src/lib/erc/types.ts`: shared ERC TypeScript types.
- `frontend/src/lib/erc/api.ts`: API client functions for `/api/erc`.
- `frontend/src/hooks/erc/useERCOverview.ts`: home summary data hook.
- `frontend/src/hooks/erc/useERCArticle.ts`: article detail and practice submission hook.
- `frontend/src/hooks/erc/useERCReview.ts`: single-card review hook.
- `frontend/src/pages/ERC/Home.tsx`: reading training dashboard.
- `frontend/src/pages/ERC/Library.tsx`: article library.
- `frontend/src/pages/ERC/Practice.tsx`: full-article practice page.
- `frontend/src/pages/ERC/PracticeResult.tsx`: result view using navigation state.
- `frontend/src/pages/ERC/Review.tsx`: due single-question review page.
- `frontend/src/pages/ERC/Mistakes.tsx`: mistake list grouped by article.
- `frontend/src/pages/ERC/__tests__/Home.test.tsx`: home rendering test.
- `frontend/src/pages/ERC/__tests__/Practice.test.tsx`: unanswered-question validation and submit flow test.
- `frontend/src/pages/ERC/__tests__/Review.test.tsx`: no-due and review-card states.

Modify frontend files:

- `frontend/src/main.tsx`: add authenticated routes for ERC pages.
- `frontend/src/pages/AppCenter.tsx`: add a 阅读训练 app entry if the page uses explicit app cards.

---

### Task 1: Backend Importer

**Files:**
- Create: `backend/routes/erc/importer.py`
- Test: `backend/tests/test_erc_importer.py`

- [ ] **Step 1: Write failing importer tests**

Create `backend/tests/test_erc_importer.py` with:

```python
from __future__ import annotations

import pytest

from routes.erc.importer import ERCArticleSeed, parse_article_payload


def _payload() -> dict:
    return {
        "article_id": "kaoyan2_2025_text1",
        "exam": "考研英语二",
        "year": 2025,
        "text_no": 1,
        "title": "",
        "content": [
            {"paragraph_no": 1, "text": "Paragraph one."},
            {"paragraph_no": 2, "text": "Paragraph two."},
        ],
        "questions": [
            {
                "question_id": "kaoyan2_2025_text1_q21",
                "question_no": 21,
                "stem": "According to Paragraph 1, ...",
                "options": {"A": "Alpha", "B": "Beta", "C": "Gamma", "D": "Delta"},
                "answer": "B",
                "evidence": {"paragraphs": [], "text": ""},
                "explanation": "",
                "question_type": "",
            }
        ],
    }


def test_parse_article_payload_extracts_article_paragraphs_and_questions() -> None:
    seed = parse_article_payload(_payload(), source_name="kaoyan2_2025_text1.json", sort_order=7)

    assert isinstance(seed, ERCArticleSeed)
    assert seed.article_id == "kaoyan2_2025_text1"
    assert seed.exam == "考研英语二"
    assert seed.year == 2025
    assert seed.text_no == 1
    assert seed.sort_order == 7
    assert seed.paragraphs[0].paragraph_no == 1
    assert seed.questions[0].question_id == "kaoyan2_2025_text1_q21"
    assert seed.questions[0].answer == "B"


def test_parse_article_payload_rejects_invalid_answer() -> None:
    payload = _payload()
    payload["questions"][0]["answer"] = "E"

    with pytest.raises(ValueError, match="answer"):
        parse_article_payload(payload, source_name="bad.json", sort_order=1)


def test_parse_article_payload_rejects_filename_article_mismatch() -> None:
    with pytest.raises(ValueError, match="filename"):
        parse_article_payload(_payload(), source_name="kaoyan2_2025_text2.json", sort_order=1)
```

- [ ] **Step 2: Run importer tests and verify RED**

Run:

```bash
cd backend
uv run pytest tests/test_erc_importer.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'routes.erc'`.

- [ ] **Step 3: Implement importer**

Create `backend/routes/erc/importer.py` with dataclasses:

```python
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ERCParagraphSeed:
    paragraph_no: int
    text: str


@dataclass(frozen=True)
class ERCQuestionSeed:
    question_id: str
    question_no: int
    stem: str
    options: dict[str, str]
    answer: str
    evidence: dict[str, Any]
    explanation: str
    question_type: str
    sort_order: int


@dataclass(frozen=True)
class ERCArticleSeed:
    article_id: str
    exam: str
    year: int
    text_no: int
    title: str
    sort_order: int
    paragraphs: list[ERCParagraphSeed]
    questions: list[ERCQuestionSeed]


def _require_text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be a non-empty string")
    return value.strip()


def parse_article_payload(payload: dict[str, Any], *, source_name: str, sort_order: int) -> ERCArticleSeed:
    article_id = _require_text(payload, "article_id")
    expected_name = f"{article_id}.json"
    if source_name != expected_name:
        raise ValueError(f"filename {source_name} does not match article_id {article_id}")

    content = payload.get("content")
    if not isinstance(content, list) or not content:
        raise ValueError("content must be a non-empty list")
    paragraphs = [
        ERCParagraphSeed(paragraph_no=int(item["paragraph_no"]), text=_require_text(item, "text"))
        for item in content
    ]

    questions_payload = payload.get("questions")
    if not isinstance(questions_payload, list) or not questions_payload:
        raise ValueError("questions must be a non-empty list")

    questions: list[ERCQuestionSeed] = []
    seen_question_ids: set[str] = set()
    for index, item in enumerate(questions_payload, start=1):
        question_id = _require_text(item, "question_id")
        if question_id in seen_question_ids:
            raise ValueError(f"duplicate question_id {question_id}")
        seen_question_ids.add(question_id)
        options = item.get("options")
        if not isinstance(options, dict):
            raise ValueError(f"{question_id} options must be an object")
        normalized_options = {key: _require_text(options, key) for key in ("A", "B", "C", "D")}
        answer = _require_text(item, "answer")
        if answer not in normalized_options:
            raise ValueError(f"{question_id} answer must be one of A/B/C/D")
        evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {"paragraphs": [], "text": ""}
        questions.append(
            ERCQuestionSeed(
                question_id=question_id,
                question_no=int(item["question_no"]),
                stem=_require_text(item, "stem"),
                options=normalized_options,
                answer=answer,
                evidence=evidence,
                explanation=str(item.get("explanation") or ""),
                question_type=str(item.get("question_type") or ""),
                sort_order=index,
            )
        )

    return ERCArticleSeed(
        article_id=article_id,
        exam=_require_text(payload, "exam"),
        year=int(payload["year"]),
        text_no=int(payload["text_no"]),
        title=str(payload.get("title") or ""),
        sort_order=sort_order,
        paragraphs=paragraphs,
        questions=questions,
    )


def load_article_seeds(directory: Path) -> list[ERCArticleSeed]:
    files = sorted(directory.glob("*.json"))
    seeds: list[ERCArticleSeed] = []
    seen_article_ids: set[str] = set()
    for sort_order, file_path in enumerate(files, start=1):
        payload = json.loads(file_path.read_text(encoding="utf-8"))
        seed = parse_article_payload(payload, source_name=file_path.name, sort_order=sort_order)
        if seed.article_id in seen_article_ids:
            raise ValueError(f"duplicate article_id {seed.article_id}")
        seen_article_ids.add(seed.article_id)
        seeds.append(seed)
    return seeds
```

- [ ] **Step 4: Run importer tests and verify GREEN**

Run:

```bash
cd backend
uv run pytest tests/test_erc_importer.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/erc/importer.py backend/tests/test_erc_importer.py
git commit -m "feat(backend): add erc json importer"
```

---

### Task 2: Backend Tables and Import Script

**Files:**
- Create: `backend/routes/erc/repository.py`
- Create: `backend/routes/erc/__init__.py`
- Create: `backend/scripts/import_erc.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_erc_importer.py`

- [ ] **Step 1: Add failing test for load directory uniqueness**

Append to `backend/tests/test_erc_importer.py`:

```python
import json

from routes.erc.importer import load_article_seeds


def test_load_article_seeds_reads_sorted_json_files(tmp_path) -> None:
    first = _payload()
    second = _payload()
    second["article_id"] = "kaoyan2_2025_text2"
    second["text_no"] = 2
    second["questions"][0]["question_id"] = "kaoyan2_2025_text2_q26"
    (tmp_path / "kaoyan2_2025_text2.json").write_text(json.dumps(second), encoding="utf-8")
    (tmp_path / "kaoyan2_2025_text1.json").write_text(json.dumps(first), encoding="utf-8")

    seeds = load_article_seeds(tmp_path)

    assert [seed.article_id for seed in seeds] == ["kaoyan2_2025_text1", "kaoyan2_2025_text2"]
    assert [seed.sort_order for seed in seeds] == [1, 2]
```

- [ ] **Step 2: Run targeted test and verify RED/GREEN**

Run:

```bash
cd backend
uv run pytest tests/test_erc_importer.py -q
```

Expected: PASS if Task 1 already implemented `load_article_seeds`; if not, FAIL first, then complete Task 1 implementation.

- [ ] **Step 3: Implement repository tables and seed upsert helpers**

Create `backend/routes/erc/repository.py` with:

```python
from __future__ import annotations

import json
from typing import Any

import asyncpg

from .importer import ERCArticleSeed


async def init_erc(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 ERC 表")
    await init_tables(pool)


async def init_tables(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_sets (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              key TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL,
              description TEXT NOT NULL DEFAULT '',
              exam TEXT NOT NULL DEFAULT '',
              source_version TEXT NOT NULL DEFAULT '',
              article_count INTEGER NOT NULL DEFAULT 0,
              question_count INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_articles (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              set_id UUID NOT NULL REFERENCES erc_sets(id) ON DELETE CASCADE,
              article_id TEXT NOT NULL UNIQUE,
              exam TEXT NOT NULL,
              year INTEGER NOT NULL,
              text_no INTEGER NOT NULL,
              title TEXT NOT NULL DEFAULT '',
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_paragraphs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              article_pk UUID NOT NULL REFERENCES erc_articles(id) ON DELETE CASCADE,
              paragraph_no INTEGER NOT NULL,
              text TEXT NOT NULL,
              UNIQUE(article_pk, paragraph_no)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_questions (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              article_pk UUID NOT NULL REFERENCES erc_articles(id) ON DELETE CASCADE,
              question_id TEXT NOT NULL UNIQUE,
              question_no INTEGER NOT NULL,
              stem TEXT NOT NULL,
              options_json JSONB NOT NULL,
              answer TEXT NOT NULL,
              evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              explanation TEXT NOT NULL DEFAULT '',
              question_type TEXT NOT NULL DEFAULT '',
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_user_article_attempts (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              article_pk UUID NOT NULL REFERENCES erc_articles(id) ON DELETE CASCADE,
              correct_count INTEGER NOT NULL,
              question_count INTEGER NOT NULL,
              time_spent_ms INTEGER NULL,
              started_at TIMESTAMPTZ NULL,
              submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_user_question_cards (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              question_pk UUID NOT NULL REFERENCES erc_questions(id) ON DELETE CASCADE,
              due_at TIMESTAMPTZ NULL,
              fsrs_card_json JSONB NULL,
              wrong_count INTEGER NOT NULL DEFAULT 0,
              right_count INTEGER NOT NULL DEFAULT 0,
              lapse_count INTEGER NOT NULL DEFAULT 0,
              last_review_at TIMESTAMPTZ NULL,
              last_answer_correct BOOLEAN NULL,
              last_chosen_option TEXT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(user_id, question_pk)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_review_logs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              article_pk UUID NOT NULL REFERENCES erc_articles(id) ON DELETE CASCADE,
              question_pk UUID NOT NULL REFERENCES erc_questions(id) ON DELETE CASCADE,
              attempt_id UUID NULL REFERENCES erc_user_article_attempts(id) ON DELETE SET NULL,
              mode TEXT NOT NULL,
              chosen_option TEXT NOT NULL,
              correct_option TEXT NOT NULL,
              is_correct BOOLEAN NOT NULL,
              rating TEXT NOT NULL,
              time_spent_ms INTEGER NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_mistake_bucket (
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              article_pk UUID NOT NULL REFERENCES erc_articles(id) ON DELETE CASCADE,
              question_pk UUID NOT NULL REFERENCES erc_questions(id) ON DELETE CASCADE,
              wrong_count INTEGER NOT NULL DEFAULT 0,
              last_wrong_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              is_active BOOLEAN NOT NULL DEFAULT TRUE,
              PRIMARY KEY (user_id, question_pk)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS erc_user_settings (
              user_id BIGINT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
              daily_review_target INTEGER NOT NULL DEFAULT 20,
              same_article_cooldown_hours INTEGER NOT NULL DEFAULT 24,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_erc_articles_set_sort ON erc_articles(set_id, sort_order);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_erc_cards_due ON erc_user_question_cards(user_id, due_at);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_erc_logs_user_created ON erc_review_logs(user_id, created_at DESC);")


def _json_param(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


async def upsert_set(conn: asyncpg.Connection, *, key: str, name: str, description: str, exam: str, source_version: str) -> str:
    row = await conn.fetchrow(
        """
        INSERT INTO erc_sets(key, name, description, exam, source_version)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (key) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            exam = EXCLUDED.exam,
            source_version = EXCLUDED.source_version,
            updated_at = NOW()
        RETURNING id::text
        """,
        key,
        name,
        description,
        exam,
        source_version,
    )
    return str(row["id"])


async def upsert_article_seed(conn: asyncpg.Connection, *, set_id: str, seed: ERCArticleSeed) -> None:
    article_row = await conn.fetchrow(
        """
        INSERT INTO erc_articles(set_id, article_id, exam, year, text_no, title, sort_order)
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (article_id) DO UPDATE
        SET set_id = EXCLUDED.set_id,
            exam = EXCLUDED.exam,
            year = EXCLUDED.year,
            text_no = EXCLUDED.text_no,
            title = EXCLUDED.title,
            sort_order = EXCLUDED.sort_order,
            updated_at = NOW()
        RETURNING id::text
        """,
        set_id,
        seed.article_id,
        seed.exam,
        seed.year,
        seed.text_no,
        seed.title,
        seed.sort_order,
    )
    article_pk = str(article_row["id"])
    await conn.execute("DELETE FROM erc_paragraphs WHERE article_pk = $1::uuid", article_pk)
    for paragraph in seed.paragraphs:
        await conn.execute(
            "INSERT INTO erc_paragraphs(article_pk, paragraph_no, text) VALUES ($1::uuid, $2, $3)",
            article_pk,
            paragraph.paragraph_no,
            paragraph.text,
        )
    for question in seed.questions:
        await conn.execute(
            """
            INSERT INTO erc_questions(
              article_pk, question_id, question_no, stem, options_json, answer,
              evidence_json, explanation, question_type, sort_order
            )
            VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10)
            ON CONFLICT (question_id) DO UPDATE
            SET article_pk = EXCLUDED.article_pk,
                question_no = EXCLUDED.question_no,
                stem = EXCLUDED.stem,
                options_json = EXCLUDED.options_json,
                answer = EXCLUDED.answer,
                evidence_json = EXCLUDED.evidence_json,
                explanation = EXCLUDED.explanation,
                question_type = EXCLUDED.question_type,
                sort_order = EXCLUDED.sort_order,
                updated_at = NOW()
            """,
            article_pk,
            question.question_id,
            question.question_no,
            question.stem,
            _json_param(question.options),
            question.answer,
            _json_param(question.evidence),
            question.explanation,
            question.question_type,
            question.sort_order,
        )


async def refresh_set_counts(conn: asyncpg.Connection, *, set_id: str) -> None:
    await conn.execute(
        """
        UPDATE erc_sets
        SET article_count = (
              SELECT COUNT(*) FROM erc_articles WHERE set_id = $1::uuid
            ),
            question_count = (
              SELECT COUNT(*)
              FROM erc_questions q
              JOIN erc_articles a ON a.id = q.article_pk
              WHERE a.set_id = $1::uuid
            ),
            updated_at = NOW()
        WHERE id = $1::uuid
        """,
        set_id,
    )
```

- [ ] **Step 4: Export ERC module and wire app lifespan**

Create `backend/routes/erc/__init__.py`:

```python
from .repository import init_erc
from .routes import router

__all__ = ["init_erc", "router"]
```

Modify `backend/main.py`:

```python
from routes.erc import init_erc
from routes.erc import router as erc_router
```

Call `await init_erc(app)` after `await init_vocab(app)` and include `app.include_router(erc_router)` after `app.include_router(vocab_router)`.

- [ ] **Step 5: Add import script**

Create `backend/scripts/import_erc.py`:

```python
from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from routes.auth_routes import _database_url
from routes.erc.importer import load_article_seeds
from routes.erc.repository import init_tables, refresh_set_counts, upsert_article_seed, upsert_set

import asyncpg


async def _run(args: argparse.Namespace) -> None:
    pool = await asyncpg.create_pool(dsn=_database_url(), min_size=1, max_size=2, command_timeout=60)
    try:
        await init_tables(pool)
        seeds = load_article_seeds(Path(args.directory))
        async with pool.acquire() as conn:
            async with conn.transaction():
                set_id = await upsert_set(
                    conn,
                    key=args.set_key,
                    name=args.name,
                    description=args.description,
                    exam=args.exam,
                    source_version=args.source_version,
                )
                for seed in seeds:
                    await upsert_article_seed(conn, set_id=set_id, seed=seed)
                await refresh_set_counts(conn, set_id=set_id)
        print(f"Imported {len(seeds)} ERC articles into {args.set_key}")
    finally:
        await pool.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    parser.add_argument("--set-key", default="kaoyan2_2020_2025")
    parser.add_argument("--name", default="考研英语二 2020-2025")
    parser.add_argument("--description", default="考研英语二阅读理解真题 2020-2025")
    parser.add_argument("--exam", default="考研英语二")
    parser.add_argument("--source-version", default="2026-05-09")
    asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Run backend checks**

Run:

```bash
cd backend
uv run pytest tests/test_erc_importer.py -q
uv run ruff check routes/erc scripts/import_erc.py tests/test_erc_importer.py
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/erc backend/scripts/import_erc.py backend/main.py backend/tests/test_erc_importer.py
git commit -m "feat(backend): add erc database import flow"
```

---

### Task 3: Backend Schemas and Routes

**Files:**
- Create: `backend/routes/erc/schemas.py`
- Create: `backend/routes/erc/routes.py`
- Test: `backend/tests/test_erc_routes.py`

- [ ] **Step 1: Write route contract tests**

Create `backend/tests/test_erc_routes.py` with tests matching the Vocab route style:

```python
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
```

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
cd backend
uv run pytest tests/test_erc_routes.py -q
```

Expected: FAIL with missing `routes.erc.routes` or missing schemas.

- [ ] **Step 3: Implement schemas**

Create `backend/routes/erc/schemas.py` with Pydantic models for:

```python
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ERCSetOut(BaseModel):
    id: str
    key: str
    name: str
    description: str
    exam: str
    article_count: int
    question_count: int


class ERCOverviewArticleOut(BaseModel):
    article_id: str
    year: int
    text_no: int
    title: str


class ERCOverviewOut(BaseModel):
    due_review_count: int
    practiced_article_count: int
    practiced_question_count: int
    accuracy: float
    mistake_count: int
    recommended_article: ERCOverviewArticleOut | None = None


class ERCArticleListItemOut(BaseModel):
    article_id: str
    set_id: str
    year: int
    text_no: int
    title: str
    status: Literal["unstarted", "practiced", "has_due_review"]
    question_count: int
    mistake_count: int
    last_attempt_at: datetime | None = None


class ERCParagraphOut(BaseModel):
    paragraph_no: int
    text: str


class ERCQuestionOut(BaseModel):
    question_id: str
    question_no: int
    stem: str
    options: dict[str, str]
    answer: str | None = None


class ERCArticleDetailOut(BaseModel):
    article_id: str
    set_id: str
    exam: str
    year: int
    text_no: int
    title: str
    paragraphs: list[ERCParagraphOut]
    questions: list[ERCQuestionOut]
    last_attempt_at: datetime | None = None


class ERCAnswerIn(BaseModel):
    question_id: str
    chosen_option: Literal["A", "B", "C", "D"]
    time_spent_ms: int | None = Field(default=None, ge=0)


class ERCArticleSubmitIn(BaseModel):
    answers: list[ERCAnswerIn]
    time_spent_ms: int | None = Field(default=None, ge=0)
    started_at: datetime | None = None


class ERCArticleSubmitItemOut(BaseModel):
    question_id: str
    question_no: int
    chosen_option: str
    correct_option: str
    is_correct: bool
    rating: Literal["again", "hard", "good", "easy"]
    next_review_at: datetime | None = None
    entered_mistakes: bool


class ERCArticleSubmitOut(BaseModel):
    attempt_id: str
    article_id: str
    correct_count: int
    question_count: int
    items: list[ERCArticleSubmitItemOut]


class ERCReviewNextOut(BaseModel):
    has_item: bool
    next_due_at: datetime | None = None
    article: ERCOverviewArticleOut | None = None
    paragraphs: list[ERCParagraphOut] = []
    question: ERCQuestionOut | None = None


class ERCReviewSubmitIn(BaseModel):
    question_id: str
    chosen_option: Literal["A", "B", "C", "D"]
    time_spent_ms: int | None = Field(default=None, ge=0)


class ERCReviewSubmitOut(BaseModel):
    question_id: str
    chosen_option: str
    correct_option: str
    is_correct: bool
    rating: Literal["again", "hard", "good", "easy"]
    next_review_at: datetime | None = None


class ERCMistakeItemOut(BaseModel):
    article_id: str
    year: int
    text_no: int
    question_id: str
    question_no: int
    stem: str
    correct_option: str
    last_chosen_option: str | None = None
    wrong_count: int
    last_wrong_at: datetime
    is_due: bool
```

- [ ] **Step 4: Implement routes**

Create `backend/routes/erc/routes.py` that mirrors Vocab route dependency style:

```python
from __future__ import annotations

from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from routes.auth_routes import get_current_user

from .schemas import (
    ERCArticleDetailOut,
    ERCArticleListItemOut,
    ERCArticleSubmitIn,
    ERCArticleSubmitOut,
    ERCMistakeItemOut,
    ERCOverviewOut,
    ERCReviewNextOut,
    ERCReviewSubmitIn,
    ERCReviewSubmitOut,
    ERCSetOut,
)
from .service import (
    get_article_detail,
    get_next_review,
    get_overview,
    list_articles,
    list_mistakes,
    list_sets,
    submit_article_practice,
    submit_review,
)

router = APIRouter(prefix="/api/erc", tags=["erc"])


def _pool_from_request(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return pool


@router.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@router.get("/overview", response_model=ERCOverviewOut)
async def route_get_overview(request: Request, user: Annotated[Any, Depends(get_current_user)]) -> ERCOverviewOut:
    return ERCOverviewOut(**await get_overview(_pool_from_request(request), user_id=int(user.id)))


@router.get("/sets", response_model=list[ERCSetOut])
async def route_list_sets(request: Request, user: Annotated[Any, Depends(get_current_user)]) -> list[ERCSetOut]:
    _ = user
    return [ERCSetOut(**item) for item in await list_sets(_pool_from_request(request))]


@router.get("/articles", response_model=list[ERCArticleListItemOut])
async def route_list_articles(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
) -> list[ERCArticleListItemOut]:
    rows = await list_articles(_pool_from_request(request), user_id=int(user.id), set_id=set_id)
    return [ERCArticleListItemOut(**item) for item in rows]


@router.get("/articles/{article_id}", response_model=ERCArticleDetailOut)
async def route_get_article_detail(
    request: Request,
    article_id: str,
    user: Annotated[Any, Depends(get_current_user)],
) -> ERCArticleDetailOut:
    return ERCArticleDetailOut(**await get_article_detail(_pool_from_request(request), user_id=int(user.id), article_id=article_id))


@router.post("/articles/{article_id}/submit", response_model=ERCArticleSubmitOut)
async def route_submit_article(
    article_id: str,
    payload: ERCArticleSubmitIn,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> ERCArticleSubmitOut:
    result = await submit_article_practice(
        _pool_from_request(request),
        user_id=int(user.id),
        article_id=article_id,
        answers=[item.model_dump() for item in payload.answers],
        time_spent_ms=payload.time_spent_ms,
        started_at=payload.started_at,
    )
    return ERCArticleSubmitOut(**result)


@router.get("/review/next", response_model=ERCReviewNextOut)
async def route_get_next_review(request: Request, user: Annotated[Any, Depends(get_current_user)]) -> ERCReviewNextOut:
    return ERCReviewNextOut(**await get_next_review(_pool_from_request(request), user_id=int(user.id)))


@router.post("/review/submit", response_model=ERCReviewSubmitOut)
async def route_submit_review(
    payload: ERCReviewSubmitIn,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> ERCReviewSubmitOut:
    return ERCReviewSubmitOut(
        **await submit_review(
            _pool_from_request(request),
            user_id=int(user.id),
            question_id=payload.question_id,
            chosen_option=payload.chosen_option,
            time_spent_ms=payload.time_spent_ms,
        )
    )


@router.get("/mistakes", response_model=list[ERCMistakeItemOut])
async def route_list_mistakes(request: Request, user: Annotated[Any, Depends(get_current_user)]) -> list[ERCMistakeItemOut]:
    return [ERCMistakeItemOut(**item) for item in await list_mistakes(_pool_from_request(request), user_id=int(user.id))]
```

- [ ] **Step 5: Run route tests**

Run:

```bash
cd backend
uv run pytest tests/test_erc_routes.py -q
```

Expected: route tests pass after service stubs exist. If `routes.erc.service` is missing, proceed to Task 4 and rerun.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/erc/schemas.py backend/routes/erc/routes.py backend/tests/test_erc_routes.py
git commit -m "feat(backend): add erc api contracts"
```

---

### Task 4: Backend Service Logic

**Files:**
- Create: `backend/routes/erc/service.py`
- Modify: `backend/routes/erc/repository.py`
- Test: `backend/tests/test_erc_service.py`

- [ ] **Step 1: Write failing service helper tests**

Create `backend/tests/test_erc_service.py`:

```python
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from routes.erc.service import rating_for_answer, should_skip_same_article


def test_rating_for_answer_maps_wrong_to_again_and_correct_to_good() -> None:
    assert rating_for_answer(is_correct=False) == "again"
    assert rating_for_answer(is_correct=True) == "good"


def test_should_skip_same_article_respects_cooldown_window() -> None:
    now = datetime(2026, 5, 9, 12, tzinfo=UTC)
    recent = [{"article_pk": "article-1", "created_at": now - timedelta(hours=3)}]
    old = [{"article_pk": "article-1", "created_at": now - timedelta(hours=25)}]

    assert should_skip_same_article("article-1", recent_logs=recent, now=now, cooldown_hours=24)
    assert not should_skip_same_article("article-1", recent_logs=old, now=now, cooldown_hours=24)
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
cd backend
uv run pytest tests/test_erc_service.py -q
```

Expected: FAIL because `routes.erc.service` is missing.

- [ ] **Step 3: Add repository query helpers**

Extend `backend/routes/erc/repository.py` with focused helpers:

- `list_set_rows(pool)`
- `list_article_rows(pool, user_id, set_id)`
- `get_article_row(conn, article_id)`
- `list_paragraph_rows(conn, article_pk)`
- `list_question_rows(conn, article_pk, include_answer)`
- `insert_article_attempt(conn, ...)`
- `insert_review_log(conn, ...)`
- `get_user_question_card(conn, user_id, question_pk)`
- `upsert_user_question_card(conn, ...)`
- `upsert_mistake(conn, ...)`
- `list_due_card_rows(conn, user_id, limit)`
- `list_recent_review_article_rows(conn, user_id, since)`
- `list_mistake_rows(pool, user_id)`
- `get_overview_counts(pool, user_id)`

Each helper should return `asyncpg.Record` rows or plain ids, not Pydantic models.

- [ ] **Step 4: Implement service**

Create `backend/routes/erc/service.py` with these public functions:

```python
def rating_for_answer(*, is_correct: bool) -> str:
    return "good" if is_correct else "again"


def should_skip_same_article(article_pk: str, *, recent_logs: list[dict], now: datetime, cooldown_hours: int) -> bool:
    threshold = now - timedelta(hours=cooldown_hours)
    return any(str(item["article_pk"]) == article_pk and item["created_at"] >= threshold for item in recent_logs)
```

Then implement async service functions used by routes:

- `list_sets(pool)`
- `get_overview(pool, user_id)`
- `list_articles(pool, user_id, set_id=None)`
- `get_article_detail(pool, user_id, article_id)`
- `submit_article_practice(pool, user_id, article_id, answers, time_spent_ms, started_at)`
- `get_next_review(pool, user_id)`
- `submit_review(pool, user_id, question_id, chosen_option, time_spent_ms)`
- `list_mistakes(pool, user_id)`

FSRS scheduling should mirror Vocab service:

```python
from fsrs import Card, Rating, Scheduler
```

Map `again -> Rating.Again`, `good -> Rating.Good`, `hard -> Rating.Hard`, `easy -> Rating.Easy`. Serialize `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, and `last_review` into `fsrs_card_json`.

- [ ] **Step 5: Run service and route tests**

Run:

```bash
cd backend
uv run pytest tests/test_erc_service.py tests/test_erc_routes.py -q
```

Expected: PASS.

- [ ] **Step 6: Run backend ERC checks**

Run:

```bash
cd backend
uv run ruff check routes/erc tests/test_erc_service.py tests/test_erc_routes.py
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/erc backend/tests/test_erc_service.py backend/tests/test_erc_routes.py
git commit -m "feat(backend): implement erc learning services"
```

---

### Task 5: Frontend ERC API and Routing

**Files:**
- Create: `frontend/src/lib/erc/types.ts`
- Create: `frontend/src/lib/erc/api.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/pages/AppCenter.tsx`

- [ ] **Step 1: Add TypeScript ERC types**

Create `frontend/src/lib/erc/types.ts` matching backend response names:

```typescript
export interface ERCSet {
  id: string;
  key: string;
  name: string;
  description: string;
  exam: string;
  article_count: number;
  question_count: number;
}

export interface ERCOverview {
  due_review_count: number;
  practiced_article_count: number;
  practiced_question_count: number;
  accuracy: number;
  mistake_count: number;
  recommended_article: ERCOverviewArticle | null;
}

export interface ERCOverviewArticle {
  article_id: string;
  year: number;
  text_no: number;
  title: string;
}

export interface ERCArticleListItem extends ERCOverviewArticle {
  set_id: string;
  status: 'unstarted' | 'practiced' | 'has_due_review';
  question_count: number;
  mistake_count: number;
  last_attempt_at: string | null;
}

export interface ERCParagraph {
  paragraph_no: number;
  text: string;
}

export interface ERCQuestion {
  question_id: string;
  question_no: number;
  stem: string;
  options: Record<'A' | 'B' | 'C' | 'D', string>;
  answer?: string | null;
}

export interface ERCArticleDetail extends ERCOverviewArticle {
  set_id: string;
  exam: string;
  paragraphs: ERCParagraph[];
  questions: ERCQuestion[];
  last_attempt_at: string | null;
}

export interface ERCPracticeAnswer {
  question_id: string;
  chosen_option: 'A' | 'B' | 'C' | 'D';
  time_spent_ms?: number;
}

export interface ERCArticleSubmitResult {
  attempt_id: string;
  article_id: string;
  correct_count: number;
  question_count: number;
  items: Array<{
    question_id: string;
    question_no: number;
    chosen_option: string;
    correct_option: string;
    is_correct: boolean;
    rating: 'again' | 'hard' | 'good' | 'easy';
    next_review_at: string | null;
    entered_mistakes: boolean;
  }>;
}

export interface ERCReviewNext {
  has_item: boolean;
  next_due_at: string | null;
  article: ERCOverviewArticle | null;
  paragraphs: ERCParagraph[];
  question: ERCQuestion | null;
}

export interface ERCMistakeItem {
  article_id: string;
  year: number;
  text_no: number;
  question_id: string;
  question_no: number;
  stem: string;
  correct_option: string;
  last_chosen_option: string | null;
  wrong_count: number;
  last_wrong_at: string;
  is_due: boolean;
}
```

- [ ] **Step 2: Add API client**

Create `frontend/src/lib/erc/api.ts`:

```typescript
import { apiJson } from '../api';
import type {
  ERCArticleDetail,
  ERCArticleListItem,
  ERCArticleSubmitResult,
  ERCMistakeItem,
  ERCOverview,
  ERCPracticeAnswer,
  ERCReviewNext,
  ERCSet,
} from './types';

export function fetchERCOverview() {
  return apiJson<ERCOverview>('/api/erc/overview');
}

export function fetchERCSets() {
  return apiJson<ERCSet[]>('/api/erc/sets');
}

export function fetchERCArticles(setId?: string) {
  const query = setId ? `?set_id=${encodeURIComponent(setId)}` : '';
  return apiJson<ERCArticleListItem[]>(`/api/erc/articles${query}`);
}

export function fetchERCArticle(articleId: string) {
  return apiJson<ERCArticleDetail>(`/api/erc/articles/${articleId}`);
}

export function submitERCArticle(articleId: string, answers: ERCPracticeAnswer[], timeSpentMs?: number) {
  return apiJson<ERCArticleSubmitResult>(`/api/erc/articles/${articleId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, time_spent_ms: timeSpentMs }),
  });
}

export function fetchERCReviewNext() {
  return apiJson<ERCReviewNext>('/api/erc/review/next');
}

export function submitERCReview(questionId: string, chosenOption: 'A' | 'B' | 'C' | 'D', timeSpentMs?: number) {
  return apiJson(`/api/erc/review/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: questionId, chosen_option: chosenOption, time_spent_ms: timeSpentMs }),
  });
}

export function fetchERCMistakes() {
  return apiJson<ERCMistakeItem[]>('/api/erc/mistakes');
}
```

- [ ] **Step 3: Add routes**

Modify `frontend/src/main.tsx` imports and routes:

```typescript
import ERCHome from './pages/ERC/Home';
import ERCLibrary from './pages/ERC/Library';
import ERCMistakes from './pages/ERC/Mistakes';
import ERCPractice from './pages/ERC/Practice';
import ERCPracticeResult from './pages/ERC/PracticeResult';
import ERCReview from './pages/ERC/Review';
```

Add authenticated routes:

```tsx
<Route path="/erc" element={<ERCHome />} />
<Route path="/erc/library" element={<ERCLibrary />} />
<Route path="/erc/articles/:articleId/practice" element={<ERCPractice />} />
<Route path="/erc/articles/:articleId/result" element={<ERCPracticeResult />} />
<Route path="/erc/review" element={<ERCReview />} />
<Route path="/erc/mistakes" element={<ERCMistakes />} />
```

- [ ] **Step 4: Run frontend typecheck and verify current missing pages**

Run:

```bash
cd frontend
pnpm check
```

Expected: FAIL until page files exist. Continue to Task 6.

- [ ] **Step 5: Commit after Task 6 pages exist**

Commit together with Task 6.

---

### Task 6: Frontend Pages

**Files:**
- Create all `frontend/src/pages/ERC/*.tsx`
- Test: `frontend/src/pages/ERC/__tests__/Home.test.tsx`
- Test: `frontend/src/pages/ERC/__tests__/Practice.test.tsx`
- Test: `frontend/src/pages/ERC/__tests__/Review.test.tsx`

- [ ] **Step 1: Write frontend tests**

Create tests that mock `frontend/src/lib/erc/api.ts` and verify:

- Home renders due count and links to `/erc/library`, `/erc/review`, `/erc/mistakes`.
- Practice blocks submit when not all questions are answered.
- Review shows “暂无到期复习” when `has_item` is false.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd frontend
pnpm test -- src/pages/ERC/__tests__/Home.test.tsx src/pages/ERC/__tests__/Practice.test.tsx src/pages/ERC/__tests__/Review.test.tsx
```

Expected: FAIL because pages do not exist.

- [ ] **Step 3: Implement pages**

Create pages with restrained product UI matching existing Vocab conventions:

- `Home.tsx`: dashboard with stats and CTA links.
- `Library.tsx`: list articles grouped by year.
- `Practice.tsx`: load article by `articleId`, render paragraphs, questions, option buttons, unanswered warning, submit and navigate result state.
- `PracticeResult.tsx`: read `location.state` result, show score and per-question feedback.
- `Review.tsx`: load next review, render article context and one question, submit answer.
- `Mistakes.tsx`: list mistakes grouped by article title/year/text.

Use normal links and buttons; do not introduce a new design system.

- [ ] **Step 4: Run frontend tests and typecheck**

Run:

```bash
cd frontend
pnpm test -- src/pages/ERC/__tests__/Home.test.tsx src/pages/ERC/__tests__/Practice.test.tsx src/pages/ERC/__tests__/Review.test.tsx
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/erc frontend/src/pages/ERC frontend/src/main.tsx frontend/src/pages/AppCenter.tsx
git commit -m "feat(frontend): add erc reading training pages"
```

---

### Task 7: End-to-End Verification

**Files:**
- No new files expected.

- [ ] **Step 1: Run backend test subset**

Run:

```bash
cd backend
uv run pytest tests/test_erc_importer.py tests/test_erc_service.py tests/test_erc_routes.py -q
uv run ruff check routes/erc scripts/import_erc.py tests/test_erc_importer.py tests/test_erc_service.py tests/test_erc_routes.py
```

Expected: PASS.

- [ ] **Step 2: Run frontend checks**

Run:

```bash
cd frontend
pnpm test -- src/pages/ERC/__tests__/Home.test.tsx src/pages/ERC/__tests__/Practice.test.tsx src/pages/ERC/__tests__/Review.test.tsx
pnpm check
```

Expected: PASS.

- [ ] **Step 3: Run broader safe checks**

Run:

```bash
cd backend
uv run pytest tests/test_vocab_routes.py tests/test_erc_routes.py -q
cd ../frontend
pnpm test -- src/pages/Vocab/__tests__/Home.test.tsx src/pages/ERC/__tests__/Home.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit verification-only fixes if needed**

If verification revealed small issues, fix them with tests first and commit:

```bash
git add <changed-files>
git commit -m "fix: polish erc verification issues"
```

---

### Task 8: Dev Log Update

**Files:**
- Modify: `docs/开发日志.md`

- [ ] **Step 1: Add branch entry**

Add an entry under the current branch section for each ERC implementation commit. Include:

- User request wording: “开始实现 ERC 阅读训练产品板块。”
- Commit hash.
- Completed work.
- Verification notes.

- [ ] **Step 2: Commit dev log**

```bash
git add docs/开发日志.md
git commit -m "docs: record erc implementation work"
```

---

## Self-Review

Spec coverage:

- JSON import is covered by Tasks 1-2.
- Multi-user database model is covered by Task 2.
- API contracts are covered by Task 3.
- FSRS practice/review behavior is covered by Task 4.
- Frontend page flow is covered by Tasks 5-6.
- Verification and dev log are covered by Tasks 7-8.

Scope notes:

- Evidence highlighting, AI explanations,错因分类, and custom FSRS settings stay out of MVP.
- The first implementation may display full article context during review because existing JSON evidence fields are empty.

