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
PomodoroStatus = Literal["normal", "focus", "rest"]

FOCUS_MAX_SECONDS = 25 * 60
REST_MAX_SECONDS = 5 * 60


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


class EventCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    due_at: datetime
    is_primary: bool = False


class EventUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    due_at: datetime | None = None
    is_primary: bool | None = None


class EventOut(BaseModel):
    id: UUID
    user_id: int
    name: str
    due_at: datetime
    is_primary: bool
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
    pomodoro_status: PomodoroStatus = "focus"
    limit_seconds: int | None = None
    remaining_seconds: int | None = None
    requires_confirmation: bool = False


class PomodoroCurrentOut(BaseModel):
    status: PomodoroStatus
    workflow_task_id: UUID | None = None
    current_task_id: UUID | None = None
    started_at: datetime | None = None
    elapsed_seconds: int = 0
    limit_seconds: int | None = None
    remaining_seconds: int | None = None
    requires_confirmation: bool = False


class PomodoroAdvanceRequest(BaseModel):
    task_id: UUID | None = None


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
            """
            CREATE TABLE IF NOT EXISTS rest_logs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              duration INTEGER NOT NULL,
              start_time TIMESTAMPTZ NOT NULL,
              end_at TIMESTAMPTZ NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_rest_logs_duration CHECK (duration >= 0),
              CONSTRAINT chk_rest_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pomodoro_state (
              user_id BIGINT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
              current_status VARCHAR(20) NOT NULL DEFAULT 'normal',
              workflow_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_pomodoro_current_status CHECK (current_status IN ('normal', 'focus', 'rest'))
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
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_rest_logs_user_start ON rest_logs(user_id, start_time DESC);"
        )
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_rest_open_per_user ON rest_logs(user_id) WHERE end_at IS NULL;"
        )
        # 迁移：允许 end_at 为空、放宽 duration 校验并更新时间一致性约束
        await conn.execute("ALTER TABLE focus_logs ALTER COLUMN end_at DROP NOT NULL;")
        await conn.execute("ALTER TABLE focus_logs DROP CONSTRAINT IF EXISTS chk_focus_logs_duration;")
        await conn.execute("ALTER TABLE focus_logs DROP CONSTRAINT IF EXISTS chk_focus_logs_end_at;")
        await conn.execute("ALTER TABLE focus_logs ADD CONSTRAINT chk_focus_logs_duration CHECK (duration >= 0);")
        await conn.execute(
            "ALTER TABLE focus_logs ADD CONSTRAINT chk_focus_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time);"
        )
        await conn.execute("ALTER TABLE rest_logs ALTER COLUMN end_at DROP NOT NULL;")
        await conn.execute("ALTER TABLE rest_logs DROP CONSTRAINT IF EXISTS chk_rest_logs_duration;")
        await conn.execute("ALTER TABLE rest_logs DROP CONSTRAINT IF EXISTS chk_rest_logs_end_at;")
        await conn.execute("ALTER TABLE rest_logs ADD CONSTRAINT chk_rest_logs_duration CHECK (duration >= 0);")
        await conn.execute(
            "ALTER TABLE rest_logs ADD CONSTRAINT chk_rest_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time);"
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              name VARCHAR(255) NOT NULL,
              due_at TIMESTAMPTZ NOT NULL,
              is_primary BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;")
        await conn.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE events ALTER COLUMN name SET NOT NULL;")
        await conn.execute("ALTER TABLE events ALTER COLUMN due_at SET NOT NULL;")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_events_user_due_at ON events(user_id, due_at ASC);")
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_events_primary_per_user ON events(user_id) WHERE is_primary = TRUE;"
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


def _row_to_event(row: asyncpg.Record) -> EventOut:
    """将 asyncpg.Record 转为 EventOut。"""
    return EventOut(
        id=row["id"],
        user_id=int(row["user_id"]),
        name=str(row["name"]),
        due_at=row["due_at"],
        is_primary=bool(row["is_primary"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_focus_log(
    row: asyncpg.Record,
    *,
    limit_seconds: int | None = None,
    pomodoro_status: PomodoroStatus = "focus",
) -> FocusLogOut:
    """将 asyncpg.Record 转为 FocusLogOut。"""
    # 当 end_at 为空表示进行中的专注，动态计算到当前的持续时长
    _dynamic_duration = (
        int((datetime.now(UTC) - row["start_time"]).total_seconds()) if row["end_at"] is None else int(row["duration"])
    )
    if _dynamic_duration < 0:
        _dynamic_duration = 0
    remaining_seconds: int | None = None
    requires_confirmation = False
    if limit_seconds is not None:
        if _dynamic_duration > limit_seconds:
            _dynamic_duration = limit_seconds
        if row["end_at"] is None:
            remaining_seconds = max(limit_seconds - _dynamic_duration, 0)
            requires_confirmation = _dynamic_duration >= limit_seconds
    return FocusLogOut(
        id=row["id"],
        user_id=int(row["user_id"]),
        task_id=row["task_id"],
        duration=_dynamic_duration,
        start_time=row["start_time"],
        end_at=row["end_at"],
        created_at=row["created_at"],
        pomodoro_status=pomodoro_status,
        limit_seconds=limit_seconds,
        remaining_seconds=remaining_seconds,
        requires_confirmation=requires_confirmation,
    )


async def _upsert_pomodoro_state(
    conn: asyncpg.Connection,
    user_id: int,
    *,
    status_: PomodoroStatus,
    workflow_task_id: UUID | None,
) -> None:
    await conn.execute(
        """
        INSERT INTO pomodoro_state(user_id, current_status, workflow_task_id, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET current_status = EXCLUDED.current_status,
                      workflow_task_id = EXCLUDED.workflow_task_id,
                      updated_at = NOW()
        """,
        int(user_id),
        status_,
        workflow_task_id,
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


@router.post("/events", response_model=EventOut)
async def create_event(
    request: Request,
    body: EventCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> EventOut:
    """创建事件。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            if body.is_primary:
                await conn.execute(
                    """
                    UPDATE events
                    SET is_primary = FALSE, updated_at = NOW()
                    WHERE user_id = $1 AND is_primary = TRUE
                    """,
                    int(user.id),
                )
            row = await conn.fetchrow(
                """
                INSERT INTO events(user_id, name, due_at, is_primary)
                VALUES ($1, $2, $3, $4)
                RETURNING id, user_id, name, due_at, is_primary, created_at, updated_at
                """,
                int(user.id),
                body.name,
                body.due_at,
                body.is_primary,
            )
    if row is None:
        raise HTTPException(status_code=500, detail="创建事件失败")
    return _row_to_event(row)


@router.get("/events", response_model=list[EventOut])
async def list_events(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[EventOut]:
    """列出当前用户全部事件。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, user_id, name, due_at, is_primary, created_at, updated_at
            FROM events
            WHERE user_id = $1
            ORDER BY due_at ASC, created_at DESC
            """,
            int(user.id),
        )
    return [_row_to_event(row) for row in rows]


@router.get("/events/primary", response_model=EventOut)
async def get_primary_event(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> EventOut:
    """获取当前用户主事件。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, name, due_at, is_primary, created_at, updated_at
            FROM events
            WHERE user_id = $1 AND is_primary = TRUE
            """,
            int(user.id),
        )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="主事件不存在")
    return _row_to_event(row)


@router.patch("/events/{event_id}", response_model=EventOut)
async def update_event(
    request: Request,
    event_id: UUID,
    body: EventUpdateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> EventOut:
    """更新事件。"""
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        pool = _pool_from_request(request)
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, user_id, name, due_at, is_primary, created_at, updated_at
                FROM events
                WHERE id = $1 AND user_id = $2
                """,
                event_id,
                int(user.id),
            )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
        return _row_to_event(row)

    allowed_cols: dict[str, str] = {
        "name": "name",
        "due_at": "due_at",
        "is_primary": "is_primary",
    }

    sets: list[str] = []
    args: list[Any] = []
    is_primary = patch.get("is_primary")

    for key, value in patch.items():
        col = allowed_cols.get(key)
        if col is None:
            continue
        args.append(value)
        sets.append(f"{col} = ${len(args)}")

    if not sets:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="没有可更新字段")

    args.append(event_id)
    event_i = len(args)
    args.append(int(user.id))
    user_i = len(args)

    sql = f"""
        UPDATE events
        SET {", ".join(sets)}, updated_at = NOW()
        WHERE id = ${event_i} AND user_id = ${user_i}
        RETURNING id, user_id, name, due_at, is_primary, created_at, updated_at
    """

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            if is_primary is True:
                await conn.execute(
                    """
                    UPDATE events
                    SET is_primary = FALSE, updated_at = NOW()
                    WHERE user_id = $1 AND is_primary = TRUE AND id <> $2
                    """,
                    int(user.id),
                    event_id,
                )
            row = await conn.fetchrow(sql, *args)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
    return _row_to_event(row)


@router.delete("/events/{event_id}")
async def delete_event(
    request: Request,
    event_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, bool]:
    """删除事件。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        tag = await conn.execute(
            "DELETE FROM events WHERE id = $1 AND user_id = $2",
            event_id,
            int(user.id),
        )
    if not tag.startswith("DELETE ") or tag.endswith(" 0"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
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
            open_rest = await conn.fetchrow(
                """
                SELECT id
                FROM rest_logs
                WHERE user_id = $1 AND end_at IS NULL
                """,
                int(user.id),
            )
            if open_rest is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="已有进行中的休息")
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
            await _upsert_pomodoro_state(conn, int(user.id), status_="focus", workflow_task_id=task_id)
    if row is None:
        raise HTTPException(status_code=500, detail="开始专注失败")
    return _row_to_focus_log(row, limit_seconds=FOCUS_MAX_SECONDS, pomodoro_status="focus")


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
            dur = max(dur, 0)
            if dur > FOCUS_MAX_SECONDS:
                dur = FOCUS_MAX_SECONDS
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
            await _upsert_pomodoro_state(conn, int(user.id), status_="normal", workflow_task_id=None)
    if row is None:
        raise HTTPException(status_code=500, detail="结束专注失败")
    return _row_to_focus_log(row, limit_seconds=FOCUS_MAX_SECONDS, pomodoro_status="focus")


@router.post("/break/stop", response_model=PomodoroCurrentOut)
async def stop_break(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> PomodoroCurrentOut:
    """结束休息并回到普通状态。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            rest_row = await conn.fetchrow(
                """
                SELECT id, start_time
                FROM rest_logs
                WHERE user_id = $1 AND end_at IS NULL
                """,
                int(user.id),
            )
            if rest_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前无进行中的休息")
            dur = int((datetime.now(UTC) - rest_row["start_time"]).total_seconds())
            dur = max(dur, 0)
            if dur > REST_MAX_SECONDS:
                dur = REST_MAX_SECONDS
            await conn.execute(
                """
                UPDATE rest_logs
                SET end_at = NOW(), duration = $1
                WHERE id = $2
                """,
                dur,
                rest_row["id"],
            )
            await _upsert_pomodoro_state(conn, int(user.id), status_="normal", workflow_task_id=None)
    return PomodoroCurrentOut(status="normal")


@router.post("/pomodoro/advance", response_model=PomodoroCurrentOut)
async def advance_pomodoro(
    request: Request,
    body: PomodoroAdvanceRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> PomodoroCurrentOut:
    """在达到时长上限后推进番茄钟状态：专注->休息 或 休息->专注。"""
    pool = _pool_from_request(request)
    uid = int(user.id)
    async with pool.acquire() as conn:
        async with conn.transaction():
            focus_row = await conn.fetchrow(
                """
                SELECT id, task_id, start_time
                FROM focus_logs
                WHERE user_id = $1 AND end_at IS NULL
                """,
                uid,
            )
            if focus_row is not None:
                focus_elapsed = int((datetime.now(UTC) - focus_row["start_time"]).total_seconds())
                focus_elapsed = max(focus_elapsed, 0)
                if focus_elapsed < FOCUS_MAX_SECONDS:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前专注尚未达到上限")
                await conn.execute(
                    """
                    UPDATE focus_logs
                    SET end_at = NOW(), duration = $1
                    WHERE id = $2
                    """,
                    FOCUS_MAX_SECONDS,
                    focus_row["id"],
                )
                await conn.execute(
                    """
                    UPDATE tasks
                    SET actual_duration = actual_duration + $1, updated_at = NOW()
                    WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE
                    """,
                    FOCUS_MAX_SECONDS,
                    focus_row["task_id"],
                    uid,
                )
                await conn.execute(
                    """
                    INSERT INTO rest_logs(user_id, duration, start_time, end_at)
                    VALUES ($1, 0, NOW(), NULL)
                    """,
                    uid,
                )
                await _upsert_pomodoro_state(conn, uid, status_="rest", workflow_task_id=focus_row["task_id"])
                return PomodoroCurrentOut(
                    status="rest",
                    workflow_task_id=focus_row["task_id"],
                    started_at=datetime.now(UTC),
                    elapsed_seconds=0,
                    limit_seconds=REST_MAX_SECONDS,
                    remaining_seconds=REST_MAX_SECONDS,
                    requires_confirmation=False,
                )

            rest_row = await conn.fetchrow(
                """
                SELECT id, start_time
                FROM rest_logs
                WHERE user_id = $1 AND end_at IS NULL
                """,
                uid,
            )
            if rest_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前不在可推进的番茄钟状态")
            rest_elapsed = int((datetime.now(UTC) - rest_row["start_time"]).total_seconds())
            rest_elapsed = max(rest_elapsed, 0)
            if rest_elapsed < REST_MAX_SECONDS:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前休息尚未达到上限")
            state_row = await conn.fetchrow(
                """
                SELECT workflow_task_id
                FROM pomodoro_state
                WHERE user_id = $1
                """,
                uid,
            )
            next_task_id = body.task_id or ((state_row or {}).get("workflow_task_id"))
            if next_task_id is None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="缺少下一轮专注任务")
            task_row = await conn.fetchrow(
                """
                SELECT id
                FROM tasks
                WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE AND status <> 'done'
                """,
                next_task_id,
                uid,
            )
            if task_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="下一轮专注任务不存在")
            await conn.execute(
                """
                UPDATE rest_logs
                SET end_at = NOW(), duration = $1
                WHERE id = $2
                """,
                REST_MAX_SECONDS,
                rest_row["id"],
            )
            try:
                await conn.execute(
                    """
                    INSERT INTO focus_logs(user_id, task_id, duration, start_time, end_at)
                    VALUES ($1, $2, 0, NOW(), NULL)
                    """,
                    uid,
                    next_task_id,
                )
            except asyncpg.UniqueViolationError:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="已有进行中的专注")
            await _upsert_pomodoro_state(conn, uid, status_="focus", workflow_task_id=next_task_id)
            return PomodoroCurrentOut(
                status="focus",
                workflow_task_id=next_task_id,
                current_task_id=next_task_id,
                started_at=datetime.now(UTC),
                elapsed_seconds=0,
                limit_seconds=FOCUS_MAX_SECONDS,
                remaining_seconds=FOCUS_MAX_SECONDS,
                requires_confirmation=False,
            )


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
    return _row_to_focus_log(row, limit_seconds=FOCUS_MAX_SECONDS, pomodoro_status="focus")


@router.get("/pomodoro/current", response_model=PomodoroCurrentOut)
async def get_current_pomodoro(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> PomodoroCurrentOut:
    """查询当前番茄钟状态（普通/专注/休息）。"""
    uid = int(user.id)
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        focus_row = await conn.fetchrow(
            """
            SELECT task_id, start_time
            FROM focus_logs
            WHERE user_id = $1 AND end_at IS NULL
            """,
            uid,
        )
        if focus_row is not None:
            elapsed = int((datetime.now(UTC) - focus_row["start_time"]).total_seconds())
            elapsed = max(elapsed, 0)
            elapsed = min(elapsed, FOCUS_MAX_SECONDS)
            return PomodoroCurrentOut(
                status="focus",
                workflow_task_id=focus_row["task_id"],
                current_task_id=focus_row["task_id"],
                started_at=focus_row["start_time"],
                elapsed_seconds=elapsed,
                limit_seconds=FOCUS_MAX_SECONDS,
                remaining_seconds=max(FOCUS_MAX_SECONDS - elapsed, 0),
                requires_confirmation=elapsed >= FOCUS_MAX_SECONDS,
            )

        rest_row = await conn.fetchrow(
            """
            SELECT start_time
            FROM rest_logs
            WHERE user_id = $1 AND end_at IS NULL
            """,
            uid,
        )
        state_row = await conn.fetchrow(
            """
            SELECT workflow_task_id
            FROM pomodoro_state
            WHERE user_id = $1
            """,
            uid,
        )
        workflow_task_id = (state_row or {}).get("workflow_task_id")
        if rest_row is not None:
            elapsed = int((datetime.now(UTC) - rest_row["start_time"]).total_seconds())
            elapsed = max(elapsed, 0)
            elapsed = min(elapsed, REST_MAX_SECONDS)
            return PomodoroCurrentOut(
                status="rest",
                workflow_task_id=workflow_task_id,
                started_at=rest_row["start_time"],
                elapsed_seconds=elapsed,
                limit_seconds=REST_MAX_SECONDS,
                remaining_seconds=max(REST_MAX_SECONDS - elapsed, 0),
                requires_confirmation=elapsed >= REST_MAX_SECONDS,
            )
        return PomodoroCurrentOut(status="normal", workflow_task_id=workflow_task_id)


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
                        LEAST(COALESCE(fl.end_at, NOW()), b.day_end, fl.start_time + ($2 * INTERVAL '1 second'))
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
            FOCUS_MAX_SECONDS,
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
                                LEAST(
                                    COALESCE(fl.end_at, NOW()),
                                    b.range_end,
                                    fl.start_time + ($3 * INTERVAL '1 second')
                                )
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
            FOCUS_MAX_SECONDS,
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
