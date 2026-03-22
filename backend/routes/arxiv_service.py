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
from typing import Any, Literal

import arxiv
import asyncpg
from fastapi import HTTPException

from routes.arxiv_repository import (
    delete_daily_candidates,
    fetch_daily_candidates,
    fetch_daily_candidates_for_tasks,
    fetch_daily_configs_for_scheduler,
    fetch_filtered_arxiv_ids,
    insert_daily_candidate,
    update_daily_config_last_run,
)

logger = logging.getLogger(__name__)

SortBy = Literal["relevance", "submitted_date", "last_updated_date"]
SortOrder = Literal["ascending", "descending"]
SearchField = Literal["title", "summary", "all"]

_SEARCH_CACHE_TTL_SECONDS = 10 * 60
_SEARCH_CACHE_STALE_SECONDS = 24 * 60 * 60
_SEARCH_CACHE: dict[str, _SearchCacheEntry] = {}
_SEARCH_CACHE_LOCK = Lock()
_DAILY_SCHEDULER_INTERVAL_SECONDS = 30
_DAILY_SCHEDULER_STATE_KEY = "arxiv_daily_scheduler_task"


@dataclass(frozen=True)
class _SortConfig:
    criterion: arxiv.SortCriterion
    order: arxiv.SortOrder


@dataclass(frozen=True)
class _SearchCacheEntry:
    saved_at: float
    papers: list[dict[str, Any]]


def normalize_arxiv_id(raw: str) -> str:
    tail = raw.rsplit("/", 1)[-1]
    return tail.split("v", 1)[0]


def parse_daily_time(raw: str) -> time_of_day:
    try:
        hour_s, minute_s = raw.split(":", 1)
        hour = int(hour_s)
        minute = int(minute_s)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="每日更新时间格式错误，需为 HH:MM") from exc
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise HTTPException(status_code=422, detail="每日更新时间范围错误，需为 00:00-23:59")
    return time_of_day(hour=hour, minute=minute)


def time_to_hhmm(value: time_of_day) -> str:
    return f"{value.hour:02d}:{value.minute:02d}"


def _build_keyword_queries(keywords: str, search_field: SearchField) -> list[str]:
    keyword = keywords.strip()
    field_map = {"title": "ti", "summary": "abs"}

    if search_field in field_map:
        prefix = field_map[search_field]
        if " " not in keyword:
            return [f"{prefix}:{keyword}"]
        phrase = keyword.replace('"', "").strip()
        if not phrase:
            return [f"{prefix}:{keyword}"]
        return [
            f'{prefix}:"{phrase}"',
            f"{prefix}:{keyword}",
        ]

    if " " not in keyword:
        return [f"all:{keyword}"]
    phrase = keyword.replace('"', "").strip()
    if not phrase:
        return [f"all:{keyword}"]
    return [
        f'ti:"{phrase}"',
        f'all:"{phrase}"',
        f"all:{keyword}",
    ]


def _compose_query(keyword_expr: str, category: str | None, author: str | None) -> str:
    parts: list[str] = [keyword_expr]
    if category and category.strip():
        parts.append(f"cat:{category.strip()}")
    if author and author.strip():
        parts.append(f"au:{author.strip()}")
    return " AND ".join(parts)


def _build_query_candidates(keywords: str, category: str | None, author: str | None, search_field: SearchField) -> list[str]:
    keyword_queries = _build_keyword_queries(keywords, search_field)
    return [_compose_query(q, category, author) for q in keyword_queries]


def _sort_config(sort_by: SortBy, sort_order: SortOrder) -> _SortConfig:
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
        criterion=criterion_map[sort_by],
        order=order_map[sort_order],
    )


def _search_cache_key(
    keywords: str,
    category: str | None,
    author: str | None,
    limit: int,
    offset: int,
    sort_by: str,
    sort_order: str,
) -> str:
    return "|".join(
        [
            keywords.strip(),
            (category or "").strip(),
            (author or "").strip(),
            str(limit),
            str(offset),
            sort_by,
            sort_order,
        ]
    )


def _cache_get(key: str, *, max_age_seconds: int) -> list[dict[str, Any]] | None:
    with _SEARCH_CACHE_LOCK:
        entry = _SEARCH_CACHE.get(key)
        if entry is None:
            return None
        if time.time() - entry.saved_at > max_age_seconds:
            return None
        return deepcopy(entry.papers)


def _cache_set(key: str, papers: list[dict[str, Any]]) -> None:
    with _SEARCH_CACHE_LOCK:
        _SEARCH_CACHE[key] = _SearchCacheEntry(saved_at=time.time(), papers=deepcopy(papers))


def _is_rate_limited_error(exc: Exception) -> bool:
    return re.search(r"\b429\b", str(exc)) is not None


def _search_sync(
    keywords: str,
    category: str | None,
    author: str | None,
    search_field: SearchField,
    limit: int,
    offset: int,
    sort_by: SortBy,
    sort_order: SortOrder,
) -> list[dict[str, Any]]:
    sort = _sort_config(sort_by, sort_order)
    client = arxiv.Client(page_size=min(limit, 100), delay_seconds=5.0, num_retries=5)
    for query in _build_query_candidates(keywords, category, author, search_field):
        search = arxiv.Search(
            query=query,
            max_results=limit + offset,
            sort_by=sort.criterion,
            sort_order=sort.order,
        )
        papers: list[dict[str, Any]] = []
        for result in client.results(search, offset=offset):
            authors = [n for n in (str(author.name).strip() for author in result.authors) if n]
            if not authors:
                logger.warning(f"No authors found for {result.entry_id} (title: {result.title})")
            papers.append(
                {
                    "arxiv_id": normalize_arxiv_id(str(result.entry_id)),
                    "title": str(result.title).strip(),
                    "authors": authors,
                    "published": result.published.isoformat(),
                    "summary": str(result.summary).strip(),
                }
            )
        if papers:
            return papers
    return []


async def search_arxiv_papers(
    keywords: str,
    category: str | None,
    author: str | None,
    search_field: SearchField,
    limit: int,
    offset: int,
    sort_by: SortBy,
    sort_order: SortOrder,
) -> list[dict[str, Any]]:
    cache_key = _search_cache_key(keywords, category, author, limit, offset, sort_by, sort_order)
    cached = _cache_get(cache_key, max_age_seconds=_SEARCH_CACHE_TTL_SECONDS)
    if cached is not None:
        return cached
    try:
        papers = await asyncio.to_thread(
            _search_sync,
            keywords,
            category,
            author,
            search_field,
            limit,
            offset,
            sort_by,
            sort_order,
        )
        _cache_set(cache_key, papers)
        return papers
    except Exception as exc:
        if _is_rate_limited_error(exc):
            stale = _cache_get(cache_key, max_age_seconds=_SEARCH_CACHE_STALE_SECONDS)
            if stale is not None:
                return stale
            raise HTTPException(status_code=429, detail="ArXiv 当前限流，请 30-60 秒后重试") from exc
        raise HTTPException(status_code=502, detail=f"ArXiv 检索失败: {exc}") from exc


async def fetch_paper_details(arxiv_ids: list[str]) -> list[dict[str, Any]]:
    try:
        client = arxiv.Client(page_size=len(arxiv_ids), delay_seconds=5.0, num_retries=5)
        search = arxiv.Search(id_list=arxiv_ids)
        papers: list[dict[str, Any]] = []
        for result in client.results(search):
            papers.append(
                {
                    "arxiv_id": normalize_arxiv_id(str(result.entry_id)),
                    "title": str(result.title).strip(),
                    "authors": [str(author.name).strip() for author in result.authors],
                    "published": result.published.isoformat(),
                    "summary": str(result.summary).strip(),
                }
            )
        return papers
    except Exception as exc:
        if _is_rate_limited_error(exc):
            raise HTTPException(status_code=429, detail="ArXiv 当前限流，请稍后重试") from exc
        raise HTTPException(status_code=502, detail=f"获取论文详情失败: {exc}") from exc


async def refresh_daily_candidates_for_user(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    candidate_day: date,
    config_row: asyncpg.Record,
) -> list[dict[str, Any]]:
    target_count = int(config_row["limit_count"])
    fetch_limit = max(target_count * 3, 50)
    papers = await search_arxiv_papers(
        keywords=str(config_row["keywords"]),
        category=str(config_row["category"]) if config_row["category"] else None,
        author=str(config_row["author"]) if config_row["author"] else None,
        search_field=config_row["search_field"],
        limit=fetch_limit,
        offset=0,
        sort_by=config_row["sort_by"],
        sort_order=config_row["sort_order"],
    )
    paper_ids = [normalize_arxiv_id(p["arxiv_id"]) for p in papers]
    filtered_ids = await fetch_filtered_arxiv_ids(conn, user_id=user_id, arxiv_ids=paper_ids)
    valid_papers = [p for p in papers if normalize_arxiv_id(p["arxiv_id"]) not in filtered_ids]
    final_papers = valid_papers[:target_count]
    await delete_daily_candidates(conn, user_id=user_id, candidate_date=candidate_day)
    for paper in final_papers:
        await insert_daily_candidate(
            conn,
            user_id=user_id,
            candidate_date=candidate_day,
            arxiv_id=normalize_arxiv_id(paper["arxiv_id"]),
            title=paper["title"],
            authors_json=json.dumps(paper["authors"], ensure_ascii=False),
            published=paper["published"],
            summary=paper["summary"],
        )
    await update_daily_config_last_run(conn, user_id=user_id, candidate_date=candidate_day)
    return final_papers


async def daily_scheduler_loop(app: Any) -> None:
    while True:
        try:
            pool = getattr(getattr(app, "state", None), "auth_pool", None)
            if pool is not None:
                now = datetime.now(UTC)
                today = now.date()
                current_hhmm = f"{now.hour:02d}:{now.minute:02d}"
                async with pool.acquire() as conn:
                    rows = await fetch_daily_configs_for_scheduler(conn, current_hhmm=current_hhmm, today=today)
                    for row in rows:
                        await refresh_daily_candidates_for_user(
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


async def init_arxiv_scheduler(app: Any) -> None:
    scheduler = getattr(getattr(app, "state", None), _DAILY_SCHEDULER_STATE_KEY, None)
    if scheduler is None or scheduler.done():
        app.state.arxiv_daily_scheduler_task = asyncio.create_task(daily_scheduler_loop(app))


async def close_arxiv_scheduler(app: Any) -> None:
    task = getattr(getattr(app, "state", None), _DAILY_SCHEDULER_STATE_KEY, None)
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    app.state.arxiv_daily_scheduler_task = None


def row_to_daily_config(row: asyncpg.Record) -> dict[str, Any]:
    update_time = row["update_time"]
    updated_at = row["updated_at"]
    last_run_on = row["last_run_on"]
    return {
        "user_id": int(row["user_id"]),
        "keywords": str(row["keywords"]),
        "category": str(row["category"]) if row["category"] is not None else None,
        "author": str(row["author"]) if row["author"] is not None else None,
        "limit": int(row["limit_count"]),
        "sort_by": row["sort_by"],
        "sort_order": row["sort_order"],
        "search_field": row["search_field"],
        "update_time": time_to_hhmm(update_time),
        "updated_at": updated_at.isoformat(),
        "last_run_on": last_run_on.isoformat() if last_run_on is not None else None,
    }


def row_to_paper_state(row: asyncpg.Record) -> dict[str, Any]:
    from routes.arxiv_repository import parse_jsonb_int_list

    tag_ids = parse_jsonb_int_list(row.get("tag_ids_json", []))
    return {
        "user_id": int(row["user_id"]),
        "arxiv_id": str(row["arxiv_id"]),
        "is_favorite": bool(row["is_favorite"]),
        "is_read": bool(row["is_read"]),
        "is_skipped": bool(row["is_skipped"]),
        "tag_ids": tag_ids,
    }


def row_to_paper_tag(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "user_id": int(row["user_id"]),
        "name": str(row["name"]),
        "color": str(row["color"]),
    }


def row_to_daily_candidate(row: asyncpg.Record) -> dict[str, Any]:
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

    return {
        "arxiv_id": str(row["arxiv_id"]),
        "title": str(row["title"]),
        "authors": [str(a) for a in authors],
        "published": str(row["published"]),
        "summary": str(row["summary"]),
        "is_read": bool(row["is_read"]),
        "linked_task_id": str(row["linked_task_id"]) if row["linked_task_id"] else None,
        "linked_task_status": str(row["linked_task_status"]) if row["linked_task_status"] else None,
    }


async def get_daily_candidates_with_auto_refresh(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    run_day: date,
) -> list[dict[str, Any]]:
    from routes.arxiv_repository import get_daily_config

    candidates = await fetch_daily_candidates(conn, user_id=user_id, candidate_date=run_day)
    if candidates:
        return [row_to_daily_candidate(row) for row in candidates]

    async with conn.transaction():
        config_row = await get_daily_config(conn, user_id=user_id)
        if config_row is None:
            return []

        if config_row["last_run_on"] == run_day:
            return []

        await refresh_daily_candidates_for_user(
            conn,
            user_id=user_id,
            candidate_day=run_day,
            config_row=config_row,
        )
        candidates = await fetch_daily_candidates(conn, user_id=user_id, candidate_date=run_day)
        return [row_to_daily_candidate(row) for row in candidates]


async def batch_create_daily_tasks(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    run_day: date,
    arxiv_ids: list[str],
) -> tuple[int, int, list[str]]:
    from routes.arxiv_repository import create_task_and_link

    rows = await fetch_daily_candidates_for_tasks(conn, user_id=user_id, candidate_date=run_day, arxiv_ids=arxiv_ids)
    by_id = {str(r["arxiv_id"]): r for r in rows}
    created_ids: list[str] = []
    skipped = 0
    for arxiv_id in arxiv_ids:
        row = by_id.get(arxiv_id)
        if row is None:
            skipped += 1
            continue
        task_id = await create_task_and_link(
            conn,
            user_id=user_id,
            candidate_date=run_day,
            arxiv_id=arxiv_id,
            title=str(row["title"]),
            summary=str(row["summary"]),
        )
        if task_id is None:
            skipped += 1
            continue
        created_ids.append(task_id)
    return len(created_ids), skipped, created_ids
