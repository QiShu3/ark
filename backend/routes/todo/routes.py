from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from routes.auth_routes import get_current_user

from .db import _pool_from_request
from .event_store import (
    create_event_row,
    delete_event_row,
    get_event_delete_preview_row,
    get_primary_event_row,
    list_event_rows,
    update_event_row,
)
from .helpers import (
    UTC,
    _achievement_item,
    _advance_focus_workflow_to_next_phase,
    _appointment_occurrence_bounds,
    _appointment_with_completion,
    _bind_first_focus_phase_to_task,
    _build_appointment_occurrence,
    _build_completion_state,
    _build_default_phases,
    _close_open_focus_app_work_log,
    _close_open_focus_log,
    _completion_records_for_user,
    _create_or_update_managed_app_task,
    _create_workflow_with_focus_phase,
    _delivery_eve_completed,
    _event_completion_records,
    _event_confirmed_appointment_occurrence_count,
    _event_focus_seconds,
    _focus_activity_dates,
    _focus_work_type_for_task_row,
    _get_active_app_task_config,
    _get_bindable_task,
    _get_default_focus_workflow_preset,
    _get_event_for_user,
    _global_focus_seconds,
    _insert_completion_record,
    _max_consecutive_day_count,
    _next_task_window_after_today,
    _normalize_completion_settings,
    _normalize_focus_end_at,
    _normalize_timer_mode,
    _normalize_workflow_phases,
    _phase_focus_work_type_value,
    _phase_task_id_value,
    _raise_if_completion_blocked,
    _resolve_appointment_ends_at,
    _resolve_appointment_occurrences,
    _resolve_task_due_date,
    _row_to_event,
    _row_to_focus_log,
    _row_to_focus_workflow,
    _row_to_focus_workflow_preset,
    _safe_int,
    _section_from_items,
    _set_workflow_current_phase,
    _start_focus_app_work_log,
    _start_focus_log_for_task,
    _stop_active_focus,
    _sync_active_focus_workflow,
    _task_with_completion,
    _to_jsonb_param,
    _validate_appointment_times,
    _validate_linked_task,
    _validate_phase_task_bindings,
)
from .schemas import (
    AchievementSectionOut,
    AchievementSummaryOut,
    AppointmentCreateRequest,
    AppointmentListView,
    AppointmentOccurrenceConfirmRequest,
    AppointmentOccurrenceOut,
    AppointmentOut,
    AppointmentUpdateRequest,
    AppTaskStatusOut,
    ERCAppTaskInitRequest,
    ERCConfigSaveRequest,
    ERCConfigStatusOut,
    ERCModuleStatusOut,
    ERCPracticeAppTaskInitRequest,
    EventCreateRequest,
    EventDeletePreviewOut,
    EventOut,
    EventPlanTemplateCreateRequest,
    EventPlanTemplateItemOut,
    EventPlanTemplateOut,
    EventPlanTemplateUpdateRequest,
    EventTemplateStoreItemOut,
    EventTemplateStoreOut,
    EventUpdateRequest,
    EventWorkbenchOut,
    FocusLogCreateRequest,
    FocusLogOut,
    FocusStatsOut,
    FocusTodayOut,
    FocusWorkflowCreateRequest,
    FocusWorkflowOut,
    FocusWorkflowPresetCreateRequest,
    FocusWorkflowPresetOut,
    FocusWorkflowPresetUpdateRequest,
    FocusWorkflowResultRequest,
    FocusWorkflowSelectTaskRequest,
    FocusWorkflowStartAppWorkRequest,
    TaskCreateRequest,
    TaskFocusStats,
    TaskOut,
    TaskStatus,
    TaskUpdateRequest,
    VocabAppTaskInitRequest,
)

router = APIRouter(prefix="/todo", tags=["todo"])


def _config_payload(config: Any) -> dict[str, object]:
    if isinstance(config, dict):
        return dict(config)
    if isinstance(config, str):
        import json

        decoded = json.loads(config)
        return dict(decoded) if isinstance(decoded, dict) else {}
    return {}


def _row_value(row: Any, key: str, default: Any = None) -> Any:
    if hasattr(row, "get"):
        return row.get(key, default)
    try:
        return row[key]
    except KeyError:
        return default


def _row_to_event_plan_template_item(row: Any) -> EventPlanTemplateItemOut:
    return EventPlanTemplateItemOut(
        id=row["id"],
        template_id=row["template_id"],
        kind=row["kind"],
        title=str(row["title"]),
        content=row["content"],
        offset_days=int(row["offset_days"]),
        sort_order=int(row["sort_order"]),
        details=_payload_dict(_row_value(row, "details", {})),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_event_plan_template(row: Any, items: list[Any]) -> EventPlanTemplateOut:
    return EventPlanTemplateOut(
        id=row["id"],
        user_id=int(row["user_id"]),
        name=str(row["name"]),
        description=row["description"],
        schedule_mode=row["schedule_mode"],
        default_event_name=_row_value(row, "default_event_name"),
        default_start_date=_row_value(row, "default_start_date"),
        default_due_at=_row_value(row, "default_due_at"),
        default_is_primary=_row_value(row, "default_is_primary"),
        items=[_row_to_event_plan_template_item(item) for item in items],
        app_configs=_payload_list(_row_value(row, "app_configs", [])),
        workflows=_payload_list(_row_value(row, "workflows", [])),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _event_plan_template_out(conn: Any, row: Any) -> EventPlanTemplateOut:
    items = await conn.fetch(
        """
        SELECT id, template_id, kind, title, content, offset_days, sort_order, details, created_at, updated_at
        FROM event_plan_template_items
        WHERE template_id = $1
        ORDER BY sort_order ASC, created_at ASC
        """,
        row["id"],
    )
    return _row_to_event_plan_template(row, items)


def _row_to_event_template_store_item(row: Any) -> EventTemplateStoreItemOut:
    return EventTemplateStoreItemOut(
        id=row["id"],
        template_id=row["template_id"],
        kind=row["kind"],
        title=str(row["title"]),
        content=row["content"],
        offset_days=int(row["offset_days"]),
        sort_order=int(row["sort_order"]),
        details=_payload_dict(_row_value(row, "details", {})),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_event_template_store(row: Any, items: list[Any]) -> EventTemplateStoreOut:
    return EventTemplateStoreOut(
        id=row["id"],
        slug=str(row["slug"]),
        category=str(row["category"]),
        name=str(row["name"]),
        description=row["description"],
        schedule_mode=row["schedule_mode"],
        default_event_name=_row_value(row, "default_event_name"),
        default_start_date=_row_value(row, "default_start_date"),
        default_due_at=_row_value(row, "default_due_at"),
        default_is_primary=_row_value(row, "default_is_primary"),
        items=[_row_to_event_template_store_item(item) for item in items],
        app_configs=_payload_list(_row_value(row, "app_configs", [])),
        workflows=_payload_list(_row_value(row, "workflows", [])),
        sort_order=int(_row_value(row, "sort_order", 0) or 0),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _event_template_store_out(conn: Any, row: Any) -> EventTemplateStoreOut:
    items = await conn.fetch(
        """
        SELECT id, template_id, kind, title, content, offset_days, sort_order, details, created_at, updated_at
        FROM event_template_store_items
        WHERE template_id = $1
        ORDER BY sort_order ASC, created_at ASC
        """,
        row["id"],
    )
    return _row_to_event_template_store(row, items)


async def _replace_event_plan_template_items(
    conn: Any,
    *,
    template_id: UUID,
    items: list[Any],
) -> None:
    await conn.execute("DELETE FROM event_plan_template_items WHERE template_id = $1", template_id)
    for index, item in enumerate(items):
        get_value = item.get if isinstance(item, dict) else lambda key, default=None: getattr(item, key, default)
        await conn.fetchrow(
            """
            INSERT INTO event_plan_template_items(template_id, kind, title, content, offset_days, sort_order, details)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            RETURNING id, template_id, kind, title, content, offset_days, sort_order, details, created_at, updated_at
            """,
            template_id,
            get_value("kind"),
            get_value("title"),
            get_value("content"),
            get_value("offset_days"),
            get_value("sort_order", index) if get_value("sort_order", index) is not None else index,
            _to_jsonb_param(get_value("details", {}) or {}),
        )


def _payload_dict(value: Any) -> dict[str, object]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        decoded = json.loads(value)
        return dict(decoded) if isinstance(decoded, dict) else {}
    return {}


def _payload_list(value: Any) -> list[dict[str, object]]:
    if value is None:
        return []
    if isinstance(value, str):
        decoded = json.loads(value)
        if not isinstance(decoded, list):
            return []
        value = decoded
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, dict)]


async def _event_workbench_out(conn: Any, *, user_id: int, event_row: Any) -> EventWorkbenchOut:
    task_rows = await conn.fetch(
        """
        SELECT id, user_id, title, content, status,
               current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
               event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
               weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
               actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
               source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
        FROM tasks
        WHERE user_id = $1 AND event_id = $2 AND is_deleted = FALSE
        ORDER BY due_date ASC NULLS LAST, created_at ASC
        """,
        user_id,
        event_row["id"],
    )
    appointment_rows = await conn.fetch(
        """
        SELECT id, user_id, title, content, status, starts_at, ends_at, repeat_rule, linked_task_id,
               event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
               weekday_only, time_inherits_from_event, time_overridden,
               is_deleted, created_at, updated_at
        FROM appointments
        WHERE user_id = $1 AND event_id = $2 AND is_deleted = FALSE
        ORDER BY ends_at ASC, created_at ASC
        """,
        user_id,
        event_row["id"],
    )
    return EventWorkbenchOut(
        event=_row_to_event(event_row),
        created_tasks=[await _task_with_completion(conn, row) for row in task_rows],
        created_appointments=[await _appointment_with_completion(conn, row) for row in appointment_rows],
    )


def _focus_workflow_task_kwargs(task_row: Any | None) -> dict[str, Any]:
    if task_row is None:
        return {}
    return {
        "task_title": str(task_row["title"]),
        "task_source_type": task_row.get("source_type") if hasattr(task_row, "get") else task_row["source_type"],
        "task_app_id": task_row.get("app_id") if hasattr(task_row, "get") else task_row["app_id"],
        "task_app_task_type": task_row.get("app_task_type") if hasattr(task_row, "get") else task_row["app_task_type"],
        "task_app_config_id": task_row.get("app_config_id") if hasattr(task_row, "get") else task_row["app_config_id"],
    }


async def _app_task_status_for_event(
    conn: Any,
    *,
    user_id: int,
    app_id: str,
    app_task_type: str,
    event_row: Any,
) -> AppTaskStatusOut:
    config = await _get_active_app_task_config(
        conn,
        user_id=user_id,
        app_id=app_id,
        app_task_type=app_task_type,
        event_id=event_row["id"],
    )
    if config is None:
        return AppTaskStatusOut(
            state="event_not_configured",
            event_id=event_row["id"],
            event_name=str(event_row["name"]),
            blocked_reason="当前事件未配置该应用",
        )

    config_dict = _config_payload(config["config"])
    if config["created_task_id"] is None:
        return AppTaskStatusOut(
            state="uninitialized",
            config_id=config["id"],
            event_id=event_row["id"],
            event_name=str(event_row["name"]),
            config=config_dict,
        )

    task_row = await conn.fetchrow(
        """
        -- app task status task lookup
        SELECT id, user_id, title, content, status,
               current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
               event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
               weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
               actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
               source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
        FROM tasks
        WHERE id = $1
          AND user_id = $2
          AND event_id = $6
          AND source_type = 'app'
          AND managed_by_app = TRUE
          AND app_id = $3
          AND app_task_type = $4
          AND app_config_id = $5
          AND is_deleted = FALSE
        """,
        config["created_task_id"],
        user_id,
        app_id,
        app_task_type,
        config["id"],
        event_row["id"],
    )
    if task_row is None:
        return AppTaskStatusOut(
            state="config_invalid",
            config_id=config["id"],
            event_id=event_row["id"],
            event_name=str(event_row["name"]),
            blocked_reason="应用托管任务不存在",
            config=config_dict,
        )

    task = await _task_with_completion(conn, task_row)
    completion_state = task.completion_state
    if completion_state is not None and completion_state.completion_state == "period_complete":
        state = "completed_today"
    elif completion_state is not None and completion_state.is_completable_now:
        state = "ready"
    else:
        state = "blocked"

    return AppTaskStatusOut(
        state=state,
        task_id=task.id,
        config_id=config["id"],
        event_id=event_row["id"],
        event_name=str(event_row["name"]),
        completion_state=completion_state,
        blocked_reason=completion_state.blocked_reason if completion_state is not None else None,
        config=config_dict,
    )


async def _app_task_status(conn: Any, *, user_id: int, app_id: str, app_task_type: str) -> AppTaskStatusOut:
    event_row = await get_primary_event_row(conn, user_id=user_id)
    if event_row is None:
        return AppTaskStatusOut(state="no_primary_event", blocked_reason="没有主事件，无法读取事件应用配置")
    return await _app_task_status_for_event(
        conn,
        user_id=user_id,
        app_id=app_id,
        app_task_type=app_task_type,
        event_row=event_row,
    )


async def _resolve_vocab_app_deck_id(conn: Any, raw_deck_id: str) -> str:
    deck_id = raw_deck_id.strip()
    if not deck_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="词书不存在")

    try:
        deck_uuid = UUID(deck_id)
    except ValueError:
        deck_uuid = None

    if deck_uuid is not None:
        deck_row = await conn.fetchrow("SELECT id FROM vocab_decks WHERE id = $1", deck_uuid)
        if deck_row is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="词书不存在")
        return str(deck_uuid)

    deck_row = await conn.fetchrow(
        """
        SELECT regexp_replace(key, '_[0-9]+$', '') AS deck_id
        FROM vocab_decks
        WHERE key = $1 OR regexp_replace(key, '_[0-9]+$', '') = $1
        LIMIT 1
        """,
        deck_id,
    )
    if deck_row is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="词书不存在")
    return str(deck_row["deck_id"])


async def _resolve_app_config_event(conn: Any, *, user_id: int, event_id: UUID | None) -> Any | None:
    if event_id is not None:
        event_row = await _get_event_for_user(conn, user_id=user_id, event_id=event_id)
        if event_row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="关联事件不存在")
        return event_row
    return await get_primary_event_row(conn, user_id=user_id)


@router.get("/app-tasks/vocab/status", response_model=AppTaskStatusOut)
async def get_vocab_app_task_status(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> AppTaskStatusOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        return await _app_task_status(conn, user_id=int(user.id), app_id="vocab", app_task_type="vocab_today")


@router.post("/app-tasks/vocab/init", response_model=AppTaskStatusOut)
async def init_vocab_app_task(
    request: Request,
    body: VocabAppTaskInitRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AppTaskStatusOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            deck_id = await _resolve_vocab_app_deck_id(conn, body.deck_id)
            event_row = await _resolve_app_config_event(conn, user_id=int(user.id), event_id=body.event_id)
            if event_row is None:
                return AppTaskStatusOut(state="no_primary_event", blocked_reason="没有主事件，无法保存事件应用配置")

            config = {
                "deck_id": deck_id,
                "daily_target_count": body.daily_target_count,
                "default_focus_duration": body.default_focus_duration,
                "add_to_today_plan": body.add_to_today_plan,
                "event_id": str(event_row["id"]),
            }
            await _create_or_update_managed_app_task(
                conn,
                user_id=int(user.id),
                app_id="vocab",
                app_task_type="vocab_today",
                config=config,
                add_to_today_plan=body.add_to_today_plan,
                event_id=event_row["id"],
            )
            return await _app_task_status_for_event(
                conn,
                user_id=int(user.id),
                app_id="vocab",
                app_task_type="vocab_today",
                event_row=event_row,
            )


@router.get("/app-tasks/erc/status", response_model=AppTaskStatusOut)
async def get_erc_app_task_status(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> AppTaskStatusOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        return await _app_task_status(conn, user_id=int(user.id), app_id="erc", app_task_type="erc_review")


@router.post("/app-tasks/erc/init", response_model=AppTaskStatusOut)
async def init_erc_app_task(
    request: Request,
    body: ERCAppTaskInitRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AppTaskStatusOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            event_row = await _resolve_app_config_event(conn, user_id=int(user.id), event_id=body.event_id)
            if event_row is None:
                return AppTaskStatusOut(state="no_primary_event", blocked_reason="没有主事件，无法保存事件应用配置")
            config = {
                "review_scope": body.review_scope,
                "daily_question_target": body.daily_question_target,
                "default_focus_duration": body.default_focus_duration,
                "add_to_today_plan": body.add_to_today_plan,
                "event_id": str(event_row["id"]),
            }
            await _create_or_update_managed_app_task(
                conn,
                user_id=int(user.id),
                app_id="erc",
                app_task_type="erc_review",
                config=config,
                add_to_today_plan=body.add_to_today_plan,
                event_id=event_row["id"],
            )
            return await _app_task_status_for_event(
                conn,
                user_id=int(user.id),
                app_id="erc",
                app_task_type="erc_review",
                event_row=event_row,
            )


@router.get("/app-tasks/erc-practice/status", response_model=AppTaskStatusOut)
async def get_erc_practice_app_task_status(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> AppTaskStatusOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        return await _app_task_status(conn, user_id=int(user.id), app_id="erc", app_task_type="erc_practice")


@router.post("/app-tasks/erc-practice/init", response_model=AppTaskStatusOut)
async def init_erc_practice_app_task(
    request: Request,
    body: ERCPracticeAppTaskInitRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AppTaskStatusOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            event_row = await _resolve_app_config_event(conn, user_id=int(user.id), event_id=body.event_id)
            if event_row is None:
                return AppTaskStatusOut(state="no_primary_event", blocked_reason="没有主事件，无法保存事件应用配置")
            config = {
                "daily_article_target": body.daily_article_target,
                "default_focus_duration": body.default_focus_duration,
                "add_to_today_plan": body.add_to_today_plan,
                "event_id": str(event_row["id"]),
            }
            await _create_or_update_managed_app_task(
                conn,
                user_id=int(user.id),
                app_id="erc",
                app_task_type="erc_practice",
                config=config,
                add_to_today_plan=body.add_to_today_plan,
                event_id=event_row["id"],
            )
            return await _app_task_status_for_event(
                conn,
                user_id=int(user.id),
                app_id="erc",
                app_task_type="erc_practice",
                event_row=event_row,
            )


async def _erc_module_status(
    conn: Any,
    *,
    user_id: int,
    app_task_type: str,
    event_id: UUID,
    event_name: str,
) -> ERCModuleStatusOut:
    config = await _get_active_app_task_config(
        conn,
        user_id=user_id,
        app_id="erc",
        app_task_type=app_task_type,
        event_id=event_id,
        include_disabled=True,
    )
    if config is None or config["status"] == "disabled":
        return ERCModuleStatusOut(
            enabled=False,
            state="event_not_configured",
            config={},
        )

    config_dict = _config_payload(config["config"])
    if config["created_task_id"] is None:
        return ERCModuleStatusOut(
            enabled=True,
            state="uninitialized",
            config_id=config["id"],
            config=config_dict,
        )

    task_row = await conn.fetchrow(
        """
        -- app task status task lookup
        SELECT id, user_id, title, content, status,
               current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
               event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
               weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
               actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
               source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
        FROM tasks
        WHERE id = $1
          AND user_id = $2
          AND event_id = $6
          AND source_type = 'app'
          AND managed_by_app = TRUE
          AND app_id = $3
          AND app_task_type = $4
          AND app_config_id = $5
          AND is_deleted = FALSE
        """,
        config["created_task_id"],
        user_id,
        "erc",
        app_task_type,
        config["id"],
        event_id,
    )
    if task_row is None:
        return ERCModuleStatusOut(
            enabled=True,
            state="config_invalid",
            config_id=config["id"],
            blocked_reason="应用托管任务不存在",
            config=config_dict,
        )

    task = await _task_with_completion(conn, task_row)
    completion_state = task.completion_state
    if completion_state is not None and completion_state.completion_state == "period_complete":
        state = "completed_today"
    elif completion_state is not None and completion_state.is_completable_now:
        state = "ready"
    else:
        state = "blocked"

    return ERCModuleStatusOut(
        enabled=True,
        state=state,
        task_id=task.id,
        config_id=config["id"],
        completion_state=completion_state,
        blocked_reason=completion_state.blocked_reason if completion_state is not None else None,
        config=config_dict,
    )


@router.get("/app-tasks/erc-config", response_model=ERCConfigStatusOut)
async def get_erc_config_status(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    event_id: UUID | None = Query(default=None),
) -> ERCConfigStatusOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        event_row = await _resolve_app_config_event(conn, user_id=int(user.id), event_id=event_id)
        if event_row is None:
            return ERCConfigStatusOut(
                practice=ERCModuleStatusOut(enabled=False, state="no_primary_event", config={}),
                review=ERCModuleStatusOut(enabled=False, state="no_primary_event", config={}),
            )
        practice = await _erc_module_status(
            conn,
            user_id=int(user.id),
            app_task_type="erc_practice",
            event_id=event_row["id"],
            event_name=str(event_row["name"]),
        )
        review = await _erc_module_status(
            conn,
            user_id=int(user.id),
            app_task_type="erc_review",
            event_id=event_row["id"],
            event_name=str(event_row["name"]),
        )
        return ERCConfigStatusOut(
            event_id=event_row["id"],
            event_name=str(event_row["name"]),
            practice=practice,
            review=review,
        )


async def _save_erc_module(
    conn: Any,
    *,
    user_id: int,
    app_task_type: str,
    config: dict[str, Any],
    enabled: bool,
    add_to_today_plan: bool,
    event_id: UUID,
) -> ERCModuleStatusOut:
    existing_config = await _get_active_app_task_config(
        conn,
        user_id=user_id,
        app_id="erc",
        app_task_type=app_task_type,
        event_id=event_id,
        include_disabled=True,
    )

    if not enabled:
        if existing_config is not None and existing_config["status"] == "active":
            await conn.execute(
                """
                UPDATE app_task_configs
                SET status = 'disabled', updated_at = NOW()
                WHERE id = $1 AND user_id = $2 AND app_id = $3 AND app_task_type = $4
                """,
                existing_config["id"],
                user_id,
                "erc",
                app_task_type,
            )
        return ERCModuleStatusOut(enabled=False, state="event_not_configured", config={})

    confirmation_needed = False
    if existing_config is not None and existing_config["status"] == "disabled" and existing_config["created_task_id"] is not None:
        task_row = await conn.fetchrow(
            "SELECT manually_scheduled_for_today FROM tasks WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE",
            existing_config["created_task_id"],
            user_id,
        )
        if task_row is not None and bool(task_row["manually_scheduled_for_today"]):
            confirmation_needed = True
        await conn.execute(
            """
            UPDATE app_task_configs
            SET status = 'active', updated_at = NOW()
            WHERE id = $1 AND user_id = $2 AND app_id = $3 AND app_task_type = $4
            """,
            existing_config["id"],
            user_id,
            "erc",
            app_task_type,
        )

    await _create_or_update_managed_app_task(
        conn,
        user_id=user_id,
        app_id="erc",
        app_task_type=app_task_type,
        config=config,
        add_to_today_plan=add_to_today_plan,
        event_id=event_id,
    )

    status_out = await _erc_module_status(
        conn,
        user_id=user_id,
        app_task_type=app_task_type,
        event_id=event_id,
        event_name="",
    )
    status_out.confirmation_needed = confirmation_needed
    return status_out


@router.post("/app-tasks/erc-config", response_model=ERCConfigStatusOut)
async def save_erc_config(
    request: Request,
    body: ERCConfigSaveRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> ERCConfigStatusOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            event_row = await _resolve_app_config_event(conn, user_id=int(user.id), event_id=body.event_id)
            if event_row is None:
                return ERCConfigStatusOut(
                    practice=ERCModuleStatusOut(enabled=False, state="no_primary_event", config={}),
                    review=ERCModuleStatusOut(enabled=False, state="no_primary_event", config={}),
                )
            practice_config = {
                "daily_article_target": body.practice.daily_article_target,
                "default_focus_duration": body.practice.default_focus_duration,
                "add_to_today_plan": body.practice.add_to_today_plan,
                "event_id": str(event_row["id"]),
            }
            review_config = {
                "review_scope": body.review.review_scope,
                "daily_question_target": body.review.daily_question_target,
                "default_focus_duration": body.review.default_focus_duration,
                "add_to_today_plan": body.review.add_to_today_plan,
                "event_id": str(event_row["id"]),
            }
            practice = await _save_erc_module(
                conn,
                user_id=int(user.id),
                app_task_type="erc_practice",
                config=practice_config,
                enabled=body.practice_enabled,
                add_to_today_plan=body.practice.add_to_today_plan,
                event_id=event_row["id"],
            )
            review = await _save_erc_module(
                conn,
                user_id=int(user.id),
                app_task_type="erc_review",
                config=review_config,
                enabled=body.review_enabled,
                add_to_today_plan=body.review.add_to_today_plan,
                event_id=event_row["id"],
            )
            return ERCConfigStatusOut(
                event_id=event_row["id"],
                event_name=str(event_row["name"]),
                practice=practice,
                review=review,
            )


@router.post("/tasks", response_model=TaskOut)
async def create_task(
    request: Request,
    body: TaskCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> TaskOut:
    """创建任务。"""
    if (
        body.source_type != "user"
        or body.managed_by_app
        or body.app_id
        or body.app_task_type
        or body.app_config_id
        or body.app_instance_key
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="应用托管任务只能由子应用初始化创建"
        )

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        normalized_is_recurring, normalized_period_type, normalized_custom_period_days, normalized_max = (
            _normalize_completion_settings(
                is_recurring=body.is_recurring,
                period_type=body.period_type,
                custom_period_days=body.custom_period_days,
                max_completions_per_period=body.max_completions_per_period,
            )
        )
        event_row = await _get_event_for_user(conn, user_id=int(user.id), event_id=body.event_id)
        due_date = _resolve_task_due_date(
            event_row=event_row,
            due_date=body.due_date,
            time_inherits_from_event=body.time_inherits_from_event,
            time_overridden=body.time_overridden,
        )
        row = await conn.fetchrow(
            """
            INSERT INTO tasks(
                user_id, title, content, status,
                current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
                start_date, due_date, source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
            RETURNING id, user_id, title, content, status,
                      current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                      event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                      weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
                      actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
                      source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
            """,
            int(user.id),
            body.title,
            body.content,
            body.status,
            body.current_cycle_count,
            body.target_cycle_count,
            body.cycle_period,
            body.cycle_every_days,
            body.event,
            body.event_ids,
            body.event_id,
            normalized_is_recurring,
            normalized_period_type,
            normalized_custom_period_days,
            normalized_max,
            body.weekday_only,
            body.time_inherits_from_event,
            body.time_overridden,
            False,
            body.task_type,
            body.start_date,
            due_date,
            body.source_type,
            body.app_id,
            body.app_task_type,
            body.app_config_id,
            body.app_instance_key,
            body.managed_by_app,
        )
    if row is None:
        raise HTTPException(status_code=500, detail="创建任务失败")
    async with pool.acquire() as conn:
        return await _task_with_completion(conn, row)


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
        SELECT id, user_id, title, content, status,
               current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
               event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
               weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
               actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
               source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
        FROM tasks
        WHERE {where_sql}
        ORDER BY updated_at DESC
        LIMIT ${limit_i} OFFSET ${offset_i}
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
        return [await _task_with_completion(conn, r) for r in rows]


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
            SELECT id, user_id, title, content, status,
                   current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                   event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                   weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
                   actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
                   source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
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
              due_date ASC NULLS LAST,
              updated_at ASC
            LIMIT 500
            """,
            int(user.id),
            range_start,
            range_end,
        )
        return [await _task_with_completion(conn, r) for r in rows]


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
            SELECT id, user_id, title, content, status,
                   current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                   event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                   weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
                   actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
                   source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
            FROM tasks
            WHERE id = $1 AND user_id = $2 AND ($3::BOOLEAN = TRUE OR is_deleted = FALSE)
            """,
            task_id,
            int(user.id),
            include_deleted,
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
        return await _task_with_completion(conn, row)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    request: Request,
    task_id: UUID,
    body: TaskUpdateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> TaskOut:
    """更新任务（部分字段）。"""
    patch = body.model_dump(exclude_unset=True)
    reserved_app_task_fields = {
        "source_type",
        "app_id",
        "app_task_type",
        "app_config_id",
        "app_instance_key",
        "managed_by_app",
    }
    if reserved_app_task_fields & patch.keys():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="应用托管任务只能由子应用初始化创建"
        )
    if not patch:
        return await get_task(request, task_id, user)

    pool = _pool_from_request(request)
    current = await get_task(request, task_id, user)
    if current.managed_by_app:
        app_outer_fields = {
            "event",
            "event_ids",
            "event_id",
            "time_inherits_from_event",
            "time_overridden",
            "start_date",
            "due_date",
            "manually_scheduled_for_today",
        }
        if not set(patch).issubset(app_outer_fields):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="应用托管任务只能修改计划、事件和提醒等外层属性",
            )

    allowed_cols: dict[str, str] = {
        "title": "title",
        "content": "content",
        "status": "status",
        "current_cycle_count": "current_cycle_count",
        "target_cycle_count": "target_cycle_count",
        "cycle_period": "cycle_period",
        "cycle_every_days": "cycle_every_days",
        "event": "event",
        "event_ids": "event_ids",
        "event_id": "event_id",
        "is_recurring": "is_recurring",
        "period_type": "period_type",
        "custom_period_days": "custom_period_days",
        "max_completions_per_period": "max_completions_per_period",
        "weekday_only": "weekday_only",
        "time_inherits_from_event": "time_inherits_from_event",
        "time_overridden": "time_overridden",
        "task_type": "task_type",
        "start_date": "start_date",
        "due_date": "due_date",
        "manually_scheduled_for_today": "manually_scheduled_for_today",
    }

    async with pool.acquire() as conn:
        if not current.managed_by_app:
            normalized_is_recurring, normalized_period_type, normalized_custom_period_days, normalized_max = (
                _normalize_completion_settings(
                    is_recurring=patch.get("is_recurring", current.is_recurring),
                    period_type=patch.get("period_type", current.period_type),
                    custom_period_days=patch.get("custom_period_days", current.custom_period_days),
                    max_completions_per_period=patch.get(
                        "max_completions_per_period", current.max_completions_per_period
                    ),
                )
            )
            patch["is_recurring"] = normalized_is_recurring
            patch["period_type"] = normalized_period_type
            patch["custom_period_days"] = normalized_custom_period_days
            patch["max_completions_per_period"] = normalized_max

        event_row = await _get_event_for_user(
            conn, user_id=int(user.id), event_id=patch.get("event_id", current.event_id)
        )
        patch["due_date"] = _resolve_task_due_date(
            event_row=event_row,
            due_date=patch.get("due_date", current.due_date),
            time_inherits_from_event=patch.get("time_inherits_from_event", current.time_inherits_from_event),
            time_overridden=patch.get("time_overridden", current.time_overridden),
        )

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

        row = await conn.fetchrow(
            f"""
            UPDATE tasks
            SET {", ".join(sets)}, updated_at = NOW()
            WHERE id = ${len(args) + 1} AND user_id = ${len(args) + 2} AND is_deleted = FALSE
            RETURNING id, user_id, title, content, status,
                      current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                      event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                      weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
                      actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
                      source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
            """,
            *args,
            task_id,
            int(user.id),
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
        return await _task_with_completion(conn, row)


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
            SET due_date = $1,
                start_date = CASE WHEN start_date > $1 THEN $1 ELSE start_date END,
                manually_scheduled_for_today = TRUE,
                updated_at = NOW()
            WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE
            RETURNING id, user_id, title, content, status,
                      current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                      event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                      weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
                      actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
                      source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
            """,
            now,
            task_id,
            int(user.id),
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
        return await _task_with_completion(conn, row)


@router.patch("/tasks/{task_id}/move-out-of-today", response_model=TaskOut)
async def move_task_out_of_today(
    request: Request,
    task_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> TaskOut:
    """将今日任务移回安排仓库，不改变任务完成周期。"""
    pool = _pool_from_request(request)
    current = await get_task(request, task_id, user)
    next_start, next_due = _next_task_window_after_today(current)
    time_overridden = bool(
        current.time_overridden or (current.event_id is not None and current.time_inherits_from_event)
    )

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE tasks
            SET start_date = $1, due_date = $2, time_overridden = $3, manually_scheduled_for_today = FALSE, updated_at = NOW()
            WHERE id = $4 AND user_id = $5 AND is_deleted = FALSE
            RETURNING id, user_id, title, content, status,
                      current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                      event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                      weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
                      actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
                      source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
            """,
            next_start,
            next_due,
            time_overridden,
            task_id,
            int(user.id),
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
        return await _task_with_completion(conn, row)


@router.post("/tasks/{task_id}/complete", response_model=TaskOut)
async def complete_task(
    request: Request,
    task_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> TaskOut:
    """完成任务；重复任务仅记录一次完成，不直接改为 done。"""
    pool = _pool_from_request(request)
    completed_at = datetime.now(UTC)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT id, user_id, title, content, status,
                       current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                       event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                       weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
                       actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
                       source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
                FROM tasks
                WHERE id = $1 AND user_id = $2 AND ($3::BOOLEAN = TRUE OR is_deleted = FALSE)
                """,
                task_id,
                int(user.id),
                False,
            )
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
            if bool(row["managed_by_app"]):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="应用托管任务必须由子应用专注工作完成",
                )

            completion_state = await _build_completion_state(
                conn,
                user_id=int(user.id),
                subject_type="task",
                subject_id=task_id,
                is_recurring=bool(row["is_recurring"]),
                period_type=row["period_type"],
                custom_period_days=row["custom_period_days"],
                max_completions_per_period=int(row["max_completions_per_period"]),
                weekday_only=bool(row["weekday_only"]),
                permanent_done=str(row["status"]) == "done",
                now=completed_at,
            )
            _raise_if_completion_blocked(completion_state, noun="任务")
            await _insert_completion_record(
                conn,
                user_id=int(user.id),
                subject_type="task",
                subject_id=task_id,
                completed_at=completed_at,
                counted_period_start=completion_state.current_period_start,
                counted_period_end=completion_state.current_period_end,
            )

            if not bool(row["is_recurring"]) or row["period_type"] == "once":
                row = await conn.fetchrow(
                    """
                    UPDATE tasks
                    SET status = $1, updated_at = NOW()
                    WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE
                    RETURNING id, user_id, title, content, status,
                              current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                              event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                              weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
                              actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
                              source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
                    """,
                    "done",
                    task_id,
                    int(user.id),
                )
                if row is None:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

        return await _task_with_completion(conn, row, now=completed_at)


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
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        normalized_is_recurring, normalized_period_type, normalized_custom_period_days, normalized_max = (
            _normalize_completion_settings(
                is_recurring=body.is_recurring,
                period_type=body.period_type,
                custom_period_days=body.custom_period_days,
                max_completions_per_period=body.max_completions_per_period,
            )
        )
        event_row = await _get_event_for_user(conn, user_id=int(user.id), event_id=body.event_id)
        resolved_ends_at = _resolve_appointment_ends_at(
            event_row=event_row,
            ends_at=body.ends_at,
            time_inherits_from_event=body.time_inherits_from_event,
            time_overridden=body.time_overridden,
        )
        _validate_appointment_times(body.starts_at, resolved_ends_at)
        await _validate_linked_task(
            conn,
            user_id=int(user.id),
            linked_task_id=body.linked_task_id,
        )
        row = await conn.fetchrow(
            """
            INSERT INTO appointments(
                user_id, title, content, status, starts_at, ends_at, repeat_rule, linked_task_id,
                event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                weekday_only, time_inherits_from_event, time_overridden
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id, user_id, title, content, status, starts_at, ends_at, repeat_rule, linked_task_id,
                      event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                      weekday_only, time_inherits_from_event, time_overridden,
                      is_deleted, created_at, updated_at
            """,
            int(user.id),
            body.title,
            body.content,
            body.status,
            body.starts_at,
            resolved_ends_at,
            body.repeat_rule,
            body.linked_task_id,
            body.event_id,
            normalized_is_recurring,
            normalized_period_type,
            normalized_custom_period_days,
            normalized_max,
            body.weekday_only,
            body.time_inherits_from_event,
            body.time_overridden,
        )
    if row is None:
        raise HTTPException(status_code=500, detail="创建日程失败")
    async with pool.acquire() as conn:
        return await _appointment_with_completion(conn, row)


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
                   event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                   weekday_only, time_inherits_from_event, time_overridden,
                   is_deleted, created_at, updated_at
            FROM appointments
            WHERE {" AND ".join(where_clauses)}
            ORDER BY ends_at ASC, created_at ASC
            """,
            *args,
        )
        return [await _appointment_with_completion(conn, row) for row in rows]


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
                   event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                   weekday_only, time_inherits_from_event, time_overridden,
                   is_deleted, created_at, updated_at
            FROM appointments
            WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
            """,
            appointment_id,
            int(user.id),
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")
        return await _appointment_with_completion(conn, row)


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
    next_linked_task_id = patch.get("linked_task_id", current.linked_task_id)

    allowed_cols = {
        "title": "title",
        "content": "content",
        "status": "status",
        "starts_at": "starts_at",
        "ends_at": "ends_at",
        "repeat_rule": "repeat_rule",
        "linked_task_id": "linked_task_id",
        "event_id": "event_id",
        "is_recurring": "is_recurring",
        "period_type": "period_type",
        "custom_period_days": "custom_period_days",
        "max_completions_per_period": "max_completions_per_period",
        "weekday_only": "weekday_only",
        "time_inherits_from_event": "time_inherits_from_event",
        "time_overridden": "time_overridden",
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

    async with pool.acquire() as conn:
        merged_is_recurring, merged_period_type, merged_custom_period_days, merged_max = _normalize_completion_settings(
            is_recurring=patch.get("is_recurring", current.is_recurring),
            period_type=patch.get("period_type", current.period_type),
            custom_period_days=patch.get("custom_period_days", current.custom_period_days),
            max_completions_per_period=patch.get("max_completions_per_period", current.max_completions_per_period),
        )
        patch["is_recurring"] = merged_is_recurring
        patch["period_type"] = merged_period_type
        patch["custom_period_days"] = merged_custom_period_days
        patch["max_completions_per_period"] = merged_max
        event_row = await _get_event_for_user(
            conn, user_id=int(user.id), event_id=patch.get("event_id", current.event_id)
        )
        next_ends_at = _resolve_appointment_ends_at(
            event_row=event_row,
            ends_at=patch.get("ends_at", current.ends_at),
            time_inherits_from_event=patch.get("time_inherits_from_event", current.time_inherits_from_event),
            time_overridden=patch.get("time_overridden", current.time_overridden),
        )
        patch["ends_at"] = next_ends_at
        _validate_appointment_times(next_starts_at, next_ends_at)
        sets = []
        args = []
        for key, value in patch.items():
            col = allowed_cols.get(key)
            if col is None:
                continue
            args.append(value)
            sets.append(f"{col} = ${len(args)}")
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
            WHERE id = ${len(args) + 1} AND user_id = ${len(args) + 2} AND is_deleted = FALSE
            RETURNING id, user_id, title, content, status, starts_at, ends_at, repeat_rule, linked_task_id,
                      event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                      weekday_only, time_inherits_from_event, time_overridden,
                      is_deleted, created_at, updated_at
            """,
            *args,
            appointment_id,
            int(user.id),
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")
        return await _appointment_with_completion(conn, row)


@router.post("/appointments/{appointment_id}/complete", response_model=AppointmentOut)
async def complete_appointment(
    request: Request,
    appointment_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> AppointmentOut:
    """完成日程；重复日程仅记录一次完成，不直接改为 attended。"""
    pool = _pool_from_request(request)
    completed_at = datetime.now(UTC)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT id, user_id, title, content, status, starts_at, ends_at, repeat_rule, linked_task_id,
                       event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                       weekday_only, time_inherits_from_event, time_overridden,
                       is_deleted, created_at, updated_at
                FROM appointments
                WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
                """,
                appointment_id,
                int(user.id),
            )
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")

            completion_state = await _build_completion_state(
                conn,
                user_id=int(user.id),
                subject_type="appointment",
                subject_id=appointment_id,
                is_recurring=bool(row["is_recurring"]),
                period_type=row["period_type"],
                custom_period_days=row["custom_period_days"],
                max_completions_per_period=int(row["max_completions_per_period"]),
                weekday_only=bool(row["weekday_only"]),
                permanent_done=str(row["status"]) in {"attended", "missed", "cancelled"}
                and not bool(row["is_recurring"]),
                now=completed_at,
            )
            _raise_if_completion_blocked(completion_state, noun="日程")
            await _insert_completion_record(
                conn,
                user_id=int(user.id),
                subject_type="appointment",
                subject_id=appointment_id,
                completed_at=completed_at,
                counted_period_start=completion_state.current_period_start,
                counted_period_end=completion_state.current_period_end,
            )

            if not bool(row["is_recurring"]) or row["period_type"] == "once":
                row = await conn.fetchrow(
                    """
                    UPDATE appointments
                    SET status = $1, updated_at = NOW()
                    WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE
                    RETURNING id, user_id, title, content, status, starts_at, ends_at, repeat_rule, linked_task_id,
                              event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                              weekday_only, time_inherits_from_event, time_overridden,
                              is_deleted, created_at, updated_at
                    """,
                    "attended",
                    appointment_id,
                    int(user.id),
                )
                if row is None:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")

        return await _appointment_with_completion(conn, row, now=completed_at)


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


@router.get("/achievements/summary", response_model=AchievementSummaryOut)
async def get_achievement_summary(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    event_id: UUID | None = Query(default=None),
) -> AchievementSummaryOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        event_row = await _get_event_for_user(conn, user_id=int(user.id), event_id=event_id)
        if event_row is None:
            event_row = await conn.fetchrow(
                """
                SELECT id, user_id, name, start_date, due_at, is_primary, created_at, updated_at
                FROM events
                WHERE user_id = $1 AND is_primary = TRUE
                """,
                int(user.id),
            )
        selected_event = _row_to_event(event_row) if event_row is not None else None
        all_completion_records = await _completion_records_for_user(conn, user_id=int(user.id))
        completed_task_ids = {
            record["subject_id"] for record in all_completion_records if record["subject_type"] == "task"
        }
        completed_appointment_ids = {
            record["subject_id"] for record in all_completion_records if record["subject_type"] == "appointment"
        }
        global_focus_seconds = await _global_focus_seconds(conn, user_id=int(user.id))
        global_completion_count = len(all_completion_records)
        global_activity_days = {record["completed_at"].date() for record in all_completion_records}
        global_activity_days.update(await _focus_activity_dates(conn, user_id=int(user.id)))
        global_usage_streak = _max_consecutive_day_count(global_activity_days)

        event_section: AchievementSectionOut | None = None
        if event_row is not None:
            event_task_ids = {
                row["id"]
                for row in await conn.fetch(
                    "SELECT id FROM tasks WHERE user_id = $1 AND event_id = $2 AND is_deleted = FALSE",
                    int(user.id),
                    event_row["id"],
                )
            }
            event_appointment_ids = {
                row["id"]
                for row in await conn.fetch(
                    "SELECT id FROM appointments WHERE user_id = $1 AND event_id = $2 AND is_deleted = FALSE",
                    int(user.id),
                    event_row["id"],
                )
            }
            event_completed_count = len(event_task_ids & completed_task_ids) + len(
                event_appointment_ids & completed_appointment_ids
            )
            event_focus_seconds = await _event_focus_seconds(conn, user_id=int(user.id), event_id=event_row["id"])
            event_completion_records = _event_completion_records(
                all_completion_records,
                task_ids=event_task_ids,
                appointment_ids=event_appointment_ids,
            )
            event_progress_streak = _max_consecutive_day_count(
                {record["completed_at"].date() for record in event_completion_records}
            )
            confirmed_appointment_count = len(event_appointment_ids & completed_appointment_ids)
            confirmed_appointment_count += await _event_confirmed_appointment_occurrence_count(
                conn,
                user_id=int(user.id),
                event_id=event_row["id"],
            )
            delivery_eve_value = (
                1
                if _delivery_eve_completed(
                    completion_records=event_completion_records,
                    event_due_at=event_row["due_at"],
                    task_ids=event_task_ids,
                    appointment_ids=event_appointment_ids,
                )
                else 0
            )
            event_items = [
                _achievement_item(
                    item_id="event-first-push",
                    title="首次推进",
                    description="第一次完成绑定到该事件的任务或日程。",
                    current_value=1 if event_completed_count > 0 else 0,
                    target_value=1,
                ),
                _achievement_item(
                    item_id="event-focus-2h",
                    title="进入状态",
                    description="围绕该事件累计专注 2 小时。",
                    current_value=event_focus_seconds,
                    target_value=2 * 60 * 60,
                ),
                _achievement_item(
                    item_id="event-complete-5",
                    title="推进不停",
                    description="完成 5 个绑定安排。",
                    current_value=event_completed_count,
                    target_value=5,
                ),
                _achievement_item(
                    item_id="event-streak-3d",
                    title="连续推进 3 天",
                    description="连续三天至少完成一项绑定到该事件的安排。",
                    current_value=event_progress_streak,
                    target_value=3,
                ),
                _achievement_item(
                    item_id="event-confirm-3-appointments",
                    title="守住关键节点",
                    description="确认 3 个绑定到该事件的日程。",
                    current_value=confirmed_appointment_count,
                    target_value=3,
                ),
                _achievement_item(
                    item_id="event-delivery-eve",
                    title="交付前夜",
                    description="在截止前 24 小时内完成最后一个未完成的绑定安排。",
                    current_value=delivery_eve_value,
                    target_value=1,
                ),
            ]
            event_section = _section_from_items(
                title="事件成就",
                summary_text=f"{event_row['name']} 的当前进展",
                primary_metric_value=event_focus_seconds,
                primary_metric_label="事件专注秒数",
                items=event_items,
            )
    return AchievementSummaryOut(
        active_event=selected_event,
        event_achievements=event_section,
        global_achievements=_section_from_items(
            title="全局成就",
            summary_text="始终显示的长期累计进度",
            primary_metric_value=global_focus_seconds,
            primary_metric_label="总专注秒数",
            items=[
                _achievement_item(
                    item_id="global-focus-10h",
                    title="总专注 10 小时",
                    description="跨所有事件累计专注 10 小时。",
                    current_value=global_focus_seconds,
                    target_value=10 * 60 * 60,
                ),
                _achievement_item(
                    item_id="global-focus-50h",
                    title="总专注 50 小时",
                    description="跨所有事件累计专注 50 小时。",
                    current_value=global_focus_seconds,
                    target_value=50 * 60 * 60,
                ),
                _achievement_item(
                    item_id="global-complete-100",
                    title="累计完成 100 项安排",
                    description="跨所有事件累计完成 100 次任务或日程。",
                    current_value=global_completion_count,
                    target_value=100,
                ),
                _achievement_item(
                    item_id="global-usage-7d",
                    title="连续使用 7 天",
                    description="连续 7 天有完成记录或专注记录。",
                    current_value=global_usage_streak,
                    target_value=7,
                ),
            ],
        ),
    )


@router.get("/event-template-store", response_model=list[EventTemplateStoreOut])
async def list_event_template_store(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[EventTemplateStoreOut]:
    _ = user
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, slug, category, name, description, schedule_mode, default_event_name, default_start_date,
                   default_due_at, default_is_primary, app_configs, workflows, sort_order, created_at, updated_at
            FROM event_template_store_templates
            ORDER BY sort_order ASC, name ASC
            """
        )
        return [await _event_template_store_out(conn, row) for row in rows]


@router.get("/event-plan-templates", response_model=list[EventPlanTemplateOut])
async def list_event_plan_templates(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[EventPlanTemplateOut]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, user_id, name, description, schedule_mode, default_event_name, default_start_date,
                   default_due_at, default_is_primary, app_configs, workflows, created_at, updated_at
            FROM event_plan_templates
            WHERE user_id = $1
            ORDER BY updated_at DESC, created_at DESC
            """,
            int(user.id),
        )
        return [await _event_plan_template_out(conn, row) for row in rows]


@router.post("/event-plan-templates", response_model=EventPlanTemplateOut)
async def create_event_plan_template(
    request: Request,
    body: EventPlanTemplateCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> EventPlanTemplateOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO event_plan_templates(
                    user_id, name, description, schedule_mode,
                    default_event_name, default_start_date, default_due_at, default_is_primary, app_configs, workflows
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
                RETURNING id, user_id, name, description, schedule_mode, default_event_name, default_start_date,
                          default_due_at, default_is_primary, app_configs, workflows, created_at, updated_at
                """,
                int(user.id),
                body.name.strip(),
                body.description,
                body.schedule_mode,
                body.default_event_name.strip() if body.default_event_name else None,
                body.default_start_date,
                body.default_due_at,
                body.default_is_primary,
                _to_jsonb_param(body.app_configs),
                _to_jsonb_param(body.workflows),
            )
            if row is None:
                raise HTTPException(status_code=500, detail="创建模板失败")
            await _replace_event_plan_template_items(conn, template_id=row["id"], items=body.items)
            return await _event_plan_template_out(conn, row)


@router.get("/event-plan-templates/{template_id}", response_model=EventPlanTemplateOut)
async def get_event_plan_template(
    request: Request,
    template_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> EventPlanTemplateOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, name, description, schedule_mode, default_event_name, default_start_date,
                   default_due_at, default_is_primary, app_configs, workflows, created_at, updated_at
            FROM event_plan_templates
            WHERE id = $1 AND user_id = $2
            """,
            template_id,
            int(user.id),
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模板不存在")
        return await _event_plan_template_out(conn, row)


@router.patch("/event-plan-templates/{template_id}", response_model=EventPlanTemplateOut)
async def update_event_plan_template(
    request: Request,
    template_id: UUID,
    body: EventPlanTemplateUpdateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> EventPlanTemplateOut:
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        return await get_event_plan_template(request, template_id, user)
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchrow(
                """
                SELECT id, user_id, name, description, schedule_mode, default_event_name, default_start_date,
                       default_due_at, default_is_primary, app_configs, workflows, created_at, updated_at
                FROM event_plan_templates
                WHERE id = $1 AND user_id = $2
                """,
                template_id,
                int(user.id),
            )
            if current is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模板不存在")
            sets: list[str] = []
            args: list[Any] = []
            for key in (
                "name",
                "description",
                "schedule_mode",
                "default_event_name",
                "default_start_date",
                "default_due_at",
                "default_is_primary",
                "app_configs",
                "workflows",
            ):
                if key not in patch:
                    continue
                value = patch[key]
                if key in {"name", "default_event_name"} and value is not None:
                    value = str(value).strip()
                if key in {"app_configs", "workflows"}:
                    value = _to_jsonb_param(value or [])
                    args.append(value)
                    sets.append(f"{key} = ${len(args)}::jsonb")
                    continue
                args.append(value)
                sets.append(f"{key} = ${len(args)}")
            row = current
            if sets:
                args.append(template_id)
                template_i = len(args)
                args.append(int(user.id))
                user_i = len(args)
                row = await conn.fetchrow(
                    f"""
                    UPDATE event_plan_templates
                    SET {", ".join(sets)}, updated_at = NOW()
                    WHERE id = ${template_i} AND user_id = ${user_i}
                    RETURNING id, user_id, name, description, schedule_mode, default_event_name, default_start_date,
                              default_due_at, default_is_primary, app_configs, workflows, created_at, updated_at
                    """,
                    *args,
                )
            if row is None:
                raise HTTPException(status_code=500, detail="更新模板失败")
            if body.items is not None:
                await _replace_event_plan_template_items(conn, template_id=template_id, items=body.items)
            return await _event_plan_template_out(conn, row)


@router.post("/event-plan-templates/{template_id}/copy", response_model=EventPlanTemplateOut)
async def copy_event_plan_template(
    request: Request,
    template_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> EventPlanTemplateOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            source = await conn.fetchrow(
                """
                SELECT id, user_id, name, description, schedule_mode, default_event_name, default_start_date,
                       default_due_at, default_is_primary, app_configs, workflows, created_at, updated_at
                FROM event_plan_templates
                WHERE id = $1 AND user_id = $2
                """,
                template_id,
                int(user.id),
            )
            if source is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模板不存在")
            source_items = await conn.fetch(
                """
                SELECT id, template_id, kind, title, content, offset_days, sort_order, details, created_at, updated_at
                FROM event_plan_template_items
                WHERE template_id = $1
                ORDER BY sort_order ASC, created_at ASC
                """,
                template_id,
            )
            row = await conn.fetchrow(
                """
                INSERT INTO event_plan_templates(
                    user_id, name, description, schedule_mode,
                    default_event_name, default_start_date, default_due_at, default_is_primary, app_configs, workflows
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
                RETURNING id, user_id, name, description, schedule_mode, default_event_name, default_start_date,
                          default_due_at, default_is_primary, app_configs, workflows, created_at, updated_at
                """,
                int(user.id),
                f"{source['name']} 副本",
                source["description"],
                source["schedule_mode"],
                source["default_event_name"],
                source["default_start_date"],
                source["default_due_at"],
                source["default_is_primary"],
                _to_jsonb_param(source["app_configs"] or []),
                _to_jsonb_param(source["workflows"] or []),
            )
            if row is None:
                raise HTTPException(status_code=500, detail="复制模板失败")
            for item in source_items:
                await conn.fetchrow(
                    """
                    INSERT INTO event_plan_template_items(template_id, kind, title, content, offset_days, sort_order, details)
                    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
                    RETURNING id, template_id, kind, title, content, offset_days, sort_order, details, created_at, updated_at
                    """,
                    row["id"],
                    item["kind"],
                    item["title"],
                    item["content"],
                    item["offset_days"],
                    item["sort_order"],
                    _to_jsonb_param(item["details"] or {}),
                )
            return await _event_plan_template_out(conn, row)


@router.delete("/event-plan-templates/{template_id}")
async def delete_event_plan_template(
    request: Request,
    template_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, bool]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        tag = await conn.execute(
            "DELETE FROM event_plan_templates WHERE id = $1 AND user_id = $2",
            template_id,
            int(user.id),
        )
    if not tag.startswith("DELETE ") or tag.endswith(" 0"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模板不存在")
    return {"ok": True}


@router.get("/events/{event_id}/workbench", response_model=EventWorkbenchOut)
async def get_event_workbench(
    request: Request,
    event_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> EventWorkbenchOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        event_row = await _get_event_for_user(conn, user_id=int(user.id), event_id=event_id)
        if event_row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
        return await _event_workbench_out(conn, user_id=int(user.id), event_row=event_row)


@router.get("/events/{event_id}/workflows", response_model=list[FocusWorkflowPresetOut])
async def list_event_workflows(
    request: Request,
    event_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[FocusWorkflowPresetOut]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        event_row = await _get_event_for_user(conn, user_id=int(user.id), event_id=event_id)
        if event_row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
        rows = await conn.fetch(
            f"""
            SELECT {WORKFLOW_PRESET_SELECT}
            FROM focus_workflow_presets
            WHERE user_id = $1 AND event_id = $2
            ORDER BY updated_at DESC
            """,
            int(user.id),
            event_id,
        )
    return [_row_to_focus_workflow_preset(row) for row in rows]


@router.post("/events/{event_id}/workflows", response_model=FocusWorkflowPresetOut)
async def create_event_workflow(
    request: Request,
    event_id: UUID,
    body: FocusWorkflowPresetCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowPresetOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            event_row = await _get_event_for_user(conn, user_id=int(user.id), event_id=event_id)
            if event_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
            phases = _normalize_workflow_phases(
                body.phases,
                fallback_focus_duration=int(body.focus_duration),
                fallback_break_duration=int(body.break_duration),
                default_focus_timer_mode=body.default_focus_timer_mode,
            )
            phases = await _validate_event_workflow_phase_task_bindings(conn, int(user.id), event_id, phases)
            row = await conn.fetchrow(
                f"""
                INSERT INTO focus_workflow_presets(
                    user_id, event_id, name, focus_duration, break_duration, phases, default_focus_timer_mode, is_default
                )
                VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, FALSE)
                RETURNING {WORKFLOW_PRESET_SELECT}
                """,
                int(user.id),
                event_id,
                body.name.strip(),
                int(body.focus_duration),
                int(body.break_duration),
                _to_jsonb_param(phases),
                body.default_focus_timer_mode,
            )
    if row is None:
        raise HTTPException(status_code=500, detail="创建工作流失败")
    return _row_to_focus_workflow_preset(row)


@router.patch("/events/{event_id}/workflows/{workflow_id}", response_model=FocusWorkflowPresetOut)
async def update_event_workflow(
    request: Request,
    event_id: UUID,
    workflow_id: UUID,
    body: FocusWorkflowPresetUpdateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowPresetOut:
    patch = body.model_dump(exclude_unset=True)
    patch.pop("is_default", None)
    if not patch:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="没有可更新字段")
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            event_row = await _get_event_for_user(conn, user_id=int(user.id), event_id=event_id)
            if event_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
            target = await conn.fetchrow(
                f"""
                SELECT {WORKFLOW_PRESET_SELECT}
                FROM focus_workflow_presets
                WHERE id = $1 AND user_id = $2 AND event_id = $3
                """,
                workflow_id,
                int(user.id),
                event_id,
            )
            if target is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="工作流不存在")
            target_timer_mode = (
                target.get("default_focus_timer_mode", "countdown")
                if hasattr(target, "get")
                else target["default_focus_timer_mode"]
            )
            if "phases" in patch:
                phases = _normalize_workflow_phases(
                    body.phases,
                    fallback_focus_duration=int(target["focus_duration"]),
                    fallback_break_duration=int(target["break_duration"]),
                    default_focus_timer_mode=str(patch.get("default_focus_timer_mode") or target_timer_mode),
                )
                phases = await _validate_event_workflow_phase_task_bindings(conn, int(user.id), event_id, phases)
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
            args.append(workflow_id)
            p_i = len(args)
            args.append(int(user.id))
            u_i = len(args)
            args.append(event_id)
            e_i = len(args)
            row = await conn.fetchrow(
                f"""
                UPDATE focus_workflow_presets
                SET {", ".join(sets)}, is_default = FALSE, updated_at = NOW()
                WHERE id = ${p_i} AND user_id = ${u_i} AND event_id = ${e_i}
                RETURNING {WORKFLOW_PRESET_SELECT}
                """,
                *args,
            )
    if row is None:
        raise HTTPException(status_code=500, detail="更新工作流失败")
    return _row_to_focus_workflow_preset(row)


@router.delete("/events/{event_id}/workflows/{workflow_id}")
async def delete_event_workflow(
    request: Request,
    event_id: UUID,
    workflow_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, bool]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            event_row = await _get_event_for_user(conn, user_id=int(user.id), event_id=event_id)
            if event_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
            tag = await conn.execute(
                "DELETE FROM focus_workflow_presets WHERE id = $1 AND user_id = $2 AND event_id = $3",
                workflow_id,
                int(user.id),
                event_id,
            )
    if not tag.startswith("DELETE ") or tag.endswith(" 0"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="工作流不存在")
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
            row = await create_event_row(conn, user_id=int(user.id), body=body)
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
        rows = await list_event_rows(conn, user_id=int(user.id))
    return [_row_to_event(row) for row in rows]


@router.get("/events/primary", response_model=EventOut)
async def get_primary_event(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> EventOut:
    """获取当前用户主事件。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await get_primary_event_row(conn, user_id=int(user.id))
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
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await update_event_row(conn, user_id=int(user.id), event_id=event_id, patch=patch)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
    return _row_to_event(row)


@router.get("/events/{event_id}/delete-preview", response_model=EventDeletePreviewOut)
async def get_event_delete_preview(
    request: Request,
    event_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> EventDeletePreviewOut:
    """返回删除事件时会一起清理的内容数量。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await get_event_delete_preview_row(conn, user_id=int(user.id), event_id=event_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
    return EventDeletePreviewOut(
        tasks_count=int(row["tasks_count"]),
        appointments_count=int(row["appointments_count"]),
        workflows_count=int(row["workflows_count"]),
        app_configs_count=int(row["app_configs_count"]),
    )


@router.delete("/events/{event_id}")
async def delete_event(
    request: Request,
    event_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, bool]:
    """删除事件。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            tag = await delete_event_row(conn, user_id=int(user.id), event_id=event_id)
    if not tag.startswith("DELETE ") or tag.endswith(" 0"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
    return {"ok": True}


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


WORKFLOW_PRESET_SELECT = """
id, user_id, event_id, (SELECT name FROM events WHERE id = event_id) AS event_name, name, focus_duration, break_duration,
default_focus_timer_mode, phases, is_default, created_at, updated_at
"""


async def _validate_event_workflow_phase_task_bindings(
    conn: Any,
    user_id: int,
    event_id: UUID,
    phases: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    validated: list[dict[str, Any]] = []
    for phase in phases:
        next_phase = dict(phase)
        task_id = _phase_task_id_value(next_phase)
        if str(next_phase.get("phase_type")) == "focus" and task_id is not None:
            task_row = await conn.fetchrow(
                """
                SELECT id, status, is_deleted
                FROM tasks
                WHERE id = $1 AND user_id = $2 AND event_id = $3
                """,
                task_id,
                int(user_id),
                event_id,
            )
            if task_row is None or bool(task_row["is_deleted"]) or str(task_row["status"]) == "done":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="绑定任务必须属于当前事件且未完成",
                )
            next_phase["task_id"] = task_row["id"]
        elif str(next_phase.get("phase_type")) != "focus":
            next_phase["task_id"] = None
        validated.append(next_phase)
    return validated


@router.get("/focus/workflows", response_model=list[FocusWorkflowPresetOut])
async def list_focus_workflow_presets(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[FocusWorkflowPresetOut]:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {WORKFLOW_PRESET_SELECT}
            FROM focus_workflow_presets
            WHERE user_id = $1
            ORDER BY is_default DESC, (event_id IS NOT NULL) ASC, updated_at DESC
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
                f"""
                INSERT INTO focus_workflow_presets(user_id, name, focus_duration, break_duration, phases, default_focus_timer_mode, is_default)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
                RETURNING {WORKFLOW_PRESET_SELECT}
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
                f"""
                SELECT {WORKFLOW_PRESET_SELECT}
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
                RETURNING {WORKFLOW_PRESET_SELECT}
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
                f"""
                SELECT {WORKFLOW_PRESET_SELECT}
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
                f"""
                UPDATE focus_workflow_presets
                SET is_default = TRUE, updated_at = NOW()
                WHERE id = $1 AND user_id = $2
                RETURNING {WORKFLOW_PRESET_SELECT}
                """,
                preset_id,
                int(user.id),
            )
    if updated is None:
        raise HTTPException(status_code=500, detail="设置默认工作流失败")
    return _row_to_focus_workflow_preset(updated)


@router.post("/focus/workflows/{preset_id}/start", response_model=FocusWorkflowOut)
async def start_focus_workflow_preset(
    request: Request,
    preset_id: UUID,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            preset = await conn.fetchrow(
                f"""
                SELECT {WORKFLOW_PRESET_SELECT}
                FROM focus_workflow_presets
                WHERE id = $1 AND user_id = $2
                """,
                preset_id,
                int(user.id),
            )
            if preset is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="工作流不存在")

            active = await conn.fetchrow(
                "SELECT id FROM focus_workflows WHERE user_id = $1 AND status = 'active'",
                int(user.id),
            )
            if active is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="已有活动工作流")

            phases = _normalize_workflow_phases(
                preset["phases"],
                fallback_focus_duration=int(preset["focus_duration"]),
                fallback_break_duration=int(preset["break_duration"]),
                default_focus_timer_mode=_normalize_timer_mode(
                    preset.get("default_focus_timer_mode", "countdown") if hasattr(preset, "get") else "countdown"
                ),
            )
            if not phases:
                phases = _build_default_phases(int(preset["focus_duration"]), int(preset["break_duration"]))

            first_phase = phases[0]
            first_phase_type = str(first_phase["phase_type"])
            pending_task_selection = False
            task_row = None
            task_id = None
            runtime_task_id = None
            active_focus_work_type = _phase_focus_work_type_value(first_phase)
            focus_work_display_state = "fullscreen" if active_focus_work_type is not None else None
            record_focus = bool(first_phase.get("record_focus", True))

            if first_phase_type == "focus" and active_focus_work_type is None:
                phase_task_id = _phase_task_id_value(first_phase)
                task_row = await _get_bindable_task(conn, int(user.id), phase_task_id)
                if (
                    phase_task_id is None
                    or task_row is None
                    or bool(task_row["is_deleted"])
                    or str(task_row["status"]) == "done"
                ):
                    pending_task_selection = True
                    task_row = None
                else:
                    task_id = task_row["id"]
                    runtime_task_id = task_row["id"]
                    active_focus_work_type = _focus_work_type_for_task_row(task_row)
                    focus_work_display_state = "fullscreen"

            row = await conn.fetchrow(
                """
                INSERT INTO focus_workflows(
                    user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                    focus_duration, break_duration, current_phase, phase_started_at,
                    phase_planned_duration, pending_confirmation, pending_task_selection, status,
                    active_focus_work_type, focus_work_display_state, focus_work_result,
                    focus_work_progress_snapshot, is_paused, paused_at, record_focus
                )
                VALUES ($1, $2, $3, $4, $5::jsonb, 0, $6, $7, $8, NOW(), $9, FALSE, $10,
                        'active', $11, $12, NULL, NULL, FALSE, NULL, $13)
                RETURNING id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                          focus_duration, break_duration, current_phase, phase_started_at,
                          phase_planned_duration, pending_confirmation, pending_task_selection,
                          active_focus_work_type, focus_work_display_state, focus_work_result,
                          focus_work_progress_snapshot, is_paused, paused_at, record_focus
                """,
                int(user.id),
                task_id,
                runtime_task_id,
                str(preset["name"] or "工作流"),
                _to_jsonb_param(phases),
                int(preset["focus_duration"]),
                int(preset["break_duration"]),
                first_phase_type,
                int(first_phase["duration"]),
                pending_task_selection,
                active_focus_work_type,
                focus_work_display_state,
                record_focus,
            )
            if row is None:
                raise HTTPException(status_code=500, detail="开始工作流失败")

            if active_focus_work_type is not None:
                await _start_focus_app_work_log(conn, int(user.id), row["id"], active_focus_work_type, record_focus)
            if task_row is not None and task_id is not None:
                await _start_focus_log_for_task(conn, int(user.id), task_id)

    return _row_to_focus_workflow(row, **_focus_workflow_task_kwargs(task_row))


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
                """
                SELECT id, title, source_type, app_id, app_task_type, app_config_id,
                       app_instance_key, managed_by_app
                FROM tasks
                WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
                """,
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
                focus_duration = 1500
                break_duration = 300
                phases = _build_default_phases(focus_duration, break_duration)
                workflow_name = "默认工作流"
            phases = _bind_first_focus_phase_to_task(phases, task_id)
            row = await _create_workflow_with_focus_phase(
                conn,
                user_id=int(user.id),
                task_id=task_id,
                workflow_name=workflow_name,
                phases=phases,
                focus_duration=focus_duration,
                break_duration=break_duration,
                task_focus_work_type=_focus_work_type_for_task_row(task_row),
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
                """
                SELECT id, title, source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
                FROM tasks
                WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
                """,
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
                task_focus_work_type=_focus_work_type_for_task_row(task_row),
            )
            row = await conn.fetchrow(
                """
                SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                       focus_duration, break_duration, current_phase, phase_started_at,
                       phase_planned_duration, pending_confirmation, pending_task_selection,
                       active_focus_work_type, focus_work_display_state, focus_work_result,
                       focus_work_progress_snapshot, is_paused, paused_at, record_focus
                FROM focus_workflows
                WHERE user_id = $1 AND status = 'active'
                """,
                int(user.id),
            )
    return _row_to_focus_workflow(row, **_focus_workflow_task_kwargs(task_row))


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
            task_kwargs: dict[str, Any] = {}
            if row["task_id"] is not None:
                task_row = await conn.fetchrow(
                    """
                    SELECT title, source_type, app_id, app_task_type, app_config_id
                    FROM tasks
                    WHERE id = $1 AND user_id = $2
                    """,
                    row["task_id"],
                    int(user.id),
                )
                if task_row is not None:
                    task_title = str(task_row["title"])
                    task_kwargs = _focus_workflow_task_kwargs(task_row)
    return _row_to_focus_workflow(
        row, task_title=task_title, **{k: v for k, v in task_kwargs.items() if k != "task_title"}
    )


@router.post("/focus/workflow/start-app-work", response_model=FocusWorkflowOut)
async def start_focus_workflow_app_work(
    request: Request,
    body: FocusWorkflowStartAppWorkRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    """从子应用临时进入页面级专注工作。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await _sync_active_focus_workflow(conn, int(user.id))
            focus_phase = {
                "phase_type": "focus",
                "duration": 1500,
                "timer_mode": "countdown",
                "task_id": None,
                "focus_work_type": body.focus_work_type,
                "is_temporary": True,
                "record_focus": bool(body.record_focus),
            }
            break_phase = {
                "phase_type": "break",
                "duration": 300,
                "timer_mode": None,
                "task_id": None,
                "focus_work_type": None,
                "is_temporary": True,
                "record_focus": True,
            }

            if row is None:
                phases = [focus_phase]
                try:
                    created = await conn.fetchrow(
                        """
                        INSERT INTO focus_workflows(
                            user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                            focus_duration, break_duration, current_phase, phase_started_at,
                            phase_planned_duration, pending_confirmation, pending_task_selection, status,
                            active_focus_work_type, focus_work_display_state, focus_work_result,
                            focus_work_progress_snapshot, is_paused, paused_at, record_focus
                        )
                        VALUES ($1, NULL, NULL, $2, $3::jsonb, 0, $4, $5, 'focus', NOW(), $4, FALSE, FALSE,
                                'active', $6, 'fullscreen', NULL, NULL, FALSE, NULL, $7)
                        RETURNING id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                                  focus_duration, break_duration, current_phase, phase_started_at,
                                  phase_planned_duration, pending_confirmation, pending_task_selection,
                                  active_focus_work_type, focus_work_display_state, focus_work_result,
                                  focus_work_progress_snapshot, is_paused, paused_at, record_focus
                        """,
                        int(user.id),
                        "临时专注工作",
                        _to_jsonb_param(phases),
                        int(focus_phase["duration"]),
                        int(break_phase["duration"]),
                        body.focus_work_type,
                        bool(body.record_focus),
                    )
                except Exception as exc:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="已有活动工作流") from exc
                if created is None:
                    raise HTTPException(status_code=500, detail="开始专注工作失败")
                await _start_focus_app_work_log(
                    conn, int(user.id), created["id"], body.focus_work_type, bool(body.record_focus)
                )
                return _row_to_focus_workflow(created)

            if str(row["current_phase"]) == "focus":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前已经处于专注状态")
            if bool(row.get("pending_task_selection", False) if hasattr(row, "get") else False):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段需要先选择任务")

            phases = _normalize_workflow_phases(
                row.get("phases") if hasattr(row, "get") else row["phases"],
                fallback_focus_duration=int(row["focus_duration"]),
                fallback_break_duration=int(row["break_duration"]),
            )
            current_index = _safe_int(
                row.get("current_phase_index", 0) if hasattr(row, "get") else row["current_phase_index"], 0
            )
            insert_index = current_index + 1
            next_phases = [*phases[:insert_index], focus_phase, break_phase, *phases[insert_index:]]
            await conn.execute(
                "UPDATE focus_workflows SET phases = $1::jsonb, updated_at = NOW() WHERE id = $2",
                _to_jsonb_param(next_phases),
                row["id"],
            )
            next_row = await _set_workflow_current_phase(
                conn,
                row["id"],
                phase_index=insert_index,
                phase=focus_phase,
                task_id=None,
                runtime_task_id=None,
                pending_task_selection=False,
                active_focus_work_type=body.focus_work_type,
                focus_work_display_state="fullscreen",
                focus_work_result=None,
                focus_work_progress_snapshot=None,
                record_focus=bool(body.record_focus),
            )
            await _start_focus_app_work_log(
                conn, int(user.id), row["id"], body.focus_work_type, bool(body.record_focus)
            )
    return _row_to_focus_workflow(next_row)


@router.post("/focus/workflow/focus-work-result", response_model=FocusWorkflowOut)
async def submit_focus_work_result(
    request: Request,
    body: FocusWorkflowResultRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    """提交页面级专注工作对当前阶段的结果。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await _sync_active_focus_workflow(conn, int(user.id))
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前无活动工作流")
            if str(row["current_phase"]) != "focus":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段不是专注阶段")
            active_focus_work_type = (
                row.get("active_focus_work_type") if hasattr(row, "get") else row["active_focus_work_type"]
            )
            if (
                active_focus_work_type is None
                and (row.get("task_id") if hasattr(row, "get") else row["task_id"]) is not None
                and (row.get("runtime_task_id") if hasattr(row, "get") else row["runtime_task_id"]) is not None
                and not bool(row.get("pending_task_selection", False) if hasattr(row, "get") else False)
                and not bool(row["pending_confirmation"])
            ):
                active_focus_work_type = "task_focus"
            if active_focus_work_type != body.focus_work_type:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="专注工作类型不匹配")

            await _close_open_focus_log(conn, int(user.id))
            await _close_open_focus_app_work_log(
                conn,
                int(user.id),
                result=body.result,
                progress_snapshot=dict(body.progress_snapshot),
            )
            workflow_task_id = (row.get("runtime_task_id") if hasattr(row, "get") else row["runtime_task_id"]) or (
                row.get("task_id") if hasattr(row, "get") else row["task_id"]
            )
            completed_task = body.progress_snapshot.get("completedTask") is True
            if body.result == "completed" and completed_task and workflow_task_id is not None:
                task_row = await conn.fetchrow(
                    """
                    SELECT id, user_id, status, is_recurring, period_type, custom_period_days,
                           max_completions_per_period, weekday_only, source_type, app_id, app_task_type
                    FROM tasks
                    WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
                    """,
                    workflow_task_id,
                    int(user.id),
                )
                if task_row is not None and task_row["source_type"] == "app":
                    completed_at = datetime.now(UTC)
                    completion_state = await _build_completion_state(
                        conn,
                        user_id=int(user.id),
                        subject_type="task",
                        subject_id=task_row["id"],
                        is_recurring=bool(task_row["is_recurring"]),
                        period_type=task_row["period_type"],
                        custom_period_days=task_row["custom_period_days"],
                        max_completions_per_period=int(task_row["max_completions_per_period"]),
                        weekday_only=bool(task_row["weekday_only"]),
                        permanent_done=str(task_row["status"]) == "done",
                        now=completed_at,
                    )
                    _raise_if_completion_blocked(completion_state, noun="应用任务")
                    await _insert_completion_record(
                        conn,
                        user_id=int(user.id),
                        subject_type="task",
                        subject_id=task_row["id"],
                        completed_at=completed_at,
                        counted_period_start=completion_state.current_period_start,
                        counted_period_end=completion_state.current_period_end,
                    )

            phases = _normalize_workflow_phases(
                row.get("phases") if hasattr(row, "get") else row["phases"],
                fallback_focus_duration=int(row["focus_duration"]),
                fallback_break_duration=int(row["break_duration"]),
            )
            current_index = _safe_int(
                row.get("current_phase_index", 0) if hasattr(row, "get") else row["current_phase_index"], 0
            )
            next_index = current_index + 1
            if next_index >= len(phases):
                return await _advance_focus_workflow_to_next_phase(conn, row, int(user.id), skip_breaks=False)
            next_phase = phases[next_index]
            should_minimize = False
            if str(next_phase["phase_type"]) == "break":
                next_focus_index = next_index + 1
                if next_focus_index < len(phases):
                    next_focus_phase = phases[next_focus_index]
                    should_minimize = (
                        str(next_focus_phase.get("phase_type")) == "focus"
                        and next_focus_phase.get("focus_work_type") == body.focus_work_type
                    )
            next_row = await _set_workflow_current_phase(
                conn,
                row["id"],
                phase_index=next_index,
                phase=next_phase,
                task_id=None,
                runtime_task_id=None,
                pending_task_selection=False,
                active_focus_work_type=body.focus_work_type if should_minimize else None,
                focus_work_display_state="minimized" if should_minimize else "closed",
                focus_work_result=body.result,
                focus_work_progress_snapshot=dict(body.progress_snapshot),
                record_focus=bool(row.get("record_focus", True) if hasattr(row, "get") else row["record_focus"]),
            )
    return _row_to_focus_workflow(next_row)


@router.post("/focus/workflow/skip_phase", response_model=FocusWorkflowOut)
async def skip_focus_workflow_phase(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    """跳过当前阶段的剩余时间，直接推进到下一阶段。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                       focus_duration, break_duration, current_phase, phase_started_at,
                       phase_planned_duration, pending_confirmation, pending_task_selection,
                       active_focus_work_type, focus_work_display_state, focus_work_result,
                       focus_work_progress_snapshot, is_paused, paused_at, record_focus
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

            current_phase_type = str(row["current_phase"])
            if current_phase_type == "focus":
                await _close_open_focus_log(conn, int(user.id))
                await _close_open_focus_app_work_log(
                    conn,
                    int(user.id),
                    result="interrupted",
                    progress_snapshot={},
                )

            # 直接推进到下一阶段，跳过手动待确认状态
            return await _advance_focus_workflow_to_next_phase(conn, row, int(user.id), skip_breaks=False)


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


@router.post("/focus/workflow/pause", response_model=FocusWorkflowOut)
async def pause_focus_workflow(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await _sync_active_focus_workflow(conn, int(user.id))
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前无活动工作流")
            if str(row["current_phase"]) != "focus":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段不是专注阶段")
            if bool(row.get("pending_task_selection", False) if hasattr(row, "get") else False):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段需要先选择任务")
            if bool(row["pending_confirmation"]):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段已结束，请确认流转")
            if bool(row.get("is_paused", False) if hasattr(row, "get") else False):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前专注已暂停")
            await conn.execute(
                """
                UPDATE focus_workflows
                SET is_paused = TRUE, paused_at = NOW(), updated_at = NOW()
                WHERE id = $1
                """,
                row["id"],
            )
            updated_row = await conn.fetchrow(
                """
                SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                       focus_duration, break_duration, current_phase, phase_started_at,
                       phase_planned_duration, pending_confirmation, pending_task_selection,
                       active_focus_work_type, focus_work_display_state, focus_work_result,
                       focus_work_progress_snapshot, is_paused, paused_at, record_focus
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


@router.post("/focus/workflow/resume", response_model=FocusWorkflowOut)
async def resume_focus_workflow(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> FocusWorkflowOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await _sync_active_focus_workflow(conn, int(user.id))
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="当前无活动工作流")
            if str(row["current_phase"]) != "focus":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段不是专注阶段")
            if not bool(row.get("is_paused", False) if hasattr(row, "get") else False):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前专注未暂停")
            paused_at = row.get("paused_at") if hasattr(row, "get") else row["paused_at"]
            if paused_at is None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前专注缺少暂停时间")
            await conn.execute(
                """
                UPDATE focus_workflows
                SET phase_started_at = phase_started_at + (NOW() - $2::timestamptz),
                    is_paused = FALSE,
                    paused_at = NULL,
                    updated_at = NOW()
                WHERE id = $1
                """,
                row["id"],
                paused_at,
            )
            await conn.execute(
                """
                UPDATE focus_logs
                SET start_time = start_time + (NOW() - $2::timestamptz)
                WHERE user_id = $1 AND end_at IS NULL
                """,
                int(user.id),
                paused_at,
            )
            await conn.execute(
                """
                UPDATE focus_app_work_logs
                SET start_time = start_time + (NOW() - $2::timestamptz)
                WHERE user_id = $1 AND end_at IS NULL
                """,
                int(user.id),
                paused_at,
            )
            updated_row = await conn.fetchrow(
                """
                SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                       focus_duration, break_duration, current_phase, phase_started_at,
                       phase_planned_duration, pending_confirmation, pending_task_selection,
                       active_focus_work_type, focus_work_display_state, focus_work_result,
                       focus_work_progress_snapshot, is_paused, paused_at, record_focus
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
                       phase_planned_duration, pending_confirmation, pending_task_selection,
                       active_focus_work_type, focus_work_display_state, focus_work_result,
                       focus_work_progress_snapshot, record_focus
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
            current_index = _safe_int(
                row.get("current_phase_index", 0) if hasattr(row, "get") else row["current_phase_index"], 0
            )
            phase = phases[current_index]
            if str(phase["phase_type"]) != "focus":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前阶段不是专注阶段")
            task_row = await _get_bindable_task(conn, int(user.id), body.task_id)
            if task_row is None or bool(task_row["is_deleted"]) or str(task_row["status"]) == "done":
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="请选择未完成任务")
            focus_work_type = _focus_work_type_for_task_row(task_row)
            next_row = await _set_workflow_current_phase(
                conn,
                row["id"],
                phase_index=current_index,
                phase=phase,
                task_id=task_row["id"],
                runtime_task_id=task_row["id"],
                pending_task_selection=False,
                active_focus_work_type=focus_work_type,
                focus_work_display_state="fullscreen",
                focus_work_result=None,
                focus_work_progress_snapshot=None,
            )
            await _start_focus_app_work_log(conn, int(user.id), row["id"], focus_work_type, True)
            await _start_focus_log_for_task(conn, int(user.id), task_row["id"])
    return _row_to_focus_workflow(next_row, **_focus_workflow_task_kwargs(task_row))


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
            await _close_open_focus_app_work_log(
                conn,
                int(user.id),
                result="abandoned",
                progress_snapshot={},
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
