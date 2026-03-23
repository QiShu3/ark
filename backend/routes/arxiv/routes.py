from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from routes.arxiv.repository import (
    create_paper_tag,
    delete_paper_tag,
    get_daily_config,
    init_tables,
    list_paper_states,
    list_paper_tags,
    upsert_daily_config,
    upsert_paper_state,
)
from routes.arxiv.service import (
    batch_create_daily_tasks,
    close_arxiv_scheduler,
    fetch_daily_candidates,
    fetch_paper_details,
    get_daily_candidates_with_auto_refresh,
    init_arxiv_scheduler,
    parse_daily_time,
    refresh_daily_candidates_for_user,
    row_to_daily_candidate,
    row_to_daily_config,
    row_to_paper_state,
    row_to_paper_tag,
    search_arxiv_papers,
)
from routes.auth_routes import get_current_user

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


def _pool_from_request(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return pool


async def init_arxiv(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 arxiv 表")
    await init_tables(pool)
    await init_arxiv_scheduler(app)


async def close_arxiv(app: Any) -> None:
    await close_arxiv_scheduler(app)


@router.post("/search", response_model=list[ArxivPaperOut])
async def search_arxiv(
    payload: ArxivSearchRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[ArxivPaperOut]:
    _ = user
    papers = await search_arxiv_papers(
        keywords=payload.keywords,
        category=payload.category,
        author=payload.author,
        search_field=payload.search_field,
        limit=payload.limit,
        offset=payload.offset,
        sort_by=payload.sort_by,
        sort_order=payload.sort_order,
    )
    return [ArxivPaperOut(**p) for p in papers]


@router.post("/papers/details", response_model=list[ArxivPaperOut])
async def get_paper_details(
    payload: PaperDetailsRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[ArxivPaperOut]:
    _ = user
    papers = await fetch_paper_details(payload.arxiv_ids)
    return [ArxivPaperOut(**p) for p in papers]


@router.put("/papers/state", response_model=PaperStateOut)
async def upsert_paper_state_route(
    request: Request,
    payload: PaperStateUpsertRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> PaperStateOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await upsert_paper_state(
                conn,
                user_id=int(user.id),
                arxiv_id=payload.arxiv_id.strip(),
                title=(payload.title or "").strip(),
                is_favorite=payload.is_favorite,
                is_read=payload.is_read,
                is_skipped=payload.is_skipped,
                tag_ids=payload.tag_ids,
            )
    if row is None:
        raise HTTPException(status_code=500, detail="写入论文状态失败")
    return PaperStateOut(**row_to_paper_state(row))


@router.get("/papers", response_model=list[PaperStateOut])
async def list_paper_states_route(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    is_favorite: bool | None = Query(default=None),
    is_read: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[PaperStateOut]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await list_paper_states(
            conn,
            user_id=int(user.id),
            is_favorite=is_favorite,
            is_read=is_read,
            limit=limit,
            offset=offset,
        )
    return [PaperStateOut(**row_to_paper_state(row)) for row in rows]


@router.get("/papers/tags", response_model=list[PaperTagOut])
async def list_paper_tags_route(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[PaperTagOut]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await list_paper_tags(conn, user_id=int(user.id))
    return [PaperTagOut(**row_to_paper_tag(row)) for row in rows]


@router.post("/papers/tags", response_model=PaperTagOut)
async def create_paper_tag_route(
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
        row = await create_paper_tag(conn, user_id=int(user.id), name=name, color=color)
    if row is None:
        raise HTTPException(status_code=500, detail="创建标签失败")
    return PaperTagOut(**row_to_paper_tag(row))


@router.delete("/papers/tags/{tag_id}")
async def delete_paper_tag_route(
    tag_id: int,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, bool]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await delete_paper_tag(conn, user_id=int(user.id), tag_id=tag_id)
            if row is None:
                raise HTTPException(status_code=404, detail="标签不存在")
    return {"ok": True}


@router.get("/daily/config", response_model=DailyConfigOut | None)
async def get_daily_config_route(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> DailyConfigOut | None:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await get_daily_config(conn, user_id=int(user.id))
    if row is None:
        return None
    return DailyConfigOut(**row_to_daily_config(row))


@router.put("/daily/config", response_model=DailyConfigOut)
async def upsert_daily_config_route(
    request: Request,
    payload: DailyConfigUpsertRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> DailyConfigOut:
    pool = _pool_from_request(request)
    run_day = datetime.now(UTC).date()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await upsert_daily_config(
                conn,
                user_id=int(user.id),
                keywords=payload.keywords.strip(),
                category=payload.category.strip() if payload.category and payload.category.strip() else None,
                author=payload.author.strip() if payload.author and payload.author.strip() else None,
                limit_count=payload.limit,
                sort_by=payload.sort_by,
                sort_order=payload.sort_order,
                search_field=payload.search_field,
                update_time=parse_daily_time(payload.update_time),
            )
            if row is None:
                raise HTTPException(status_code=500, detail="保存每日配置失败")
            await refresh_daily_candidates_for_user(
                conn,
                user_id=int(user.id),
                candidate_day=run_day,
                config_row=row,
            )
            row = await get_daily_config(conn, user_id=int(user.id))
    if row is None:
        raise HTTPException(status_code=500, detail="读取每日配置失败")
    return DailyConfigOut(**row_to_daily_config(row))


@router.post("/daily/refresh", response_model=list[DailyCandidateOut])
async def refresh_daily_candidates_route(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[DailyCandidateOut]:
    pool = _pool_from_request(request)
    run_day = datetime.now(UTC).date()
    async with pool.acquire() as conn:
        async with conn.transaction():
            config_row = await get_daily_config(conn, user_id=int(user.id))
            if config_row is None:
                raise HTTPException(status_code=404, detail="请先保存每日配置")
            await refresh_daily_candidates_for_user(
                conn,
                user_id=int(user.id),
                candidate_day=run_day,
                config_row=config_row,
            )
            rows = await fetch_daily_candidates(conn, user_id=int(user.id), candidate_date=run_day)
            return [DailyCandidateOut(**row_to_daily_candidate(row)) for row in rows]


@router.get("/daily/candidates", response_model=list[DailyCandidateOut])
async def list_daily_candidates_route(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[DailyCandidateOut]:
    pool = _pool_from_request(request)
    run_day = datetime.now(UTC).date()
    async with pool.acquire() as conn:
        candidates = await get_daily_candidates_with_auto_refresh(conn, user_id=int(user.id), run_day=run_day)
    return [DailyCandidateOut(**c) for c in candidates]


@router.post("/daily/tasks/prepare")
async def prepare_daily_tasks_action(
    request: Request,
    payload: DailyTaskBatchCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, Any]:
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
async def commit_daily_tasks_route(
    request: Request,
    payload: DailyTaskBatchCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> DailyTaskBatchCreateOut:
    ids = [x.strip() for x in payload.arxiv_ids if isinstance(x, str) and x.strip()]
    if not ids:
        raise HTTPException(status_code=422, detail="缺少 arxiv_ids")
    pool = _pool_from_request(request)
    run_day = datetime.now(UTC).date()
    async with pool.acquire() as conn:
        async with conn.transaction():
            created_count, skipped_count, task_ids = await batch_create_daily_tasks(
                conn,
                user_id=int(user.id),
                run_day=run_day,
                arxiv_ids=ids,
            )
    return DailyTaskBatchCreateOut(created_count=created_count, skipped_count=skipped_count, task_ids=task_ids)


@router.get("/health")
async def arxiv_health() -> dict[str, bool]:
    return {"ok": True}
