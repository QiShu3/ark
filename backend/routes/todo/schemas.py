from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from lib.focus_work_types import CHOICE_KIND, FLASH_CARD_KIND, INPUT_KIND, normalize_focus_work_type

TaskStatus = Literal["todo", "done"]
TaskCyclePeriod = Literal["daily", "weekly", "monthly", "custom"]
TaskType = Literal["focus", "checkin"]
TaskSourceType = Literal["user", "app"]
EventPlanScheduleMode = Literal["from_start", "before_due"]
EventPlanItemKind = Literal["task", "appointment"]
AppTaskId = Literal["vocab", "erc", "input"]
AppTaskType = Literal["flash_card", "choice", "input"]
AppTaskConfigStatus = Literal["active", "disabled", "invalid"]
AppTaskRuntimeState = Literal[
    "uninitialized",
    "ready",
    "completed_today",
    "blocked",
    "config_invalid",
    "no_primary_event",
    "event_not_configured",
]
CompletionPeriodType = Literal["once", "daily", "weekly", "monthly", "custom_days"]
AppointmentStoredStatus = Literal["pending", "attended", "missed", "cancelled"]
AppointmentStatus = Literal["pending", "needs_confirmation", "attended", "missed", "cancelled"]
AppointmentListView = Literal["all", "today", "needs_confirmation", "repeating"]
PhaseType = Literal["focus", "break", "deliberate_group"]
FocusTimerMode = Literal["countdown", "countup"]
FocusWorkType = Literal["flash_card", "choice", "input", "task_focus"]
FocusWorkDisplayState = Literal["fullscreen", "minimized", "closed"]
FocusWorkResult = Literal["completed", "interrupted", "abandoned"]
FocusWorkRunStatus = Literal["running", "paused", "content_completed", "completed", "abandoned"]
FocusWorkRunMode = Literal["counted", "extra"]
WorkflowRecordStatus = Literal["running", "completed", "abandoned"]
FocusPhaseRuntimeState = Literal[
    "running_run",
    "counted_run_completed_confirming",
    "extra_run_completed",
    "task_already_completed",
    "phase_time_expired_prompt",
    "pending_task_selection",
    "break_running",
    "workflow_settlement",
]
COUNTUP_PHASE_CAP_SECONDS = 2 * 60 * 60


class _NormalizedFocusWorkTypeBase(BaseModel):
    @field_validator("focus_work_type", "active_focus_work_type", "next_focus_work_type", mode="before", check_fields=False)
    @classmethod
    def _normalize_focus_work_type(cls, value: Any) -> Any:
        normalized = normalize_focus_work_type(value)
        if normalized in {FLASH_CARD_KIND, CHOICE_KIND, INPUT_KIND, "task_focus"}:
            return normalized
        return value


class _NormalizedAppTaskTypeBase(BaseModel):
    @field_validator("app_task_type", "active_task_app_task_type", mode="before", check_fields=False)
    @classmethod
    def _normalize_app_task_type(cls, value: Any) -> Any:
        normalized = normalize_focus_work_type(value)
        if normalized in {FLASH_CARD_KIND, CHOICE_KIND, INPUT_KIND}:
            return normalized
        return value


class CompletionStateOut(BaseModel):
    completion_state: Literal["permanent", "available", "period_complete", "blocked"]
    is_completable_now: bool
    completed_count_in_period: int
    remaining_completions_in_period: int
    current_period_start: datetime | None
    current_period_end: datetime | None
    blocked_reason: Literal["period_limit_reached", "not_workday", "already_completed_once"] | None
    hidden_from_action_list: bool


class TaskCreateRequest(_NormalizedAppTaskTypeBase):
    title: str = Field(min_length=1, max_length=255)
    content: str | None = None
    status: TaskStatus = "todo"
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
    start_date: datetime | None = None
    due_date: datetime | None = None
    source_type: TaskSourceType = "user"
    app_id: AppTaskId | None = None
    app_task_type: AppTaskType | None = None
    app_config_id: UUID | None = None
    app_instance_key: str | None = Field(default=None, max_length=160)
    managed_by_app: bool = False


class TaskUpdateRequest(_NormalizedAppTaskTypeBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = None
    status: TaskStatus | None = None
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
    manually_scheduled_for_today: bool | None = None
    task_type: TaskType | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    source_type: TaskSourceType | None = None
    app_id: AppTaskId | None = None
    app_task_type: AppTaskType | None = None
    app_config_id: UUID | None = None
    app_instance_key: str | None = Field(default=None, max_length=160)
    managed_by_app: bool | None = None


class TaskOut(_NormalizedAppTaskTypeBase):
    id: UUID
    user_id: int
    title: str
    content: str | None
    status: TaskStatus
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
    actual_duration: int
    start_date: datetime | None
    due_date: datetime | None
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    completion_state: CompletionStateOut | None = None
    source_type: TaskSourceType = "user"
    app_id: AppTaskId | None = None
    app_task_type: AppTaskType | None = None
    app_config_id: UUID | None = None
    app_instance_key: str | None = None
    managed_by_app: bool = False


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
    start_date: date
    due_at: datetime
    is_primary: bool = False


class EventUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    start_date: date | None = None
    due_at: datetime | None = None
    is_primary: bool | None = None


class EventOut(BaseModel):
    id: UUID
    user_id: int
    name: str
    start_date: date
    due_at: datetime
    is_primary: bool
    created_at: datetime
    updated_at: datetime


class EventDeletePreviewOut(BaseModel):
    tasks_count: int
    appointments_count: int
    workflows_count: int
    app_configs_count: int


class EventPlanTemplateItemIn(BaseModel):
    kind: EventPlanItemKind
    title: str = Field(min_length=1, max_length=255)
    content: str | None = None
    offset_days: int = Field(ge=0)
    sort_order: int = Field(default=0, ge=0)
    details: dict[str, Any] = Field(default_factory=dict)


class EventPlanTemplateCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    schedule_mode: EventPlanScheduleMode
    default_event_name: str | None = None
    default_start_date: date | None = None
    default_due_at: datetime | None = None
    default_is_primary: bool | None = None
    items: list[EventPlanTemplateItemIn] = Field(default_factory=list)
    app_configs: list[dict[str, Any]] = Field(default_factory=list)
    workflows: list[dict[str, Any]] = Field(default_factory=list)


class EventPlanTemplateUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    schedule_mode: EventPlanScheduleMode | None = None
    default_event_name: str | None = None
    default_start_date: date | None = None
    default_due_at: datetime | None = None
    default_is_primary: bool | None = None
    items: list[EventPlanTemplateItemIn] | None = None
    app_configs: list[dict[str, Any]] | None = None
    workflows: list[dict[str, Any]] | None = None


class EventPlanTemplateItemOut(BaseModel):
    id: UUID
    template_id: UUID
    kind: EventPlanItemKind
    title: str
    content: str | None
    offset_days: int
    sort_order: int
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class EventPlanTemplateOut(BaseModel):
    id: UUID
    user_id: int
    name: str
    description: str | None
    schedule_mode: EventPlanScheduleMode
    default_event_name: str | None
    default_start_date: date | None
    default_due_at: datetime | None
    default_is_primary: bool | None
    items: list[EventPlanTemplateItemOut]
    app_configs: list[dict[str, Any]] = Field(default_factory=list)
    workflows: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class EventTemplateStoreItemOut(BaseModel):
    id: UUID
    template_id: UUID
    kind: EventPlanItemKind
    title: str
    content: str | None
    offset_days: int
    sort_order: int
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class EventTemplateStoreOut(BaseModel):
    id: UUID
    slug: str
    category: str
    name: str
    description: str | None
    schedule_mode: EventPlanScheduleMode
    default_event_name: str | None
    default_start_date: date | None
    default_due_at: datetime | None
    default_is_primary: bool | None
    items: list[EventTemplateStoreItemOut]
    app_configs: list[dict[str, Any]] = Field(default_factory=list)
    workflows: list[dict[str, Any]] = Field(default_factory=list)
    sort_order: int
    created_at: datetime
    updated_at: datetime


class EventPlanTemplateApplyRequest(BaseModel):
    template_id: UUID


class EventWorkbenchOut(BaseModel):
    event: EventOut
    created_tasks: list[TaskOut]
    created_appointments: list[AppointmentOut]


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


class AppTaskInitRequest(BaseModel):
    default_focus_duration: int = Field(default=1500, ge=60, le=24 * 60 * 60)
    add_to_today_plan: bool = True
    event_id: UUID | None = None


class VocabAppTaskInitRequest(AppTaskInitRequest):
    deck_id: str
    daily_target_count: int = Field(default=20, ge=1, le=500)


class ERCAppTaskInitRequest(AppTaskInitRequest):
    review_scope: Literal["due", "mistakes", "all"] = "due"
    daily_question_target: int = Field(default=10, ge=1, le=200)
    set_id: str | None = None


class ERCPracticeAppTaskInitRequest(AppTaskInitRequest):
    daily_article_target: int = Field(default=1, ge=1, le=50)
    set_id: str | None = None


class ERCModuleStatusOut(BaseModel):
    enabled: bool
    state: AppTaskRuntimeState
    task_id: UUID | None = None
    config_id: UUID | None = None
    completion_state: CompletionStateOut | None = None
    blocked_reason: str | None = None
    config: dict[str, object] = Field(default_factory=dict)
    confirmation_needed: bool = False


class ERCConfigStatusOut(BaseModel):
    event_id: UUID | None = None
    event_name: str | None = None
    practice: ERCModuleStatusOut
    review: ERCModuleStatusOut


class ERCPracticeModuleConfig(BaseModel):
    daily_article_target: int = Field(default=1, ge=1, le=50)
    default_focus_duration: int = Field(default=1500, ge=60, le=24 * 60 * 60)
    add_to_today_plan: bool = True
    set_id: str | None = None


class ERCReviewModuleConfig(BaseModel):
    review_scope: Literal["due", "mistakes", "all"] = "due"
    daily_question_target: int = Field(default=10, ge=1, le=200)
    default_focus_duration: int = Field(default=1500, ge=60, le=24 * 60 * 60)
    add_to_today_plan: bool = True


class ERCConfigSaveRequest(BaseModel):
    event_id: UUID | None = None
    practice_enabled: bool = True
    review_enabled: bool = True
    practice: ERCPracticeModuleConfig = Field(default_factory=ERCPracticeModuleConfig)
    review: ERCReviewModuleConfig = Field(default_factory=ERCReviewModuleConfig)


class AppTaskStatusOut(BaseModel):
    state: AppTaskRuntimeState
    task_id: UUID | None = None
    config_id: UUID | None = None
    event_id: UUID | None = None
    event_name: str | None = None
    completion_state: CompletionStateOut | None = None
    blocked_reason: str | None = None
    config: dict[str, object] = Field(default_factory=dict)


class FocusWorkflowPhase(_NormalizedFocusWorkTypeBase):
    model_config = ConfigDict(extra="allow")

    phase_type: Literal["focus", "break", "deliberate_group"]
    duration: int = Field(ge=60, le=24 * 60 * 60)
    timer_mode: FocusTimerMode | None = None
    task_id: UUID | None = None
    focus_work_type: FocusWorkType | None = None
    is_temporary: bool = False
    record_focus: bool = True
    config_ids: list[str] | None = None
    config_names: list[str] | None = None


class FocusWorkRunSummaryOut(_NormalizedFocusWorkTypeBase, _NormalizedAppTaskTypeBase):
    id: UUID
    workflow_id: UUID
    phase_index: int
    task_id: UUID | None = None
    focus_work_type: FocusWorkType
    app_id: AppTaskId | None = None
    app_task_type: AppTaskType | None = None
    counts_for_task_completion: bool
    status: FocusWorkRunStatus
    progress_snapshot: dict[str, Any] | None = None
    config_snapshot: dict[str, Any] | None = None
    completion_reason: str | None = None
    source_run_id: UUID | None = None


class WorkflowSettlementPhaseOut(_NormalizedFocusWorkTypeBase):
    name: str
    focus_work_type: FocusWorkType
    answered_count: int = 0
    correct_count: int = 0
    accuracy: float | None = None
    duration_seconds: int = 0


class WorkflowSettlementNodeOut(_NormalizedFocusWorkTypeBase):
    name: str
    focus_work_type: FocusWorkType | None = None
    answered_count: int = 0
    correct_count: int = 0
    accuracy: float | None = None
    duration_seconds: int = 0
    status: str = "completed"
    is_return_node: bool = False
    return_to_name: str | None = None
    children: list[WorkflowSettlementNodeOut] = Field(default_factory=list)


class WorkflowSettlementOut(BaseModel):
    workflow_name: str
    result: str = "完成"
    phases: list[WorkflowSettlementPhaseOut]
    nodes: list[WorkflowSettlementNodeOut] = Field(default_factory=list)
    total_phases: int
    total_answered: int
    total_correct: int
    total_accuracy: float | None = None
    total_duration_seconds: int
    fork_count: int = 0
    retry_count: int = 0
    best_accuracy: float | None = None
    first_try_passed_count: int = 0


class FocusWorkflowOut(_NormalizedFocusWorkTypeBase, _NormalizedAppTaskTypeBase):
    state: Literal["normal", "focus", "break", "settlement"]
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
    next_focus_work_type: FocusWorkType | None = None
    has_minimized_work: bool = False
    is_paused: bool = False
    record_focus: bool = True
    active_task_source_type: TaskSourceType | None = None
    active_task_app_id: AppTaskId | None = None
    active_task_app_task_type: AppTaskType | None = None
    active_task_app_config_id: UUID | None = None
    is_task_completed_today: bool = False
    task_blocked_reason: str | None = None
    phase_runtime_state: FocusPhaseRuntimeState | None = None
    phase_runtime_state_before_timeout_prompt: FocusPhaseRuntimeState | None = None
    active_run_id: UUID | None = None
    active_run: FocusWorkRunSummaryOut | None = None
    workflow_settlement: WorkflowSettlementOut | None = None


class FocusWorkflowPresetCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    icon: str | None = Field(default=None, max_length=50)
    phases: list[FocusWorkflowPhase] | None = None
    focus_duration: int = Field(default=1500, ge=60, le=24 * 60 * 60)
    break_duration: int = Field(default=300, ge=60, le=24 * 60 * 60)
    default_focus_timer_mode: FocusTimerMode = "countdown"
    is_default: bool = False


class FocusWorkflowPresetUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    icon: str | None = Field(default=None, max_length=50)
    phases: list[FocusWorkflowPhase] | None = None
    focus_duration: int | None = Field(default=None, ge=60, le=24 * 60 * 60)
    break_duration: int | None = Field(default=None, ge=60, le=24 * 60 * 60)
    default_focus_timer_mode: FocusTimerMode | None = None
    is_default: bool | None = None


class FocusWorkflowPresetOut(BaseModel):
    id: UUID
    user_id: int
    event_id: UUID | None = None
    event_name: str | None = None
    name: str
    icon: str | None = None
    focus_duration: int
    break_duration: int
    default_focus_timer_mode: FocusTimerMode = "countdown"
    phases: list[FocusWorkflowPhase]
    is_default: bool
    created_at: datetime
    updated_at: datetime


class FocusWorkflowSelectTaskRequest(BaseModel):
    task_id: UUID


class FocusWorkflowStartAppWorkRequest(_NormalizedFocusWorkTypeBase):
    focus_work_type: FocusWorkType
    record_focus: bool = True
    bank_id: str | None = None


class FocusWorkflowResultRequest(_NormalizedFocusWorkTypeBase):
    focus_work_type: FocusWorkType
    result: FocusWorkResult
    progress_snapshot: dict[str, object] = Field(default_factory=dict)


class FocusWorkRunCreateRequest(BaseModel):
    mode: FocusWorkRunMode


class FocusWorkRunContentCompleteRequest(BaseModel):
    progress_snapshot: dict[str, Any] = Field(default_factory=dict)


class FocusWorkflowExtendPhaseRequest(BaseModel):
    extend_seconds: int = Field(default=300, ge=60, le=24 * 60 * 60)


class FocusWorkForkRequest(_NormalizedFocusWorkTypeBase):
    parent_run_id: UUID
    child_config_id: UUID | None = None
    focus_work_type: FocusWorkType
    bank_id: str | None = None
    scope: dict[str, Any] = Field(default_factory=dict)
    completion: dict[str, Any] = Field(default_factory=dict)
    pass_criteria: dict[str, Any] = Field(default_factory=dict)


class WorkflowRecordNodeOut(BaseModel):
    id: str
    run_id: UUID | None = None
    config_id: str | None = None
    name: str
    focus_work_type: FocusWorkType | None = None
    status: str
    accuracy: float | None = None
    children: list[WorkflowRecordNodeOut] = Field(default_factory=list)
    created_at: datetime | None = None


class WorkflowRecordOut(BaseModel):
    id: UUID
    workflow_id: UUID
    workflow_name: str | None = None
    nodes: list[WorkflowRecordNodeOut] = Field(default_factory=list)
    status: WorkflowRecordStatus
    started_at: datetime
    completed_at: datetime | None = None
    created_at: datetime


class DeliberateWorkflowMultiStartRequest(BaseModel):
    config_ids: list[str] = Field(min_length=1)
