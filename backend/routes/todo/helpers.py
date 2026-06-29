from __future__ import annotations

import calendar
import json
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

import asyncpg
from fastapi import HTTPException, status

from .schemas import (
    AchievementItemOut,
    AchievementSectionOut,
    AchievementSectionStatsOut,
    AchievementStatus,
    AppointmentOccurrenceOut,
    AppointmentOut,
    AppointmentStatus,
    AppointmentStoredStatus,
    CompletionPeriodType,
    CompletionStateOut,
    EventOut,
    FocusLogCreateRequest,
    FocusLogOut,
    FocusTimerMode,
    FocusWorkflowOut,
    FocusWorkflowPhase,
    FocusWorkflowPresetOut,
    FocusWorkRunSummaryOut,
    FocusWorkType,
    PhaseType,
    TaskOut,
    TaskType,
)

UTC = getattr(timezone, "utc")
COUNTUP_PHASE_CAP_SECONDS = 2 * 60 * 60

TASK_RETURNING_COLUMNS = """
id, user_id, title, content, status,
current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
actual_duration, start_date, due_date, is_deleted, created_at, updated_at,
source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
"""


def _row_to_task(row: asyncpg.Record) -> TaskOut:
    """将 asyncpg.Record 转为 TaskOut。"""
    return TaskOut(
        id=row["id"],
        user_id=int(row["user_id"]),
        title=str(row["title"]),
        content=row["content"],
        status=row["status"],
        current_cycle_count=int(row["current_cycle_count"]),
        target_cycle_count=int(row["target_cycle_count"]),
        cycle_period=row["cycle_period"],
        cycle_every_days=row["cycle_every_days"],
        event=str(row["event"] or ""),
        event_ids=list(row["event_ids"] or []),
        event_id=row["event_id"],
        is_recurring=bool(row["is_recurring"]),
        period_type=row["period_type"],
        custom_period_days=row["custom_period_days"],
        max_completions_per_period=int(row["max_completions_per_period"]),
        weekday_only=bool(row["weekday_only"]),
        time_inherits_from_event=bool(row["time_inherits_from_event"]),
        time_overridden=bool(row["time_overridden"]),
        manually_scheduled_for_today=bool(row["manually_scheduled_for_today"]),
        task_type=_normalize_task_type(row["task_type"]),
        actual_duration=int(row["actual_duration"]),
        start_date=row["start_date"],
        due_date=row["due_date"],
        is_deleted=bool(row["is_deleted"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        source_type=str(_record_get(row, "source_type", "user") or "user"),
        app_id=_record_get(row, "app_id"),
        app_task_type=_record_get(row, "app_task_type"),
        app_config_id=_record_get(row, "app_config_id"),
        app_instance_key=_record_get(row, "app_instance_key"),
        managed_by_app=bool(_record_get(row, "managed_by_app", False)),
    )


def _app_task_title(app_id: str, app_task_type: str) -> str:
    if app_id == "vocab" and app_task_type == "vocab_today":
        return "今日单词"
    if app_id == "erc" and app_task_type == "review":
        return "复习"
    if app_id == "erc" and app_task_type == "practice":
        return "真题练习"
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="不支持的应用任务类型")


async def _get_active_app_task_config(
    conn: Any,
    *,
    user_id: int,
    app_id: str,
    app_task_type: str,
    event_id: UUID | None,
    include_disabled: bool = False,
) -> asyncpg.Record | dict[str, Any] | None:
    status_filter = "status IN ('active', 'disabled')" if include_disabled else "status = 'active'"
    if event_id is None:
        return await conn.fetchrow(
            f"""
            SELECT id, user_id, event_id, app_id, app_task_type, config, status, created_task_id, created_at, updated_at
            FROM app_task_configs
            WHERE user_id = $1 AND app_id = $2 AND app_task_type = $3 AND {status_filter} AND event_id IS NULL
            ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC
            LIMIT 1
            """,
            user_id,
            app_id,
            app_task_type,
        )
    return await conn.fetchrow(
        f"""
        SELECT id, user_id, event_id, app_id, app_task_type, config, status, created_task_id, created_at, updated_at
        FROM app_task_configs
        WHERE user_id = $1 AND event_id = $2 AND app_id = $3 AND app_task_type = $4 AND {status_filter}
        ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC
        LIMIT 1
        """,
        user_id,
        event_id,
        app_id,
        app_task_type,
    )


async def _create_or_update_app_task_config(
    conn: Any,
    *,
    user_id: int,
    app_id: str,
    app_task_type: str,
    config: dict[str, Any],
    event_id: UUID | None,
) -> asyncpg.Record | dict[str, Any]:
    if event_id is None:
        row = await conn.fetchrow(
            """
            INSERT INTO app_task_configs(user_id, event_id, app_id, app_task_type, config, status)
            VALUES ($1, NULL, $2, $3, $4::jsonb, 'active')
            ON CONFLICT (user_id, app_id, app_task_type)
            WHERE status = 'active' AND event_id IS NULL
            DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()
            RETURNING id, user_id, event_id, app_id, app_task_type, config, status, created_task_id, created_at, updated_at
            """,
            user_id,
            app_id,
            app_task_type,
            _to_jsonb_param(config),
        )
        if row is None:
            raise HTTPException(status_code=500, detail="应用任务配置保存失败")
        return row

    row = await conn.fetchrow(
        """
        INSERT INTO app_task_configs(user_id, event_id, app_id, app_task_type, config, status)
        VALUES ($1, $2, $3, $4, $5::jsonb, 'active')
        ON CONFLICT (user_id, event_id, app_id, app_task_type)
        WHERE status = 'active' AND event_id IS NOT NULL
        DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()
        RETURNING id, user_id, event_id, app_id, app_task_type, config, status, created_task_id, created_at, updated_at
        """,
        user_id,
        event_id,
        app_id,
        app_task_type,
        _to_jsonb_param(config),
    )
    if row is None:
        raise HTTPException(status_code=500, detail="应用任务配置保存失败")
    return row


async def _create_or_update_managed_app_task(
    conn: Any,
    *,
    user_id: int,
    app_id: str,
    app_task_type: str,
    config: dict[str, Any],
    add_to_today_plan: bool,
    event_id: UUID | None,
) -> asyncpg.Record | dict[str, Any]:
    title = _app_task_title(app_id, app_task_type)
    config_row = await _create_or_update_app_task_config(
        conn,
        user_id=user_id,
        app_id=app_id,
        app_task_type=app_task_type,
        config=config,
        event_id=event_id,
    )
    config_id = config_row["id"]
    conflict_clause = (
        "ON CONFLICT (user_id, app_id, app_task_type) "
        "WHERE source_type = 'app' AND managed_by_app = TRUE AND is_deleted = FALSE AND event_id IS NULL"
        if event_id is None
        else "ON CONFLICT (user_id, event_id, app_id, app_task_type) "
        "WHERE source_type = 'app' AND managed_by_app = TRUE AND is_deleted = FALSE AND event_id IS NOT NULL"
    )
    row = await conn.fetchrow(
        f"""
        INSERT INTO tasks(
            user_id, title, content, status,
            current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
            event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
            weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type,
            start_date, due_date, source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
        {conflict_clause}
        DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            status = EXCLUDED.status,
            current_cycle_count = EXCLUDED.current_cycle_count,
            target_cycle_count = EXCLUDED.target_cycle_count,
            cycle_period = EXCLUDED.cycle_period,
            cycle_every_days = EXCLUDED.cycle_every_days,
            event = EXCLUDED.event,
            event_ids = EXCLUDED.event_ids,
            event_id = EXCLUDED.event_id,
            is_recurring = EXCLUDED.is_recurring,
            period_type = EXCLUDED.period_type,
            custom_period_days = EXCLUDED.custom_period_days,
            max_completions_per_period = EXCLUDED.max_completions_per_period,
            weekday_only = EXCLUDED.weekday_only,
            time_inherits_from_event = EXCLUDED.time_inherits_from_event,
            time_overridden = EXCLUDED.time_overridden,
            manually_scheduled_for_today = CASE WHEN tasks.manually_scheduled_for_today THEN TRUE ELSE EXCLUDED.manually_scheduled_for_today END,
            task_type = EXCLUDED.task_type,
            start_date = EXCLUDED.start_date,
            due_date = EXCLUDED.due_date,
            source_type = EXCLUDED.source_type,
            app_config_id = EXCLUDED.app_config_id,
            app_instance_key = EXCLUDED.app_instance_key,
            managed_by_app = EXCLUDED.managed_by_app,
            updated_at = NOW()
        RETURNING {TASK_RETURNING_COLUMNS}
        """,
        user_id,
        title,
        None,
        "todo",
        0,
        0,
        "daily",
        None,
        "",
        [],
        event_id,
        True,
        "daily",
        None,
        1,
        False,
        False,
        False,
        add_to_today_plan,
        "focus",
        None,
        None,
        "app",
        app_id,
        app_task_type,
        config_id,
        f"{event_id}:{app_id}:{app_task_type}" if event_id is not None else f"{app_id}:{app_task_type}",
        True,
    )

    if row is None:
        raise HTTPException(status_code=500, detail="应用托管任务保存失败")

    await conn.execute(
        """
        UPDATE app_task_configs
        SET created_task_id = $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3 AND app_id = $4 AND app_task_type = $5
        """,
        row["id"],
        config_id,
        user_id,
        app_id,
        app_task_type,
    )
    return row


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
        event_id=row["event_id"],
        is_recurring=bool(row["is_recurring"]),
        period_type=row["period_type"],
        custom_period_days=row["custom_period_days"],
        max_completions_per_period=int(row["max_completions_per_period"]),
        weekday_only=bool(row["weekday_only"]),
        time_inherits_from_event=bool(row["time_inherits_from_event"]),
        time_overridden=bool(row["time_overridden"]),
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
        start_date=row["start_date"],
        due_at=row["due_at"],
        is_primary=bool(row["is_primary"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _get_event_for_user(conn: Any, *, user_id: int, event_id: UUID | None) -> dict[str, Any] | None:
    if event_id is None:
        return None
    row = await conn.fetchrow(
        """
        SELECT id, user_id, name, start_date, due_at, is_primary, created_at, updated_at
        FROM events
        WHERE id = $1 AND user_id = $2
        """,
        event_id,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="关联事件不存在")
    return row


def _empty_achievement_section(title: str) -> AchievementSectionOut:
    return AchievementSectionOut(
        title=title,
        summary_text=None,
        stats=AchievementSectionStatsOut(
            unlocked_count=0,
            in_progress_count=0,
            primary_metric_value=0,
            primary_metric_label=None,
        ),
        latest_unlocked=[],
        upcoming=[],
    )


async def _completed_subject_ids(
    conn: Any,
    *,
    user_id: int,
    subject_type: Literal["task", "appointment"],
) -> set[UUID]:
    rows = await conn.fetch(
        """
        SELECT DISTINCT subject_id
        FROM completion_records
        WHERE user_id = $1 AND subject_type = $2
        """,
        user_id,
        subject_type,
    )
    return {row["subject_id"] for row in rows}


async def _event_focus_seconds(conn: Any, *, user_id: int, event_id: UUID) -> int:
    row = await conn.fetchrow(
        """
        SELECT COALESCE(SUM(fl.duration), 0)::BIGINT AS seconds
        FROM focus_logs fl
        JOIN tasks t ON t.id = fl.task_id
        WHERE fl.user_id = $1
          AND t.user_id = $1
          AND t.event_id = $2
          AND t.is_deleted = FALSE
        """,
        user_id,
        event_id,
    )
    return int((row or {}).get("seconds") or 0)


async def _global_focus_seconds(conn: Any, *, user_id: int) -> int:
    row = await conn.fetchrow(
        """
        SELECT COALESCE(SUM(duration), 0)::BIGINT AS seconds
        FROM focus_logs
        WHERE user_id = $1
        """,
        user_id,
    )
    return int((row or {}).get("seconds") or 0)


async def _completion_records_for_user(conn: Any, *, user_id: int) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT subject_type, subject_id, completed_at
        FROM completion_records
        WHERE user_id = $1
        ORDER BY completed_at ASC
        """,
        user_id,
    )
    return [dict(row) for row in rows]


async def _focus_activity_dates(conn: Any, *, user_id: int) -> set[date]:
    rows = await conn.fetch(
        """
        SELECT start_time
        FROM focus_logs
        WHERE user_id = $1
        ORDER BY start_time ASC
        """,
        user_id,
    )
    return {row["start_time"].date() for row in rows if row["start_time"] is not None}


async def _event_confirmed_appointment_occurrence_count(conn: Any, *, user_id: int, event_id: UUID) -> int:
    row = await conn.fetchrow(
        """
        SELECT COUNT(*)::BIGINT AS count
        FROM appointment_occurrence_results aor
        JOIN appointments a ON a.id = aor.appointment_id
        WHERE a.user_id = $1
          AND a.event_id = $2
          AND a.is_deleted = FALSE
          AND aor.status = 'attended'
        """,
        user_id,
        event_id,
    )
    return int((row or {}).get("count") or 0)


def _max_consecutive_day_count(days: set[date]) -> int:
    if not days:
        return 0
    longest = 0
    current = 0
    previous: date | None = None
    for day in sorted(days):
        if previous is not None and day == previous + timedelta(days=1):
            current += 1
        else:
            current = 1
        longest = max(longest, current)
        previous = day
    return longest


def _event_completion_records(
    completion_records: list[dict[str, Any]],
    *,
    task_ids: set[UUID],
    appointment_ids: set[UUID],
) -> list[dict[str, Any]]:
    return [
        record
        for record in completion_records
        if (record["subject_type"] == "task" and record["subject_id"] in task_ids)
        or (record["subject_type"] == "appointment" and record["subject_id"] in appointment_ids)
    ]


def _delivery_eve_completed(
    *,
    completion_records: list[dict[str, Any]],
    event_due_at: datetime,
    task_ids: set[UUID],
    appointment_ids: set[UUID],
) -> bool:
    all_subjects = {("task", subject_id) for subject_id in task_ids} | {
        ("appointment", subject_id) for subject_id in appointment_ids
    }
    if not all_subjects:
        return False

    final_window_start = event_due_at - timedelta(hours=24)
    completed_subjects: set[tuple[str, UUID]] = set()
    for record in sorted(completion_records, key=lambda item: item["completed_at"]):
        subject = (record["subject_type"], record["subject_id"])
        if subject not in all_subjects:
            continue
        completed_subjects.add(subject)
        completed_at = record["completed_at"]
        if final_window_start <= completed_at <= event_due_at and completed_subjects >= all_subjects:
            return True
    return False


def _achievement_item(
    *,
    item_id: str,
    title: str,
    description: str,
    current_value: int,
    target_value: int,
) -> AchievementItemOut:
    if current_value >= target_value:
        status: AchievementStatus = "unlocked"
    elif current_value > 0:
        status = "in_progress"
    else:
        status = "locked"
    progress_text = None if status == "unlocked" else f"{current_value} / {target_value}"
    return AchievementItemOut(
        id=item_id,
        title=title,
        description=description,
        status=status,
        current_value=current_value,
        target_value=target_value,
        progress_text=progress_text,
    )


def _section_from_items(
    *,
    title: str,
    summary_text: str | None,
    primary_metric_value: int,
    primary_metric_label: str,
    items: list[AchievementItemOut],
) -> AchievementSectionOut:
    unlocked = [item for item in items if item.status == "unlocked"]
    upcoming = [item for item in items if item.status != "unlocked"]
    return AchievementSectionOut(
        title=title,
        summary_text=summary_text,
        stats=AchievementSectionStatsOut(
            unlocked_count=len(unlocked),
            in_progress_count=len([item for item in items if item.status == "in_progress"]),
            primary_metric_value=primary_metric_value,
            primary_metric_label=primary_metric_label,
        ),
        latest_unlocked=unlocked,
        upcoming=upcoming,
    )


def _normalize_completion_settings(
    *,
    is_recurring: bool,
    period_type: CompletionPeriodType,
    custom_period_days: int | None,
    max_completions_per_period: int,
) -> tuple[bool, CompletionPeriodType, int | None, int]:
    normalized_period_type: CompletionPeriodType = period_type
    normalized_custom_period_days = custom_period_days
    normalized_max = max(1, int(max_completions_per_period))
    normalized_recurring = bool(is_recurring)
    if normalized_period_type == "once":
        normalized_recurring = False
        normalized_custom_period_days = None
    else:
        normalized_recurring = True
    if normalized_period_type != "custom_days":
        normalized_custom_period_days = None
    else:
        normalized_custom_period_days = max(1, int(normalized_custom_period_days or 1))
    return normalized_recurring, normalized_period_type, normalized_custom_period_days, normalized_max


def _resolve_task_due_date(
    *,
    event_row: dict[str, Any] | None,
    due_date: datetime | None,
    time_inherits_from_event: bool,
    time_overridden: bool,
) -> datetime | None:
    if event_row is not None and time_inherits_from_event and not time_overridden:
        return event_row["due_at"]
    return due_date


def _resolve_appointment_ends_at(
    *,
    event_row: dict[str, Any] | None,
    ends_at: datetime | None,
    time_inherits_from_event: bool,
    time_overridden: bool,
) -> datetime | None:
    if event_row is not None and time_inherits_from_event and not time_overridden:
        return event_row["due_at"]
    return ends_at


def _period_bounds(
    *, now: datetime, period_type: CompletionPeriodType, custom_period_days: int | None
) -> tuple[datetime | None, datetime | None]:
    if period_type == "once":
        return None, None
    if period_type == "daily":
        start = datetime(now.year, now.month, now.day, tzinfo=UTC)
        return start, start + timedelta(days=1)
    if period_type == "weekly":
        start = datetime(now.year, now.month, now.day, tzinfo=UTC) - timedelta(days=now.weekday())
        return start, start + timedelta(days=7)
    if period_type == "monthly":
        start = datetime(now.year, now.month, 1, tzinfo=UTC)
        if now.month == 12:
            end = datetime(now.year + 1, 1, 1, tzinfo=UTC)
        else:
            end = datetime(now.year, now.month + 1, 1, tzinfo=UTC)
        return start, end
    days = max(1, int(custom_period_days or 1))
    return now - timedelta(days=days), now


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        next_month = datetime(year + 1, 1, 1, tzinfo=UTC)
    else:
        next_month = datetime(year, month + 1, 1, tzinfo=UTC)
    return (next_month - timedelta(days=1)).day


def _add_months(value: datetime, months: int) -> datetime:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, _days_in_month(year, month))
    return value.replace(year=year, month=month, day=day)


def _copy_time_to_day(day_start: datetime, source: datetime | None) -> datetime:
    if source is None:
        return day_start
    return day_start.replace(
        hour=source.hour,
        minute=source.minute,
        second=source.second,
        microsecond=source.microsecond,
    )


def _task_field(task: Any, key: str) -> Any:
    if isinstance(task, dict):
        return task.get(key)
    return getattr(task, key)


def _next_task_window_after_today(task: Any, *, now: datetime | None = None) -> tuple[datetime, datetime]:
    current = now or datetime.now(UTC)
    today_start = datetime(current.year, current.month, current.day, tzinfo=UTC)
    due_date = _task_field(task, "due_date")
    period_type = _task_field(task, "period_type")
    custom_period_days = _task_field(task, "custom_period_days")
    is_recurring = bool(_task_field(task, "is_recurring"))

    if not is_recurring or period_type == "once":
        next_start = today_start + timedelta(days=1)
        if due_date is not None and due_date >= next_start:
            return next_start, due_date
        return next_start, _copy_time_to_day(next_start, due_date)

    if period_type == "daily":
        next_start = today_start + timedelta(days=1)
        return next_start, _copy_time_to_day(next_start, due_date)

    if period_type == "weekly":
        _, period_end = _period_bounds(now=current, period_type="weekly", custom_period_days=None)
        next_start = period_end or (today_start + timedelta(days=7))
        next_due = due_date + timedelta(days=7) if due_date is not None else next_start
        return next_start, max(next_due, next_start)

    if period_type == "monthly":
        _, period_end = _period_bounds(now=current, period_type="monthly", custom_period_days=None)
        next_start = period_end or _add_months(datetime(current.year, current.month, 1, tzinfo=UTC), 1)
        next_due = _add_months(due_date, 1) if due_date is not None else next_start
        return next_start, max(next_due, next_start)

    days = max(1, int(custom_period_days or 1))
    next_start = today_start + timedelta(days=days)
    next_due = due_date + timedelta(days=days) if due_date is not None else next_start
    return next_start, max(next_due, next_start)


async def _count_completion_records(
    conn: Any,
    *,
    user_id: int,
    subject_type: str,
    subject_id: UUID,
    period_start: datetime | None,
    period_end: datetime | None,
) -> int:
    if period_start is None or period_end is None:
        rows = await conn.fetch(
            """
            SELECT id, completed_at
            FROM completion_records
            WHERE user_id = $1 AND subject_type = $2 AND subject_id = $3
            ORDER BY completed_at ASC
            """,
            user_id,
            subject_type,
            subject_id,
        )
        return len(rows)
    rows = await conn.fetch(
        """
        SELECT id, completed_at
        FROM completion_records
        WHERE user_id = $1
          AND subject_type = $2
          AND subject_id = $3
          AND completed_at >= $4
          AND completed_at < $5
        ORDER BY completed_at ASC
        """,
        user_id,
        subject_type,
        subject_id,
        period_start,
        period_end,
    )
    return len(rows)


async def _build_completion_state(
    conn: Any,
    *,
    user_id: int,
    subject_type: str,
    subject_id: UUID,
    is_recurring: bool,
    period_type: CompletionPeriodType,
    custom_period_days: int | None,
    max_completions_per_period: int,
    weekday_only: bool,
    permanent_done: bool,
    now: datetime | None = None,
) -> CompletionStateOut:
    current = now or datetime.now(UTC)
    if not is_recurring or period_type == "once":
        if permanent_done:
            return CompletionStateOut(
                completion_state="permanent",
                is_completable_now=False,
                completed_count_in_period=1,
                remaining_completions_in_period=0,
                current_period_start=None,
                current_period_end=None,
                blocked_reason="already_completed_once",
                hidden_from_action_list=True,
            )
        return CompletionStateOut(
            completion_state="available",
            is_completable_now=True,
            completed_count_in_period=0,
            remaining_completions_in_period=1,
            current_period_start=None,
            current_period_end=None,
            blocked_reason=None,
            hidden_from_action_list=False,
        )

    period_start, period_end = _period_bounds(
        now=current, period_type=period_type, custom_period_days=custom_period_days
    )
    completed_count = await _count_completion_records(
        conn,
        user_id=user_id,
        subject_type=subject_type,
        subject_id=subject_id,
        period_start=period_start,
        period_end=period_end,
    )
    remaining = max(0, max_completions_per_period - completed_count)
    if weekday_only and current.weekday() >= 5:
        return CompletionStateOut(
            completion_state="blocked",
            is_completable_now=False,
            completed_count_in_period=completed_count,
            remaining_completions_in_period=remaining,
            current_period_start=period_start,
            current_period_end=period_end,
            blocked_reason="not_workday",
            hidden_from_action_list=True,
        )
    if remaining <= 0:
        return CompletionStateOut(
            completion_state="period_complete",
            is_completable_now=False,
            completed_count_in_period=completed_count,
            remaining_completions_in_period=0,
            current_period_start=period_start,
            current_period_end=period_end,
            blocked_reason="period_limit_reached",
            hidden_from_action_list=True,
        )
    return CompletionStateOut(
        completion_state="available",
        is_completable_now=True,
        completed_count_in_period=completed_count,
        remaining_completions_in_period=remaining,
        current_period_start=period_start,
        current_period_end=period_end,
        blocked_reason=None,
        hidden_from_action_list=False,
    )


async def _task_with_completion(
    conn: Any, row: asyncpg.Record | dict[str, Any], *, now: datetime | None = None
) -> TaskOut:
    task = _row_to_task(row)
    task.completion_state = await _build_completion_state(
        conn,
        user_id=task.user_id,
        subject_type="task",
        subject_id=task.id,
        is_recurring=task.is_recurring,
        period_type=task.period_type,
        custom_period_days=task.custom_period_days,
        max_completions_per_period=task.max_completions_per_period,
        weekday_only=task.weekday_only,
        permanent_done=task.status == "done",
        now=now,
    )
    return task


async def _appointment_with_completion(
    conn: Any, row: asyncpg.Record | dict[str, Any], *, now: datetime | None = None
) -> AppointmentOut:
    appointment = _row_to_appointment(row)
    appointment.completion_state = await _build_completion_state(
        conn,
        user_id=appointment.user_id,
        subject_type="appointment",
        subject_id=appointment.id,
        is_recurring=appointment.is_recurring,
        period_type=appointment.period_type,
        custom_period_days=appointment.custom_period_days,
        max_completions_per_period=appointment.max_completions_per_period,
        weekday_only=appointment.weekday_only,
        permanent_done=appointment.status in {"attended", "missed", "cancelled"} and not appointment.is_recurring,
        now=now,
    )
    return appointment


async def _insert_completion_record(
    conn: Any,
    *,
    user_id: int,
    subject_type: str,
    subject_id: UUID,
    completed_at: datetime,
    counted_period_start: datetime | None,
    counted_period_end: datetime | None,
) -> None:
    await conn.execute(
        """
        INSERT INTO completion_records(user_id, subject_type, subject_id, completed_at, counted_period_start, counted_period_end)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        user_id,
        subject_type,
        subject_id,
        completed_at,
        counted_period_start,
        counted_period_end,
    )


def _raise_if_completion_blocked(state: CompletionStateOut, *, noun: str) -> None:
    if state.is_completable_now:
        return
    if state.blocked_reason == "period_limit_reached":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前周期已达完成上限")
    if state.blocked_reason == "not_workday":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前仅工作日可完成")
    if state.blocked_reason == "already_completed_once":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"该{noun}已完成")
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"当前不可完成该{noun}")


async def _propagate_event_due_at(conn: Any, *, user_id: int, event_id: UUID, due_at: datetime) -> None:
    await conn.execute(
        """
        UPDATE tasks
        SET due_date = $1, updated_at = NOW()
        WHERE user_id = $2
          AND event_id = $3
          AND time_inherits_from_event = TRUE
          AND time_overridden = FALSE
          AND is_deleted = FALSE
        """,
        due_at,
        user_id,
        event_id,
    )
    await conn.execute(
        """
        UPDATE appointments
        SET ends_at = $1, updated_at = NOW()
        WHERE user_id = $2
          AND event_id = $3
          AND time_inherits_from_event = TRUE
          AND time_overridden = FALSE
          AND is_deleted = FALSE
        """,
        due_at,
        user_id,
        event_id,
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
    paused_at: datetime | None = None,
) -> int | None:
    """计算当前阶段剩余秒数。"""
    if phase_started_at is None or phase_planned_duration is None:
        return None
    if pending_confirmation:
        return 0
    now_point = paused_at or datetime.now(UTC)
    elapsed = int((now_point - phase_started_at).total_seconds())
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
    if text == "deliberate_group":
        return "deliberate_group"
    return None


def _normalize_timer_mode(value: Any, default: FocusTimerMode = "countdown") -> FocusTimerMode:
    text = str(value or "").strip()
    if text == "countup":
        return "countup"
    if text == "countdown":
        return "countdown"
    return default


def _normalize_focus_work_type(value: Any) -> FocusWorkType | None:
    text = str(value or "").strip()
    if text in {"vocab_today", "review", "practice", "task_focus", "input"}:
        return text  # type: ignore[return-value]
    return None


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


def _phase_timer_mode_value(
    phase: dict[str, Any], *, default_focus_timer_mode: FocusTimerMode = "countdown"
) -> FocusTimerMode:
    if not _phase_is_focus(phase):
        return "countdown"
    return _normalize_timer_mode(phase.get("timer_mode"), default_focus_timer_mode)


def _phase_task_id_value(phase: dict[str, Any]) -> UUID | None:
    if not _phase_is_focus(phase):
        return None
    return _normalize_phase_task_id(phase.get("task_id"))


def _phase_focus_work_type_value(phase: dict[str, Any] | FocusWorkflowPhase) -> FocusWorkType | None:
    if isinstance(phase, FocusWorkflowPhase):
        return phase.focus_work_type
    if not _phase_is_focus(phase):
        return None
    return _normalize_focus_work_type(phase.get("focus_work_type"))


def _bind_first_focus_phase_to_task(phases: list[dict[str, Any]], task_id: UUID) -> list[dict[str, Any]]:
    """Bind an explicit task launch to the first focus phase, ignoring stale preset work bindings."""
    bound_phases: list[dict[str, Any]] = []
    did_bind = False
    for phase in phases:
        next_phase = dict(phase)
        if not did_bind and _phase_is_focus(next_phase):
            next_phase["task_id"] = task_id
            next_phase["focus_work_type"] = None
            did_bind = True
        bound_phases.append(next_phase)
    return bound_phases


def _next_focus_phase_work_type(phases: list[FocusWorkflowPhase], current_phase_index: int) -> FocusWorkType | None:
    next_index = current_phase_index + 1
    if next_index >= len(phases):
        return None
    next_phase = phases[next_index]
    if next_phase.phase_type != "focus":
        return None
    return next_phase.focus_work_type


def _phase_elapsed_seconds(phase_started_at: datetime | None, *, paused_at: datetime | None = None) -> int | None:
    if phase_started_at is None:
        return None
    now_point = paused_at or datetime.now(UTC)
    elapsed = int((now_point - phase_started_at).total_seconds())
    return elapsed if elapsed > 0 else 0


def _should_use_task_focus_runtime(
    *,
    state: str,
    current_phase: FocusWorkflowPhase | None,
    pending_confirmation: bool,
    pending_task_selection: bool,
    task_id: UUID | None,
    runtime_task_id: UUID | None,
    active_focus_work_type: FocusWorkType | None,
) -> bool:
    if state != "focus":
        return False
    if pending_confirmation or pending_task_selection:
        return False
    if current_phase is None or current_phase.phase_type != "focus":
        return False
    if current_phase.focus_work_type is not None:
        return False
    if active_focus_work_type is not None and active_focus_work_type != "task_focus":
        return False
    return task_id is not None or runtime_task_id is not None


def _focus_work_type_for_task_row(task_row: Any | None) -> FocusWorkType:
    if task_row is None:
        return "task_focus"
    app_task_type = _record_get(task_row, "app_task_type")
    if app_task_type == "vocab_today":
        return "vocab_today"
    if app_task_type == "review":
        return "review"
    if app_task_type == "practice":
        return "practice"
    return "task_focus"


def _to_jsonb_param(value: Any) -> str:
    """将值转换为可绑定到 jsonb 的字符串参数。"""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


def _record_get(row: Any, key: str, default: Any = None) -> Any:
    if hasattr(row, "get"):
        return row.get(key, default)
    try:
        return row[key]
    except (KeyError, IndexError, TypeError):
        return default


def _row_to_focus_work_run_summary(row: asyncpg.Record | dict[str, Any]) -> FocusWorkRunSummaryOut:
    progress_snapshot = _record_get(row, "progress_snapshot")
    if isinstance(progress_snapshot, str):
        try:
            progress_snapshot = json.loads(progress_snapshot)
        except json.JSONDecodeError:
            progress_snapshot = None
    if not isinstance(progress_snapshot, dict):
        progress_snapshot = None
    config_snapshot = _record_get(row, "config_snapshot")
    if isinstance(config_snapshot, str):
        try:
            config_snapshot = json.loads(config_snapshot)
        except json.JSONDecodeError:
            config_snapshot = None
    if not isinstance(config_snapshot, dict):
        config_snapshot = None
    return FocusWorkRunSummaryOut(
        id=_record_get(row, "id"),
        workflow_id=_record_get(row, "workflow_id"),
        phase_index=_safe_int(_record_get(row, "phase_index"), 0),
        task_id=_record_get(row, "task_id"),
        focus_work_type=_normalize_focus_work_type(_record_get(row, "focus_work_type")) or "task_focus",
        app_id=_record_get(row, "app_id"),
        app_task_type=_record_get(row, "app_task_type"),
        counts_for_task_completion=bool(_record_get(row, "counts_for_task_completion", True)),
        status=_record_get(row, "status"),
        progress_snapshot=progress_snapshot,
        config_snapshot=config_snapshot,
        completion_reason=_record_get(row, "completion_reason"),
        source_run_id=_record_get(row, "source_run_id"),
    )


async def _fetch_focus_work_run_summary(
    conn: Any,
    *,
    user_id: int,
    run_id: UUID,
) -> FocusWorkRunSummaryOut | None:
    row = await conn.fetchrow(
        """
        SELECT id, workflow_id, phase_index, task_id, focus_work_type, app_id, app_task_type,
               counts_for_task_completion, status, progress_snapshot, config_snapshot,
               completion_reason, source_run_id
        FROM focus_work_runs
        WHERE id = $1 AND user_id = $2
        """,
        run_id,
        user_id,
    )
    return _row_to_focus_work_run_summary(row) if row is not None else None


async def _fetch_active_focus_work_run(
    conn: Any,
    *,
    user_id: int,
    workflow_id: UUID,
) -> FocusWorkRunSummaryOut | None:
    row = await conn.fetchrow(
        """
        SELECT id, workflow_id, phase_index, task_id, focus_work_type, app_id, app_task_type,
               counts_for_task_completion, status, progress_snapshot, config_snapshot,
               completion_reason, source_run_id
        FROM focus_work_runs
        WHERE user_id = $1
          AND workflow_id = $2
          AND status IN ('running', 'paused', 'content_completed')
        ORDER BY created_at DESC
        LIMIT 1
        """,
        user_id,
        workflow_id,
    )
    return _row_to_focus_work_run_summary(row) if row is not None else None


async def _create_focus_work_run(
    conn: Any,
    *,
    user_id: int,
    workflow_id: UUID,
    phase_index: int,
    task_id: UUID | None,
    focus_work_type: FocusWorkType,
    app_id: str | None,
    app_task_type: str | None,
    counts_for_task_completion: bool,
    record_focus: bool,
    config_snapshot: dict[str, Any],
    source_run_id: UUID | None = None,
) -> FocusWorkRunSummaryOut:
    row = await conn.fetchrow(
        """
        INSERT INTO focus_work_runs(
            user_id, workflow_id, phase_index, task_id, focus_work_type, app_id, app_task_type,
            counts_for_task_completion, status, record_focus, config_snapshot, source_run_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'running', $9, $10::jsonb, $11)
        RETURNING id, workflow_id, phase_index, task_id, focus_work_type, app_id, app_task_type,
                  counts_for_task_completion, status, progress_snapshot, config_snapshot,
                  completion_reason, source_run_id
        """,
        user_id,
        workflow_id,
        phase_index,
        task_id,
        focus_work_type,
        app_id,
        app_task_type,
        counts_for_task_completion,
        record_focus,
        _to_jsonb_param(config_snapshot),
        source_run_id,
    )
    if row is None:
        raise HTTPException(status_code=500, detail="创建专注工作轮次失败")
    return _row_to_focus_work_run_summary(row)


async def _set_workflow_active_run(
    conn: Any,
    *,
    workflow_id: UUID,
    run_id: UUID | None,
    phase_runtime_state: str | None,
    before_timeout_state: str | None = None,
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        UPDATE focus_workflows
        SET active_run_id = $1,
            phase_runtime_state = $2,
            phase_runtime_state_before_timeout_prompt = $3,
            updated_at = NOW()
        WHERE id = $4
        RETURNING id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                  focus_duration, break_duration, current_phase, phase_started_at,
                  phase_planned_duration, pending_confirmation, pending_task_selection,
                  active_focus_work_type, focus_work_display_state, focus_work_result,
                  focus_work_progress_snapshot, is_paused, paused_at, record_focus,
                  active_run_id, phase_runtime_state, phase_runtime_state_before_timeout_prompt
        """,
        run_id,
        phase_runtime_state,
        before_timeout_state,
        workflow_id,
    )


async def _mark_focus_work_run_content_completed(
    conn: Any,
    *,
    user_id: int,
    run_id: UUID,
    progress_snapshot: dict[str, Any],
) -> FocusWorkRunSummaryOut:
    row = await conn.fetchrow(
        """
        UPDATE focus_work_runs
        SET status = 'content_completed',
            progress_snapshot = $1::jsonb,
            paused_at = NULL,
            updated_at = NOW()
        WHERE id = $2
          AND user_id = $3
          AND status IN ('running', 'paused')
        RETURNING id, workflow_id, phase_index, task_id, focus_work_type, app_id, app_task_type,
                  counts_for_task_completion, status, progress_snapshot, config_snapshot,
                  completion_reason, source_run_id
        """,
        _to_jsonb_param(progress_snapshot),
        run_id,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前轮次无法标记为内容完成")
    return _row_to_focus_work_run_summary(row)


async def _complete_focus_work_run(
    conn: Any,
    *,
    user_id: int,
    run_id: UUID,
    completion_reason: str,
) -> FocusWorkRunSummaryOut:
    row = await conn.fetchrow(
        """
        UPDATE focus_work_runs
        SET status = 'completed',
            completion_reason = $1,
            ended_at = COALESCE(ended_at, NOW()),
            paused_at = NULL,
            updated_at = NOW()
        WHERE id = $2
          AND user_id = $3
          AND status IN ('running', 'paused', 'content_completed')
        RETURNING id, workflow_id, phase_index, task_id, focus_work_type, app_id, app_task_type,
                  counts_for_task_completion, status, progress_snapshot, config_snapshot,
                  completion_reason, source_run_id
        """,
        completion_reason,
        run_id,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前轮次无法正常完成")
    return _row_to_focus_work_run_summary(row)


async def _abandon_active_focus_work_run(
    conn: Any,
    *,
    user_id: int,
    workflow_id: UUID,
) -> None:
    await conn.execute(
        """
        UPDATE focus_work_runs
        SET status = 'abandoned',
            completion_reason = 'phase_abandoned',
            ended_at = COALESCE(ended_at, NOW()),
            paused_at = NULL,
            updated_at = NOW()
        WHERE user_id = $1
          AND workflow_id = $2
          AND status IN ('running', 'paused', 'content_completed')
        """,
        user_id,
        workflow_id,
    )


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
                focus_work_type = phase.focus_work_type
                is_temporary = bool(phase.is_temporary)
                record_focus = bool(phase.record_focus)
                config_ids = phase.config_ids if isinstance(phase.config_ids, list) else None
                config_names = phase.config_names if isinstance(phase.config_names, list) else None
            elif isinstance(phase, dict):
                phase_type = str(phase.get("phase_type") or "").strip()
                duration = _parse_duration(phase.get("duration"))
                timer_mode = phase.get("timer_mode")
                task_id = phase.get("task_id")
                focus_work_type = phase.get("focus_work_type")
                is_temporary = bool(phase.get("is_temporary", False))
                record_focus = bool(phase.get("record_focus", True))
                config_ids = phase.get("config_ids") if isinstance(phase.get("config_ids"), list) else None
                config_names = phase.get("config_names") if isinstance(phase.get("config_names"), list) else None
            else:
                continue
            normalized: dict[str, Any] = {"phase_type": phase_type, "duration": duration}
            if phase_type == "focus":
                normalized["timer_mode"] = _normalize_timer_mode(timer_mode, default_focus_timer_mode)
                normalized["task_id"] = _phase_task_id_value({"phase_type": "focus", "task_id": task_id})
                normalized["focus_work_type"] = _normalize_focus_work_type(focus_work_type)
                normalized["is_temporary"] = is_temporary
                normalized["record_focus"] = record_focus
                if isinstance(phase, dict):
                    for key in (
                        "deck_id",
                        "target_word_count",
                        "daily_target_count",
                        "set_id",
                        "article_set_id",
                        "input_bank_id",
                        "target_question_count",
                        "daily_question_target",
                        "target_article_count",
                        "daily_article_target",
                        "task_title",
                        "choice_scope",
                        "choice_completion",
                        "deliberate_run_id",
                        "deliberate_config_id",
                        "deliberate_kind",
                        "deliberate_name",
                    ):
                        if key in phase:
                            normalized[key] = phase[key]
            elif phase_type == "deliberate_group":
                normalized["timer_mode"] = None
                normalized["task_id"] = None
                normalized["focus_work_type"] = None
                normalized["is_temporary"] = is_temporary
                normalized["record_focus"] = record_focus
                normalized["config_ids"] = config_ids
                normalized["config_names"] = config_names
            items.append(normalized)
    if not items:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="工作流至少需要一个阶段")
    for idx, phase in enumerate(items):
        phase_type = phase["phase_type"]
        duration = int(phase["duration"])
        if phase_type not in {"focus", "break", "deliberate_group"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="阶段类型必须是 focus、break 或 deliberate_group"
            )
        if duration < 60:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="阶段时长不能小于 60 秒")
        if phase_type == "break":
            phase["timer_mode"] = None
            phase["task_id"] = None
            phase["focus_work_type"] = None
            phase["is_temporary"] = False
            phase["record_focus"] = True
        if phase_type != "deliberate_group" and idx > 0 and items[idx - 1]["phase_type"] == phase_type:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="相邻阶段必须交替 focus/break"
            )
    if items[0]["phase_type"] not in {"focus", "deliberate_group"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="工作流必须以 focus 或 deliberate_group 阶段开始")
    return items


def _phase_models_from_row(row: asyncpg.Record) -> list[FocusWorkflowPhase]:
    raw = row.get("phases", []) if hasattr(row, "get") else row["phases"] if "phases" in row else []
    default_focus_timer_mode = _normalize_timer_mode(
        row.get("default_focus_timer_mode", "countdown")
        if hasattr(row, "get")
        else row.get("default_focus_timer_mode", "countdown"),  # type: ignore[arg-type]
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
                    raw_config_ids = phase.get("config_ids")
                    raw_config_names = phase.get("config_names")
                    timer_mode_val = (
                        _phase_timer_mode_value(phase, default_focus_timer_mode=default_focus_timer_mode)
                        if phase_type == "focus"
                        else None
                    )
                    task_id_val = _phase_task_id_value(phase) if phase_type == "focus" else None
                    focus_work_type_val = _phase_focus_work_type_value(phase) if phase_type == "focus" else None
                    is_temporary_val = bool(phase.get("is_temporary", False)) if phase_type == "focus" else False
                    record_focus_val = bool(phase.get("record_focus", True))
                    config_ids_val = raw_config_ids if isinstance(raw_config_ids, list) else None
                    config_names_val = raw_config_names if isinstance(raw_config_names, list) else None

                    extra_fields = {}
                    for key in (
                        "deck_id", "target_word_count", "daily_target_count", "set_id",
                        "article_set_id", "input_bank_id", "target_question_count",
                        "daily_question_target", "target_article_count", "daily_article_target",
                        "task_title", "choice_scope", "choice_completion",
                        "deliberate_run_id", "deliberate_config_id", "deliberate_kind", "deliberate_name",
                        "config_id",
                    ):
                        if key in phase:
                            extra_fields[key] = phase[key]

                    phases.append(
                        FocusWorkflowPhase(
                            phase_type=phase_type,
                            duration=duration,
                            timer_mode=timer_mode_val,
                            task_id=task_id_val,
                            focus_work_type=focus_work_type_val,
                            is_temporary=is_temporary_val,
                            record_focus=record_focus_val,
                            config_ids=config_ids_val,
                            config_names=config_names_val,
                            **extra_fields,
                        )
                    )
    return phases


def _phase_at_index(phases: list[FocusWorkflowPhase], index: int | None) -> FocusWorkflowPhase | None:
    if index is None:
        return None
    if index < 0 or index >= len(phases):
        return None
    return phases[index]


async def _check_task_completion_status(
    conn: Any,
    user_id: int,
    task_id: UUID | None,
) -> tuple[bool, str | None]:
    """Check if the task is already completed today or has reached its completion limit.
    Returns:
        (is_task_completed_today, task_blocked_reason)
    """
    if task_id is None:
        return False, None

    # Query task details from database
    row = await conn.fetchrow(
        """
        SELECT id, user_id, status, is_recurring, period_type, custom_period_days, max_completions_per_period, weekday_only
        FROM tasks
        WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
        """,
        task_id,
        user_id,
    )
    if row is None:
        return False, None

    def safe_get(r, key, default=None):
        if hasattr(r, "get"):
            return r.get(key, default)
        try:
            return r[key]
        except (KeyError, TypeError):
            return default

    state = await _build_completion_state(
        conn,
        user_id=user_id,
        subject_type="task",
        subject_id=safe_get(row, "id", task_id),
        is_recurring=bool(safe_get(row, "is_recurring", False)),
        period_type=safe_get(row, "period_type", "once"),
        custom_period_days=safe_get(row, "custom_period_days"),
        max_completions_per_period=int(safe_get(row, "max_completions_per_period", 1)),
        weekday_only=bool(safe_get(row, "weekday_only", False)),
        permanent_done=safe_get(row, "status") == "done",
    )

    return not state.is_completable_now, state.blocked_reason


def _row_to_focus_workflow(
    row: asyncpg.Record | None,
    *,
    task_title: str | None = None,
    task_source_type: str | None = None,
    task_app_id: str | None = None,
    task_app_task_type: str | None = None,
    task_app_config_id: UUID | None = None,
    completed_workflow_name: str | None = None,
    is_task_completed_today: bool = False,
    task_blocked_reason: str | None = None,
    active_run: FocusWorkRunSummaryOut | None = None,
    effective_phase_runtime_state: str | None = None,
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
    pending_task_selection = bool(row.get("pending_task_selection", False) if hasattr(row, "get") else False)
    paused_at = _record_get(row, "paused_at")
    is_paused = bool(_record_get(row, "is_paused", False))
    elapsed_seconds = _phase_elapsed_seconds(started, paused_at=paused_at) if not pending_task_selection else None
    current_phase_timer_mode = current_phase.timer_mode if current_phase is not None else None
    workflow_name = (
        str(row.get("workflow_name", "默认工作流"))
        if hasattr(row, "get")
        else str(row["workflow_name"] or "默认工作流")
    )
    runtime_task_id = _record_get(row, "runtime_task_id")
    task_id = _record_get(row, "task_id")
    phase_runtime_state = effective_phase_runtime_state if effective_phase_runtime_state is not None else _record_get(row, "phase_runtime_state")
    phase_runtime_state_before_timeout_prompt = _record_get(row, "phase_runtime_state_before_timeout_prompt")
    active_run_id = _record_get(row, "active_run_id")
    active_focus_work_type = _normalize_focus_work_type(_record_get(row, "active_focus_work_type"))
    focus_work_display_state = _record_get(row, "focus_work_display_state")
    if focus_work_display_state not in {"fullscreen", "minimized", "closed"}:
        focus_work_display_state = None
    if _should_use_task_focus_runtime(
        state=str(row["current_phase"]),
        current_phase=current_phase,
        pending_confirmation=pending,
        pending_task_selection=pending_task_selection,
        task_id=task_id,
        runtime_task_id=runtime_task_id,
        active_focus_work_type=active_focus_work_type,
    ):
        active_focus_work_type = "task_focus"
        if focus_work_display_state is None:
            focus_work_display_state = "fullscreen"
    next_focus_work_type = _next_focus_phase_work_type(phases, current_phase_index)
    has_minimized_work = focus_work_display_state == "minimized" and active_focus_work_type is not None
    return FocusWorkflowOut(
        state=row["current_phase"],
        workflow_name=workflow_name,
        current_phase_index=current_phase_index,
        phases=phases,
        task_id=task_id,
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
            paused_at=paused_at if is_paused else None,
        )
        if current_phase_timer_mode != "countup"
        else None,
        runtime_task_id=runtime_task_id,
        completed_workflow_name=completed_workflow_name,
        active_focus_work_type=active_focus_work_type,
        focus_work_display_state=focus_work_display_state,
        next_focus_work_type=next_focus_work_type,
        has_minimized_work=has_minimized_work,
        is_paused=is_paused,
        record_focus=bool(_record_get(row, "record_focus", True)),
        active_task_source_type=task_source_type,
        active_task_app_id=task_app_id,
        active_task_app_task_type=task_app_task_type,
        active_task_app_config_id=task_app_config_id,
        is_task_completed_today=is_task_completed_today,
        task_blocked_reason=task_blocked_reason,
        phase_runtime_state=phase_runtime_state,
        phase_runtime_state_before_timeout_prompt=phase_runtime_state_before_timeout_prompt,
        active_run_id=active_run_id,
        active_run=active_run,
    )


def _row_to_focus_workflow_preset(row: asyncpg.Record) -> FocusWorkflowPresetOut:
    phases = _phase_models_from_row(row)
    if not phases:
        phases = _normalize_workflow_phases(
            None,
            fallback_focus_duration=int(row["focus_duration"]),
            fallback_break_duration=int(row["break_duration"]),
        )
        phases = [
            FocusWorkflowPhase(phase_type=phase["phase_type"], duration=int(phase["duration"])) for phase in phases
        ]
    return FocusWorkflowPresetOut(
        id=row["id"],
        user_id=int(row["user_id"]),
        event_id=row.get("event_id") if hasattr(row, "get") else row["event_id"] if "event_id" in row else None,
        event_name=row.get("event_name") if hasattr(row, "get") else row["event_name"] if "event_name" in row else None,
        name=str(row["name"]),
        icon=row.get("icon") if hasattr(row, "get") else row["icon"] if "icon" in row else None,
        focus_duration=int(row["focus_duration"]),
        break_duration=int(row["break_duration"]),
        default_focus_timer_mode=_normalize_timer_mode(
            row.get("default_focus_timer_mode", "countdown") if hasattr(row, "get") else "countdown"
        ),
        phases=phases,
        is_default=bool(row["is_default"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _get_default_focus_workflow_preset(conn: Any, user_id: int) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT id, user_id, event_id, name, focus_duration, break_duration, default_focus_timer_mode, phases, is_default, created_at, updated_at
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
        SELECT id, status, is_deleted, title, source_type, app_id, app_task_type, app_config_id,
               app_instance_key, managed_by_app
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
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="绑定任务必须是未完成任务"
                )
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


async def _start_focus_app_work_log(
    conn: Any,
    user_id: int,
    workflow_id: UUID,
    focus_work_type: FocusWorkType,
    record_focus: bool,
) -> None:
    if not record_focus:
        return
    await conn.execute(
        """
        INSERT INTO focus_app_work_logs(user_id, workflow_id, focus_work_type, duration, start_time, end_at, record_focus)
        VALUES ($1, $2, $3, 0, NOW(), NULL, TRUE)
        ON CONFLICT DO NOTHING
        """,
        int(user_id),
        workflow_id,
        focus_work_type,
    )


async def _close_open_focus_app_work_log(
    conn: Any,
    user_id: int,
    *,
    result: str,
    progress_snapshot: dict[str, Any],
) -> dict[str, Any] | None:
    open_row = await conn.fetchrow(
        """
        SELECT id, start_time
        FROM focus_app_work_logs
        WHERE user_id = $1 AND end_at IS NULL AND record_focus = TRUE
        """,
        int(user_id),
    )
    if open_row is None:
        return None
    now = datetime.now(UTC)
    dur = int((now - open_row["start_time"]).total_seconds())
    if dur < 0:
        dur = 0
    row = await conn.fetchrow(
        """
        UPDATE focus_app_work_logs
        SET end_at = NOW(), duration = $1, result = $2, progress_snapshot = $3::jsonb
        WHERE id = $4
        RETURNING id, duration, focus_work_type, result, progress_snapshot
        """,
        dur,
        result,
        _to_jsonb_param(progress_snapshot),
        open_row["id"],
    )
    if row is None:
        return None
    return {
        "id": row["id"],
        "duration": int(row["duration"]),
        "focus_work_type": row["focus_work_type"],
        "result": row["result"],
        "progress_snapshot": row["progress_snapshot"],
    }


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


async def _set_workflow_waiting_for_task(
    conn: Any, workflow_id: UUID, phase_index: int, phase: dict[str, Any]
) -> asyncpg.Record | None:
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
            is_paused = FALSE,
            paused_at = NULL,
            active_focus_work_type = NULL,
            focus_work_display_state = NULL,
            focus_work_result = NULL,
            focus_work_progress_snapshot = NULL,
            active_run_id = NULL,
            phase_runtime_state = 'pending_task_selection',
            phase_runtime_state_before_timeout_prompt = NULL,
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
               phase_planned_duration, pending_confirmation, pending_task_selection,
               active_focus_work_type, focus_work_display_state, focus_work_result,
               focus_work_progress_snapshot, is_paused, paused_at, record_focus,
               active_run_id, phase_runtime_state, phase_runtime_state_before_timeout_prompt
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
    active_focus_work_type: FocusWorkType | None = None,
    focus_work_display_state: str | None = None,
    record_focus: bool = True,
    phase_runtime_state: str | None = None,
) -> asyncpg.Record | None:
    next_phase_runtime_state = phase_runtime_state
    if next_phase_runtime_state is None:
        if pending_task_selection:
            next_phase_runtime_state = "pending_task_selection"
        elif str(phase["phase_type"]) == "break":
            next_phase_runtime_state = "break_running"
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
            is_paused = FALSE,
            paused_at = NULL,
            active_focus_work_type = $7,
            focus_work_display_state = $8,
            focus_work_result = NULL,
            focus_work_progress_snapshot = NULL,
            record_focus = $9,
            active_run_id = NULL,
            phase_runtime_state = $10,
            phase_runtime_state_before_timeout_prompt = NULL,
            updated_at = NOW()
        WHERE id = $11
        """,
        str(phase["phase_type"]),
        int(phase_index),
        task_id,
        runtime_task_id,
        int(phase["duration"]),
        pending_task_selection,
        active_focus_work_type,
        focus_work_display_state,
        bool(record_focus),
        next_phase_runtime_state,
        workflow_id,
    )
    return await conn.fetchrow(
        """
        SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
               focus_duration, break_duration, current_phase, phase_started_at,
               phase_planned_duration, pending_confirmation, pending_task_selection,
               active_focus_work_type, focus_work_display_state,
               is_paused, paused_at, record_focus,
               active_run_id, phase_runtime_state, phase_runtime_state_before_timeout_prompt
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
    start_index = (
        _safe_int(
            workflow_row.get("current_phase_index", 0)
            if hasattr(workflow_row, "get")
            else workflow_row["current_phase_index"],
            0,
        )
        + 1
    )
    workflow_id = workflow_row["id"]
    workflow_name = str(workflow_row["workflow_name"] or "工作流")
    current_task_title: str | None = None
    current_task_id = (workflow_row.get("runtime_task_id") if hasattr(workflow_row, "get") else None) or (
        workflow_row.get("task_id") if hasattr(workflow_row, "get") else workflow_row["task_id"]
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
            is_task_completed_today = False
            task_blocked_reason = None
            if current_task_id is not None:
                is_task_completed_today, task_blocked_reason = await _check_task_completion_status(
                    conn, user_id, current_task_id
                )
            return _row_to_focus_workflow(
                next_row,
                task_title=current_task_title,
                is_task_completed_today=is_task_completed_today,
                task_blocked_reason=task_blocked_reason,
            )
        phase_focus_work_type = _phase_focus_work_type_value(phase)
        if phase_focus_work_type is not None:
            record_focus = bool(phase.get("record_focus", True))
            next_row = await _set_workflow_current_phase(
                conn,
                workflow_id,
                phase_index=idx,
                phase=phase,
                task_id=None,
                runtime_task_id=None,
                pending_task_selection=False,
                active_focus_work_type=phase_focus_work_type,
                focus_work_display_state="fullscreen",
                record_focus=record_focus,
            )
            return _row_to_focus_workflow(next_row, task_title=None)
        phase_task_id = _phase_task_id_value(phase)
        task_row = await _get_bindable_task(conn, user_id, phase_task_id)
        if phase_task_id is not None and (
            task_row is None or bool(task_row["is_deleted"]) or str(task_row["status"]) == "done"
        ):
            continue
        if phase_task_id is None:
            next_row = await _set_workflow_waiting_for_task(conn, workflow_id, idx, phase)
            return _row_to_focus_workflow(next_row, task_title=None)
        focus_work_type = _focus_work_type_for_task_row(task_row)
        next_row = await _set_workflow_current_phase(
            conn,
            workflow_id,
            phase_index=idx,
            phase=phase,
            task_id=task_row["id"],
            runtime_task_id=task_row["id"],
            pending_task_selection=False,
            active_focus_work_type=focus_work_type,
            focus_work_display_state="fullscreen",
        )
        await _start_focus_log_for_task(conn, user_id, task_row["id"])
        is_task_completed_today, task_blocked_reason = await _check_task_completion_status(
            conn, user_id, task_row["id"]
        )
        return _row_to_focus_workflow(
            next_row,
            task_title=str(task_row["title"]),
            task_source_type=_record_get(task_row, "source_type"),
            task_app_id=_record_get(task_row, "app_id"),
            task_app_task_type=_record_get(task_row, "app_task_type"),
            task_app_config_id=_record_get(task_row, "app_config_id"),
            is_task_completed_today=is_task_completed_today,
            task_blocked_reason=task_blocked_reason,
        )
    return await _complete_focus_workflow(conn, workflow_id, workflow_name)


async def _sync_active_focus_workflow(conn: Any, user_id: int) -> asyncpg.Record | None:
    """同步活动工作流状态，包括 countup 上限、任务失效与待选任务状态。"""
    row = await conn.fetchrow(
        """
        SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
               focus_duration, break_duration, current_phase, phase_started_at,
               phase_planned_duration, pending_confirmation, pending_task_selection,
               active_focus_work_type, focus_work_display_state, focus_work_result,
               focus_work_progress_snapshot, is_paused, paused_at, record_focus,
               active_run_id, phase_runtime_state, phase_runtime_state_before_timeout_prompt
        FROM focus_workflows
        WHERE user_id = $1 AND status = 'active'
        """,
        int(user_id),
    )
    if row is None:
        return None
    if bool(_record_get(row, "is_paused", False)):
        return row
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
        if _phase_focus_work_type_value(current_phase) is not None or _record_get(row, "active_focus_work_type") is not None:
            pass
        else:
            runtime_task_id = row.get("runtime_task_id") if hasattr(row, "get") else None
            effective_task_id = runtime_task_id or _phase_task_id_value(current_phase) or row["task_id"]
            if effective_task_id is None:
                return await _set_workflow_waiting_for_task(conn, row["id"], current_index, current_phase)
            task_row = await _get_bindable_task(conn, user_id, effective_task_id)
            if task_row is None or bool(task_row["is_deleted"]) or str(task_row["status"]) == "done":
                await _close_open_focus_log(conn, int(user_id))
                advanced = await _advance_focus_workflow_to_next_phase(conn, row, int(user_id), skip_breaks=True)
                return (
                    None
                    if advanced.state == "normal"
                    else await conn.fetchrow(
                        """
                SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                       focus_duration, break_duration, current_phase, phase_started_at,
                       phase_planned_duration, pending_confirmation, pending_task_selection,
                       active_focus_work_type, focus_work_display_state, focus_work_result,
                       focus_work_progress_snapshot, is_paused, paused_at, record_focus
                FROM focus_workflows
                WHERE user_id = $1 AND status = 'active'
                """,
                        int(user_id),
                    )
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
        await _close_open_focus_app_work_log(conn, int(user_id), result="interrupted", progress_snapshot={})
        advanced = await _advance_focus_workflow_to_next_phase(conn, row, int(user_id), skip_breaks=False)
        return (
            None
            if advanced.state == "normal"
            else await conn.fetchrow(
                """
            SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                   focus_duration, break_duration, current_phase, phase_started_at,
                   phase_planned_duration, pending_confirmation, pending_task_selection,
                   active_focus_work_type, focus_work_display_state, focus_work_result,
                   focus_work_progress_snapshot, is_paused, paused_at, record_focus
            FROM focus_workflows
            WHERE user_id = $1 AND status = 'active'
            """,
                int(user_id),
            )
        )
    if current_phase_type == "focus" and timer_mode == "countdown":
        if elapsed < phase_planned_duration:
            return row
        phase_runtime_state = _record_get(row, "phase_runtime_state")
        if phase_runtime_state == "phase_time_expired_prompt":
            return row
        if phase_runtime_state in {
            "running_run",
            "counted_run_completed_confirming",
            "extra_run_completed",
            "task_already_completed",
        }:
            return await conn.fetchrow(
                """
                UPDATE focus_workflows
                SET phase_runtime_state = 'phase_time_expired_prompt',
                    phase_runtime_state_before_timeout_prompt = $1,
                    updated_at = NOW()
                WHERE id = $2
                RETURNING id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                          focus_duration, break_duration, current_phase, phase_started_at,
                          phase_planned_duration, pending_confirmation, pending_task_selection,
                          active_focus_work_type, focus_work_display_state, focus_work_result,
                          focus_work_progress_snapshot, is_paused, paused_at, record_focus,
                          active_run_id, phase_runtime_state, phase_runtime_state_before_timeout_prompt
                """,
                phase_runtime_state,
                row["id"],
            )
        await _close_open_focus_log(conn, int(user_id))
        await _close_open_focus_app_work_log(conn, int(user_id), result="interrupted", progress_snapshot={})
        advanced = await _advance_focus_workflow_to_next_phase(conn, row, int(user_id), skip_breaks=False)
        return (
            None
            if advanced.state == "normal"
            else await conn.fetchrow(
                """
            SELECT id, user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                   focus_duration, break_duration, current_phase, phase_started_at,
                   phase_planned_duration, pending_confirmation, pending_task_selection,
                   active_focus_work_type, focus_work_display_state, focus_work_result,
                   focus_work_progress_snapshot, is_paused, paused_at, record_focus
            FROM focus_workflows
            WHERE user_id = $1 AND status = 'active'
            """,
                int(user_id),
            )
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
        await _close_open_focus_app_work_log(conn, int(user_id), result="interrupted", progress_snapshot={})
    return await conn.fetchrow(
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


def _normalize_focus_end_at(body: FocusLogCreateRequest) -> datetime:
    """规范化并校验 focus log 的 end_at。"""
    if body.end_at is None:
        return body.start_time + timedelta(seconds=body.duration)
    return body.end_at


async def _stop_active_focus(conn: Any, user_id: int) -> None:
    """结束当前用户的活动专注及工作流。"""
    workflow_row = await conn.fetchrow(
        "SELECT id FROM focus_workflows WHERE user_id = $1 AND status = 'active'",
        user_id,
    )
    await _close_open_focus_app_work_log(conn, int(user_id), result="abandoned", progress_snapshot={})
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
    task_focus_work_type: FocusWorkType | None = None,
) -> asyncpg.Record:
    """创建活动工作流并进入 focus 阶段。"""
    first_phase = phases[0]
    first_focus_work_type = _phase_focus_work_type_value(first_phase)
    if first_focus_work_type is None and _phase_is_focus(first_phase) and task_id is not None:
        first_focus_work_type = task_focus_work_type or "task_focus"
    first_record_focus = bool(first_phase.get("record_focus", True))
    first_focus_work_display_state = "fullscreen" if first_focus_work_type is not None else None
    try:
        workflow_row = await conn.fetchrow(
            """
            INSERT INTO focus_workflows(
                user_id, task_id, runtime_task_id, workflow_name, phases, current_phase_index,
                focus_duration, break_duration, current_phase, phase_started_at,
                phase_planned_duration, pending_confirmation, pending_task_selection, status,
                active_focus_work_type, focus_work_display_state, focus_work_result,
                focus_work_progress_snapshot, is_paused, paused_at, record_focus
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, 0, $6, $7, $8, NOW(), $9, FALSE, FALSE, 'active',
                    $10, $11, NULL, NULL, FALSE, NULL, $12)
            RETURNING id
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
            first_focus_work_type,
            first_focus_work_display_state,
            first_record_focus,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="已有活动工作流")
    if workflow_row is None:
        raise HTTPException(status_code=500, detail="开始工作流失败")
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


__all__ = [name for name in globals() if name.startswith("_")] + ["UTC", "COUNTUP_PHASE_CAP_SECONDS"]
