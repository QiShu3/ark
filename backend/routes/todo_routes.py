from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from routes.auth_routes import get_current_user

router = APIRouter(prefix="/todo", tags=["todo"])

TaskStatus = Literal["todo", "done"]
TaskCyclePeriod = Literal["daily", "weekly", "monthly", "custom"]


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str | None = None
    status: TaskStatus = "todo"
    priority: int = Field(default=0, ge=0, le=3)
    target_duration: int = Field(default=0, ge=0)
    current_cycle_count: int = Field(default=0, ge=0)
    target_cycle_count: int = Field(default=0, ge=0)
    cycle_period: TaskCyclePeriod = "daily"
    cycle_every_days: int | None = Field(default=None, ge=1)
    event: str = ""
    tags: list[str] = Field(default_factory=list)
    start_date: datetime | None = None
    due_date: datetime | None = None


class TaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = None
    status: TaskStatus | None = None
    priority: int | None = Field(default=None, ge=0, le=3)
    target_duration: int | None = Field(default=None, ge=0)
    current_cycle_count: int | None = Field(default=None, ge=0)
    target_cycle_count: int | None = Field(default=None, ge=0)
    cycle_period: TaskCyclePeriod | None = None
    cycle_every_days: int | None = Field(default=None, ge=1)
    event: str | None = None
    tags: list[str] | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None


class TaskOut(BaseModel):
    id: UUID
    user_id: int
    title: str
    content: str | None
    status: TaskStatus
    priority: int
    target_duration: int
    current_cycle_count: int
    target_cycle_count: int
    cycle_period: TaskCyclePeriod
    cycle_every_days: int | None
    event: str
    tags: list[str]
    actual_duration: int
    start_date: datetime | None
    due_date: datetime | None
    is_deleted: bool
    created_at: datetime
    updated_at: datetime


class FocusLogCreateRequest(BaseModel):
    duration: int = Field(gt=0)
    start_time: datetime
    end_at: datetime | None = None


class FocusLogOut(BaseModel):
    id: UUID
    user_id: int
    task_id: UUID
    duration: int
    start_time: datetime
    end_at: datetime | None
    created_at: datetime


class FocusTodayOut(BaseModel):
    seconds: int
    minutes: int


class TaskFocusStats(BaseModel):
    id: UUID
    title: str
    duration: int


class FocusStatsOut(BaseModel):
    total_duration: int
    tasks: list[TaskFocusStats]


def _pool_from_request(request: Request) -> asyncpg.Pool:
    """从 FastAPI request 中获取数据库连接池（复用 auth_pool）。"""
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return pool


async def init_todo(app: Any) -> None:
    """初始化 ToDo 所需数据表（复用已创建的连接池）。"""
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 ToDo 表")

    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              title VARCHAR(255) NOT NULL,
              content TEXT NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'todo',
              priority INTEGER NOT NULL DEFAULT 0,
              target_duration INTEGER NOT NULL DEFAULT 0,
              current_cycle_count INTEGER NOT NULL DEFAULT 0,
              target_cycle_count INTEGER NOT NULL DEFAULT 0,
              cycle_period VARCHAR(20) NOT NULL DEFAULT 'daily',
              cycle_every_days INTEGER NULL,
              event TEXT NOT NULL DEFAULT '',
              tags TEXT[] NOT NULL DEFAULT '{}',
              actual_duration INTEGER NOT NULL DEFAULT 0,
              start_date TIMESTAMPTZ NULL,
              due_date TIMESTAMPTZ NULL,
              is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_tasks_status CHECK (status IN ('todo', 'done')),
              CONSTRAINT chk_tasks_priority CHECK (priority BETWEEN 0 AND 3),
              CONSTRAINT chk_tasks_target_duration CHECK (target_duration >= 0),
              CONSTRAINT chk_tasks_current_cycle_count CHECK (current_cycle_count >= 0),
              CONSTRAINT chk_tasks_target_cycle_count CHECK (target_cycle_count >= 0),
              CONSTRAINT chk_tasks_cycle_period CHECK (cycle_period IN ('daily', 'weekly', 'monthly', 'custom')),
              CONSTRAINT chk_tasks_cycle_every_days CHECK (
                  (cycle_period <> 'custom' AND cycle_every_days IS NULL)
                  OR
                  (cycle_period = 'custom' AND cycle_every_days IS NOT NULL AND cycle_every_days >= 1)
              ),
              CONSTRAINT chk_tasks_actual_duration CHECK (actual_duration >= 0)
            );
            """
        )
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS current_cycle_count INTEGER NOT NULL DEFAULT 0;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS target_cycle_count INTEGER NOT NULL DEFAULT 0;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cycle_period VARCHAR(20) NOT NULL DEFAULT 'daily';")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cycle_every_days INTEGER NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event TEXT NOT NULL DEFAULT '';")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';")
        await conn.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS category;")
        await conn.execute("UPDATE tasks SET status = 'todo' WHERE status = 'doing';")
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_status;")
        await conn.execute("ALTER TABLE tasks ADD CONSTRAINT chk_tasks_status CHECK (status IN ('todo', 'done'));")
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_current_cycle_count;")
        await conn.execute(
            "ALTER TABLE tasks ADD CONSTRAINT chk_tasks_current_cycle_count CHECK (current_cycle_count >= 0);"
        )
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_target_cycle_count;")
        await conn.execute(
            "ALTER TABLE tasks ADD CONSTRAINT chk_tasks_target_cycle_count CHECK (target_cycle_count >= 0);"
        )
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_cycle_period;")
        await conn.execute(
            "ALTER TABLE tasks ADD CONSTRAINT chk_tasks_cycle_period CHECK (cycle_period IN ('daily', 'weekly', 'monthly', 'custom'));"
        )
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_cycle_every_days;")
        await conn.execute(
            """
            ALTER TABLE tasks
            ADD CONSTRAINT chk_tasks_cycle_every_days CHECK (
                (cycle_period <> 'custom' AND cycle_every_days IS NULL)
                OR
                (cycle_period = 'custom' AND cycle_every_days IS NOT NULL AND cycle_every_days >= 1)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS focus_logs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
              duration INTEGER NOT NULL,
              start_time TIMESTAMPTZ NOT NULL,
              end_at TIMESTAMPTZ NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_focus_logs_duration CHECK (duration >= 0),
              CONSTRAINT chk_focus_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time)
            );
            """
        )

        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted_status ON tasks(user_id, is_deleted, status);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted_due_date ON tasks(user_id, is_deleted, due_date);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted_start_date ON tasks(user_id, is_deleted, start_date);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_focus_logs_user_start ON focus_logs(user_id, start_time DESC);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_focus_logs_task_start ON focus_logs(task_id, start_time DESC);"
        )
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_focus_open_per_user ON focus_logs(user_id) WHERE end_at IS NULL;"
        )
        # 迁移：允许 end_at 为空、放宽 duration 校验并更新时间一致性约束
        await conn.execute("ALTER TABLE focus_logs ALTER COLUMN end_at DROP NOT NULL;")
        await conn.execute("ALTER TABLE focus_logs DROP CONSTRAINT IF EXISTS chk_focus_logs_duration;")
        await conn.execute("ALTER TABLE focus_logs DROP CONSTRAINT IF EXISTS chk_focus_logs_end_at;")
        await conn.execute("ALTER TABLE focus_logs ADD CONSTRAINT chk_focus_logs_duration CHECK (duration >= 0);")
        await conn.execute(
            "ALTER TABLE focus_logs ADD CONSTRAINT chk_focus_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time);"
        )


def _row_to_task(row: asyncpg.Record) -> TaskOut:
    """将 asyncpg.Record 转为 TaskOut。"""
    return TaskOut(
        id=row["id"],
        user_id=int(row["user_id"]),
        title=str(row["title"]),
        content=row["content"],
        status=row["status"],
        priority=int(row["priority"]),
        target_duration=int(row["target_duration"]),
        current_cycle_count=int(row["current_cycle_count"]),
        target_cycle_count=int(row["target_cycle_count"]),
        cycle_period=row["cycle_period"],
        cycle_every_days=row["cycle_every_days"],
        event=str(row["event"] or ""),
        tags=[str(x) for x in (row["tags"] or [])],
        actual_duration=int(row["actual_duration"]),
        start_date=row["start_date"],
        due_date=row["due_date"],
        is_deleted=bool(row["is_deleted"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_focus_log(row: asyncpg.Record) -> FocusLogOut:
    """将 asyncpg.Record 转为 FocusLogOut。"""
    # 当 end_at 为空表示进行中的专注，动态计算到当前的持续时长
    _dynamic_duration = (
        int((datetime.now(UTC) - row["start_time"]).total_seconds()) if row["end_at"] is None else int(row["duration"])
    )
    return FocusLogOut(
        id=row["id"],
        user_id=int(row["user_id"]),
        task_id=row["task_id"],
        duration=_dynamic_duration,
        start_time=row["start_time"],
        end_at=row["end_at"],
        created_at=row["created_at"],
    )


@router.post("/tasks", response_model=TaskOut)
async def create_task(
    request: Request,
    body: TaskCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> TaskOut:
    """创建任务。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO tasks(
                user_id, title, content, status, priority, target_duration,
                current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, tags,
                start_date, due_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id, user_id, title, content, status, priority, target_duration,
                      current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, tags,
                      actual_duration, start_date, due_date, is_deleted, created_at, updated_at
            """,
            int(user.id),
            body.title,
            body.content,
            body.status,
            body.priority,
            body.target_duration,
            body.current_cycle_count,
            body.target_cycle_count,
            body.cycle_period,
            body.cycle_every_days,
            body.event,
            body.tags,
            body.start_date,
            body.due_date,
        )
    if row is None:
        raise HTTPException(status_code=500, detail="创建任务失败")
    return _row_to_task(row)


@router.get("/tasks", response_model=list[TaskOut])
async def list_tasks(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    status_: Annotated[TaskStatus | None, Query(alias="status")] = None,
    q: str | None = Query(default=None, max_length=255),
    include_deleted: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[TaskOut]:
    """分页列出任务。"""
    pool = _pool_from_request(request)

    clauses: list[str] = ["user_id = $1"]
    args: list[Any] = [int(user.id)]

    if not include_deleted:
        clauses.append("is_deleted = FALSE")
    if status_ is not None:
        args.append(status_)
        clauses.append(f"status = ${len(args)}")
    if q is not None and q.strip():
        args.append(f"%{q.strip()}%")
        clauses.append(f"title ILIKE ${len(args)}")

    args.append(limit)
    limit_i = len(args)
    args.append(offset)
    offset_i = len(args)

    where_sql = " AND ".join(clauses)
    sql = f"""
        SELECT id, user_id, title, content, status, priority, target_duration,
               current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, tags,
               actual_duration, start_date, due_date, is_deleted, created_at, updated_at
        FROM tasks
        WHERE {where_sql}
        ORDER BY updated_at DESC
        LIMIT ${limit_i} OFFSET ${offset_i}
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [_row_to_task(r) for r in rows]


@router.get("/tasks/{task_id}", response_model=TaskOut)
async def get_task(
    request: Request,
    task_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
    include_deleted: bool = False,
) -> TaskOut:
    """获取单个任务。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, title, content, status, priority, target_duration,
                   current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, tags,
                   actual_duration, start_date, due_date, is_deleted, created_at, updated_at
            FROM tasks
            WHERE id = $1 AND user_id = $2 AND ($3::BOOLEAN = TRUE OR is_deleted = FALSE)
            """,
            task_id,
            int(user.id),
            include_deleted,
        )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    return _row_to_task(row)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    request: Request,
    task_id: UUID,
    body: TaskUpdateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> TaskOut:
    """更新任务（部分字段）。"""
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        return await get_task(request, task_id, user)

    allowed_cols: dict[str, str] = {
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
        "tags": "tags",
        "start_date": "start_date",
        "due_date": "due_date",
    }

    sets: list[str] = []
    args: list[Any] = []
    for k, v in patch.items():
        col = allowed_cols.get(k)
        if col is None:
            continue
        args.append(v)
        sets.append(f"{col} = ${len(args)}")

    if not sets:
        return await get_task(request, task_id, user)

    args.append(task_id)
    task_i = len(args)
    args.append(int(user.id))
    user_i = len(args)

    sql = f"""
        UPDATE tasks
        SET {", ".join(sets)}, updated_at = NOW()
        WHERE id = ${task_i} AND user_id = ${user_i} AND is_deleted = FALSE
        RETURNING id, user_id, title, content, status, priority, target_duration,
                  current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, tags,
                  actual_duration, start_date, due_date, is_deleted, created_at, updated_at
    """

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *args)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    return _row_to_task(row)


@router.delete("/tasks/{task_id}")
async def delete_task(
    request: Request,
    task_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, bool]:
    """软删除任务。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        tag = await conn.execute(
            """
            UPDATE tasks
            SET is_deleted = TRUE, updated_at = NOW()
            WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
            """,
            task_id,
            int(user.id),
        )
    if not tag.startswith("UPDATE ") or tag.endswith(" 0"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    return {"ok": True}


def _normalize_focus_end_at(body: FocusLogCreateRequest) -> datetime:
    """规范化并校验 focus log 的 end_at。"""
    if body.end_at is None:
        return body.start_time + timedelta(seconds=body.duration)
    return body.end_at


@router.post("/tasks/{task_id}/focus-logs", response_model=FocusLogOut)
async def create_focus_log(
    request: Request,
    task_id: UUID,
    body: FocusLogCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusLogOut:
    """创建专注记录并累计到任务实际时长。"""
    end_at = _normalize_focus_end_at(body)
    if end_at < body.start_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_at 不能早于 start_time",
        )

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            task_row = await conn.fetchrow(
                "SELECT id FROM tasks WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE",
                task_id,
                int(user.id),
            )
            if task_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

            log_row = await conn.fetchrow(
                """
                INSERT INTO focus_logs(user_id, task_id, duration, start_time, end_at)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, user_id, task_id, duration, start_time, end_at, created_at
                """,
                int(user.id),
                task_id,
                body.duration,
                body.start_time,
                end_at,
            )
            await conn.execute(
                """
                UPDATE tasks
                SET actual_duration = actual_duration + $1, updated_at = NOW()
                WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE
                """,
                body.duration,
                task_id,
                int(user.id),
            )

    if log_row is None:
        raise HTTPException(status_code=500, detail="创建专注记录失败")
    return _row_to_focus_log(log_row)


@router.get("/tasks/{task_id}/focus-logs", response_model=list[FocusLogOut])
async def list_focus_logs(
    request: Request,
    task_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[FocusLogOut]:
    """列出指定任务的专注记录。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, user_id, task_id, duration, start_time, end_at, created_at
            FROM focus_logs
            WHERE task_id = $1 AND user_id = $2
            ORDER BY start_time DESC
            LIMIT $3 OFFSET $4
            """,
            task_id,
            int(user.id),
            limit,
            offset,
        )
    return [_row_to_focus_log(r) for r in rows]


@router.post("/tasks/{task_id}/focus/start", response_model=FocusLogOut)
async def start_focus(
    request: Request,
    task_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusLogOut:
    """开始对指定任务进行专注，会创建一条进行中的 focus_logs 记录（end_at 为 NULL）。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            task_row = await conn.fetchrow(
                "SELECT id FROM tasks WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE",
                task_id,
                int(user.id),
            )
            if task_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
            try:
                row = await conn.fetchrow(
                    """
                    INSERT INTO focus_logs(user_id, task_id, duration, start_time, end_at)
                    VALUES ($1, $2, 0, NOW(), NULL)
                    RETURNING id, user_id, task_id, duration, start_time, end_at, created_at
                    """,
                    int(user.id),
                    task_id,
                )
            except asyncpg.UniqueViolationError:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="已有进行中的专注")
    if row is None:
        raise HTTPException(status_code=500, detail="开始专注失败")
    return _row_to_focus_log(row)


@router.post("/focus/stop", response_model=FocusLogOut)
async def stop_focus(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusLogOut:
    """结束当前用户的进行中专注，填充 end_at 与最终 duration，并累计到任务的 actual_duration。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            open_row = await conn.fetchrow(
                """
                SELECT id, user_id, task_id, duration, start_time, end_at, created_at
                FROM focus_logs
                WHERE user_id = $1 AND end_at IS NULL
                """,
                int(user.id),
            )
            if open_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前无进行中的专注")
            now = datetime.now(UTC)
            start = open_row["start_time"]
            dur = int((now - start).total_seconds())
            if dur < 0:
                dur = 0
            row = await conn.fetchrow(
                """
                UPDATE focus_logs
                SET end_at = NOW(), duration = $1
                WHERE id = $2
                RETURNING id, user_id, task_id, duration, start_time, end_at, created_at
                """,
                dur,
                open_row["id"],
            )
            await conn.execute(
                """
                UPDATE tasks
                SET actual_duration = actual_duration + $1, updated_at = NOW()
                WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE
                """,
                dur,
                row["task_id"],
                int(user.id),
            )
    if row is None:
        raise HTTPException(status_code=500, detail="结束专注失败")
    return _row_to_focus_log(row)


@router.get("/focus/current", response_model=FocusLogOut)
async def get_current_focus(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusLogOut:
    """查询当前用户正在进行的专注记录，返回动态计算的持续时长。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, task_id, duration, start_time, end_at, created_at
            FROM focus_logs
            WHERE user_id = $1 AND end_at IS NULL
            """,
            int(user.id),
        )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前无进行中的专注")
    return _row_to_focus_log(row)


@router.get("/focus/today", response_model=FocusTodayOut)
async def get_today_focus_duration(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusTodayOut:
    """获取当前用户“今日”专注时长（秒与分钟），包含进行中的专注。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            WITH bounds AS (
              SELECT date_trunc('day', NOW()) AS day_start,
                     date_trunc('day', NOW()) + interval '1 day' AS day_end
            )
            SELECT
              COALESCE(
                SUM(
                  GREATEST(
                    0,
                    EXTRACT(
                      epoch FROM (
                        LEAST(COALESCE(fl.end_at, NOW()), b.day_end)
                        - GREATEST(fl.start_time, b.day_start)
                      )
                    )
                  )
                ),
                0
              )::BIGINT AS seconds
            FROM focus_logs fl
            CROSS JOIN bounds b
            WHERE fl.user_id = $1
              AND fl.start_time < b.day_end
              AND COALESCE(fl.end_at, NOW()) > b.day_start
            """,
            int(user.id),
        )
    seconds = int((row or {}).get("seconds") or 0)
    if seconds < 0:
        seconds = 0
    return FocusTodayOut(seconds=seconds, minutes=seconds // 60)


@router.get("/focus/stats", response_model=FocusStatsOut)
async def get_focus_stats(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    range_query: Annotated[Literal["today", "week", "month"], Query(alias="range")],
) -> FocusStatsOut:
    """获取专注统计信息。"""
    pool = _pool_from_request(request)

    now = datetime.now(UTC)
    if range_query == "today":
        range_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif range_query == "week":
        range_start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    else:  # month
        range_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            WITH bounds AS (
                SELECT $2::TIMESTAMPTZ AS range_start,
                       NOW() AS range_end
            ),
            log_durations AS (
                SELECT
                    fl.task_id,
                    GREATEST(
                        0,
                        EXTRACT(
                            epoch FROM (
                                LEAST(COALESCE(fl.end_at, NOW()), b.range_end)
                                - GREATEST(fl.start_time, b.range_start)
                            )
                        )
                    )::BIGINT AS duration
                FROM focus_logs fl
                CROSS JOIN bounds b
                WHERE fl.user_id = $1
                  AND fl.start_time < b.range_end
                  AND COALESCE(fl.end_at, NOW()) > b.range_start
            )
            SELECT
                t.id,
                t.title,
                SUM(ld.duration)::BIGINT as total_duration
            FROM log_durations ld
            JOIN tasks t ON ld.task_id = t.id
            GROUP BY t.id, t.title
            HAVING SUM(ld.duration) > 0
            ORDER BY total_duration DESC
            """,
            int(user.id),
            range_start,
        )

    tasks_stats = [
        TaskFocusStats(
            id=row["id"],
            title=row["title"],
            duration=row["total_duration"],
        )
        for row in rows
    ]

    total_duration = sum(t.duration for t in tasks_stats)
    return FocusStatsOut(total_duration=total_duration, tasks=tasks_stats)
