from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException

from routes.agents.approval import create_approval
from routes.agents.models import AgentActionResponse, AgentContext
from routes.arxiv.service import (
    batch_create_daily_tasks,
    fetch_paper_details,
    get_daily_candidates_with_auto_refresh,
    search_arxiv_papers,
)


async def prepare_arxiv_daily_tasks_action(
    conn: Any, *, ctx: AgentContext, resource_scope: str, payload: dict[str, Any]
) -> AgentActionResponse:
    raw_ids = payload.get("arxiv_ids")
    ids = [str(x).strip() for x in raw_ids if isinstance(x, str) and str(x).strip()] if isinstance(raw_ids, list) else []
    if not ids:
        raise HTTPException(status_code=422, detail="缺少 arxiv_ids")
    approval_id, expires_at = await create_approval(
        conn, ctx=ctx, action_id="arxiv.daily_tasks", resource_scope=resource_scope, payload={"arxiv_ids": ids}
    )
    return AgentActionResponse(
        type="approval_required",
        action_id="arxiv.daily_tasks.prepare",
        approval_id=approval_id,
        title=f"将今日 {len(ids)} 篇论文加入任务",
        message=f"将按每篇论文创建一条任务，共 {len(ids)} 条。确认后执行。",
        impact={"resource_type": "arxiv_daily_candidates", "resource_ids": ids, "count": len(ids)},
        commit_action="arxiv.daily_tasks.commit",
        expires_at=expires_at,
    )


async def commit_arxiv_daily_tasks_action(conn: Any, *, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    raw_ids = payload.get("arxiv_ids")
    ids = [str(x).strip() for x in raw_ids if isinstance(x, str) and str(x).strip()] if isinstance(raw_ids, list) else []
    if not ids:
        raise HTTPException(status_code=422, detail="缺少 arxiv_ids")
    run_day = datetime.now(UTC).date()
    created_count, skipped_count, task_ids = await batch_create_daily_tasks(conn, user_id=user_id, run_day=run_day, arxiv_ids=ids)
    return {"created_count": created_count, "skipped_count": skipped_count, "task_ids": task_ids}


async def arxiv_daily_candidates_action(conn: Any, *, user_id: int) -> dict[str, Any]:
    run_day = datetime.now(UTC).date()
    items = await get_daily_candidates_with_auto_refresh(conn, user_id=user_id, run_day=run_day)
    return {"items": items, "date": run_day.isoformat()}


async def arxiv_search_action(payload: dict[str, Any]) -> dict[str, Any]:
    keywords = payload.get("keywords")
    if not isinstance(keywords, str) or not keywords.strip():
        raise HTTPException(status_code=422, detail="缺少 keywords")

    category = payload.get("category")
    author = payload.get("author")
    limit_raw = payload.get("limit", 20)
    offset_raw = payload.get("offset", 0)
    sort_by = payload.get("sort_by", "submitted_date")
    sort_order = payload.get("sort_order", "descending")
    search_field = payload.get("search_field", "title")

    try:
        limit = int(limit_raw)
        offset = int(offset_raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="limit 或 offset 格式错误") from exc

    if limit < 1 or limit > 100:
        raise HTTPException(status_code=422, detail="limit 必须在 1 到 100 之间")
    if offset < 0:
        raise HTTPException(status_code=422, detail="offset 不能小于 0")
    if sort_by not in {"relevance", "submitted_date", "last_updated_date"}:
        raise HTTPException(status_code=422, detail="sort_by 非法")
    if sort_order not in {"ascending", "descending"}:
        raise HTTPException(status_code=422, detail="sort_order 非法")
    if search_field not in {"title", "summary", "all"}:
        raise HTTPException(status_code=422, detail="search_field 非法")
    if category is not None and not isinstance(category, str):
        raise HTTPException(status_code=422, detail="category 格式错误")
    if author is not None and not isinstance(author, str):
        raise HTTPException(status_code=422, detail="author 格式错误")

    items = await search_arxiv_papers(
        keywords=keywords.strip(),
        category=category.strip() if isinstance(category, str) and category.strip() else None,
        author=author.strip() if isinstance(author, str) and author.strip() else None,
        search_field=search_field,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return {"items": items, "count": len(items)}


async def arxiv_paper_details_action(payload: dict[str, Any]) -> dict[str, Any]:
    raw_ids = payload.get("arxiv_ids")
    ids = [str(x).strip() for x in raw_ids if isinstance(x, str) and str(x).strip()] if isinstance(raw_ids, list) else []
    if not ids:
        raise HTTPException(status_code=422, detail="缺少 arxiv_ids")
    items = await fetch_paper_details(ids)
    return {"items": items, "count": len(items)}


async def handle_arxiv_daily_tasks_prepare(
    conn: Any, *, ctx: AgentContext, payload: dict[str, Any], resource_scope: str, approval_payload: dict[str, Any] | None
) -> AgentActionResponse:
    _ = approval_payload
    return await prepare_arxiv_daily_tasks_action(conn, ctx=ctx, resource_scope=resource_scope, payload=payload)


async def handle_arxiv_daily_candidates(
    conn: Any, *, ctx: AgentContext, payload: dict[str, Any], resource_scope: str, approval_payload: dict[str, Any] | None
) -> dict[str, Any]:
    _ = ctx
    _ = payload
    _ = resource_scope
    _ = approval_payload
    return await arxiv_daily_candidates_action(conn, user_id=ctx.user_id)


async def handle_arxiv_search(
    conn: Any, *, ctx: AgentContext, payload: dict[str, Any], resource_scope: str, approval_payload: dict[str, Any] | None
) -> dict[str, Any]:
    _ = conn
    _ = ctx
    _ = resource_scope
    _ = approval_payload
    return await arxiv_search_action(payload)


async def handle_arxiv_paper_details(
    conn: Any, *, ctx: AgentContext, payload: dict[str, Any], resource_scope: str, approval_payload: dict[str, Any] | None
) -> dict[str, Any]:
    _ = conn
    _ = ctx
    _ = resource_scope
    _ = approval_payload
    return await arxiv_paper_details_action(payload)


async def handle_arxiv_daily_tasks_commit(
    conn: Any, *, ctx: AgentContext, payload: dict[str, Any], resource_scope: str, approval_payload: dict[str, Any] | None
) -> dict[str, Any]:
    _ = payload
    _ = resource_scope
    if approval_payload is None:
        raise HTTPException(status_code=422, detail="缺少审批负载")
    return await commit_arxiv_daily_tasks_action(conn, user_id=ctx.user_id, payload=approval_payload)
