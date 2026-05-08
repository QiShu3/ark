from __future__ import annotations

import sys

from routes.todo import routes as _routes
from routes.todo.db import init_todo
from routes.todo.schemas import (
    AchievementItemOut,
    AchievementSectionOut,
    AchievementSectionStatsOut,
    AchievementStatus,
    AchievementSummaryOut,
    AppointmentCreateRequest,
    AppointmentListView,
    AppointmentOccurrenceConfirmRequest,
    AppointmentOccurrenceOut,
    AppointmentOut,
    AppointmentStatus,
    AppointmentStoredStatus,
    AppointmentUpdateRequest,
    CompletionPeriodType,
    CompletionStateOut,
    EventCreateRequest,
    EventOut,
    EventUpdateRequest,
    FocusLogCreateRequest,
    FocusLogOut,
    FocusStatsOut,
    FocusTimerMode,
    FocusTodayOut,
    FocusWorkflowCreateRequest,
    FocusWorkflowOut,
    FocusWorkflowPhase,
    FocusWorkflowPresetCreateRequest,
    FocusWorkflowPresetOut,
    FocusWorkflowPresetUpdateRequest,
    FocusWorkflowSelectTaskRequest,
    PhaseType,
    TaskCreateRequest,
    TaskCyclePeriod,
    TaskFocusStats,
    TaskOut,
    TaskStatus,
    TaskType,
    TaskUpdateRequest,
)

_routes.init_todo = init_todo
_routes.AchievementItemOut = AchievementItemOut
_routes.AchievementSectionOut = AchievementSectionOut
_routes.AchievementSectionStatsOut = AchievementSectionStatsOut
_routes.AchievementStatus = AchievementStatus
_routes.AchievementSummaryOut = AchievementSummaryOut
_routes.AppointmentCreateRequest = AppointmentCreateRequest
_routes.AppointmentListView = AppointmentListView
_routes.AppointmentOccurrenceConfirmRequest = AppointmentOccurrenceConfirmRequest
_routes.AppointmentOccurrenceOut = AppointmentOccurrenceOut
_routes.AppointmentOut = AppointmentOut
_routes.AppointmentStatus = AppointmentStatus
_routes.AppointmentStoredStatus = AppointmentStoredStatus
_routes.AppointmentUpdateRequest = AppointmentUpdateRequest
_routes.CompletionPeriodType = CompletionPeriodType
_routes.CompletionStateOut = CompletionStateOut
_routes.EventCreateRequest = EventCreateRequest
_routes.EventOut = EventOut
_routes.EventUpdateRequest = EventUpdateRequest
_routes.FocusLogCreateRequest = FocusLogCreateRequest
_routes.FocusLogOut = FocusLogOut
_routes.FocusStatsOut = FocusStatsOut
_routes.FocusTimerMode = FocusTimerMode
_routes.FocusTodayOut = FocusTodayOut
_routes.FocusWorkflowCreateRequest = FocusWorkflowCreateRequest
_routes.FocusWorkflowOut = FocusWorkflowOut
_routes.FocusWorkflowPhase = FocusWorkflowPhase
_routes.FocusWorkflowPresetCreateRequest = FocusWorkflowPresetCreateRequest
_routes.FocusWorkflowPresetOut = FocusWorkflowPresetOut
_routes.FocusWorkflowPresetUpdateRequest = FocusWorkflowPresetUpdateRequest
_routes.FocusWorkflowSelectTaskRequest = FocusWorkflowSelectTaskRequest
_routes.PhaseType = PhaseType
_routes.TaskCreateRequest = TaskCreateRequest
_routes.TaskCyclePeriod = TaskCyclePeriod
_routes.TaskFocusStats = TaskFocusStats
_routes.TaskOut = TaskOut
_routes.TaskStatus = TaskStatus
_routes.TaskType = TaskType
_routes.TaskUpdateRequest = TaskUpdateRequest

sys.modules[__name__] = _routes
