from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, date, datetime
from datetime import time as time_of_day
from threading import Lock
from typing import Annotated, Any, Literal

import arxiv
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from routes.auth_routes import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/arxiv", tags=["arxiv"])


SortBy = Literal["relevance", "submitted_date", "last_updated_date"]
SortOrder = Literal["ascending", "descending"]
SearchField = Literal["title", "summary", "all"]


class ArxivSearchRequest(BaseModel):
    keywords: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=64)
    author: str | None = Field(default=None, max_length=120)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    sort_by: SortBy = "submitted_date"
    sort_order: SortOrder = "descending"
    search_field: SearchField = "title"


class ArxivPaperOut(BaseModel):
    arxiv_id: str
    title: str
    authors: list[str]
    published: str
    summary: str


class PaperStateUpsertRequest(BaseModel):
    arxiv_id: str = Field(min_length=3, max_length=64)
    title: str = Field(default="")
    is_favorite: bool = False
    is_read: bool = False
    is_skipped: bool = False
    tag_ids: list[int] = Field(default_factory=list)


class PaperDetailsRequest(BaseModel):
    arxiv_ids: list[str] = Field(min_length=1, max_length=100)


class PaperStateOut(BaseModel):
    user_id: int
    arxiv_id: str
    is_favorite: bool
    is_read: bool
    is_skipped: bool
    tag_ids: list[int]


class PaperTagCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    color: str = Field(min_length=1, max_length=32)


class PaperTagOut(BaseModel):
    id: int
    user_id: int
    name: str
    color: str


class DailyConfigUpsertRequest(BaseModel):
    keywords: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=64)
    author: str | None = Field(default=None, max_length=120)
    limit: int = Field(default=20, ge=1, le=100)
    sort_by: SortBy = "submitted_date"
    sort_order: SortOrder = "descending"
    search_field: SearchField = "title"
    update_time: str = Field(pattern=r"^\d{2}:\d{2}$")


class DailyConfigOut(BaseModel):
    user_id: int
    keywords: str
    category: str | None
    author: str | None
    limit: int
    sort_by: SortBy
    sort_order: SortOrder
    search_field: SearchField
    update_time: str
    updated_at: str
    last_run_on: str | None


class DailyCandidateOut(BaseModel):
    arxiv_id: str
    title: str
    authors: list[str]
    published: str
    summary: str
    is_read: bool
    linked_task_id: str | None = None
    linked_task_status: str | None = None


class DailyTaskBatchCreateRequest(BaseModel):
    arxiv_ids: list[str] = Field(default_factory=list)


class DailyTaskBatchCreateOut(BaseModel):
    created_count: int
    skipped_count: int
    task_ids: list[str]


@dataclass(frozen=True)
class _SortConfig:
    criterion: arxiv.SortCriterion
    order: arxiv.SortOrder


@dataclass(frozen=True)
class _SearchCacheEntry:
    saved_at: float
    papers: list[ArxivPaperOut]


_SEARCH_CACHE_TTL_SECONDS = 10 * 60
_SEARCH_CACHE_STALE_SECONDS = 24 * 60 * 60
_SEARCH_CACHE: dict[str, _SearchCacheEntry] = {}
_SEARCH_CACHE_LOCK = Lock()
_DAILY_SCHEDULER_INTERVAL_SECONDS = 30
_DAILY_SCHEDULER_STATE_KEY = "arxiv_daily_scheduler_task"


def _pool_from_request(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return pool


async def init_arxiv(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 arxiv 表")
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS papers (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL,
              arxiv_id TEXT NOT NULL,
              title TEXT NOT NULL DEFAULT '',
              is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
              is_read BOOLEAN NOT NULL DEFAULT FALSE,
              is_skipped BOOLEAN NOT NULL DEFAULT FALSE,
              tag_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
              UNIQUE (user_id, arxiv_id)
            );
            """
        )
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS user_id BIGINT;")
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS arxiv_id TEXT;")
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';")
        await conn.execute("ALTER TABLE papers ALTER COLUMN title SET DEFAULT '';")
        await conn.execute("UPDATE papers SET title = '' WHERE title IS NULL;")
        await conn.execute("ALTER TABLE papers ALTER COLUMN title SET NOT NULL;")
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS tag_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb;")
        await conn.execute("UPDATE papers SET tag_ids_json = '[]'::jsonb WHERE tag_ids_json IS NULL;")
        await conn.execute("ALTER TABLE papers ALTER COLUMN tag_ids_json SET DEFAULT '[]'::jsonb;")
        await conn.execute("ALTER TABLE papers ALTER COLUMN tag_ids_json SET NOT NULL;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_tag_defs (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              name TEXT NOT NULL,
              color TEXT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(user_id, name)
            );
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_paper_tag_defs_user_created ON paper_tag_defs(user_id, created_at DESC);"
        )
        await conn.execute(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE table_name = 'papers' AND constraint_name = 'uniq_papers_user_arxiv'
              ) THEN
                ALTER TABLE papers ADD CONSTRAINT uniq_papers_user_arxiv UNIQUE (user_id, arxiv_id);
              END IF;
            END$$;
            """
        )
        await conn.execute(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE table_name = 'papers' AND constraint_name = 'fk_papers_user_id'
              ) THEN
                ALTER TABLE papers
                ADD CONSTRAINT fk_papers_user_id
                FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;
              END IF;
            END$$;
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS arxiv_daily_configs (
              user_id BIGINT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
              keywords TEXT NOT NULL,
              category TEXT NULL,
              author TEXT NULL,
              limit_count INTEGER NOT NULL DEFAULT 20,
              sort_by TEXT NOT NULL DEFAULT 'submitted_date',
              sort_order TEXT NOT NULL DEFAULT 'descending',
              search_field TEXT NOT NULL DEFAULT 'title',
              update_time TIME NOT NULL,
              last_run_on DATE NULL,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS arxiv_daily_candidates (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              candidate_date DATE NOT NULL,
              arxiv_id TEXT NOT NULL,
              title TEXT NOT NULL,
              authors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
              published TEXT NOT NULL,
              summary TEXT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(user_id, candidate_date, arxiv_id)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS arxiv_daily_task_links (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              candidate_date DATE NOT NULL,
              arxiv_id TEXT NOT NULL,
              task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(user_id, candidate_date, arxiv_id, task_id)
            );
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_daily_candidates_user_date ON arxiv_daily_candidates(user_id, candidate_date DESC);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_daily_links_user_arxiv ON arxiv_daily_task_links(user_id, arxiv_id);"
        )
    scheduler = getattr(getattr(app, "state", None), _DAILY_SCHEDULER_STATE_KEY, None)
    if scheduler is None or scheduler.done():
        app.state.arxiv_daily_scheduler_task = asyncio.create_task(_daily_scheduler_loop(app))


async def close_arxiv(app: Any) -> None:
    task = getattr(getattr(app, "state", None), _DAILY_SCHEDULER_STATE_KEY, None)
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    app.state.arxiv_daily_scheduler_task = None


def _parse_daily_time(raw: str) -> time_of_day:
    try:
        hour_s, minute_s = raw.split(":", 1)
        hour = int(hour_s)
        minute = int(minute_s)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="每日更新时间格式错误，需为 HH:MM") from exc
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise HTTPException(status_code=422, detail="每日更新时间范围错误，需为 00:00-23:59")
    return time_of_day(hour=hour, minute=minute)


def _time_to_hhmm(value: time_of_day) -> str:
    return f"{value.hour:02d}:{value.minute:02d}"


def _row_to_daily_config(row: asyncpg.Record) -> DailyConfigOut:
    update_time = row["update_time"]
    updated_at = row["updated_at"]
    last_run_on = row["last_run_on"]
    return DailyConfigOut(
        user_id=int(row["user_id"]),
        keywords=str(row["keywords"]),
        category=str(row["category"]) if row["category"] is not None else None,
        author=str(row["author"]) if row["author"] is not None else None,
        limit=int(row["limit_count"]),
        sort_by=row["sort_by"],
        sort_order=row["sort_order"],
        search_field=row["search_field"],
        update_time=_time_to_hhmm(update_time),
        updated_at=updated_at.isoformat(),
        last_run_on=last_run_on.isoformat() if last_run_on is not None else None,
    )


def _daily_config_to_search_payload(row: asyncpg.Record) -> ArxivSearchRequest:
    return ArxivSearchRequest(
        keywords=str(row["keywords"]),
        category=str(row["category"]) if row["category"] else None,
        author=str(row["author"]) if row["author"] else None,
        limit=int(row["limit_count"]),
        offset=0,
        sort_by=row["sort_by"],
        sort_order=row["sort_order"],
        search_field=row["search_field"],
    )


async def _refresh_daily_candidates_for_user(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    candidate_day: date,
    config_row: asyncpg.Record,
) -> list[ArxivPaperOut]:
    target_count = int(config_row["limit_count"])
    fetch_limit = max(target_count * 3, 50)
    payload = _daily_config_to_search_payload(config_row)
    payload.limit = fetch_limit
    papers = await _search_arxiv(payload)
    paper_ids = [_normalize_arxiv_id(p.arxiv_id) for p in papers]
    filtered_ids: set[str] = set()
    if paper_ids:
        rows = await conn.fetch(
            """
            SELECT arxiv_id
            FROM papers
            WHERE user_id = $1
              AND arxiv_id = ANY($2::text[])
              AND (is_read = TRUE OR is_favorite = TRUE OR is_skipped = TRUE)
            """,
            user_id,
            paper_ids,
        )
        filtered_ids = {str(r["arxiv_id"]) for r in rows}
    valid_papers = [p for p in papers if _normalize_arxiv_id(p.arxiv_id) not in filtered_ids]
    final_papers = valid_papers[:target_count]
    await conn.execute(
        "DELETE FROM arxiv_daily_candidates WHERE user_id = $1 AND candidate_date = $2",
        user_id,
        candidate_day,
    )
    for paper in final_papers:
        await conn.execute(
            """
            INSERT INTO arxiv_daily_candidates(user_id, candidate_date, arxiv_id, title, authors_json, published, summary)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
            ON CONFLICT (user_id, candidate_date, arxiv_id)
            DO UPDATE SET title = EXCLUDED.title, authors_json = EXCLUDED.authors_json, published = EXCLUDED.published, summary = EXCLUDED.summary
            """,
            user_id,
            candidate_day,
            _normalize_arxiv_id(paper.arxiv_id),
            paper.title,
            json.dumps(paper.authors, ensure_ascii=False),
            paper.published,
            paper.summary,
        )
    await conn.execute(
        "UPDATE arxiv_daily_configs SET last_run_on = $1, updated_at = NOW() WHERE user_id = $2",
        candidate_day,
        user_id,
    )
    return final_papers


async def _daily_scheduler_loop(app: Any) -> None:
    while True:
        try:
            pool = getattr(getattr(app, "state", None), "auth_pool", None)
            if pool is not None:
                now = datetime.now(UTC)
                today = now.date()
                current_hhmm = f"{now.hour:02d}:{now.minute:02d}"
                async with pool.acquire() as conn:
                    rows = await conn.fetch(
                        """
                        SELECT user_id, keywords, category, author, limit_count, sort_by, sort_order, search_field, update_time, last_run_on, updated_at
                        FROM arxiv_daily_configs
                        WHERE to_char(update_time, 'HH24:MI') <= $1
                          AND (last_run_on IS NULL OR last_run_on < $2)
                        """,
                        current_hhmm,
                        today,
                    )
                    for row in rows:
                        await _refresh_daily_candidates_for_user(
                            conn,
                            user_id=int(row["user_id"]),
                            candidate_day=today,
                            config_row=row,
                        )
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
        await asyncio.sleep(_DAILY_SCHEDULER_INTERVAL_SECONDS)


def _compose_query(payload: ArxivSearchRequest, keyword_expr: str) -> str:
    parts: list[str] = [keyword_expr]
    if payload.category and payload.category.strip():
        parts.append(f"cat:{payload.category.strip()}")
    if payload.author and payload.author.strip():
        parts.append(f"au:{payload.author.strip()}")
    return " AND ".join(parts)


def _build_query_candidates(payload: ArxivSearchRequest) -> list[str]:
    keyword = payload.keywords.strip()
    field_map = {"title": "ti", "summary": "abs"}
    if payload.search_field in field_map:
        prefix = field_map[payload.search_field]
        if " " not in keyword:
            return [_compose_query(payload, f"{prefix}:{keyword}")]
        phrase = keyword.replace('"', "").strip()
        if not phrase:
            return [_compose_query(payload, f"{prefix}:{keyword}")]
        return [
            _compose_query(payload, f'{prefix}:"{phrase}"'),
            _compose_query(payload, f"{prefix}:{keyword}"),
        ]

    if " " not in keyword:
        return [_compose_query(payload, f"all:{keyword}")]
    phrase = keyword.replace('"', "").strip()
    if not phrase:
        return [_compose_query(payload, f"all:{keyword}")]
    return [
        _compose_query(payload, f'ti:"{phrase}"'),
        _compose_query(payload, f'all:"{phrase}"'),
        _compose_query(payload, f"all:{keyword}"),
    ]


def _sort_config(payload: ArxivSearchRequest) -> _SortConfig:
    criterion_map: dict[SortBy, arxiv.SortCriterion] = {
        "relevance": arxiv.SortCriterion.Relevance,
        "submitted_date": arxiv.SortCriterion.SubmittedDate,
        "last_updated_date": arxiv.SortCriterion.LastUpdatedDate,
    }
    order_map: dict[SortOrder, arxiv.SortOrder] = {
        "ascending": arxiv.SortOrder.Ascending,
        "descending": arxiv.SortOrder.Descending,
    }
    return _SortConfig(
        criterion=criterion_map[payload.sort_by],
        order=order_map[payload.sort_order],
    )


def _normalize_arxiv_id(raw: str) -> str:
    tail = raw.rsplit("/", 1)[-1]
    return tail.split("v", 1)[0]


def _search_cache_key(payload: ArxivSearchRequest) -> str:
    return "|".join(
        [
            payload.keywords.strip(),
            (payload.category or "").strip(),
            (payload.author or "").strip(),
            str(payload.limit),
            str(payload.offset),
            payload.sort_by,
            payload.sort_order,
        ]
    )


def _cache_get(key: str, *, max_age_seconds: int) -> list[ArxivPaperOut] | None:
    with _SEARCH_CACHE_LOCK:
        entry = _SEARCH_CACHE.get(key)
        if entry is None:
            return None
        if time.time() - entry.saved_at > max_age_seconds:
            return None
        return deepcopy(entry.papers)


def _cache_set(key: str, papers: list[ArxivPaperOut]) -> None:
    with _SEARCH_CACHE_LOCK:
        _SEARCH_CACHE[key] = _SearchCacheEntry(saved_at=time.time(), papers=deepcopy(papers))


def _is_rate_limited_error(exc: Exception) -> bool:
    return re.search(r"\b429\b", str(exc)) is not None


def _search_sync(payload: ArxivSearchRequest) -> list[ArxivPaperOut]:
    sort = _sort_config(payload)
    client = arxiv.Client(page_size=min(payload.limit, 100), delay_seconds=5.0, num_retries=5)
    for query in _build_query_candidates(payload):
        search = arxiv.Search(
            query=query,
            max_results=payload.limit + payload.offset,
            sort_by=sort.criterion,
            sort_order=sort.order,
        )
        papers: list[ArxivPaperOut] = []
        for result in client.results(search, offset=payload.offset):
            authors = [n for n in (str(author.name).strip() for author in result.authors) if n]
            if not authors:
                logger.warning(f"No authors found for {result.entry_id} (title: {result.title})")
            papers.append(
                ArxivPaperOut(
                    arxiv_id=_normalize_arxiv_id(str(result.entry_id)),
                    title=str(result.title).strip(),
                    authors=authors,
                    published=result.published.isoformat(),
                    summary=str(result.summary).strip(),
                )
            )
        if papers:
            return papers
    return []


async def _search_arxiv(payload: ArxivSearchRequest) -> list[ArxivPaperOut]:
    cache_key = _search_cache_key(payload)
    cached = _cache_get(cache_key, max_age_seconds=_SEARCH_CACHE_TTL_SECONDS)
    if cached is not None:
        return cached
    try:
        papers = await asyncio.to_thread(_search_sync, payload)
        _cache_set(cache_key, papers)
        return papers
    except Exception as exc:
        if _is_rate_limited_error(exc):
            stale = _cache_get(cache_key, max_age_seconds=_SEARCH_CACHE_STALE_SECONDS)
            if stale is not None:
                return stale
            raise HTTPException(status_code=429, detail="ArXiv 当前限流，请 30-60 秒后重试") from exc
        raise HTTPException(status_code=502, detail=f"ArXiv 检索失败: {exc}") from exc


def _parse_jsonb_int_list(raw_value: Any) -> list[int]:
    parsed: Any = raw_value
    if isinstance(raw_value, str):
        try:
            parsed = json.loads(raw_value)
        except json.JSONDecodeError:
            return []
    if not isinstance(parsed, list):
        return []
    values: list[int] = []
    for item in parsed:
        if isinstance(item, int):
            values.append(item)
        elif isinstance(item, str) and item.isdigit():
            values.append(int(item))
    return values


def _row_to_paper_state(row: asyncpg.Record) -> PaperStateOut:
    tag_ids = _parse_jsonb_int_list(row.get("tag_ids_json", []))
    return PaperStateOut(
        user_id=int(row["user_id"]),
        arxiv_id=str(row["arxiv_id"]),
        is_favorite=bool(row["is_favorite"]),
        is_read=bool(row["is_read"]),
        is_skipped=bool(row["is_skipped"]),
        tag_ids=tag_ids,
    )


def _row_to_paper_tag(row: asyncpg.Record) -> PaperTagOut:
    return PaperTagOut(
        id=int(row["id"]),
        user_id=int(row["user_id"]),
        name=str(row["name"]),
        color=str(row["color"]),
    )


@router.post("/search", response_model=list[ArxivPaperOut])
async def search_arxiv(
    payload: ArxivSearchRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[ArxivPaperOut]:
    _ = user
    return await _search_arxiv(payload)


@router.post("/papers/details", response_model=list[ArxivPaperOut])
async def get_paper_details(
    payload: PaperDetailsRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[ArxivPaperOut]:
    _ = user
    try:
        client = arxiv.Client(page_size=len(payload.arxiv_ids), delay_seconds=5.0, num_retries=5)
        search = arxiv.Search(id_list=payload.arxiv_ids)
        papers: list[ArxivPaperOut] = []
        for result in client.results(search):
            papers.append(
                ArxivPaperOut(
                    arxiv_id=_normalize_arxiv_id(str(result.entry_id)),
                    title=str(result.title).strip(),
                    authors=[str(author.name).strip() for author in result.authors],
                    published=result.published.isoformat(),
                    summary=str(result.summary).strip(),
                )
            )
        return papers
    except Exception as exc:
        if _is_rate_limited_error(exc):
            raise HTTPException(status_code=429, detail="ArXiv 当前限流，请稍后重试") from exc
        raise HTTPException(status_code=502, detail=f"获取论文详情失败: {exc}") from exc


@router.put("/papers/state", response_model=PaperStateOut)
async def upsert_paper_state(
    request: Request,
    payload: PaperStateUpsertRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> PaperStateOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO papers(user_id, arxiv_id, title, is_favorite, is_read, is_skipped, tag_ids_json)
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
                ON CONFLICT (user_id, arxiv_id)
                DO UPDATE SET
                  is_favorite = EXCLUDED.is_favorite,
                  is_read = EXCLUDED.is_read,
                  is_skipped = EXCLUDED.is_skipped,
                  title = EXCLUDED.title,
                  tag_ids_json = EXCLUDED.tag_ids_json
                RETURNING user_id, arxiv_id, is_favorite, is_read, is_skipped, tag_ids_json
                """,
                int(user.id),
                payload.arxiv_id.strip(),
                (payload.title or "").strip(),
                payload.is_favorite,
                payload.is_read,
                payload.is_skipped,
                json.dumps(sorted(set(payload.tag_ids))),
            )
            await conn.execute(
                """
                UPDATE tasks t
                SET status = CASE
                    WHEN $3::BOOLEAN = TRUE THEN 'done'
                    WHEN t.status = 'done' THEN 'todo'
                    ELSE t.status
                  END,
                  updated_at = NOW()
                FROM arxiv_daily_task_links l
                WHERE l.user_id = $1
                  AND l.arxiv_id = $2
                  AND l.task_id = t.id
                  AND t.user_id = $1
                  AND t.is_deleted = FALSE
                """,
                int(user.id),
                payload.arxiv_id.strip(),
                payload.is_read,
            )
    if row is None:
        raise HTTPException(status_code=500, detail="写入论文状态失败")
    return _row_to_paper_state(row)


@router.get("/papers", response_model=list[PaperStateOut])
async def list_paper_states(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    is_favorite: bool | None = Query(default=None),
    is_read: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[PaperStateOut]:
    clauses: list[str] = ["user_id = $1"]
    args: list[Any] = [int(user.id)]
    if is_favorite is not None:
        args.append(is_favorite)
        clauses.append(f"is_favorite = ${len(args)}")
    if is_read is not None:
        args.append(is_read)
        clauses.append(f"is_read = ${len(args)}")
    args.append(limit)
    limit_i = len(args)
    args.append(offset)
    offset_i = len(args)
    where_sql = " AND ".join(clauses)
    sql = f"""
        SELECT user_id, arxiv_id, is_favorite, is_read, is_skipped, tag_ids_json
        FROM papers
        WHERE {where_sql}
        ORDER BY arxiv_id DESC
        LIMIT ${limit_i} OFFSET ${offset_i}
    """
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [_row_to_paper_state(row) for row in rows]


@router.get("/papers/tags", response_model=list[PaperTagOut])
async def list_paper_tags(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[PaperTagOut]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, user_id, name, color
            FROM paper_tag_defs
            WHERE user_id = $1
            ORDER BY created_at ASC, id ASC
            """,
            int(user.id),
        )
    return [_row_to_paper_tag(row) for row in rows]


@router.post("/papers/tags", response_model=PaperTagOut)
async def create_paper_tag(
    request: Request,
    payload: PaperTagCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> PaperTagOut:
    pool = _pool_from_request(request)
    name = payload.name.strip()
    color = payload.color.strip()
    if not name:
        raise HTTPException(status_code=422, detail="标签名不能为空")
    if not color:
        raise HTTPException(status_code=422, detail="标签颜色不能为空")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO paper_tag_defs(user_id, name, color)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, name)
            DO UPDATE SET color = EXCLUDED.color
            RETURNING id, user_id, name, color
            """,
            int(user.id),
            name,
            color,
        )
    if row is None:
        raise HTTPException(status_code=500, detail="创建标签失败")
    return _row_to_paper_tag(row)


@router.delete("/papers/tags/{tag_id}")
async def delete_paper_tag(
    tag_id: int,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, bool]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                DELETE FROM paper_tag_defs
                WHERE user_id = $1 AND id = $2
                RETURNING id
                """,
                int(user.id),
                tag_id,
            )
            if row is None:
                raise HTTPException(status_code=404, detail="标签不存在")
            await conn.execute(
                """
                UPDATE papers
                SET tag_ids_json = to_jsonb(
                  COALESCE(
                    ARRAY(
                      SELECT value::BIGINT
                      FROM jsonb_array_elements_text(tag_ids_json) AS value
                      WHERE value::BIGINT <> $2
                    ),
                    ARRAY[]::BIGINT[]
                  )
                )
                WHERE user_id = $1
                """,
                int(user.id),
                tag_id,
            )
    return {"ok": True}


async def _fetch_daily_candidates(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    candidate_day: date,
) -> list[DailyCandidateOut]:
    """读取指定用户某日每日候选集，并附带任务关联与已读状态。"""
    rows = await conn.fetch(
        """
        SELECT c.arxiv_id,
               c.title,
               c.authors_json,
               c.published,
               c.summary,
               COALESCE(p.is_read, FALSE) AS is_read,
               l.task_id AS linked_task_id,
               t.status AS linked_task_status
        FROM arxiv_daily_candidates c
        LEFT JOIN papers p
          ON p.user_id = c.user_id AND p.arxiv_id = c.arxiv_id
        LEFT JOIN LATERAL (
          SELECT task_id
          FROM arxiv_daily_task_links
          WHERE user_id = c.user_id
            AND candidate_date = c.candidate_date
            AND arxiv_id = c.arxiv_id
          ORDER BY created_at DESC
          LIMIT 1
        ) l ON TRUE
        LEFT JOIN tasks t
          ON t.id = l.task_id AND t.user_id = c.user_id AND t.is_deleted = FALSE
        WHERE c.user_id = $1 AND c.candidate_date = $2
        ORDER BY c.created_at DESC
        """,
        user_id,
        candidate_day,
    )
    items: list[DailyCandidateOut] = []
    for row in rows:
        raw_authors = row["authors_json"]
        authors = []
        if isinstance(raw_authors, list):
            authors = raw_authors
        elif isinstance(raw_authors, str):
            try:
                parsed = json.loads(raw_authors)
                if isinstance(parsed, list):
                    authors = parsed
            except json.JSONDecodeError:
                pass

        items.append(
            DailyCandidateOut(
                arxiv_id=str(row["arxiv_id"]),
                title=str(row["title"]),
                authors=[str(a) for a in authors],
                published=str(row["published"]),
                summary=str(row["summary"]),
                is_read=bool(row["is_read"]),
                linked_task_id=str(row["linked_task_id"]) if row["linked_task_id"] else None,
                linked_task_status=str(row["linked_task_status"]) if row["linked_task_status"] else None,
            )
        )
    return items


@router.get("/daily/config", response_model=DailyConfigOut | None)
async def get_daily_config(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> DailyConfigOut | None:
    """获取当前用户每日配置。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT user_id, keywords, category, author, limit_count, sort_by, sort_order, search_field, update_time, updated_at, last_run_on
            FROM arxiv_daily_configs
            WHERE user_id = $1
            """,
            int(user.id),
        )
    if row is None:
        return None
    return _row_to_daily_config(row)


@router.put("/daily/config", response_model=DailyConfigOut)
async def upsert_daily_config(
    request: Request,
    payload: DailyConfigUpsertRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> DailyConfigOut:
    """创建或更新每日配置，并立刻刷新当日候选集。"""
    pool = _pool_from_request(request)
    run_day = datetime.now(UTC).date()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO arxiv_daily_configs(user_id, keywords, category, author, limit_count, sort_by, sort_order, search_field, update_time, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                ON CONFLICT (user_id)
                DO UPDATE SET
                  keywords = EXCLUDED.keywords,
                  category = EXCLUDED.category,
                  author = EXCLUDED.author,
                  limit_count = EXCLUDED.limit_count,
                  sort_by = EXCLUDED.sort_by,
                  sort_order = EXCLUDED.sort_order,
                  search_field = EXCLUDED.search_field,
                  update_time = EXCLUDED.update_time,
                  updated_at = NOW()
                RETURNING user_id, keywords, category, author, limit_count, sort_by, sort_order, search_field, update_time, updated_at, last_run_on
                """,
                int(user.id),
                payload.keywords.strip(),
                payload.category.strip() if payload.category and payload.category.strip() else None,
                payload.author.strip() if payload.author and payload.author.strip() else None,
                payload.limit,
                payload.sort_by,
                payload.sort_order,
                payload.search_field,
                _parse_daily_time(payload.update_time),
            )
            if row is None:
                raise HTTPException(status_code=500, detail="保存每日配置失败")
            await _refresh_daily_candidates_for_user(
                conn,
                user_id=int(user.id),
                candidate_day=run_day,
                config_row=row,
            )
            row = await conn.fetchrow(
                """
                SELECT user_id, keywords, category, author, limit_count, sort_by, sort_order, search_field, update_time, updated_at, last_run_on
                FROM arxiv_daily_configs
                WHERE user_id = $1
                """,
                int(user.id),
            )
    if row is None:
        raise HTTPException(status_code=500, detail="读取每日配置失败")
    return _row_to_daily_config(row)


@router.post("/daily/refresh", response_model=list[DailyCandidateOut])
async def refresh_daily_candidates(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[DailyCandidateOut]:
    """手动刷新当日候选集。"""
    pool = _pool_from_request(request)
    run_day = datetime.now(UTC).date()
    async with pool.acquire() as conn:
        async with conn.transaction():
            config_row = await conn.fetchrow(
                """
                SELECT user_id, keywords, category, author, limit_count, sort_by, sort_order, search_field, update_time, updated_at, last_run_on
                FROM arxiv_daily_configs
                WHERE user_id = $1
                """,
                int(user.id),
            )
            if config_row is None:
                raise HTTPException(status_code=404, detail="请先保存每日配置")
            await _refresh_daily_candidates_for_user(
                conn,
                user_id=int(user.id),
                candidate_day=run_day,
                config_row=config_row,
            )
            return await _fetch_daily_candidates(conn, user_id=int(user.id), candidate_day=run_day)


@router.get("/daily/candidates", response_model=list[DailyCandidateOut])
async def list_daily_candidates(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[DailyCandidateOut]:
    """查询当日候选论文列表。若当日无数据且存在配置，则自动触发生成。"""
    pool = _pool_from_request(request)
    run_day = datetime.now(UTC).date()
    async with pool.acquire() as conn:
        # 1. 尝试获取现有候选列表
        candidates = await _fetch_daily_candidates(conn, user_id=int(user.id), candidate_day=run_day)
        if candidates:
            return candidates

        # 2. 若无候选，检查配置并自动生成
        async with conn.transaction():
            config_row = await conn.fetchrow(
                """
                SELECT user_id, keywords, category, author, limit_count, sort_by, sort_order, search_field, update_time, updated_at, last_run_on
                FROM arxiv_daily_configs
                WHERE user_id = $1
                """,
                int(user.id),
            )
            if config_row is None:
                return []

            # 如果今天已经运行过（last_run_on == today），说明已经尝试生成过了（可能结果为空），不再重复触发
            if config_row["last_run_on"] == run_day:
                return []

            await _refresh_daily_candidates_for_user(
                conn,
                user_id=int(user.id),
                candidate_day=run_day,
                config_row=config_row,
            )
            # 3. 获取新生成的候选列表
            return await _fetch_daily_candidates(conn, user_id=int(user.id), candidate_day=run_day)


@router.post("/daily/tasks/prepare")
async def prepare_daily_tasks_action(
    request: Request,
    payload: DailyTaskBatchCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, Any]:
    """生成“批量创建今日论文任务”的确认动作。"""
    _ = request
    _ = user
    ids = [x.strip() for x in payload.arxiv_ids if isinstance(x, str) and x.strip()]
    if not ids:
        raise HTTPException(status_code=422, detail="缺少 arxiv_ids")
    return {
        "action": "confirm",
        "operation": "daily_batch_create_tasks",
        "title": f"将今日 {len(ids)} 篇论文加入任务",
        "message": f"将按每篇论文创建一条任务，共 {len(ids)} 条。确认后执行。",
        "request": {
            "method": "POST",
            "url": "/api/arxiv/daily/tasks/commit",
            "body": {"arxiv_ids": ids},
        },
    }


@router.post("/daily/tasks/commit", response_model=DailyTaskBatchCreateOut)
async def commit_daily_tasks(
    request: Request,
    payload: DailyTaskBatchCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> DailyTaskBatchCreateOut:
    """按当日候选论文逐条创建任务并建立关联。"""
    ids = [x.strip() for x in payload.arxiv_ids if isinstance(x, str) and x.strip()]
    if not ids:
        raise HTTPException(status_code=422, detail="缺少 arxiv_ids")
    pool = _pool_from_request(request)
    run_day = datetime.now(UTC).date()
    created_ids: list[str] = []
    skipped = 0
    async with pool.acquire() as conn:
        async with conn.transaction():
            rows = await conn.fetch(
                """
                SELECT arxiv_id, title, summary
                FROM arxiv_daily_candidates
                WHERE user_id = $1 AND candidate_date = $2 AND arxiv_id = ANY($3::text[])
                """,
                int(user.id),
                run_day,
                ids,
            )
            by_id = {str(r["arxiv_id"]): r for r in rows}
            for arxiv_id in ids:
                row = by_id.get(arxiv_id)
                if row is None:
                    skipped += 1
                    continue
                task_row = await conn.fetchrow(
                    """
                    INSERT INTO tasks(user_id, title, content, status, priority, target_duration, start_date, due_date)
                    VALUES ($1, $2, $3, 'todo', 1, 0, NOW(), NULL)
                    RETURNING id
                    """,
                    int(user.id),
                    f"[Arxiv] {str(row['title'])}",
                    f"论文摘要要点：\n{str(row['summary'])}",
                )
                if task_row is None:
                    skipped += 1
                    continue
                await conn.execute(
                    """
                    INSERT INTO arxiv_daily_task_links(user_id, candidate_date, arxiv_id, task_id)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id, candidate_date, arxiv_id, task_id) DO NOTHING
                    """,
                    int(user.id),
                    run_day,
                    arxiv_id,
                    task_row["id"],
                )
                created_ids.append(str(task_row["id"]))
    return DailyTaskBatchCreateOut(created_count=len(created_ids), skipped_count=skipped, task_ids=created_ids)


@router.get("/health")
async def arxiv_health() -> dict[str, bool]:
    return {"ok": True}
