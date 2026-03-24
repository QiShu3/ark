from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import HTTPException, Request

from routes.agents.models import AgentActionResponse, AgentContext
from routes.agents.policy import evaluate_policy, forbidden
from routes.arxiv.service import batch_create_daily_tasks
from routes.todo_routes import TaskOut, TaskUpdateRequest, _row_to_task

APPROVAL_TTL = timedelta(minutes=10)


def pool_from_request(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return pool


async def init_agent(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建审批表")
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_approvals (
              id TEXT PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              agent_type TEXT NOT NULL,
              app_id TEXT NULL,
              session_id TEXT NULL,
              action_id TEXT NOT NULL,
              payload_json JSONB NOT NULL,
              payload_hash TEXT NOT NULL,
              resource_scope TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              expires_at TIMESTAMPTZ NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              confirmed_at TIMESTAMPTZ NULL,
              CONSTRAINT chk_agent_approval_status CHECK (status IN ('pending', 'confirmed', 'expired'))
            );
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_agent_approvals_user_status ON agent_approvals(user_id, status, expires_at);"
        )


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def payload_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


async def create_approval(
    conn: Any,
    *,
    ctx: AgentContext,
    action_id: str,
    resource_scope: str,
    payload: dict[str, Any],
) -> tuple[str, datetime]:
    approval_id = "appr_" + secrets.token_urlsafe(16)
    expires_at = datetime.now(UTC) + APPROVAL_TTL
    await conn.execute(
        """
        INSERT INTO agent_approvals(
            id, user_id, agent_type, app_id, session_id, action_id,
            payload_json, payload_hash, resource_scope, status, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 'pending', $10)
        """,
        approval_id,
        ctx.user_id,
        ctx.agent_type,
        ctx.app_id,
        ctx.session_id,
        action_id,
        canonical_json(payload),
        payload_hash(payload),
        resource_scope,
        expires_at,
    )
    return approval_id, expires_at


async def consume_approval(
    conn: Any,
    *,
    ctx: AgentContext,
    approval_id: str,
    action_id: str,
) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """
        SELECT id, payload_json, status, expires_at, action_id, agent_type, app_id, session_id
        FROM agent_approvals
        WHERE id = $1 AND user_id = $2
        """,
        approval_id,
        ctx.user_id,
    )
    if row is None or str(row["action_id"]) != action_id or str(row["agent_type"]) != ctx.agent_type:
        return None
    row_app_id = str(row["app_id"]) if row["app_id"] is not None else None
    row_session_id = str(row["session_id"]) if row["session_id"] is not None else None
    if row_app_id != ctx.app_id or row_session_id != ctx.session_id or str(row["status"]) != "pending":
        return None
    expires_at = row["expires_at"]
    if expires_at is None or expires_at <= datetime.now(UTC):
        await conn.execute("UPDATE agent_approvals SET status = 'expired' WHERE id = $1", approval_id)
        return None
    await conn.execute("UPDATE agent_approvals SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1", approval_id)
    payload = row["payload_json"]
    if isinstance(payload, str):
        return json.loads(payload)
    return dict(payload)


async def fetch_task_row(conn: Any, *, task_id: UUID, user_id: int, include_deleted: bool = False) -> Any:
    return await conn.fetchrow(
        """
        SELECT id, user_id, title, content, status, priority, target_duration,
               current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids, task_type, tags,
               actual_duration, start_date, due_date, is_deleted, created_at, updated_at
        FROM tasks
        WHERE id = $1 AND user_id = $2 AND ($3::BOOLEAN = TRUE OR is_deleted = FALSE)
        """,
        task_id,
        user_id,
        include_deleted,
    )


async def list_tasks_action(conn: Any, *, user_id: int, payload: dict[str, Any], summary_only: bool) -> dict[str, Any]:
    status_value = payload.get("status")
    query_value = payload.get("q")
    limit = int(payload.get("limit") or 50)
    offset = int(payload.get("offset") or 0)
    clauses: list[str] = ["user_id = $1", "is_deleted = FALSE"]
    args: list[Any] = [user_id]
    if status_value in {"todo", "done"}:
        args.append(status_value)
        clauses.append(f"status = ${len(args)}")
    if isinstance(query_value, str) and query_value.strip():
        args.append(f"%{query_value.strip()}%")
        clauses.append(f"title ILIKE ${len(args)}")
    args.extend([limit, offset])
    rows = await conn.fetch(
        f"""
        SELECT id, user_id, title, content, status, priority, target_duration,
               current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids, task_type, tags,
               actual_duration, start_date, due_date, is_deleted, created_at, updated_at
        FROM tasks
        WHERE {" AND ".join(clauses)}
        ORDER BY updated_at DESC
        LIMIT ${len(args) - 1} OFFSET ${len(args)}
        """,
        *args,
    )
    if summary_only:
        return {
            "items": [
                {
                    "id": str(row["id"]),
                    "title": str(row["title"]),
                    "status": str(row["status"]),
                    "priority": int(row["priority"]),
                    "due_date": row["due_date"].isoformat() if row["due_date"] else None,
                }
                for row in rows
            ],
            "view": "summary",
        }
    return {"items": [TaskOut.model_validate(_row_to_task(row)).model_dump(mode="json") for row in rows], "view": "full"}


async def update_task_action(conn: Any, *, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    task_id_raw = payload.get("task_id")
    patch_raw = payload.get("patch")
    if not isinstance(task_id_raw, str):
        raise HTTPException(status_code=422, detail="缺少 task_id")
    if not isinstance(patch_raw, dict):
        raise HTTPException(status_code=422, detail="缺少 patch")
    task_id = UUID(task_id_raw)
    body = TaskUpdateRequest.model_validate(patch_raw)
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        row = await fetch_task_row(conn, task_id=task_id, user_id=user_id)
        if row is None:
            raise HTTPException(status_code=404, detail="任务不存在")
        return TaskOut.model_validate(_row_to_task(row)).model_dump(mode="json")
    allowed_cols = {
        "title": "title",
        "content": "content",
        "status": "status",
        "priority": "priority",
        "target_duration": "target_duration",
        "current_cycle_count": "current_cycle_count",
        "target_cycle_count": "target_cycle_count",
        "cycle_period": "cycle_period",
        "cycle_every_days": "cycle_every_days",
        "event": "event",
        "event_ids": "event_ids",
        "task_type": "task_type",
        "tags": "tags",
        "start_date": "start_date",
        "due_date": "due_date",
    }
    sets: list[str] = []
    args: list[Any] = []
    for key, value in patch.items():
        col = allowed_cols.get(key)
        if col is None:
            continue
        args.append(value)
        sets.append(f"{col} = ${len(args)}")
    if not sets:
        raise HTTPException(status_code=422, detail="patch 中没有可更新字段")
    args.extend([task_id, user_id])
    row = await conn.fetchrow(
        f"""
        UPDATE tasks
        SET {", ".join(sets)}, updated_at = NOW()
        WHERE id = ${len(args) - 1} AND user_id = ${len(args)} AND is_deleted = FALSE
        RETURNING id, user_id, title, content, status, priority, target_duration,
                  current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids, task_type, tags,
                  actual_duration, start_date, due_date, is_deleted, created_at, updated_at
        """,
        *args,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return TaskOut.model_validate(_row_to_task(row)).model_dump(mode="json")


async def prepare_task_delete_action(
    conn: Any, *, ctx: AgentContext, resource_scope: str, payload: dict[str, Any]
) -> AgentActionResponse:
    task_id_raw = payload.get("task_id")
    if not isinstance(task_id_raw, str):
        raise HTTPException(status_code=422, detail="缺少 task_id")
    row = await fetch_task_row(conn, task_id=UUID(task_id_raw), user_id=ctx.user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    approval_id, expires_at = await create_approval(
        conn, ctx=ctx, action_id="task.delete", resource_scope=resource_scope, payload={"task_id": task_id_raw}
    )
    return AgentActionResponse(
        type="approval_required",
        action_id="task.delete.prepare",
        approval_id=approval_id,
        title="删除任务",
        message=f"该操作将删除任务《{row['title']}》。确认后不可自动恢复。",
        impact={"resource_type": "task", "resource_ids": [task_id_raw], "count": 1},
        commit_action="task.delete.commit",
        expires_at=expires_at,
    )


async def commit_task_delete_action(conn: Any, *, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    task_id_raw = payload.get("task_id")
    if not isinstance(task_id_raw, str):
        raise HTTPException(status_code=422, detail="缺少 task_id")
    tag = await conn.execute(
        """
        UPDATE tasks
        SET is_deleted = TRUE, updated_at = NOW()
        WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
        """,
        UUID(task_id_raw),
        user_id,
    )
    if not tag.startswith("UPDATE ") or tag.endswith(" 0"):
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"ok": True, "task_id": task_id_raw}


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


async def execute_action_with_context(
    pool: asyncpg.Pool, *, action_name: str, ctx: AgentContext, payload: dict[str, Any]
) -> AgentActionResponse:
    if action_name == "task.list":
        rule, scope_or_reason = evaluate_policy("task.list", ctx)
        if rule is None or scope_or_reason is None:
            return forbidden(action_name, scope_or_reason or "策略拒绝")
        async with pool.acquire() as conn:
            data = await list_tasks_action(conn, user_id=ctx.user_id, payload=payload, summary_only=scope_or_reason == "cross_app_summary")
        return AgentActionResponse(type="result", action_id=action_name, data=data)
    if action_name == "task.update":
        rule, scope_or_reason = evaluate_policy("task.update", ctx)
        if rule is None or scope_or_reason is None:
            return forbidden(action_name, scope_or_reason or "策略拒绝")
        async with pool.acquire() as conn:
            data = await update_task_action(conn, user_id=ctx.user_id, payload=payload)
        return AgentActionResponse(type="result", action_id=action_name, data=data)
    if action_name == "task.delete.prepare":
        rule, scope_or_reason = evaluate_policy("task.delete", ctx)
        if rule is None or scope_or_reason is None:
            return forbidden(action_name, scope_or_reason or "策略拒绝")
        async with pool.acquire() as conn:
            async with conn.transaction():
                return await prepare_task_delete_action(conn, ctx=ctx, resource_scope=scope_or_reason, payload=payload)
    if action_name == "task.delete.commit":
        rule, scope_or_reason = evaluate_policy("task.delete", ctx)
        if rule is None or scope_or_reason is None:
            return forbidden(action_name, scope_or_reason or "策略拒绝")
        approval_id = payload.get("approval_id")
        if not isinstance(approval_id, str) or not approval_id.strip():
            raise HTTPException(status_code=422, detail="缺少 approval_id")
        async with pool.acquire() as conn:
            async with conn.transaction():
                stored_payload = await consume_approval(conn, ctx=ctx, approval_id=approval_id.strip(), action_id="task.delete")
                if stored_payload is None:
                    return forbidden(action_name, "审批票据无效、已过期或已使用")
                data = await commit_task_delete_action(conn, user_id=ctx.user_id, payload=stored_payload)
        return AgentActionResponse(type="result", action_id=action_name, data=data)
    if action_name == "arxiv.daily_tasks.prepare":
        rule, scope_or_reason = evaluate_policy("arxiv.daily_tasks", ctx)
        if rule is None or scope_or_reason is None:
            return forbidden(action_name, scope_or_reason or "策略拒绝")
        async with pool.acquire() as conn:
            async with conn.transaction():
                return await prepare_arxiv_daily_tasks_action(conn, ctx=ctx, resource_scope=scope_or_reason, payload=payload)
    if action_name == "arxiv.daily_tasks.commit":
        rule, scope_or_reason = evaluate_policy("arxiv.daily_tasks", ctx)
        if rule is None or scope_or_reason is None:
            return forbidden(action_name, scope_or_reason or "策略拒绝")
        approval_id = payload.get("approval_id")
        if not isinstance(approval_id, str) or not approval_id.strip():
            raise HTTPException(status_code=422, detail="缺少 approval_id")
        async with pool.acquire() as conn:
            async with conn.transaction():
                stored_payload = await consume_approval(conn, ctx=ctx, approval_id=approval_id.strip(), action_id="arxiv.daily_tasks")
                if stored_payload is None:
                    return forbidden(action_name, "审批票据无效、已过期或已使用")
                data = await commit_arxiv_daily_tasks_action(conn, user_id=ctx.user_id, payload=stored_payload)
        return AgentActionResponse(type="result", action_id=action_name, data=data)
    raise HTTPException(status_code=404, detail="未知动作")
