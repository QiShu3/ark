from __future__ import annotations

import calendar
import json
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any, Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from routes.auth_routes import get_current_user

router = APIRouter(prefix="/todo", tags=["todo"])
UTC = getattr(timezone, "utc")

TaskStatus = Literal["todo", "done"]
TaskCyclePeriod = Literal["daily", "weekly", "monthly", "custom"]
TaskType = Literal["focus", "checkin"]
AppointmentStoredStatus = Literal["pending", "attended", "missed", "cancelled"]
AppointmentStatus = Literal["pending", "needs_confirmation", "attended", "missed", "cancelled"]
AppointmentListView = Literal["all", "today", "needs_confirmation", "repeating"]
PhaseType = Literal["focus", "break"]
FocusTimerMode = Literal["countdown", "countup"]
COUNTUP_PHASE_CAP_SECONDS = 2 * 60 * 60


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
    event_ids: list[UUID] = Field(default_factory=list)
    task_type: TaskType = "focus"
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
    event_ids: list[UUID] | None = None
    task_type: TaskType | None = None
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
    event_ids: list[UUID]
    task_type: TaskType
    tags: list[str]
    actual_duration: int
    start_date: datetime | None
    due_date: datetime | None
    is_deleted: bool
    created_at: datetime
    updated_at: datetime


class AppointmentCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str | None = None
    status: AppointmentStoredStatus = "pending"
    starts_at: datetime | None = None
    ends_at: datetime
    repeat_rule: str | None = Field(default=None, max_length=120)
    linked_task_id: UUID | None = None


class AppointmentUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = None
    status: AppointmentStoredStatus | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    repeat_rule: str | None = Field(default=None, max_length=120)
    linked_task_id: UUID | None = None


class AppointmentOut(BaseModel):
    id: UUID
    user_id: int
    title: str
    content: str | None
    status: AppointmentStatus
    starts_at: datetime | None
    ends_at: datetime
    repeat_rule: str | None
    linked_task_id: UUID | None
    is_deleted: bool
    created_at: datetime
    updated_at: datetime


class AppointmentOccurrenceOut(BaseModel):
    appointment_id: UUID
    occurrence_starts_at: datetime | None
    occurrence_ends_at: datetime
    status: AppointmentStatus
    linked_task_id: UUID | None


class AppointmentOccurrenceConfirmRequest(BaseModel):
    occurrence_ends_at: datetime
    status: Literal["attended", "missed", "cancelled"]


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


class FocusWorkflowCreateRequest(BaseModel):
    task_id: UUID
    focus_duration: int = Field(default=1500, ge=60, le=24 * 60 * 60)
    break_duration: int = Field(default=300, ge=60, le=24 * 60 * 60)


class FocusWorkflowPhase(BaseModel):
    phase_type: Literal["focus", "break"]
    duration: int = Field(ge=60, le=24 * 60 * 60)
    timer_mode: FocusTimerMode | None = None
    task_id: UUID | None = None


class FocusWorkflowOut(BaseModel):
    state: Literal["normal", "focus", "break"]
    workflow_name: str | None = None
    current_phase_index: int | None = None
    phases: list[FocusWorkflowPhase] = Field(default_factory=list)
    task_id: UUID | None = None
    task_title: str | None = None
    focus_duration: int | None = None
    break_duration: int | None = None
    phase_started_at: datetime | None = None
    phase_planned_duration: int | None = None
    phase_timer_mode: FocusTimerMode | None = None
    elapsed_seconds: int | None = None
    pending_confirmation: bool = False
    pending_task_selection: bool = False
    remaining_seconds: int | None = None
    runtime_task_id: UUID | None = None
    completed_workflow_name: str | None = None


class FocusWorkflowPresetCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    phases: list[FocusWorkflowPhase] | None = None
    focus_duration: int = Field(default=1500, ge=60, le=24 * 60 * 60)
    break_duration: int = Field(default=300, ge=60, le=24 * 60 * 60)
    default_focus_timer_mode: FocusTimerMode = "countdown"
    is_default: bool = False


class FocusWorkflowPresetUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    phases: list[FocusWorkflowPhase] | None = None
    focus_duration: int | None = Field(default=None, ge=60, le=24 * 60 * 60)
    break_duration: int | None = Field(default=None, ge=60, le=24 * 60 * 60)
    default_focus_timer_mode: FocusTimerMode | None = None
    is_default: bool | None = None


class FocusWorkflowPresetOut(BaseModel):
    id: UUID
    user_id: int
    name: str
    focus_duration: int
    break_duration: int
    default_focus_timer_mode: FocusTimerMode = "countdown"
    phases: list[FocusWorkflowPhase]
    is_default: bool
    created_at: datetime
    updated_at: datetime


class FocusWorkflowSelectTaskRequest(BaseModel):
    task_id: UUID


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
              event_ids UUID[] NOT NULL DEFAULT '{}',
              task_type VARCHAR(20) NOT NULL DEFAULT 'focus',
              tags TEXT[] NOT NULL DEFAULT '{}',
              actual_duration INTEGER NOT NULL DEFAULT 0,
              start_date TIMESTAMPTZ NULL,
              due_date TIMESTAMPTZ NULL,
              is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_tasks_status CHECK (status IN ('todo', 'done')),
              CONSTRAINT chk_tasks_type CHECK (task_type IN ('focus', 'checkin')),
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
        await conn.execute(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cycle_period VARCHAR(20) NOT NULL DEFAULT 'daily';"
        )
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cycle_every_days INTEGER NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event TEXT NOT NULL DEFAULT '';")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event_ids UUID[] NOT NULL DEFAULT '{}';")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type VARCHAR(20) NOT NULL DEFAULT 'focus';")
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_type;")
        await conn.execute("ALTER TABLE tasks ADD CONSTRAINT chk_tasks_type CHECK (task_type IN ('focus', 'checkin'));")
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
            CREATE TABLE IF NOT EXISTS appointments (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              title VARCHAR(255) NOT NULL,
              content TEXT NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'pending',
              starts_at TIMESTAMPTZ NULL,
              ends_at TIMESTAMPTZ NOT NULL,
              repeat_rule VARCHAR(120) NULL,
              linked_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
              is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_appointments_status CHECK (status IN ('pending', 'attended', 'missed', 'cancelled'))
            );
            """
        )
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS content TEXT NULL;")
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';"
        )
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NULL;")
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;")
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS repeat_rule VARCHAR(120) NULL;")
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS linked_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL;"
        )
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();")
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();")
        await conn.execute("ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;")
        await conn.execute(
            "ALTER TABLE appointments ADD CONSTRAINT chk_appointments_status CHECK (status IN ('pending', 'attended', 'missed', 'cancelled'));"
        )
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_appointments_user_ends_at ON appointments(user_id, ends_at ASC);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_appointments_user_status ON appointments(user_id, status);")
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_linked_task_unique
            ON appointments(linked_task_id)
            WHERE linked_task_id IS NOT NULL AND is_deleted = FALSE;
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS appointment_occurrence_results (
              appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
              occurrence_ends_at TIMESTAMPTZ NOT NULL,
              status VARCHAR(20) NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              PRIMARY KEY (appointment_id, occurrence_ends_at),
              CONSTRAINT chk_appointment_occurrence_results_status
                CHECK (status IN ('attended', 'missed', 'cancelled'))
            );
            """
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_appointment_occurrence_results_lookup
            ON appointment_occurrence_results(appointment_id, occurrence_ends_at ASC);
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
            CREATE TABLE IF NOT EXISTS focus_workflows (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
              workflow_name VARCHAR(100) NOT NULL DEFAULT '默认工作流',
              phases JSONB NOT NULL DEFAULT '[]'::jsonb,
              current_phase_index INTEGER NOT NULL DEFAULT 0,
              focus_duration INTEGER NOT NULL,
              break_duration INTEGER NOT NULL,
              current_phase VARCHAR(20) NOT NULL,
              phase_started_at TIMESTAMPTZ NOT NULL,
              phase_planned_duration INTEGER NOT NULL,
              pending_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
              pending_task_selection BOOLEAN NOT NULL DEFAULT FALSE,
              runtime_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'active',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ended_at TIMESTAMPTZ NULL,
              CONSTRAINT chk_focus_workflows_focus_duration CHECK (focus_duration >= 60),
              CONSTRAINT chk_focus_workflows_break_duration CHECK (break_duration >= 60),
              CONSTRAINT chk_focus_workflows_phase CHECK (current_phase IN ('focus', 'break')),
              CONSTRAINT chk_focus_workflows_status CHECK (status IN ('active', 'stopped'))
            );
            """
        )
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS pending_confirmation BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS pending_task_selection BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS runtime_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL;")
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ NULL;")
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS workflow_name VARCHAR(100) NOT NULL DEFAULT '默认工作流';"
        )
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS phases JSONB NOT NULL DEFAULT '[]'::jsonb;")
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS current_phase_index INTEGER NOT NULL DEFAULT 0;")
        await conn.execute("ALTER TABLE focus_workflows DROP CONSTRAINT IF EXISTS chk_focus_workflows_phase;")
        await conn.execute(
            "ALTER TABLE focus_workflows ADD CONSTRAINT chk_focus_workflows_phase CHECK (current_phase IN ('focus', 'break'));"
        )
        await conn.execute("ALTER TABLE focus_workflows DROP CONSTRAINT IF EXISTS chk_focus_workflows_status;")
        await conn.execute(
            "ALTER TABLE focus_workflows ADD CONSTRAINT chk_focus_workflows_status CHECK (status IN ('active', 'stopped'));"
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS focus_workflow_presets (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              name VARCHAR(50) NOT NULL,
              focus_duration INTEGER NOT NULL,
              break_duration INTEGER NOT NULL,
              default_focus_timer_mode VARCHAR(20) NOT NULL DEFAULT 'countdown',
              phases JSONB NOT NULL DEFAULT '[]'::jsonb,
              is_default BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_focus_workflow_presets_focus_duration CHECK (focus_duration >= 60),
              CONSTRAINT chk_focus_workflow_presets_break_duration CHECK (break_duration >= 60),
              CONSTRAINT chk_focus_workflow_presets_timer_mode CHECK (default_focus_timer_mode IN ('countdown', 'countup'))
            );
            """
        )
        await conn.execute("ALTER TABLE focus_workflow_presets ADD COLUMN IF NOT EXISTS phases JSONB NOT NULL DEFAULT '[]'::jsonb;")
        await conn.execute(
            "ALTER TABLE focus_workflow_presets ADD COLUMN IF NOT EXISTS default_focus_timer_mode VARCHAR(20) NOT NULL DEFAULT 'countdown';"
        )
        await conn.execute("ALTER TABLE focus_workflow_presets DROP CONSTRAINT IF EXISTS chk_focus_workflow_presets_timer_mode;")
        await conn.execute(
            "ALTER TABLE focus_workflow_presets ADD CONSTRAINT chk_focus_workflow_presets_timer_mode CHECK (default_focus_timer_mode IN ('countdown', 'countup'));"
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
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_focus_workflow_active_per_user ON focus_workflows(user_id) WHERE status = 'active';"
        )
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_focus_workflow_default_per_user ON focus_workflow_presets(user_id) WHERE is_default = TRUE;"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_focus_workflow_presets_user_updated ON focus_workflow_presets(user_id, updated_at DESC);"
        )
        # 迁移：允许 end_at 为空、放宽 duration 校验并更新时间一致性约束
        await conn.execute("ALTER TABLE focus_logs ALTER COLUMN end_at DROP NOT NULL;")
        await conn.execute("ALTER TABLE focus_logs DROP CONSTRAINT IF EXISTS chk_focus_logs_duration;")
        await conn.execute("ALTER TABLE focus_logs DROP CONSTRAINT IF EXISTS chk_focus_logs_end_at;")
        await conn.execute("ALTER TABLE focus_logs ADD CONSTRAINT chk_focus_logs_duration CHECK (duration >= 0);")
        await conn.execute(
            "ALTER TABLE focus_logs ADD CONSTRAINT chk_focus_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time);"
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
        event_ids=list(row["event_ids"] or []),
        task_type=_normalize_task_type(row["task_type"]),
        tags=[str(x) for x in (row["tags"] or [])],
        actual_duration=int(row["actual_duration"]),
        start_date=row["start_date"],
        due_date=row["due_date"],
        is_deleted=bool(row["is_deleted"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _appointment_status_for_display(status: AppointmentStoredStatus | str, ends_at: datetime) -> AppointmentStatus:
    if status == "pending" and ends_at <= datetime.now(UTC):
        return "needs_confirmation"
    if status == "attended":
        return "attended"
    if status == "missed":
        return "missed"
    if status == "cancelled":
        return "cancelled"
    return "pending"


def _row_to_appointment(row: asyncpg.Record) -> AppointmentOut:
    return AppointmentOut(
        id=row["id"],
        user_id=int(row["user_id"]),
        title=str(row["title"]),
        content=row["content"],
        status=_appointment_status_for_display(str(row["status"]), row["ends_at"]),
        starts_at=row["starts_at"],
        ends_at=row["ends_at"],
        repeat_rule=row["repeat_rule"],
        linked_task_id=row["linked_task_id"],
        is_deleted=bool(row["is_deleted"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _build_appointment_occurrence(
    appointment: AppointmentOut,
    *,
    occurrence_starts_at: datetime | None,
    occurrence_ends_at: datetime,
    stored_status: AppointmentStoredStatus | str,
) -> AppointmentOccurrenceOut:
    return AppointmentOccurrenceOut(
        appointment_id=appointment.id,
        occurrence_starts_at=occurrence_starts_at,
        occurrence_ends_at=occurrence_ends_at,
        status=_appointment_status_for_display(stored_status, occurrence_ends_at),
        linked_task_id=appointment.linked_task_id,
    )


def _repeat_delta(repeat_rule: str | None) -> timedelta | None:
    rule = str(repeat_rule or "").strip().lower()
    if rule == "daily":
        return timedelta(days=1)
    if rule == "weekly":
        return timedelta(weeks=1)
    return None


def _add_months(moment: datetime, months: int) -> datetime:
    month_index = (moment.month - 1) + months
    year = moment.year + month_index // 12
    month = month_index % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


def _appointment_occurrence_bounds(
    appointment: AppointmentOut,
    occurrence_ends_at: datetime,
) -> tuple[datetime | None, datetime]:
    if appointment.starts_at is None:
        return None, occurrence_ends_at
    duration = appointment.ends_at - appointment.starts_at
    return occurrence_ends_at - duration, occurrence_ends_at


def _expand_appointment_occurrence_ends(
    appointment: AppointmentOut,
    *,
    range_start: datetime,
    range_end: datetime,
) -> list[datetime]:
    base_end = appointment.ends_at
    if range_end <= range_start:
        return []

    if appointment.repeat_rule is None:
        return [base_end] if range_start <= base_end < range_end else []

    repeat_delta = _repeat_delta(appointment.repeat_rule)
    occurrences: list[datetime] = []
    if repeat_delta is not None:
        current = base_end
        while current < range_start:
            current += repeat_delta
        while current < range_end:
            occurrences.append(current)
            current += repeat_delta
        return occurrences

    if str(appointment.repeat_rule).strip().lower() == "monthly":
        current = base_end
        while current < range_start:
            current = _add_months(current, 1)
        while current < range_end:
            occurrences.append(current)
            current = _add_months(current, 1)
        return occurrences

    return [base_end] if range_start <= base_end < range_end else []


async def _validate_linked_task(
    conn: Any,
    *,
    user_id: int,
    linked_task_id: UUID | None,
    exclude_appointment_id: UUID | None = None,
) -> None:
    if linked_task_id is None:
        return

    task_row = await conn.fetchrow(
        "SELECT id FROM tasks WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE",
        linked_task_id,
        user_id,
    )
    if task_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="关联任务不存在")

    if exclude_appointment_id is None:
        linked_row = await conn.fetchrow(
            """
            SELECT id
            FROM appointments
            WHERE user_id = $1 AND linked_task_id = $2 AND is_deleted = FALSE
            LIMIT 1
            """,
            user_id,
            linked_task_id,
        )
    else:
        linked_row = await conn.fetchrow(
            """
            SELECT id
            FROM appointments
            WHERE user_id = $1 AND linked_task_id = $2 AND is_deleted = FALSE AND id <> $3
            LIMIT 1
            """,
            user_id,
            linked_task_id,
            exclude_appointment_id,
        )
    if linked_row is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该任务已关联其他日程")


async def _list_occurrence_status_rows(
    conn: Any,
    *,
    appointment_id: UUID,
    range_start: datetime,
    range_end: datetime,
) -> dict[datetime, str]:
    rows = await conn.fetch(
        """
        SELECT appointment_id, occurrence_ends_at, status, created_at, updated_at
        FROM appointment_occurrence_results
        WHERE appointment_id = $1 AND occurrence_ends_at >= $2 AND occurrence_ends_at < $3
        ORDER BY occurrence_ends_at ASC
        """,
        appointment_id,
        range_start,
        range_end,
    )
    return {row["occurrence_ends_at"]: str(row["status"]) for row in rows}


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


def _workflow_remaining_seconds(
    phase_started_at: datetime | None,
    phase_planned_duration: int | None,
    *,
    pending_confirmation: bool,
) -> int | None:
    """计算当前阶段剩余秒数。"""
    if phase_started_at is None or phase_planned_duration is None:
        return None
    if pending_confirmation:
        return 0
    elapsed = int((datetime.now(UTC) - phase_started_at).total_seconds())
    left = int(phase_planned_duration) - elapsed
    return left if left > 0 else 0


def _safe_int(value: Any, default: int = 0) -> int:
    """安全转换整数，失败时返回默认值。"""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_task_type(value: Any) -> TaskType:
    text = str(value or "focus")
    if text == "checkin":
        return "checkin"
    return "focus"


def _normalize_phase_type(value: Any) -> PhaseType | None:
    text = str(value or "").strip()
    if text == "focus":
        return "focus"
    if text == "break":
        return "break"
    return None


def _normalize_timer_mode(value: Any, default: FocusTimerMode = "countdown") -> FocusTimerMode:
    text = str(value or "").strip()
    if text == "countup":
        return "countup"
    if text == "countdown":
        return "countdown"
    return default


def _normalize_phase_task_id(value: Any) -> UUID | None:
    if value in {None, "", "null"}:
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _phase_is_focus(phase: dict[str, Any]) -> bool:
    return _normalize_phase_type(phase.get("phase_type")) == "focus"


def _phase_timer_mode_value(phase: dict[str, Any], *, default_focus_timer_mode: FocusTimerMode = "countdown") -> FocusTimerMode:
    if not _phase_is_focus(phase):
        return "countdown"
    return _normalize_timer_mode(phase.get("timer_mode"), default_focus_timer_mode)


def _phase_task_id_value(phase: dict[str, Any]) -> UUID | None:
    if not _phase_is_focus(phase):
        return None
    return _normalize_phase_task_id(phase.get("task_id"))


def _phase_elapsed_seconds(phase_started_at: datetime | None) -> int | None:
    if phase_started_at is None:
        return None
    elapsed = int((datetime.now(UTC) - phase_started_at).total_seconds())
    return elapsed if elapsed > 0 else 0


def _to_jsonb_param(value: Any) -> str:
    """将值转换为可绑定到 jsonb 的字符串参数。"""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


def _validate_appointment_times(starts_at: datetime | None, ends_at: datetime) -> None:
    if starts_at is not None and starts_at > ends_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="starts_at must be before or equal to ends_at",
        )


async def _resolve_appointment_occurrences(
    conn: Any,
    *,
    appointment: AppointmentOut,
    range_start: datetime,
    range_end: datetime,
) -> list[AppointmentOccurrenceOut]:
    occurrence_ends = _expand_appointment_occurrence_ends(
        appointment,
        range_start=range_start,
        range_end=range_end,
    )
    if not occurrence_ends:
        return []

    occurrence_statuses = await _list_occurrence_status_rows(
        conn,
        appointment_id=appointment.id,
        range_start=range_start,
        range_end=range_end,
    )
    rows: list[AppointmentOccurrenceOut] = []
    base_stored_status = "cancelled" if appointment.status == "cancelled" else "pending"
    for occurrence_ends_at in occurrence_ends:
        occurrence_starts_at, occurrence_ends_at = _appointment_occurrence_bounds(appointment, occurrence_ends_at)
        stored_status = occurrence_statuses.get(occurrence_ends_at)
        if stored_status is None:
            if appointment.status == "cancelled":
                stored_status = "cancelled"
            elif occurrence_ends_at == appointment.ends_at and appointment.status in {"attended", "missed"}:
                stored_status = appointment.status
            else:
                stored_status = base_stored_status
        rows.append(
            _build_appointment_occurrence(
                appointment,
                occurrence_starts_at=occurrence_starts_at,
                occurrence_ends_at=occurrence_ends_at,
                stored_status=stored_status,
            )
        )
    return rows


def _build_default_phases(focus_duration: int, break_duration: int) -> list[dict[str, Any]]:
    """生成默认的专注-休息两阶段。"""
    return [
        {"phase_type": "focus", "duration": int(focus_duration), "timer_mode": "countdown", "task_id": None},
        {"phase_type": "break", "duration": int(break_duration)},
    ]


def _normalize_workflow_phases(
    phases: list[FocusWorkflowPhase] | list[dict[str, Any]] | None,
    *,
    fallback_focus_duration: int,
    fallback_break_duration: int,
    default_focus_timer_mode: FocusTimerMode = "countdown",
) -> list[dict[str, Any]]:
    """规范化并校验工作流阶段。"""
    def _parse_duration(value: Any) -> int:
        """解析阶段时长，异常值返回 0。"""
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    phase_items: Any = phases
    if isinstance(phase_items, str):
        try:
            phase_items = json.loads(phase_items)
        except json.JSONDecodeError:
            phase_items = None
    if phase_items is None or not isinstance(phase_items, list):
        items = _build_default_phases(fallback_focus_duration, fallback_break_duration)
    else:
        items = []
        for phase in phase_items:
            if isinstance(phase, FocusWorkflowPhase):
                phase_type = phase.phase_type
                duration = _parse_duration(phase.duration)
                timer_mode = phase.timer_mode
                task_id = phase.task_id
            elif isinstance(phase, dict):
                phase_type = str(phase.get("phase_type") or "").strip()
                duration = _parse_duration(phase.get("duration"))
                timer_mode = phase.get("timer_mode")
                task_id = phase.get("task_id")
            else:
                continue
            normalized: dict[str, Any] = {"phase_type": phase_type, "duration": duration}
            if phase_type == "focus":
                normalized["timer_mode"] = _normalize_timer_mode(timer_mode, default_focus_timer_mode)
                normalized["task_id"] = _phase_task_id_value({"phase_type": "focus", "task_id": task_id})
            items.append(normalized)
    if not items:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="工作流至少需要一个阶段")
    for idx, phase in enumerate(items):
        phase_type = phase["phase_type"]
        duration = int(phase["duration"])
        if phase_type not in {"focus", "break"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="阶段类型必须是 focus 或 break")
        if duration < 60:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="阶段时长不能小于 60 秒")
        if phase_type == "break":
            phase["timer_mode"] = None
            phase["task_id"] = None
        if idx > 0 and items[idx - 1]["phase_type"] == phase_type:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="相邻阶段必须交替 focus/break")
    if items[0]["phase_type"] != "focus":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="工作流必须以 focus 阶段开始")
    return items


def _phase_models_from_row(row: asyncpg.Record) -> list[FocusWorkflowPhase]:
    raw = row.get("phases", []) if hasattr(row, "get") else row["phases"] if "phases" in row else []
    default_focus_timer_mode = _normalize_timer_mode(
        row.get("default_focus_timer_mode", "countdown") if hasattr(row, "get") else row.get("default_focus_timer_mode", "countdown"),  # type: ignore[arg-type]
        "countdown",
    )
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = []
    phases: list[FocusWorkflowPhase] = []
    if isinstance(raw, list):
        for phase in raw:
            if isinstance(phase, dict):
                phase_type = _normalize_phase_type(phase.get("phase_type"))
                duration = _safe_int(phase.get("duration"), 0)
                if phase_type is not None and duration >= 60:
                    phases.append(
                        FocusWorkflowPhase(
                            phase_type=phase_type,
                            duration=duration,
                            timer_mode=_phase_timer_mode_value(phase, default_focus_timer_mode=default_focus_timer_mode)
                            if phase_type == "focus"
                            else None,
                            task_id=_phase_task_id_value(phase) if phase_type == "focus" else None,
                        )
                    )
    return phases


def _phase_at_index(phases: list[FocusWorkflowPhase], index: int | None) -> FocusWorkflowPhase | None:
    if index is None:
        return None
    if index < 0 or index >= len(phases):
        return None
    return phases[index]


def _row_to_focus_workflow(
    row: asyncpg.Record | None,
    *,
    task_title: str | None = None,
    completed_workflow_name: str | None = None,
) -> FocusWorkflowOut:
    """将工作流行数据转换为返回模型。"""
    if row is None:
        return FocusWorkflowOut(state="normal", completed_workflow_name=completed_workflow_name)
    pending = bool(row["pending_confirmation"])
    planned_raw = row.get("phase_planned_duration") if hasattr(row, "get") else row["phase_planned_duration"]
    planned = _safe_int(planned_raw, 0)
    if planned <= 0:
        planned = None
    started = row["phase_started_at"]
    phases = _phase_models_from_row(row)
    current_phase_index_raw = row.get("current_phase_index", 0) if hasattr(row, "get") else row["current_phase_index"]
    current_phase_index = _safe_int(current_phase_index_raw, 0)
    current_phase = _phase_at_index(phases, current_phase_index)
    elapsed_seconds = _phase_elapsed_seconds(started) if not bool(row.get("pending_task_selection", False) if hasattr(row, "get") else False) else None
    current_phase_timer_mode = current_phase.timer_mode if current_phase is not None else None
    workflow_name = (
        str(row.get("workflow_name", "默认工作流")) if hasattr(row, "get") else str(row["workflow_name"] or "默认工作流")
    )
    pending_task_selection = bool(row.get("pending_task_selection", False) if hasattr(row, "get") else False)
    runtime_task_id = row.get("runtime_task_id") if hasattr(row, "get") else row.get("runtime_task_id")  # type: ignore[union-attr]
    return FocusWorkflowOut(
        state=row["current_phase"],
        workflow_name=workflow_name,
        current_phase_index=current_phase_index,
        phases=phases,
        task_id=row["task_id"],
        task_title=task_title,
        focus_duration=_safe_int(row["focus_duration"], 0),
        break_duration=_safe_int(row["break_duration"], 0),
        phase_started_at=started,
        phase_planned_duration=planned,
        phase_timer_mode=current_phase_timer_mode,
        elapsed_seconds=elapsed_seconds,
        pending_confirmation=pending,
        pending_task_selection=pending_task_selection,
        remaining_seconds=_workflow_remaining_seconds(
            started,
            planned,
            pending_confirmation=pending,
        ) if current_phase_timer_mode != "countup" else None,
        runtime_task_id=runtime_task_id,
        completed_workflow_name=completed_workflow_name,
    )


def _row_to_focus_workflow_preset(row: asyncpg.Record) -> FocusWorkflowPresetOut:
    phases = _phase_models_from_row(row)
    if not phases:
        phases = _normalize_workflow_phases(
            None,
            fallback_focus_duration=int(row["focus_duration"]),
            fallback_break_duration=int(row["break_duration"]),
        )
        phases = [FocusWorkflowPhase(phase_type=phase["phase_type"], duration=int(phase["duration"])) for phase in phases]
    return FocusWorkflowPresetOut(
        id=row["id"],
        user_id=int(row["user_id"]),
        name=str(row["name"]),
        focus_duration=int(row["focus_duration"]),
        break_duration=int(row["break_duration"]),
        default_focus_timer_mode=_normalize_timer_mode(row.get("default_focus_timer_mode", "countdown") if hasattr(row, "get") else "countdown"),
        phases=phases,
        is_default=bool(row["is_default"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _get_default_focus_workflow_preset(
    conn: Any, user_id: int
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT id, user_id, name, focus_duration, break_duration, default_focus_timer_mode, phases, is_default, created_at, updated_at
        FROM focus_workflow_presets
        WHERE user_id = $1 AND is_default = TRUE
        LIMIT 1
        """,
        int(user_id),
    )


async def _get_bindable_task(conn: Any, user_id: int, task_id: UUID | None) -> dict[str, Any] | None:
    if task_id is None:
        return None
    return await conn.fetchrow(
        """
        SELECT id, status, is_deleted, title
        FROM tasks
        WHERE id = $1 AND user_id = $2
        """,
        task_id,
        int(user_id),
    )


async def _validate_phase_task_bindings(conn: Any, user_id: int, phases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    validated: list[dict[str, Any]] = []
    for phase in phases:
        next_phase = dict(phase)
        task_id = _phase_task_id_value(next_phase)
        if _phase_is_focus(next_phase) and task_id is not None:
            task_row = await _get_bindable_task(conn, user_id, task_id)
            if task_row is None or bool(task_row["is_deleted"]) or str(task_row["status"]) == "done":
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="绑定任务必须是未完成任务")
            next_phase["task_id"] = task_row["id"]
        else:
            next_phase["task_id"] = None if not _phase_is_focus(next_phase) else task_id
        validated.append(next_phase)
    return validated


async def _start_focus_log_for_task(conn: Any, user_id: int, task_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow(
        """
        INSERT INTO focus_logs(user_id, task_id, duration, start_time, end_at)
        VALUES ($1, $2, 0, NOW(), NULL)
        RETURNING id, user_id, task_id, duration, start_time, end_at, created_at
        """,
        int(user_id),
        task_id,
    )
    if row is None:
        raise HTTPException(status_code=500, detail="开始专注失败")
    return row


async def _close_open_focus_log(conn: Any, user_id: int) -> dict[str, Any] | None:
    open_row = await conn.fetchrow(
        """
        SELECT id, start_time
        FROM focus_logs
        WHERE user_id = $1 AND end_at IS NULL
        """,
        int(user_id),
    )
    if open_row is None:
        return None
    now = datetime.now(UTC)
    dur = int((now - open_row["start_time"]).total_seconds())
    if dur < 0:
        dur = 0
    closed_row = await conn.fetchrow(
        """
        UPDATE focus_logs
        SET end_at = NOW(), duration = $1
        WHERE id = $2
        RETURNING task_id
        """,
        dur,
        open_row["id"],
    )
    if closed_row is not None:
        await conn.execute(
            """
            UPDATE tasks
            SET actual_duration = actual_duration + $1, updated_at = NOW()
            WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE
            """,
            dur,
            closed_row["task_id"],
            int(user_id),
        )
    return {"duration": dur, "task_id": closed_row["task_id"] if closed_row is not None else None}


async def _set_workflow_waiting_for_task(conn: Any, workflow_id: UUID, phase_index: int, phase: dict[str, Any]) -> asyncpg.Record | None:
    await conn.execute(
        """
        UPDATE focus_workflows
        SET current_phase = $1,
            current_phase_index = $2,
            task_id = NULL,
            runtime_task_id = NULL,
            phase_started_at = NOW(),
            phase_planned_duration = $3,
            pending_confirmation = FALSE,
            pending_task_selection = TRUE,
            updated_at = NOW()
        WHERE id = $4
        """,
        str(phase["phase_type"]),
        int(phase_index),
        int(phase["duration"]),
        workflow_id,
    )
    return await conn.fetchrow(
        """
        SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
               focus_duration, break_duration, current_phase, phase_started_at,
               phase_planned_duration, pending_confirmation, pending_task_selection
        FROM focus_workflows
        WHERE id = $1
        """,
        workflow_id,
    )


async def _set_workflow_current_phase(
    conn: Any,
    workflow_id: UUID,
    *,
    phase_index: int,
    phase: dict[str, Any],
    task_id: UUID | None,
    runtime_task_id: UUID | None,
    pending_task_selection: bool,
) -> asyncpg.Record | None:
    await conn.execute(
        """
        UPDATE focus_workflows
        SET current_phase = $1,
            current_phase_index = $2,
            task_id = $3,
            runtime_task_id = $4,
            phase_started_at = NOW(),
            phase_planned_duration = $5,
            pending_confirmation = FALSE,
            pending_task_selection = $6,
            updated_at = NOW()
        WHERE id = $7
        """,
        str(phase["phase_type"]),
        int(phase_index),
        task_id,
        runtime_task_id,
        int(phase["duration"]),
        pending_task_selection,
        workflow_id,
    )
    return await conn.fetchrow(
        """
        SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
               focus_duration, break_duration, current_phase, phase_started_at,
               phase_planned_duration, pending_confirmation, pending_task_selection
        FROM focus_workflows
        WHERE id = $1
        """,
        workflow_id,
    )


async def _complete_focus_workflow(conn: Any, workflow_id: UUID, workflow_name: str) -> FocusWorkflowOut:
    await conn.execute(
        """
        UPDATE focus_workflows
        SET status = 'stopped', ended_at = NOW(), updated_at = NOW()
        WHERE id = $1
        """,
        workflow_id,
    )
    return _row_to_focus_workflow(None, completed_workflow_name=workflow_name)


async def _advance_focus_workflow_to_next_phase(
    conn: Any,
    workflow_row: Any,
    user_id: int,
    *,
    skip_breaks: bool,
) -> FocusWorkflowOut:
    try:
        phases = _normalize_workflow_phases(
            workflow_row.get("phases") if hasattr(workflow_row, "get") else workflow_row["phases"],
            fallback_focus_duration=int(workflow_row["focus_duration"]),
            fallback_break_duration=int(workflow_row["break_duration"]),
        )
    except HTTPException:
        phases = _build_default_phases(
            int(workflow_row["focus_duration"]),
            int(workflow_row["break_duration"]),
        )
    start_index = _safe_int(workflow_row.get("current_phase_index", 0) if hasattr(workflow_row, "get") else workflow_row["current_phase_index"], 0) + 1
    workflow_id = workflow_row["id"]
    workflow_name = str(workflow_row["workflow_name"] or "工作流")
    current_task_title: str | None = None
    current_task_id = (
        (workflow_row.get("runtime_task_id") if hasattr(workflow_row, "get") else None)
        or (workflow_row.get("task_id") if hasattr(workflow_row, "get") else workflow_row["task_id"])
    )
    if current_task_id is not None:
        current_task_row = await _get_bindable_task(conn, user_id, current_task_id)
        if current_task_row is not None:
            current_task_title = str(current_task_row["title"])
    for idx in range(start_index, len(phases)):
        phase = phases[idx]
        phase_type = str(phase["phase_type"])
        if phase_type == "break":
            if skip_breaks:
                continue
            next_row = await _set_workflow_current_phase(
                conn,
                workflow_id,
                phase_index=idx,
                phase=phase,
                task_id=None,
                runtime_task_id=None,
                pending_task_selection=False,
            )
            return _row_to_focus_workflow(next_row, task_title=current_task_title)
        phase_task_id = _phase_task_id_value(phase)
        task_row = await _get_bindable_task(conn, user_id, phase_task_id)
        if phase_task_id is not None and (task_row is None or bool(task_row["is_deleted"]) or str(task_row["status"]) == "done"):
            continue
        if phase_task_id is None:
            next_row = await _set_workflow_waiting_for_task(conn, workflow_id, idx, phase)
            return _row_to_focus_workflow(next_row, task_title=None)
        next_row = await _set_workflow_current_phase(
            conn,
            workflow_id,
            phase_index=idx,
            phase=phase,
            task_id=task_row["id"],
            runtime_task_id=None,
            pending_task_selection=False,
        )
        await _start_focus_log_for_task(conn, user_id, task_row["id"])
        return _row_to_focus_workflow(next_row, task_title=str(task_row["title"]))
    return await _complete_focus_workflow(conn, workflow_id, workflow_name)


async def _sync_active_focus_workflow(conn: Any, user_id: int) -> asyncpg.Record | None:
    """同步活动工作流状态，包括 countup 上限、任务失效与待选任务状态。"""
    row = await conn.fetchrow(
        """
        SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
               focus_duration, break_duration, current_phase, phase_started_at,
               phase_planned_duration, pending_confirmation, pending_task_selection
        FROM focus_workflows
        WHERE user_id = $1 AND status = 'active'
        """,
        int(user_id),
    )
    if row is None:
        return None
    if bool(row.get("pending_task_selection", False) if hasattr(row, "get") else False):
        return row
    phases = _normalize_workflow_phases(
        row.get("phases") if hasattr(row, "get") else row["phases"],
        fallback_focus_duration=int(row["focus_duration"]),
        fallback_break_duration=int(row["break_duration"]),
    )
    current_index_raw = row.get("current_phase_index", 0) if hasattr(row, "get") else row["current_phase_index"]
    current_index = _safe_int(current_index_raw, 0)
    current_phase = phases[current_index] if 0 <= current_index < len(phases) else None
    if current_phase is None:
        return None
    if str(row["current_phase"]) == "focus":
        runtime_task_id = row.get("runtime_task_id") if hasattr(row, "get") else None
        effective_task_id = runtime_task_id or _phase_task_id_value(current_phase) or row["task_id"]
        if effective_task_id is None:
            return await _set_workflow_waiting_for_task(conn, row["id"], current_index, current_phase)
        task_row = await _get_bindable_task(conn, user_id, effective_task_id)
        if task_row is None or bool(task_row["is_deleted"]) or str(task_row["status"]) == "done":
            await _close_open_focus_log(conn, int(user_id))
            advanced = await _advance_focus_workflow_to_next_phase(conn, row, int(user_id), skip_breaks=True)
            return None if advanced.state == "normal" else await conn.fetchrow(
                """
                SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                       focus_duration, break_duration, current_phase, phase_started_at,
                       phase_planned_duration, pending_confirmation, pending_task_selection
                FROM focus_workflows
                WHERE user_id = $1 AND status = 'active'
                """,
                int(user_id),
            )
    if bool(row["pending_confirmation"]):
        return row
    phase_started_at = row["phase_started_at"]
    phase_planned_duration = _safe_int(row["phase_planned_duration"], 0)
    if phase_started_at is None or phase_planned_duration <= 0:
        return row
    elapsed = int((datetime.now(UTC) - phase_started_at).total_seconds())
    current_phase_type = str(row["current_phase"])
    timer_mode = _phase_timer_mode_value(current_phase)
    if current_phase_type == "focus" and timer_mode == "countup":
        if elapsed < COUNTUP_PHASE_CAP_SECONDS:
            return row
        await _close_open_focus_log(conn, int(user_id))
        advanced = await _advance_focus_workflow_to_next_phase(conn, row, int(user_id), skip_breaks=False)
        return None if advanced.state == "normal" else await conn.fetchrow(
            """
            SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                   focus_duration, break_duration, current_phase, phase_started_at,
                   phase_planned_duration, pending_confirmation, pending_task_selection
            FROM focus_workflows
            WHERE user_id = $1 AND status = 'active'
            """,
            int(user_id),
        )
    if elapsed < phase_planned_duration:
        return row
    await conn.execute(
        """
        UPDATE focus_workflows
        SET pending_confirmation = TRUE, updated_at = NOW()
        WHERE id = $1
        """,
        row["id"],
    )
    if current_phase_type == "focus":
        await _close_open_focus_log(conn, int(user_id))
    return await conn.fetchrow(
        """
        SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
               focus_duration, break_duration, current_phase, phase_started_at,
               phase_planned_duration, pending_confirmation, pending_task_selection
        FROM focus_workflows
        WHERE id = $1
        """,
        row["id"],
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
                current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids, task_type, tags,
                start_date, due_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id, user_id, title, content, status, priority, target_duration,
                      current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids, task_type, tags,
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
            body.event_ids,
            body.task_type,
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
               current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids, task_type, tags,
               actual_duration, start_date, due_date, is_deleted, created_at, updated_at
        FROM tasks
        WHERE {where_sql}
        ORDER BY updated_at DESC
        LIMIT ${limit_i} OFFSET ${offset_i}
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [_row_to_task(r) for r in rows]


@router.get("/tasks/calendar", response_model=list[TaskOut])
async def list_calendar_tasks(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    start: date = Query(...),
    end: date = Query(...),
) -> list[TaskOut]:
    """List tasks that overlap a calendar date range."""
    if end <= start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="end must be after start")

    range_start = datetime.combine(start, datetime.min.time(), tzinfo=UTC)
    range_end = datetime.combine(end, datetime.min.time(), tzinfo=UTC)

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            -- calendar range endpoint
            SELECT id, user_id, title, content, status, priority, target_duration,
                   current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids, task_type, tags,
                   actual_duration, start_date, due_date, is_deleted, created_at, updated_at
            FROM tasks
            WHERE user_id = $1
              AND is_deleted = FALSE
              AND (
                (start_date IS NOT NULL AND due_date IS NOT NULL AND start_date < $3 AND due_date >= $2)
                OR (start_date IS NOT NULL AND due_date IS NULL AND start_date >= $2 AND start_date < $3)
                OR (start_date IS NULL AND due_date IS NOT NULL AND due_date >= $2 AND due_date < $3)
              )
            ORDER BY
              CASE WHEN status = 'done' THEN 1 ELSE 0 END ASC,
              priority DESC,
              due_date ASC NULLS LAST,
              updated_at ASC
            LIMIT 500
            """,
            int(user.id),
            range_start,
            range_end,
        )
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
                   current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids, task_type, tags,
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
        "event_ids": "event_ids",
        "task_type": "task_type",
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
                  current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids, task_type, tags,
                  actual_duration, start_date, due_date, is_deleted, created_at, updated_at
    """

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *args)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    return _row_to_task(row)


@router.patch("/tasks/{task_id}/move-to-today", response_model=TaskOut)
async def move_task_to_today(
    request: Request,
    task_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> TaskOut:
    """将任务移动到今天（修改 due_date）。"""
    pool = _pool_from_request(request)
    now = datetime.now(UTC)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE tasks
            SET due_date = $1, start_date = CASE WHEN start_date > $1 THEN $1 ELSE start_date END, updated_at = NOW()
            WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE
            RETURNING id, user_id, title, content, status, priority, target_duration,
                      current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids, task_type, tags,
                      actual_duration, start_date, due_date, is_deleted, created_at, updated_at
            """,
            now,
            task_id,
            int(user.id),
        )
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


@router.post("/appointments", response_model=AppointmentOut)
async def create_appointment(
    request: Request,
    body: AppointmentCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AppointmentOut:
    """创建日程。"""
    _validate_appointment_times(body.starts_at, body.ends_at)
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        await _validate_linked_task(
            conn,
            user_id=int(user.id),
            linked_task_id=body.linked_task_id,
        )
        row = await conn.fetchrow(
            """
            INSERT INTO appointments(
                user_id, title, content, status, starts_at, ends_at, repeat_rule, linked_task_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, user_id, title, content, status, starts_at, ends_at, repeat_rule, linked_task_id,
                      is_deleted, created_at, updated_at
            """,
            int(user.id),
            body.title,
            body.content,
            body.status,
            body.starts_at,
            body.ends_at,
            body.repeat_rule,
            body.linked_task_id,
        )
    if row is None:
        raise HTTPException(status_code=500, detail="创建日程失败")
    return _row_to_appointment(row)


@router.get("/appointments", response_model=list[AppointmentOut])
async def list_appointments(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    view: AppointmentListView = Query(default="all"),
) -> list[AppointmentOut]:
    """列出日程。"""
    pool = _pool_from_request(request)
    where_clauses = ["user_id = $1", "is_deleted = FALSE"]
    sql_comment = ""
    args: list[Any] = [int(user.id)]

    if view == "today":
        sql_comment = "-- today filter"
        where_clauses.append("DATE(ends_at AT TIME ZONE 'UTC') = DATE(NOW() AT TIME ZONE 'UTC')")
    elif view == "needs_confirmation":
        sql_comment = "-- needs_confirmation filter"
        where_clauses.append("status = 'pending' AND ends_at <= NOW()")
    elif view == "repeating":
        sql_comment = "-- repeat filter"
        where_clauses.append("repeat_rule IS NOT NULL")

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            {sql_comment}
            SELECT id, user_id, title, content, status, starts_at, ends_at, repeat_rule, linked_task_id,
                   is_deleted, created_at, updated_at
            FROM appointments
            WHERE {" AND ".join(where_clauses)}
            ORDER BY ends_at ASC, created_at ASC
            """,
            *args,
        )
    return [_row_to_appointment(row) for row in rows]


@router.get("/appointments/{appointment_id}", response_model=AppointmentOut)
async def get_appointment(
    request: Request,
    appointment_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> AppointmentOut:
    """获取单个日程。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, title, content, status, starts_at, ends_at, repeat_rule, linked_task_id,
                   is_deleted, created_at, updated_at
            FROM appointments
            WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
            """,
            appointment_id,
            int(user.id),
        )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")
    return _row_to_appointment(row)


@router.patch("/appointments/{appointment_id}", response_model=AppointmentOut)
async def update_appointment(
    request: Request,
    appointment_id: UUID,
    body: AppointmentUpdateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AppointmentOut:
    """更新日程。"""
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        return await get_appointment(request, appointment_id, user)

    pool = _pool_from_request(request)
    current = await get_appointment(request, appointment_id, user)
    next_starts_at = patch.get("starts_at", current.starts_at)
    next_ends_at = patch.get("ends_at", current.ends_at)
    _validate_appointment_times(next_starts_at, next_ends_at)
    next_linked_task_id = patch.get("linked_task_id", current.linked_task_id)

    allowed_cols = {
        "title": "title",
        "content": "content",
        "status": "status",
        "starts_at": "starts_at",
        "ends_at": "ends_at",
        "repeat_rule": "repeat_rule",
        "linked_task_id": "linked_task_id",
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
        return current

    args.append(appointment_id)
    appointment_i = len(args)
    args.append(int(user.id))
    user_i = len(args)

    async with pool.acquire() as conn:
        await _validate_linked_task(
            conn,
            user_id=int(user.id),
            linked_task_id=next_linked_task_id,
            exclude_appointment_id=appointment_id,
        )
        row = await conn.fetchrow(
            f"""
            UPDATE appointments
            SET {", ".join(sets)}, updated_at = NOW()
            WHERE id = ${appointment_i} AND user_id = ${user_i} AND is_deleted = FALSE
            RETURNING id, user_id, title, content, status, starts_at, ends_at, repeat_rule, linked_task_id,
                      is_deleted, created_at, updated_at
            """,
            *args,
        )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")
    return _row_to_appointment(row)


@router.get("/appointments/{appointment_id}/occurrences", response_model=list[AppointmentOccurrenceOut])
async def list_appointment_occurrences(
    request: Request,
    appointment_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
    start: date = Query(...),
    end: date = Query(...),
) -> list[AppointmentOccurrenceOut]:
    """列出日程在给定区间内的 occurrence。"""
    if end <= start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="end must be after start")

    appointment = await get_appointment(request, appointment_id, user)
    range_start = datetime.combine(start, datetime.min.time(), tzinfo=UTC)
    range_end = datetime.combine(end, datetime.min.time(), tzinfo=UTC)

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        return await _resolve_appointment_occurrences(
            conn,
            appointment=appointment,
            range_start=range_start,
            range_end=range_end,
        )


@router.post("/appointments/{appointment_id}/occurrences/confirm", response_model=AppointmentOccurrenceOut)
async def confirm_appointment_occurrence(
    request: Request,
    appointment_id: UUID,
    body: AppointmentOccurrenceConfirmRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AppointmentOccurrenceOut:
    """独立确认某一次日程 occurrence。"""
    appointment = await get_appointment(request, appointment_id, user)
    occurrence_starts_at, occurrence_ends_at = _appointment_occurrence_bounds(appointment, body.occurrence_ends_at)

    if appointment.repeat_rule is None and body.occurrence_ends_at != appointment.ends_at:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="单次日程只能确认原始 occurrence")

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO appointment_occurrence_results(appointment_id, occurrence_ends_at, status)
            VALUES ($1, $2, $3)
            ON CONFLICT (appointment_id, occurrence_ends_at)
            DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
            RETURNING appointment_id, occurrence_ends_at, status, created_at, updated_at
            """,
            appointment.id,
            occurrence_ends_at,
            body.status,
        )
    if row is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="确认日程 occurrence 失败")

    return _build_appointment_occurrence(
        appointment,
        occurrence_starts_at=occurrence_starts_at,
        occurrence_ends_at=row["occurrence_ends_at"],
        stored_status=row["status"],
    )


@router.delete("/appointments/{appointment_id}")
async def delete_appointment(
    request: Request,
    appointment_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, bool]:
    """软删除日程。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        tag = await conn.execute(
            """
            UPDATE appointments
            SET is_deleted = TRUE, updated_at = NOW()
            WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
            """,
            appointment_id,
            int(user.id),
        )
    if not tag.startswith("UPDATE ") or tag.endswith(" 0"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")
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
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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


async def _stop_active_focus(conn: Any, user_id: int) -> None:
    """结束当前用户的活动专注及工作流。"""
    workflow_row = await conn.fetchrow(
        "SELECT id FROM focus_workflows WHERE user_id = $1 AND status = 'active'",
        user_id,
    )
    open_row = await conn.fetchrow(
        """
        SELECT id, user_id, task_id, duration, start_time, end_at, created_at
        FROM focus_logs
        WHERE user_id = $1 AND end_at IS NULL
        """,
        user_id,
    )
    if open_row is None:
        if workflow_row is not None:
            await conn.execute(
                """
                UPDATE focus_workflows
                SET status = 'stopped', ended_at = NOW(), updated_at = NOW()
                WHERE id = $1
                """,
                workflow_row["id"],
            )
        return

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
        RETURNING id, task_id
        """,
        dur,
        open_row["id"],
    )
    if workflow_row is not None:
        await conn.execute(
            """
            UPDATE focus_workflows
            SET status = 'stopped', ended_at = NOW(), updated_at = NOW()
            WHERE id = $1
            """,
            workflow_row["id"],
        )
    if row is not None:
        await conn.execute(
            """
            UPDATE tasks
            SET actual_duration = actual_duration + $1, updated_at = NOW()
            WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE
            """,
            dur,
            row["task_id"],
            user_id,
        )


async def _create_workflow_with_focus_phase(
    conn: Any,
    *,
    user_id: int,
    task_id: UUID,
    workflow_name: str,
    phases: list[dict[str, Any]],
    focus_duration: int,
    break_duration: int,
) -> asyncpg.Record:
    """创建活动工作流并进入 focus 阶段。"""
    first_phase = phases[0]
    try:
        await conn.execute(
            """
            INSERT INTO focus_workflows(
                user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                focus_duration, break_duration, current_phase, phase_started_at,
                phase_planned_duration, pending_confirmation, pending_task_selection, status
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, 0, $6, $7, $8, NOW(), $9, FALSE, FALSE, 'active')
            """,
            int(user_id),
            task_id,
            task_id,
            workflow_name,
            _to_jsonb_param(phases),
            int(focus_duration),
            int(break_duration),
            str(first_phase["phase_type"]),
            int(first_phase["duration"]),
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="已有活动工作流")
    row = await conn.fetchrow(
        """
        INSERT INTO focus_logs(user_id, task_id, duration, start_time, end_at)
        VALUES ($1, $2, 0, NOW(), NULL)
        RETURNING id, user_id, task_id, duration, start_time, end_at, created_at
        """,
        int(user_id),
        task_id,
    )
    if row is None:
        raise HTTPException(status_code=500, detail="开始专注失败")
    return row


@router.get("/focus/workflows", response_model=list[FocusWorkflowPresetOut])
async def list_focus_workflow_presets(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[FocusWorkflowPresetOut]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, user_id, name, focus_duration, break_duration, default_focus_timer_mode, phases, is_default, created_at, updated_at
            FROM focus_workflow_presets
            WHERE user_id = $1
            ORDER BY is_default DESC, updated_at DESC
            """,
            int(user.id),
        )
    return [_row_to_focus_workflow_preset(row) for row in rows]


@router.post("/focus/workflows", response_model=FocusWorkflowPresetOut)
async def create_focus_workflow_preset(
    request: Request,
    body: FocusWorkflowPresetCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowPresetOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing_default = await _get_default_focus_workflow_preset(conn, int(user.id))
            should_default = body.is_default or existing_default is None
            if should_default:
                await conn.execute(
                    "UPDATE focus_workflow_presets SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1",
                    int(user.id),
                )
            phases = _normalize_workflow_phases(
                body.phases,
                fallback_focus_duration=int(body.focus_duration),
                fallback_break_duration=int(body.break_duration),
                default_focus_timer_mode=body.default_focus_timer_mode,
            )
            phases = await _validate_phase_task_bindings(conn, int(user.id), phases)
            row = await conn.fetchrow(
                """
                INSERT INTO focus_workflow_presets(user_id, name, focus_duration, break_duration, phases, default_focus_timer_mode, is_default)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
                RETURNING id, user_id, name, focus_duration, break_duration, default_focus_timer_mode, phases, is_default, created_at, updated_at
                """,
                int(user.id),
                body.name.strip(),
                int(body.focus_duration),
                int(body.break_duration),
                _to_jsonb_param(phases),
                body.default_focus_timer_mode,
                should_default,
            )
    if row is None:
        raise HTTPException(status_code=500, detail="创建工作流失败")
    return _row_to_focus_workflow_preset(row)


@router.patch("/focus/workflows/{preset_id}", response_model=FocusWorkflowPresetOut)
async def update_focus_workflow_preset(
    request: Request,
    preset_id: UUID,
    body: FocusWorkflowPresetUpdateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowPresetOut:
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="没有可更新字段")
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            target = await conn.fetchrow(
                """
                SELECT id, user_id, name, focus_duration, break_duration, default_focus_timer_mode, phases, is_default, created_at, updated_at
                FROM focus_workflow_presets
                WHERE id = $1 AND user_id = $2
                """,
                preset_id,
                int(user.id),
            )
            if target is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="工作流不存在")
            if patch.get("is_default") is True:
                await conn.execute(
                    "UPDATE focus_workflow_presets SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1",
                    int(user.id),
                )
            if "phases" in patch:
                phases = _normalize_workflow_phases(
                    body.phases,
                    fallback_focus_duration=int(target["focus_duration"]),
                    fallback_break_duration=int(target["break_duration"]),
                    default_focus_timer_mode=str(
                        patch.get("default_focus_timer_mode") or target.get("default_focus_timer_mode", "countdown")
                    ),
                )
                phases = await _validate_phase_task_bindings(conn, int(user.id), phases)
            else:
                phases = target["phases"]
            sets: list[str] = []
            args: list[Any] = []
            if "name" in patch:
                args.append(str(patch["name"]).strip())
                sets.append(f"name = ${len(args)}")
            if "focus_duration" in patch:
                args.append(int(patch["focus_duration"]))
                sets.append(f"focus_duration = ${len(args)}")
            if "break_duration" in patch:
                args.append(int(patch["break_duration"]))
                sets.append(f"break_duration = ${len(args)}")
            if "phases" in patch:
                args.append(_to_jsonb_param(phases))
                sets.append(f"phases = ${len(args)}::jsonb")
            if "default_focus_timer_mode" in patch:
                args.append(str(patch["default_focus_timer_mode"]))
                sets.append(f"default_focus_timer_mode = ${len(args)}")
            if "is_default" in patch:
                args.append(bool(patch["is_default"]))
                sets.append(f"is_default = ${len(args)}")
            args.append(preset_id)
            p_i = len(args)
            args.append(int(user.id))
            u_i = len(args)
            row = await conn.fetchrow(
                f"""
                UPDATE focus_workflow_presets
                SET {", ".join(sets)}, updated_at = NOW()
                WHERE id = ${p_i} AND user_id = ${u_i}
                RETURNING id, user_id, name, focus_duration, break_duration, default_focus_timer_mode, phases, is_default, created_at, updated_at
                """,
                *args,
            )
    if row is None:
        raise HTTPException(status_code=500, detail="更新工作流失败")
    return _row_to_focus_workflow_preset(row)


@router.delete("/focus/workflows/{preset_id}")
async def delete_focus_workflow_preset(
    request: Request,
    preset_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, bool]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT id, is_default FROM focus_workflow_presets WHERE id = $1 AND user_id = $2",
                preset_id,
                int(user.id),
            )
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="工作流不存在")
            await conn.execute(
                "DELETE FROM focus_workflow_presets WHERE id = $1 AND user_id = $2",
                preset_id,
                int(user.id),
            )
            if bool(row["is_default"]):
                next_row = await conn.fetchrow(
                    """
                    SELECT id
                    FROM focus_workflow_presets
                    WHERE user_id = $1
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """,
                    int(user.id),
                )
                if next_row is not None:
                    await conn.execute(
                        "UPDATE focus_workflow_presets SET is_default = TRUE, updated_at = NOW() WHERE id = $1",
                        next_row["id"],
                    )
    return {"ok": True}


@router.post("/focus/workflows/{preset_id}/default", response_model=FocusWorkflowPresetOut)
async def set_default_focus_workflow_preset(
    request: Request,
    preset_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowPresetOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT id, user_id, name, focus_duration, break_duration, default_focus_timer_mode, phases, is_default, created_at, updated_at
                FROM focus_workflow_presets
                WHERE id = $1 AND user_id = $2
                """,
                preset_id,
                int(user.id),
            )
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="工作流不存在")
            await conn.execute(
                "UPDATE focus_workflow_presets SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1",
                int(user.id),
            )
            updated = await conn.fetchrow(
                """
                UPDATE focus_workflow_presets
                SET is_default = TRUE, updated_at = NOW()
                WHERE id = $1 AND user_id = $2
                RETURNING id, user_id, name, focus_duration, break_duration, default_focus_timer_mode, phases, is_default, created_at, updated_at
                """,
                preset_id,
                int(user.id),
            )
    if updated is None:
        raise HTTPException(status_code=500, detail="设置默认工作流失败")
    return _row_to_focus_workflow_preset(updated)


@router.post("/tasks/{task_id}/focus/start", response_model=FocusLogOut)
async def start_focus(
    request: Request,
    task_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusLogOut:
    """兼容开始专注接口：创建工作流并进入 focus 阶段。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            task_row = await conn.fetchrow(
                "SELECT id, target_duration FROM tasks WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE",
                task_id,
                int(user.id),
            )
            if task_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
            await _stop_active_focus(conn, int(user.id))
            preset = await _get_default_focus_workflow_preset(conn, int(user.id))
            if preset is not None:
                focus_duration = int(preset["focus_duration"])
                break_duration = int(preset["break_duration"])
                phases = _normalize_workflow_phases(
                    preset["phases"],
                    fallback_focus_duration=focus_duration,
                    fallback_break_duration=break_duration,
                    default_focus_timer_mode=_normalize_timer_mode(
                        preset.get("default_focus_timer_mode", "countdown") if hasattr(preset, "get") else "countdown"
                    ),
                )
                workflow_name = str(preset["name"] or "默认工作流")
            else:
                focus_duration = int(task_row["target_duration"]) if int(task_row["target_duration"]) >= 60 else 1500
                break_duration = 300
                phases = _build_default_phases(focus_duration, break_duration)
                workflow_name = "默认工作流"
            row = await _create_workflow_with_focus_phase(
                conn,
                user_id=int(user.id),
                task_id=task_id,
                workflow_name=workflow_name,
                phases=phases,
                focus_duration=focus_duration,
                break_duration=break_duration,
            )
    if row is None:
        raise HTTPException(status_code=500, detail="开始专注失败")
    return _row_to_focus_log(row)


@router.post("/focus/workflow/create", response_model=FocusWorkflowOut)
async def create_focus_workflow(
    request: Request,
    body: FocusWorkflowCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    """创建工作流并立即进入 focus 阶段。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            task_row = await conn.fetchrow(
                "SELECT id, title FROM tasks WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE",
                body.task_id,
                int(user.id),
            )
            if task_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
            await _stop_active_focus(conn, int(user.id))
            phases = _build_default_phases(int(body.focus_duration), int(body.break_duration))
            await _create_workflow_with_focus_phase(
                conn,
                user_id=int(user.id),
                task_id=body.task_id,
                workflow_name="自定义工作流",
                phases=phases,
                focus_duration=int(body.focus_duration),
                break_duration=int(body.break_duration),
            )
            row = await conn.fetchrow(
                """
                SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                       focus_duration, break_duration, current_phase, phase_started_at,
                       phase_planned_duration, pending_confirmation, pending_task_selection
                FROM focus_workflows
                WHERE user_id = $1 AND status = 'active'
                """,
                int(user.id),
            )
    return _row_to_focus_workflow(row, task_title=str(task_row["title"]))


@router.post("/focus/workflow/ai-create", response_model=FocusWorkflowOut)
async def create_focus_workflow_by_ai(
    request: Request,
    body: FocusWorkflowCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    """AI 创建工作流入口，必须携带授权标记。"""
    authorized = (request.headers.get("X-AI-Authorized") or "").strip().lower()
    if authorized != "true":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="AI 创建工作流需要用户授权")
    return await create_focus_workflow(request, body, user)


@router.get("/focus/workflow/current", response_model=FocusWorkflowOut)
async def get_focus_workflow_current(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    """查询当前工作流与阶段状态。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await _sync_active_focus_workflow(conn, int(user.id))
            if row is None:
                return FocusWorkflowOut(state="normal")
            task_title = None
            if row["task_id"] is not None:
                task_row = await conn.fetchrow(
                    "SELECT title FROM tasks WHERE id = $1 AND user_id = $2",
                    row["task_id"],
                    int(user.id),
                )
                if task_row is not None:
                    task_title = str(task_row["title"])
    return _row_to_focus_workflow(row, task_title=task_title)


@router.post("/focus/workflow/skip_phase", response_model=FocusWorkflowOut)
async def skip_focus_workflow_phase(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    """跳过当前阶段的剩余时间，直接将其置为待确认状态。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                       focus_duration, break_duration, current_phase, phase_started_at,
                       phase_planned_duration, pending_confirmation, pending_task_selection
                FROM focus_workflows
                WHERE user_id = $1 AND status = 'active'
                """,
                int(user.id),
            )
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前无活动工作流")
            if bool(row.get("pending_task_selection", False) if hasattr(row, "get") else False):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段需要先选择任务")
            if bool(row["pending_confirmation"]):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段已结束，请确认流转")

            # 将其强制置为待确认
            await conn.execute(
                """
                UPDATE focus_workflows
                SET pending_confirmation = TRUE, updated_at = NOW()
                WHERE id = $1
                """,
                row["id"],
            )
            current_phase_type = str(row["current_phase"])
            if current_phase_type == "focus":
                await _close_open_focus_log(conn, int(user.id))

            # 重新获取以返回最新状态
            updated_row = await conn.fetchrow(
                """
                SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                       focus_duration, break_duration, current_phase, phase_started_at,
                       phase_planned_duration, pending_confirmation, pending_task_selection
                FROM focus_workflows
                WHERE id = $1
                """,
                row["id"],
            )
            task_row = await conn.fetchrow(
                "SELECT title FROM tasks WHERE id = $1 AND user_id = $2",
                updated_row["task_id"],
                int(user.id),
            )
    return _row_to_focus_workflow(updated_row, task_title=str(task_row["title"]) if task_row else None)


@router.post("/focus/workflow/confirm", response_model=FocusWorkflowOut)
async def confirm_focus_workflow_transition(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    """确认阶段结束并流转到下一阶段。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await _sync_active_focus_workflow(conn, int(user.id))
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前无活动工作流")
            if not bool(row["pending_confirmation"]):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段未结束，无需确认")
            return await _advance_focus_workflow_to_next_phase(conn, row, int(user.id), skip_breaks=False)


@router.post("/focus/workflow/select-task", response_model=FocusWorkflowOut)
async def select_focus_workflow_task(
    request: Request,
    body: FocusWorkflowSelectTaskRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                       focus_duration, break_duration, current_phase, phase_started_at,
                       phase_planned_duration, pending_confirmation, pending_task_selection
                FROM focus_workflows
                WHERE user_id = $1 AND status = 'active'
                """,
                int(user.id),
            )
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前无活动工作流")
            if not bool(row.get("pending_task_selection", False) if hasattr(row, "get") else False):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段无需选择任务")
            phases = _normalize_workflow_phases(
                row.get("phases") if hasattr(row, "get") else row["phases"],
                fallback_focus_duration=int(row["focus_duration"]),
                fallback_break_duration=int(row["break_duration"]),
            )
            current_index = _safe_int(row.get("current_phase_index", 0) if hasattr(row, "get") else row["current_phase_index"], 0)
            phase = phases[current_index]
            if str(phase["phase_type"]) != "focus":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段不是专注阶段")
            task_row = await _get_bindable_task(conn, int(user.id), body.task_id)
            if task_row is None or bool(task_row["is_deleted"]) or str(task_row["status"]) == "done":
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="请选择未完成任务")
            next_row = await _set_workflow_current_phase(
                conn,
                row["id"],
                phase_index=current_index,
                phase=phase,
                task_id=task_row["id"],
                runtime_task_id=task_row["id"],
                pending_task_selection=False,
            )
            await _start_focus_log_for_task(conn, int(user.id), task_row["id"])
    return _row_to_focus_workflow(next_row, task_title=str(task_row["title"]))


@router.post("/focus/stop", response_model=Any)
async def stop_focus(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> Any:
    """结束当前专注并终止活动工作流。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            workflow_row = await conn.fetchrow(
                "SELECT id FROM focus_workflows WHERE user_id = $1 AND status = 'active'",
                int(user.id),
            )
            open_row = await conn.fetchrow(
                """
                SELECT id, user_id, task_id, duration, start_time, end_at, created_at
                FROM focus_logs
                WHERE user_id = $1 AND end_at IS NULL
                """,
                int(user.id),
            )
            if open_row is None:
                if workflow_row is not None:
                    await conn.execute(
                        """
                        UPDATE focus_workflows
                        SET status = 'stopped', ended_at = NOW(), updated_at = NOW()
                        WHERE id = $1
                        """,
                        workflow_row["id"],
                    )
                    return {"msg": "Workflow stopped", "stopped": True}
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
            if workflow_row is not None:
                await conn.execute(
                    """
                    UPDATE focus_workflows
                    SET status = 'stopped', ended_at = NOW(), updated_at = NOW()
                    WHERE id = $1
                    """,
                    workflow_row["id"],
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
        async with conn.transaction():
            await _sync_active_focus_workflow(conn, int(user.id))
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
        range_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
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
