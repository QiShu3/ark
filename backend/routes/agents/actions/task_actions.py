from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException

from routes.agents.models import AgentActionResponse, AgentContext
from routes.todo_routes import TaskOut, TaskUpdateRequest, _row_to_task


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
    return AgentActionResponse(
        type="approval_required",
        action_id="task.delete.prepare",
        data={"task_id": task_id_raw},
        title="删除任务",
        message=f"该操作将删除任务《{row['title']}》。确认后不可自动恢复。",
        impact={"resource_type": "task", "resource_ids": [task_id_raw], "count": 1},
        commit_action="task.delete.commit",
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


async def handle_task_list(
    conn: Any, *, ctx: AgentContext, payload: dict[str, Any], resource_scope: str, approval_payload: dict[str, Any] | None
) -> dict[str, Any]:
    _ = approval_payload
    return await list_tasks_action(conn, user_id=ctx.user_id, payload=payload, summary_only=resource_scope == "cross_app_summary")


async def handle_task_update(
    conn: Any, *, ctx: AgentContext, payload: dict[str, Any], resource_scope: str, approval_payload: dict[str, Any] | None
) -> dict[str, Any]:
    _ = resource_scope
    _ = approval_payload
    return await update_task_action(conn, user_id=ctx.user_id, payload=payload)


async def handle_task_delete_prepare(
    conn: Any, *, ctx: AgentContext, payload: dict[str, Any], resource_scope: str, approval_payload: dict[str, Any] | None
) -> AgentActionResponse:
    _ = approval_payload
    return await prepare_task_delete_action(conn, ctx=ctx, resource_scope=resource_scope, payload=payload)


async def handle_task_delete_commit(
    conn: Any, *, ctx: AgentContext, payload: dict[str, Any], resource_scope: str, approval_payload: dict[str, Any] | None
) -> dict[str, Any]:
    _ = resource_scope
    _ = approval_payload
    return await commit_task_delete_action(conn, user_id=ctx.user_id, payload=payload)
