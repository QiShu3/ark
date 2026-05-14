from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

TaskStatus = Literal["todo", "done"]
TaskCyclePeriod = Literal["daily", "weekly", "monthly", "custom"]
TaskType = Literal["focus", "checkin"]
CompletionPeriodType = Literal["once", "daily", "weekly", "monthly", "custom_days"]
AppointmentStoredStatus = Literal["pending", "attended", "missed", "cancelled"]
AppointmentStatus = Literal["pending", "needs_confirmation", "attended", "missed", "cancelled"]
AppointmentListView = Literal["all", "today", "needs_confirmation", "repeating"]
PhaseType = Literal["focus", "break"]
FocusTimerMode = Literal["countdown", "countup"]
FocusWorkType = Literal["vocab_today", "erc_review"]
FocusWorkDisplayState = Literal["fullscreen", "minimized", "closed"]
FocusWorkResult = Literal["completed", "interrupted", "abandoned"]
COUNTUP_PHASE_CAP_SECONDS = 2 * 60 * 60


class CompletionStateOut(BaseModel):
    completion_state: Literal["permanent", "available", "period_complete", "blocked"]
    is_completable_now: bool
    completed_count_in_period: int
    remaining_completions_in_period: int
    current_period_start: datetime | None
    current_period_end: datetime | None
    blocked_reason: Literal["period_limit_reached", "not_workday", "already_completed_once"] | None
    hidden_from_action_list: bool


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
    event_id: UUID | None = None
    is_recurring: bool = False
    period_type: CompletionPeriodType = "once"
    custom_period_days: int | None = Field(default=None, ge=1)
    max_completions_per_period: int = Field(default=1, ge=1)
    weekday_only: bool = False
    time_inherits_from_event: bool = False
    time_overridden: bool = False
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
    event_id: UUID | None = None
    is_recurring: bool | None = None
    period_type: CompletionPeriodType | None = None
    custom_period_days: int | None = Field(default=None, ge=1)
    max_completions_per_period: int | None = Field(default=None, ge=1)
    weekday_only: bool | None = None
    time_inherits_from_event: bool | None = None
    time_overridden: bool | None = None
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
    event_id: UUID | None
    is_recurring: bool
    period_type: CompletionPeriodType
    custom_period_days: int | None
    max_completions_per_period: int
    weekday_only: bool
    time_inherits_from_event: bool
    time_overridden: bool
    manually_scheduled_for_today: bool
    task_type: TaskType
    tags: list[str]
    actual_duration: int
    start_date: datetime | None
    due_date: datetime | None
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    completion_state: CompletionStateOut | None = None


class AppointmentCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str | None = None
    status: AppointmentStoredStatus = "pending"
    starts_at: datetime | None = None
    ends_at: datetime
    repeat_rule: str | None = Field(default=None, max_length=120)
    linked_task_id: UUID | None = None
    event_id: UUID | None = None
    is_recurring: bool = False
    period_type: CompletionPeriodType = "once"
    custom_period_days: int | None = Field(default=None, ge=1)
    max_completions_per_period: int = Field(default=1, ge=1)
    weekday_only: bool = False
    time_inherits_from_event: bool = False
    time_overridden: bool = False


class AppointmentUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = None
    status: AppointmentStoredStatus | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    repeat_rule: str | None = Field(default=None, max_length=120)
    linked_task_id: UUID | None = None
    event_id: UUID | None = None
    is_recurring: bool | None = None
    period_type: CompletionPeriodType | None = None
    custom_period_days: int | None = Field(default=None, ge=1)
    max_completions_per_period: int | None = Field(default=None, ge=1)
    weekday_only: bool | None = None
    time_inherits_from_event: bool | None = None
    time_overridden: bool | None = None


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
    event_id: UUID | None
    is_recurring: bool
    period_type: CompletionPeriodType
    custom_period_days: int | None
    max_completions_per_period: int
    weekday_only: bool
    time_inherits_from_event: bool
    time_overridden: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    completion_state: CompletionStateOut | None = None


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


AchievementStatus = Literal["unlocked", "in_progress", "locked"]


class AchievementItemOut(BaseModel):
    id: str
    title: str
    description: str
    status: AchievementStatus
    current_value: int | None = None
    target_value: int | None = None
    progress_text: str | None = None


class AchievementSectionStatsOut(BaseModel):
    unlocked_count: int
    in_progress_count: int
    primary_metric_value: int | None = None
    primary_metric_label: str | None = None


class AchievementSectionOut(BaseModel):
    title: str
    summary_text: str | None = None
    stats: AchievementSectionStatsOut
    latest_unlocked: list[AchievementItemOut]
    upcoming: list[AchievementItemOut]


class AchievementSummaryOut(BaseModel):
    active_event: EventOut | None
    event_achievements: AchievementSectionOut | None
    global_achievements: AchievementSectionOut


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
    focus_work_type: FocusWorkType | None = None
    is_temporary: bool = False
    record_focus: bool = True


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
    active_focus_work_type: FocusWorkType | None = None
    focus_work_display_state: FocusWorkDisplayState | None = None
    focus_work_result: FocusWorkResult | None = None
    focus_work_progress_snapshot: dict[str, object] | None = None
    next_focus_work_type: FocusWorkType | None = None
    has_minimized_work: bool = False
    record_focus: bool = True


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


class FocusWorkflowStartAppWorkRequest(BaseModel):
    focus_work_type: FocusWorkType
    record_focus: bool = True


class FocusWorkflowResultRequest(BaseModel):
    focus_work_type: FocusWorkType
    result: FocusWorkResult
    progress_snapshot: dict[str, object] = Field(default_factory=dict)
