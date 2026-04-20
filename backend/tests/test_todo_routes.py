from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.auth_routes import get_current_user
from routes.todo_routes import _next_task_window_after_today, router


@dataclass
class _DummyUser:
    id: int = 7


class _TxCtx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None


class _AcquireCtx:
    def __init__(self, conn: _FakeTodoConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeTodoConn:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class _FakeTodoConn:
    def __init__(self) -> None:
        self.stats_rows: list[dict[str, Any]] = []
        self.events: list[dict[str, Any]] = []
        self.tasks: list[dict[str, Any]] = []
        self.appointments: list[dict[str, Any]] = []
        self.appointment_occurrence_results: list[dict[str, Any]] = []
        self.completion_records: list[dict[str, Any]] = []

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        if "WITH bounds AS" in sql and "FROM log_durations ld" in sql:
            # Check user_id
            if args[0] != 7:
                return []
            return self.stats_rows
        if "FROM events" in sql and "ORDER BY due_at ASC" in sql:
            user_id = args[0]
            rows = [event for event in self.events if event["user_id"] == user_id]
            return sorted(rows, key=lambda event: (event["due_at"], -event["created_at"].timestamp()))
        if "FROM tasks" in sql and "calendar range endpoint" in sql:
            user_id, range_start, range_end = args
            rows = []
            for task in self.tasks:
                if task["user_id"] != user_id or task["is_deleted"]:
                    continue
                start = task["start_date"]
                due = task["due_date"]
                overlaps = False
                if start is not None and due is not None:
                    overlaps = start < range_end and due >= range_start
                elif start is not None:
                    overlaps = range_start <= start < range_end
                elif due is not None:
                    overlaps = range_start <= due < range_end
                if overlaps:
                    rows.append(task)
            return sorted(
                rows,
                key=lambda task: (
                    0 if task["status"] != "done" else 1,
                    -task["priority"],
                    task["due_date"] or datetime.max.replace(tzinfo=UTC),
                    task["updated_at"],
                ),
            )
        if "FROM appointments" in sql and "ORDER BY ends_at ASC" in sql:
            user_id = args[0]
            only_needs_confirmation = "needs_confirmation filter" in sql
            only_repeating = "repeat filter" in sql
            only_today = "today filter" in sql
            now = datetime.now(UTC)
            today = now.date()
            rows = []
            for appointment in self.appointments:
                if appointment["user_id"] != user_id or appointment["is_deleted"]:
                    continue
                ends_at = appointment["ends_at"]
                stored_status = appointment["status"]
                derived_status = "needs_confirmation" if stored_status == "pending" and ends_at <= now else stored_status
                if only_needs_confirmation and derived_status != "needs_confirmation":
                    continue
                if only_repeating and appointment["repeat_rule"] is None:
                    continue
                if only_today and ends_at.date() != today:
                    continue
                rows.append(appointment)
            return sorted(rows, key=lambda appointment: (appointment["ends_at"], appointment["created_at"]))
        if "FROM appointment_occurrence_results" in sql and "ORDER BY occurrence_ends_at ASC" in sql:
            appointment_id, range_start, range_end = args
            rows = [
                row
                for row in self.appointment_occurrence_results
                if row["appointment_id"] == appointment_id and range_start <= row["occurrence_ends_at"] < range_end
            ]
            return sorted(rows, key=lambda row: row["occurrence_ends_at"])
        if "FROM completion_records" in sql and "subject_type = $2" in sql:
            user_id, subject_type, subject_id = args[0], args[1], args[2]
            range_start = args[3] if len(args) > 3 else None
            range_end = args[4] if len(args) > 4 else None
            rows = [
                row
                for row in self.completion_records
                if row["user_id"] == user_id
                and row["subject_type"] == subject_type
                and row["subject_id"] == subject_id
                and (range_start is None or row["completed_at"] >= range_start)
                and (range_end is None or row["completed_at"] < range_end)
            ]
            return sorted(rows, key=lambda row: row["completed_at"])
        return []

    async def fetchrow(self, sql: str, *args: Any) -> dict[str, Any] | None:
        if "INSERT INTO events" in sql:
            event_id = uuid4()
            now = datetime.now(UTC)
            row = {
                "id": event_id,
                "user_id": args[0],
                "name": args[1],
                "due_at": args[2],
                "is_primary": args[3],
                "created_at": now,
                "updated_at": now,
            }
            self.events.append(row)
            return row
        if "FROM events" in sql and "is_primary = TRUE" in sql:
            user_id = args[0]
            return next((event for event in self.events if event["user_id"] == user_id and event["is_primary"]), None)
        if "FROM events" in sql and "WHERE id = $1 AND user_id = $2" in sql:
            event_id, user_id = args[0], args[1]
            return next(
                (event for event in self.events if event["id"] == event_id and event["user_id"] == user_id), None
            )
        if "SELECT id FROM tasks WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE" in sql:
            task_id, user_id = args[0], args[1]
            task = next(
                (
                    item
                    for item in self.tasks
                    if item["id"] == task_id and item["user_id"] == user_id and not item["is_deleted"]
                ),
                None,
            )
            return {"id": task["id"]} if task is not None else None
        if "INSERT INTO tasks" in sql:
            task_id = uuid4()
            now = datetime.now(UTC)
            row = {
                "id": task_id,
                "user_id": args[0],
                "title": args[1],
                "content": args[2],
                "status": args[3],
                "priority": args[4],
                "target_duration": args[5],
                "current_cycle_count": args[6],
                "target_cycle_count": args[7],
                "cycle_period": args[8],
                "cycle_every_days": args[9],
                "event": args[10],
                "event_ids": args[11],
                "event_id": args[12],
                "is_recurring": args[13],
                "period_type": args[14],
                "custom_period_days": args[15],
                "max_completions_per_period": args[16],
                "weekday_only": args[17],
                "time_inherits_from_event": args[18],
                "time_overridden": args[19],
                "task_type": args[20],
                "tags": args[21],
                "start_date": args[22],
                "due_date": args[23],
                "actual_duration": 0,
                "is_deleted": False,
                "created_at": now,
                "updated_at": now,
            }
            self.tasks.append(row)
            return row
        if "FROM tasks" in sql and "WHERE id = $1 AND user_id = $2 AND ($3::BOOLEAN = TRUE OR is_deleted = FALSE)" in sql:
            task_id, user_id = args[0], args[1]
            include_deleted = args[2]
            return next(
                (
                    task
                    for task in self.tasks
                    if task["id"] == task_id and task["user_id"] == user_id and (include_deleted or not task["is_deleted"])
                ),
                None,
            )
        if "UPDATE tasks" in sql and "RETURNING id, user_id, title, content, status" in sql:
            task_id, user_id = args[-2], args[-1]
            task = next(
                (
                    item
                    for item in self.tasks
                    if item["id"] == task_id and item["user_id"] == user_id and not item["is_deleted"]
                ),
                None,
            )
            if task is None:
                return None
            field_order = [
                "title",
                "content",
                "status",
                "priority",
                "target_duration",
                "current_cycle_count",
                "target_cycle_count",
                "cycle_period",
                "cycle_every_days",
                "event",
                "event_ids",
                "event_id",
                "is_recurring",
                "period_type",
                "custom_period_days",
                "max_completions_per_period",
                "weekday_only",
                "time_inherits_from_event",
                "time_overridden",
                "task_type",
                "tags",
                "start_date",
                "due_date",
            ]
            sql_fields = []
            for field in field_order:
                match = re.search(rf"{field} = \$(\d+)", sql)
                if match is not None:
                    sql_fields.append((int(match.group(1)), field))
            for position, field in sorted(sql_fields):
                task[field] = args[position - 1]
            task["updated_at"] = datetime.now(UTC)
            return task
        if "FROM appointments" in sql and "linked_task_id = $2" in sql:
            user_id, linked_task_id = args[0], args[1]
            exclude_appointment_id = args[2] if len(args) > 2 else None
            appointment = next(
                (
                    item
                    for item in self.appointments
                    if item["user_id"] == user_id
                    and item["linked_task_id"] == linked_task_id
                    and not item["is_deleted"]
                    and item["id"] != exclude_appointment_id
                ),
                None,
            )
            return {"id": appointment["id"]} if appointment is not None else None
        if "UPDATE events" in sql and "RETURNING id, user_id, name, due_at, is_primary, created_at, updated_at" in sql:
            event_id, user_id = args[-2], args[-1]
            event = next((item for item in self.events if item["id"] == event_id and item["user_id"] == user_id), None)
            if event is None:
                return None
            if "name = $1" in sql:
                event["name"] = args[0]
            if "due_at = $2" in sql:
                event["due_at"] = args[1]
            elif "due_at = $1" in sql:
                event["due_at"] = args[0]
            if "is_primary = $3" in sql:
                event["is_primary"] = args[2]
            elif "is_primary = $2" in sql:
                event["is_primary"] = args[1]
            elif "is_primary = $1" in sql:
                event["is_primary"] = args[0]
            event["updated_at"] = datetime.now(UTC)
            return event
        if "INSERT INTO appointments" in sql:
            appointment_id = uuid4()
            now = datetime.now(UTC)
            row = {
                "id": appointment_id,
                "user_id": args[0],
                "title": args[1],
                "content": args[2],
                "status": args[3],
                "starts_at": args[4],
                "ends_at": args[5],
                "repeat_rule": args[6],
                "linked_task_id": args[7],
                "event_id": args[8],
                "is_recurring": args[9],
                "period_type": args[10],
                "custom_period_days": args[11],
                "max_completions_per_period": args[12],
                "weekday_only": args[13],
                "time_inherits_from_event": args[14],
                "time_overridden": args[15],
                "is_deleted": False,
                "created_at": now,
                "updated_at": now,
            }
            self.appointments.append(row)
            return row
        if "FROM appointments" in sql and "WHERE id = $1 AND user_id = $2" in sql:
            appointment_id, user_id = args[0], args[1]
            return next(
                (
                    appointment
                    for appointment in self.appointments
                    if appointment["id"] == appointment_id and appointment["user_id"] == user_id and not appointment["is_deleted"]
                ),
                None,
            )
        if "UPDATE appointments" in sql and "RETURNING id, user_id, title, content, status" in sql:
            appointment_id, user_id = args[-2], args[-1]
            appointment = next(
                (
                    item
                    for item in self.appointments
                    if item["id"] == appointment_id and item["user_id"] == user_id and not item["is_deleted"]
                ),
                None,
            )
            if appointment is None:
                return None
            field_order = [
                "title",
                "content",
                "status",
                "starts_at",
                "ends_at",
                "repeat_rule",
                "linked_task_id",
                "event_id",
                "is_recurring",
                "period_type",
                "custom_period_days",
                "max_completions_per_period",
                "weekday_only",
                "time_inherits_from_event",
                "time_overridden",
            ]
            sql_fields = []
            for field in field_order:
                match = re.search(rf"{field} = \$(\d+)", sql)
                if match is not None:
                    sql_fields.append((int(match.group(1)), field))
            for position, field in sorted(sql_fields):
                appointment[field] = args[position - 1]
            appointment["updated_at"] = datetime.now(UTC)
            return appointment
        if "INSERT INTO appointment_occurrence_results" in sql:
            appointment_id, occurrence_ends_at, status = args[0], args[1], args[2]
            now = datetime.now(UTC)
            existing = next(
                (
                    item
                    for item in self.appointment_occurrence_results
                    if item["appointment_id"] == appointment_id and item["occurrence_ends_at"] == occurrence_ends_at
                ),
                None,
            )
            if existing is None:
                row = {
                    "appointment_id": appointment_id,
                    "occurrence_ends_at": occurrence_ends_at,
                    "status": status,
                    "created_at": now,
                    "updated_at": now,
                }
                self.appointment_occurrence_results.append(row)
                return row
            existing["status"] = status
            existing["updated_at"] = now
            return existing
        return None

    async def execute(self, sql: str, *args: Any) -> str:
        if "UPDATE events" in sql and "SET is_primary = FALSE" in sql:
            user_id = args[0]
            exclude_id = args[1] if len(args) > 1 else None
            for event in self.events:
                if event["user_id"] == user_id and event["is_primary"] and event["id"] != exclude_id:
                    event["is_primary"] = False
                    event["updated_at"] = datetime.now(UTC)
            return "UPDATE 1"
        if "INSERT INTO completion_records" in sql:
            now = datetime.now(UTC)
            self.completion_records.append(
                {
                    "id": uuid4(),
                    "user_id": args[0],
                    "subject_type": args[1],
                    "subject_id": args[2],
                    "completed_at": args[3],
                    "counted_period_start": args[4],
                    "counted_period_end": args[5],
                    "created_at": now,
                }
            )
            return "INSERT 1"
        if "UPDATE tasks" in sql and "SET due_date = $1, updated_at = NOW()" in sql:
            due_date, user_id, event_id = args
            updated = 0
            for task in self.tasks:
                if (
                    task["user_id"] == user_id
                    and task["event_id"] == event_id
                    and task["time_inherits_from_event"]
                    and not task["time_overridden"]
                    and not task["is_deleted"]
                ):
                    task["due_date"] = due_date
                    task["updated_at"] = datetime.now(UTC)
                    updated += 1
            return f"UPDATE {updated}"
        if "UPDATE appointments" in sql and "SET ends_at = $1, updated_at = NOW()" in sql:
            ends_at, user_id, event_id = args
            updated = 0
            for appointment in self.appointments:
                if (
                    appointment["user_id"] == user_id
                    and appointment["event_id"] == event_id
                    and appointment["time_inherits_from_event"]
                    and not appointment["time_overridden"]
                    and not appointment["is_deleted"]
                ):
                    appointment["ends_at"] = ends_at
                    appointment["updated_at"] = datetime.now(UTC)
                    updated += 1
            return f"UPDATE {updated}"
        if sql.startswith("DELETE FROM events"):
            event_id, user_id = args
            before = len(self.events)
            self.events = [
                event for event in self.events if not (event["id"] == event_id and event["user_id"] == user_id)
            ]
            deleted = before - len(self.events)
            return f"DELETE {deleted}"
        if "UPDATE appointments" in sql and "SET is_deleted = TRUE" in sql:
            appointment_id, user_id = args
            updated = 0
            for appointment in self.appointments:
                if appointment["id"] == appointment_id and appointment["user_id"] == user_id and not appointment["is_deleted"]:
                    appointment["is_deleted"] = True
                    appointment["updated_at"] = datetime.now(UTC)
                    updated += 1
            return f"UPDATE {updated}"
        return "UPDATE 1"

    def transaction(self):
        return _TxCtx()


class _FakePool:
    def __init__(self, conn: _FakeTodoConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: _DummyUser()
    return app


def _task_row(
    *,
    user_id: int = 7,
    title: str = "Task",
    status: str = "todo",
    priority: int = 0,
    start_date: datetime | None = None,
    due_date: datetime | None = None,
    is_deleted: bool = False,
) -> dict[str, Any]:
    now = datetime(2026, 4, 16, tzinfo=UTC)
    return {
        "id": uuid4(),
        "user_id": user_id,
        "title": title,
        "content": None,
        "status": status,
        "priority": priority,
        "target_duration": 0,
        "current_cycle_count": 0,
        "target_cycle_count": 0,
        "cycle_period": "daily",
        "cycle_every_days": None,
        "event": "",
        "event_ids": [],
        "event_id": None,
        "is_recurring": False,
        "period_type": "once",
        "custom_period_days": None,
        "max_completions_per_period": 1,
        "weekday_only": False,
        "time_inherits_from_event": False,
        "time_overridden": False,
        "task_type": "focus",
        "tags": [],
        "actual_duration": 0,
        "start_date": start_date,
        "due_date": due_date,
        "is_deleted": is_deleted,
        "created_at": now,
        "updated_at": now,
    }


def _appointment_row(
    *,
    user_id: int = 7,
    title: str = "Appointment",
    status: str = "pending",
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    repeat_rule: str | None = None,
    linked_task_id: Any = None,
    is_deleted: bool = False,
) -> dict[str, Any]:
    now = datetime(2026, 4, 16, tzinfo=UTC)
    return {
        "id": uuid4(),
        "user_id": user_id,
        "title": title,
        "content": None,
        "status": status,
        "starts_at": starts_at,
        "ends_at": ends_at or datetime(2026, 4, 16, 18, tzinfo=UTC),
        "repeat_rule": repeat_rule,
        "linked_task_id": linked_task_id,
        "event_id": None,
        "is_recurring": False,
        "period_type": "once",
        "custom_period_days": None,
        "max_completions_per_period": 1,
        "weekday_only": False,
        "time_inherits_from_event": False,
        "time_overridden": False,
        "is_deleted": is_deleted,
        "created_at": now,
        "updated_at": now,
    }


def _completion_record(
    *,
    subject_type: str,
    subject_id: Any,
    completed_at: datetime,
    counted_period_start: datetime | None,
    counted_period_end: datetime | None,
) -> dict[str, Any]:
    return {
        "id": uuid4(),
        "user_id": 7,
        "subject_type": subject_type,
        "subject_id": subject_id,
        "completed_at": completed_at,
        "counted_period_start": counted_period_start,
        "counted_period_end": counted_period_end,
        "created_at": completed_at,
    }


def test_create_appointment_requires_end_time_and_defaults_to_pending(monkeypatch) -> None:
    conn = _FakeTodoConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.post(
        "/todo/appointments",
        json={"title": "Standup", "ends_at": "2026-04-20T10:30:00Z"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Standup"
    assert data["status"] == "pending"
    assert len(conn.appointments) == 1


def test_list_appointments_derives_needs_confirmation(monkeypatch) -> None:
    conn = _FakeTodoConn()
    conn.appointments = [
        _appointment_row(title="Past", ends_at=datetime.now(UTC) - timedelta(hours=2)),
        _appointment_row(title="Future", ends_at=datetime.now(UTC) + timedelta(hours=2)),
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/appointments")

    assert resp.status_code == 200
    data = resp.json()
    statuses = {item["title"]: item["status"] for item in data}
    assert statuses["Past"] == "needs_confirmation"
    assert statuses["Future"] == "pending"


def test_list_appointments_supports_needs_confirmation_filter(monkeypatch) -> None:
    conn = _FakeTodoConn()
    conn.appointments = [
        _appointment_row(title="Past", ends_at=datetime.now(UTC) - timedelta(hours=2)),
        _appointment_row(title="Future", ends_at=datetime.now(UTC) + timedelta(hours=2)),
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/appointments?view=needs_confirmation")

    assert resp.status_code == 200
    assert [item["title"] for item in resp.json()] == ["Past"]


def test_update_appointment_can_confirm_result(monkeypatch) -> None:
    conn = _FakeTodoConn()
    appointment = _appointment_row(title="Exam", ends_at=datetime.now(UTC) - timedelta(hours=1))
    conn.appointments = [appointment]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.patch(f"/todo/appointments/{appointment['id']}", json={"status": "attended"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "attended"
    assert conn.appointments[0]["status"] == "attended"


def test_list_appointments_supports_repeating_filter(monkeypatch) -> None:
    conn = _FakeTodoConn()
    conn.appointments = [
        _appointment_row(title="Weekly", repeat_rule="weekly"),
        _appointment_row(title="One off", repeat_rule=None),
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/appointments?view=repeating")

    assert resp.status_code == 200
    assert [item["title"] for item in resp.json()] == ["Weekly"]


def test_create_appointment_rejects_task_link_already_used(monkeypatch) -> None:
    conn = _FakeTodoConn()
    linked_task = _task_row(title="Prepare materials")
    conn.tasks = [linked_task]
    conn.appointments = [
        _appointment_row(title="Existing", linked_task_id=linked_task["id"]),
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.post(
        "/todo/appointments",
        json={
            "title": "Another appointment",
            "ends_at": "2026-04-20T10:30:00Z",
            "linked_task_id": str(linked_task["id"]),
        },
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == "该任务已关联其他日程"


def test_update_appointment_rejects_missing_or_deleted_linked_task(monkeypatch) -> None:
    conn = _FakeTodoConn()
    appointment = _appointment_row(title="Exam")
    deleted_task = _task_row(title="Old prep", is_deleted=True)
    conn.appointments = [appointment]
    conn.tasks = [deleted_task]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.patch(
        f"/todo/appointments/{appointment['id']}",
        json={"linked_task_id": str(deleted_task["id"])},
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "关联任务不存在"


def test_list_appointment_occurrences_merges_independent_confirmation(monkeypatch) -> None:
    conn = _FakeTodoConn()
    appointment = _appointment_row(
        title="Weekly sync",
        starts_at=datetime.now(UTC) - timedelta(days=14, hours=1),
        ends_at=datetime.now(UTC) - timedelta(days=14),
        repeat_rule="weekly",
    )
    conn.appointments = [appointment]
    conn.appointment_occurrence_results = [
        {
            "appointment_id": appointment["id"],
            "occurrence_ends_at": appointment["ends_at"] + timedelta(days=7),
            "status": "attended",
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    start = (datetime.now(UTC) - timedelta(days=15)).date().isoformat()
    end = (datetime.now(UTC) + timedelta(days=8)).date().isoformat()
    resp = client.get(f"/todo/appointments/{appointment['id']}/occurrences?start={start}&end={end}")

    assert resp.status_code == 200
    data = resp.json()
    assert [item["status"] for item in data] == ["needs_confirmation", "attended", "needs_confirmation", "pending"]


def test_confirm_appointment_occurrence_only_updates_target_occurrence(monkeypatch) -> None:
    conn = _FakeTodoConn()
    appointment = _appointment_row(
        title="Weekly sync",
        starts_at=datetime(2026, 4, 1, 8, tzinfo=UTC),
        ends_at=datetime(2026, 4, 1, 9, tzinfo=UTC),
        repeat_rule="weekly",
    )
    conn.appointments = [appointment]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    occurrence_ends_at = "2026-04-15T09:00:00Z"
    resp = client.post(
        f"/todo/appointments/{appointment['id']}/occurrences/confirm",
        json={"occurrence_ends_at": occurrence_ends_at, "status": "missed"},
    )

    assert resp.status_code == 200
    assert resp.json()["status"] == "missed"
    assert len(conn.appointment_occurrence_results) == 1
    assert conn.appointment_occurrence_results[0]["occurrence_ends_at"] == datetime(2026, 4, 15, 9, tzinfo=UTC)
    assert conn.appointment_occurrence_results[0]["status"] == "missed"


def test_get_focus_stats_today(monkeypatch) -> None:
    conn = _FakeTodoConn()
    task_id = uuid4()
    conn.stats_rows = [{"id": task_id, "title": "Task 1", "total_duration": 3600}]

    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/stats?range=today")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_duration"] == 3600
    assert len(data["tasks"]) == 1
    assert data["tasks"][0]["title"] == "Task 1"
    assert data["tasks"][0]["duration"] == 3600


def test_get_focus_stats_week(monkeypatch) -> None:
    conn = _FakeTodoConn()
    task_id1 = uuid4()
    task_id2 = uuid4()
    conn.stats_rows = [
        {"id": task_id1, "title": "Task 1", "total_duration": 3600},
        {"id": task_id2, "title": "Task 2", "total_duration": 1800},
    ]

    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/stats?range=week")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_duration"] == 5400
    assert len(data["tasks"]) == 2


def test_get_focus_stats_month(monkeypatch) -> None:
    conn = _FakeTodoConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/stats?range=month")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_duration"] == 0
    assert len(data["tasks"]) == 0


def test_get_focus_stats_invalid_range(monkeypatch) -> None:
    conn = _FakeTodoConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/stats?range=year")
    assert resp.status_code == 422


def test_list_calendar_tasks_includes_single_day_and_overlapping_tasks(monkeypatch) -> None:
    conn = _FakeTodoConn()
    conn.tasks = [
        _task_row(title="Start only", start_date=datetime(2026, 4, 16, 8, tzinfo=UTC)),
        _task_row(title="Due only", due_date=datetime(2026, 4, 17, 18, tzinfo=UTC)),
        _task_row(
            title="Multi day",
            start_date=datetime(2026, 4, 15, 9, tzinfo=UTC),
            due_date=datetime(2026, 4, 20, 18, tzinfo=UTC),
        ),
        _task_row(title="Outside", due_date=datetime(2026, 5, 1, 18, tzinfo=UTC)),
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/tasks/calendar?start=2026-04-16&end=2026-04-30")

    assert resp.status_code == 200
    titles = [task["title"] for task in resp.json()]
    assert titles == ["Due only", "Multi day", "Start only"]


def test_list_calendar_tasks_excludes_deleted_and_other_users(monkeypatch) -> None:
    conn = _FakeTodoConn()
    conn.tasks = [
        _task_row(title="Mine", due_date=datetime(2026, 4, 17, 18, tzinfo=UTC)),
        _task_row(user_id=8, title="Other user", due_date=datetime(2026, 4, 17, 18, tzinfo=UTC)),
        _task_row(title="Deleted", due_date=datetime(2026, 4, 17, 18, tzinfo=UTC), is_deleted=True),
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/tasks/calendar?start=2026-04-16&end=2026-04-30")

    assert resp.status_code == 200
    assert [task["title"] for task in resp.json()] == ["Mine"]


def test_create_task_inherits_due_date_from_event_when_not_overridden(monkeypatch) -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    event_id = uuid4()
    conn.events = [
        {
            "id": event_id,
            "user_id": 7,
            "name": "DDL",
            "due_at": datetime(2026, 4, 25, 12, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        }
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.post(
        "/todo/tasks",
        json={
            "title": "Write abstract",
            "event_id": str(event_id),
            "time_inherits_from_event": True,
            "time_overridden": False,
        },
    )

    assert resp.status_code == 200
    assert resp.json()["due_date"] == "2026-04-25T12:00:00Z"


def test_create_task_insert_sql_includes_all_placeholders(monkeypatch) -> None:
    conn = _FakeTodoConn()
    captured: dict[str, str] = {}
    original_fetchrow = conn.fetchrow

    async def fetchrow_with_capture(sql: str, *args: Any) -> dict[str, Any] | None:
        if "INSERT INTO tasks" in sql:
            captured["sql"] = sql
        return await original_fetchrow(sql, *args)

    conn.fetchrow = fetchrow_with_capture  # type: ignore[method-assign]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.post("/todo/tasks", json={"title": "Check placeholders"})

    assert resp.status_code == 200
    assert "$24" in captured["sql"]


def test_create_event_can_be_primary(monkeypatch) -> None:
    conn = _FakeTodoConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    due_at = "2026-03-20T08:00:00Z"
    resp = client.post("/todo/events", json={"name": "DDL", "due_at": due_at, "is_primary": True})

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "DDL"
    assert data["is_primary"] is True
    assert len(conn.events) == 1


def test_list_events_isolated_by_user(monkeypatch) -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    conn.events = [
        {
            "id": uuid4(),
            "user_id": 7,
            "name": "Mine",
            "due_at": datetime(2026, 3, 20, tzinfo=UTC),
            "is_primary": False,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": uuid4(),
            "user_id": 8,
            "name": "Other",
            "due_at": datetime(2026, 3, 21, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        },
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/events")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Mine"


def test_update_event_primary_clears_previous_primary(monkeypatch) -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    first_id = uuid4()
    second_id = uuid4()
    conn.events = [
        {
            "id": first_id,
            "user_id": 7,
            "name": "First",
            "due_at": datetime(2026, 3, 20, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": second_id,
            "user_id": 7,
            "name": "Second",
            "due_at": datetime(2026, 3, 21, tzinfo=UTC),
            "is_primary": False,
            "created_at": now,
            "updated_at": now,
        },
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.patch(f"/todo/events/{second_id}", json={"is_primary": True})
    assert resp.status_code == 200
    assert resp.json()["is_primary"] is True
    assert next(event for event in conn.events if event["id"] == first_id)["is_primary"] is False
    assert next(event for event in conn.events if event["id"] == second_id)["is_primary"] is True


def test_update_event_propagates_due_at_only_to_non_overridden_arrangements(monkeypatch) -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    event_id = uuid4()
    conn.events = [
        {
            "id": event_id,
            "user_id": 7,
            "name": "DDL",
            "due_at": datetime(2026, 4, 25, 12, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        }
    ]
    conn.tasks = [
        {
            **_task_row(title="Synced", due_date=datetime(2026, 4, 25, 12, tzinfo=UTC)),
            "event_id": event_id,
            "time_inherits_from_event": True,
            "time_overridden": False,
        },
        {
            **_task_row(title="Override", due_date=datetime(2026, 4, 24, 8, tzinfo=UTC)),
            "event_id": event_id,
            "time_inherits_from_event": True,
            "time_overridden": True,
        },
    ]
    conn.appointments = [
        {
            **_appointment_row(title="Synced appt", ends_at=datetime(2026, 4, 25, 12, tzinfo=UTC)),
            "event_id": event_id,
            "time_inherits_from_event": True,
            "time_overridden": False,
        },
        {
            **_appointment_row(title="Override appt", ends_at=datetime(2026, 4, 24, 8, tzinfo=UTC)),
            "event_id": event_id,
            "time_inherits_from_event": True,
            "time_overridden": True,
        },
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.patch(f"/todo/events/{event_id}", json={"due_at": "2026-04-28T09:00:00Z"})

    assert resp.status_code == 200
    assert conn.tasks[0]["due_date"] == datetime(2026, 4, 28, 9, tzinfo=UTC)
    assert conn.tasks[1]["due_date"] == datetime(2026, 4, 24, 8, tzinfo=UTC)
    assert conn.appointments[0]["ends_at"] == datetime(2026, 4, 28, 9, tzinfo=UTC)
    assert conn.appointments[1]["ends_at"] == datetime(2026, 4, 24, 8, tzinfo=UTC)


def test_get_primary_event_returns_404_when_missing(monkeypatch) -> None:
    conn = _FakeTodoConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/events/primary")
    assert resp.status_code == 404


def test_delete_primary_event_leaves_no_primary(monkeypatch) -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    event_id = uuid4()
    conn.events = [
        {
            "id": event_id,
            "user_id": 7,
            "name": "Main",
            "due_at": datetime(2026, 3, 20, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        }
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    delete_resp = client.delete(f"/todo/events/{event_id}")
    assert delete_resp.status_code == 200

    primary_resp = client.get("/todo/events/primary")
    assert primary_resp.status_code == 404


def test_complete_repeating_task_records_completion_without_marking_done(monkeypatch) -> None:
    conn = _FakeTodoConn()
    task = {
        **_task_row(title="Practice piano", due_date=datetime(2026, 4, 20, 12, tzinfo=UTC)),
        "is_recurring": True,
        "period_type": "daily",
        "max_completions_per_period": 2,
    }
    conn.tasks = [task]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.post(f"/todo/tasks/{task['id']}/complete")

    assert resp.status_code == 200
    assert resp.json()["status"] == "todo"
    assert resp.json()["completion_state"]["completed_count_in_period"] == 1
    assert len(conn.completion_records) == 1


def test_complete_one_time_task_marks_done_and_records_completion(monkeypatch) -> None:
    conn = _FakeTodoConn()
    task = _task_row(title="Submit form")
    conn.tasks = [task]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.post(f"/todo/tasks/{task['id']}/complete")

    assert resp.status_code == 200
    assert resp.json()["status"] == "done"
    assert resp.json()["completion_state"]["completion_state"] == "permanent"
    assert len(conn.completion_records) == 1


def test_complete_repeating_task_rejects_after_period_limit(monkeypatch) -> None:
    conn = _FakeTodoConn()
    task = {
        **_task_row(title="Stretch"),
        "is_recurring": True,
        "period_type": "daily",
        "max_completions_per_period": 1,
    }
    conn.tasks = [task]
    conn.completion_records = [
        _completion_record(
            subject_type="task",
            subject_id=task["id"],
            completed_at=datetime.now(UTC) - timedelta(hours=1),
            counted_period_start=datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0),
            counted_period_end=(datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)),
        )
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.post(f"/todo/tasks/{task['id']}/complete")

    assert resp.status_code == 409
    assert resp.json()["detail"] == "当前周期已达完成上限"


def test_complete_repeating_appointment_records_completion_without_marking_attended(monkeypatch) -> None:
    conn = _FakeTodoConn()
    appointment = {
        **_appointment_row(title="Daily walk", ends_at=datetime(2026, 4, 20, 18, tzinfo=UTC)),
        "is_recurring": True,
        "period_type": "daily",
        "max_completions_per_period": 2,
    }
    conn.appointments = [appointment]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.post(f"/todo/appointments/{appointment['id']}/complete")

    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"
    assert resp.json()["completion_state"]["completed_count_in_period"] == 1
    assert len(conn.completion_records) == 1


def test_complete_one_time_appointment_marks_attended_and_records_completion(monkeypatch) -> None:
    conn = _FakeTodoConn()
    appointment = _appointment_row(title="Dentist", ends_at=datetime.now(UTC) + timedelta(hours=2))
    conn.appointments = [appointment]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.post(f"/todo/appointments/{appointment['id']}/complete")

    assert resp.status_code == 200
    assert resp.json()["status"] == "attended"
    assert resp.json()["completion_state"]["completion_state"] == "permanent"
    assert len(conn.completion_records) == 1


def test_next_task_window_after_today_keeps_period_and_skips_daily_to_tomorrow() -> None:
    now = datetime(2026, 4, 20, 9, tzinfo=UTC)
    task = {
        **_task_row(
            title="Daily review",
            start_date=datetime(2026, 4, 20, 0, tzinfo=UTC),
            due_date=datetime(2026, 4, 20, 18, 30, tzinfo=UTC),
        ),
        "is_recurring": True,
        "period_type": "daily",
    }

    next_start, next_due = _next_task_window_after_today(task, now=now)

    assert task["period_type"] == "daily"
    assert next_start == datetime(2026, 4, 21, 0, tzinfo=UTC)
    assert next_due == datetime(2026, 4, 21, 18, 30, tzinfo=UTC)


def test_move_task_out_of_today_keeps_period_and_overrides_inherited_event_time(monkeypatch) -> None:
    conn = _FakeTodoConn()
    task = {
        **_task_row(
            title="Daily review",
            start_date=datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0),
            due_date=datetime.now(UTC).replace(hour=18, minute=30, second=0, microsecond=0),
        ),
        "is_recurring": True,
        "period_type": "daily",
        "event_id": uuid4(),
        "time_inherits_from_event": True,
        "time_overridden": False,
    }
    conn.tasks = [task]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.patch(f"/todo/tasks/{task['id']}/move-out-of-today")

    assert resp.status_code == 200
    data = resp.json()
    assert data["period_type"] == "daily"
    assert data["time_overridden"] is True
    assert datetime.fromisoformat(data["start_date"].replace("Z", "+00:00")) > datetime.now(UTC)
    assert conn.tasks[0]["period_type"] == "daily"
    assert conn.tasks[0]["time_overridden"] is True


class _WorkflowConn:
    def __init__(self) -> None:
        self.task_id = uuid4()
        self.tasks = [
            {
                "id": self.task_id,
                "user_id": 7,
                "title": "Task A",
                "status": "todo",
                "is_deleted": False,
            }
        ]
        self.workflow = {
            "id": uuid4(),
            "user_id": 7,
            "task_id": self.task_id,
            "workflow_name": "测试流",
            "phases": [{"phase_type": "focus", "duration": 1500}, {"phase_type": "break", "duration": 300}],
            "current_phase_index": 0,
            "focus_duration": 1500,
            "break_duration": 300,
            "current_phase": "focus",
            "phase_started_at": datetime.now(UTC),
            "phase_planned_duration": 1500,
            "pending_confirmation": True,
            "pending_task_selection": False,
            "runtime_task_id": None,
        }
        self.inserted_focus_task_id: Any = None
        self.open_focus_log = {
            "id": uuid4(),
            "task_id": self.task_id,
            "start_time": datetime.now(UTC) - timedelta(minutes=10),
        }

    async def fetchrow(self, sql: str, *args: Any) -> dict[str, Any] | None:
        if "SELECT title FROM tasks" in sql:
            task_id = args[0]
            user_id = int(args[1])
            task = next(
                (item for item in self.tasks if item["id"] == task_id and int(item["user_id"]) == user_id and not item["is_deleted"]),
                None,
            )
            if task is None:
                return None
            return {"title": task["title"]}
        if "SELECT id, title, status FROM tasks" in sql:
            task_id = args[0]
            user_id = int(args[1])
            return next(
                (
                    {
                        "id": item["id"],
                        "title": item["title"],
                        "status": item["status"],
                    }
                    for item in self.tasks
                    if item["id"] == task_id and int(item["user_id"]) == user_id and not item["is_deleted"]
                ),
                None,
            )
        if "FROM tasks" in sql and "is_deleted" in sql and "WHERE id = $1 AND user_id = $2" in sql:
            task_id = args[0]
            user_id = int(args[1])
            return next(
                (
                    {
                        "id": item["id"],
                        "status": item["status"],
                        "is_deleted": item["is_deleted"],
                        "title": item["title"],
                    }
                    for item in self.tasks
                    if item["id"] == task_id and int(item["user_id"]) == user_id
                ),
                None,
            )
        if "FROM focus_workflows" in sql and "WHERE id = $1" in sql:
            return self.workflow
        if "FROM focus_workflows" in sql and "status = 'active'" in sql:
            return self.workflow
        if "SELECT id, start_time" in sql and "FROM focus_logs" in sql:
            return self.open_focus_log
        if "UPDATE focus_logs" in sql and "RETURNING task_id" in sql:
            return {"task_id": self.open_focus_log["task_id"]}
        if "INSERT INTO focus_logs" in sql:
            self.inserted_focus_task_id = args[1]
            return {
                "id": uuid4(),
                "user_id": int(args[0]),
                "task_id": args[1],
                "duration": 0,
                "start_time": datetime.now(UTC),
                "end_at": None,
                "created_at": datetime.now(UTC),
            }
        return None

    async def execute(self, sql: str, *args: Any) -> str:
        if "SET current_phase = $1" in sql and "runtime_task_id = NULL" in sql and "pending_task_selection = TRUE" in sql:
            self.workflow["current_phase"] = str(args[0])
            self.workflow["current_phase_index"] = int(args[1])
            self.workflow["task_id"] = None
            self.workflow["runtime_task_id"] = None
            self.workflow["phase_planned_duration"] = int(args[2])
            self.workflow["pending_confirmation"] = False
            self.workflow["phase_started_at"] = datetime.now(UTC)
            self.workflow["pending_task_selection"] = True
        elif "SET current_phase = $1" in sql:
            self.workflow["current_phase"] = str(args[0])
            self.workflow["current_phase_index"] = int(args[1])
            self.workflow["task_id"] = args[2]
            self.workflow["runtime_task_id"] = args[3]
            self.workflow["phase_planned_duration"] = int(args[4])
            self.workflow["pending_confirmation"] = False
            self.workflow["phase_started_at"] = datetime.now(UTC)
            self.workflow["pending_task_selection"] = bool(args[5])
        if "SET pending_task_selection = TRUE" in sql:
            self.workflow["pending_task_selection"] = True
            self.workflow["runtime_task_id"] = None
            self.workflow["task_id"] = None
        if "SET runtime_task_id = $1" in sql:
            self.workflow["runtime_task_id"] = args[0]
            self.workflow["task_id"] = args[1]
            self.workflow["pending_task_selection"] = False
            self.workflow["phase_started_at"] = datetime.now(UTC)
        return "UPDATE 1"

    def transaction(self):
        return _TxCtx()


class _WorkflowPool:
    def __init__(self, conn: _WorkflowConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def test_ai_create_workflow_requires_authorization() -> None:
    app = _build_app()
    client = TestClient(app)
    resp = client.post(
        "/todo/focus/workflow/ai-create",
        json={"task_id": str(uuid4()), "focus_duration": 1500, "break_duration": 300},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "AI 创建工作流需要用户授权"


def test_get_focus_workflow_current_returns_normal_when_none(monkeypatch) -> None:
    conn = _WorkflowConn()
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    async def _mock_sync(_conn: Any, _user_id: int):
        return None

    monkeypatch.setattr("routes.todo_routes._sync_active_focus_workflow", _mock_sync)
    app = _build_app()
    client = TestClient(app)
    resp = client.get("/todo/focus/workflow/current")
    assert resp.status_code == 200
    assert resp.json()["state"] == "normal"


def test_confirm_focus_workflow_transition_to_break(monkeypatch) -> None:
    conn = _WorkflowConn()
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    async def _mock_sync(_conn: Any, _user_id: int):
        return conn.workflow

    monkeypatch.setattr("routes.todo_routes._sync_active_focus_workflow", _mock_sync)
    app = _build_app()
    client = TestClient(app)
    resp = client.post("/todo/focus/workflow/confirm")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "break"
    assert data["pending_confirmation"] is False
    assert data["task_title"] == "Task A"


def test_confirm_focus_workflow_supports_string_phases(monkeypatch) -> None:
    conn = _WorkflowConn()
    conn.workflow["phases"] = json.dumps(conn.workflow["phases"])
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    async def _mock_sync(_conn: Any, _user_id: int):
        return conn.workflow

    monkeypatch.setattr("routes.todo_routes._sync_active_focus_workflow", _mock_sync)
    app = _build_app()
    client = TestClient(app)
    resp = client.post("/todo/focus/workflow/confirm")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "break"
    assert len(data["phases"]) == 2


def test_confirm_focus_workflow_fallbacks_when_phases_invalid(monkeypatch) -> None:
    conn = _WorkflowConn()
    conn.workflow["phases"] = '[{"phase_type":"focus","duration":"1500.5"},{"phase_type":"break","duration":300}]'
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    async def _mock_sync(_conn: Any, _user_id: int):
        return conn.workflow

    monkeypatch.setattr("routes.todo_routes._sync_active_focus_workflow", _mock_sync)
    app = _build_app()
    client = TestClient(app)
    resp = client.post("/todo/focus/workflow/confirm")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "break"
    assert data["phase_planned_duration"] == 300


def test_confirm_focus_workflow_fallbacks_when_index_invalid(monkeypatch) -> None:
    conn = _WorkflowConn()
    conn.workflow["phases"] = '[{"phase_type":"focus","duration":"oops"},{"phase_type":"break","duration":"300"}]'
    conn.workflow["current_phase_index"] = "oops"
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    async def _mock_sync(_conn: Any, _user_id: int):
        return conn.workflow

    monkeypatch.setattr("routes.todo_routes._sync_active_focus_workflow", _mock_sync)
    app = _build_app()
    client = TestClient(app)
    resp = client.post("/todo/focus/workflow/confirm")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "break"
    assert data["current_phase_index"] == 1


def test_get_focus_workflow_current_marks_pending_task_selection_for_unbound_focus(monkeypatch) -> None:
    conn = _WorkflowConn()
    conn.workflow["pending_confirmation"] = False
    conn.workflow["phases"] = [{"phase_type": "focus", "duration": 1500, "timer_mode": "countup", "task_id": None}]
    conn.workflow["runtime_task_id"] = None
    conn.workflow["task_id"] = None
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/workflow/current")
    assert resp.status_code == 200
    data = resp.json()
    assert data["pending_task_selection"] is True
    assert data["task_id"] is None

def test_get_focus_workflow_current_finishes_countup_phase_at_two_hours(monkeypatch) -> None:
    conn = _WorkflowConn()
    conn.workflow["pending_confirmation"] = False
    conn.workflow["phases"] = [{"phase_type": "focus", "duration": 1500, "timer_mode": "countup", "task_id": str(conn.task_id)}]
    conn.workflow["phase_started_at"] = datetime.now(UTC) - timedelta(hours=2, minutes=5)
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/workflow/current")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "normal"


def test_select_focus_workflow_task_starts_pending_phase(monkeypatch) -> None:
    conn = _WorkflowConn()
    next_task_id = uuid4()
    conn.tasks.append(
        {
            "id": next_task_id,
            "user_id": 7,
            "title": "Task B",
            "status": "todo",
            "is_deleted": False,
        }
    )
    conn.workflow["pending_confirmation"] = False
    conn.workflow["pending_task_selection"] = True
    conn.workflow["phases"] = [{"phase_type": "focus", "duration": 1500, "timer_mode": "countup", "task_id": None}]
    conn.workflow["runtime_task_id"] = None
    conn.workflow["task_id"] = None
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.post("/todo/focus/workflow/select-task", json={"task_id": str(next_task_id)})
    assert resp.status_code == 200
    data = resp.json()
    assert data["task_id"] == str(next_task_id)
    assert data["pending_task_selection"] is False
    assert conn.inserted_focus_task_id == next_task_id


class _WorkflowPresetConn:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self.tasks: list[dict[str, Any]] = []

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        if "FROM focus_workflow_presets" in sql and "ORDER BY is_default DESC" in sql:
            user_id = int(args[0])
            items = [row for row in self.rows if int(row["user_id"]) == user_id]
            return sorted(items, key=lambda row: (not bool(row["is_default"]), -row["updated_at"].timestamp()))
        return []

    async def fetchrow(self, sql: str, *args: Any) -> dict[str, Any] | None:
        if "WHERE user_id = $1 AND is_default = TRUE" in sql:
            user_id = int(args[0])
            return next((row for row in self.rows if int(row["user_id"]) == user_id and bool(row["is_default"])), None)
        if "FROM tasks" in sql and "is_deleted" in sql and "WHERE id = $1 AND user_id = $2" in sql:
            task_id = args[0]
            user_id = int(args[1])
            return next(
                (
                    {
                        "id": item["id"],
                        "status": item["status"],
                        "is_deleted": item["is_deleted"],
                        "title": item["title"],
                    }
                    for item in self.tasks
                    if item["id"] == task_id and int(item["user_id"]) == user_id
                ),
                None,
            )
        if "INSERT INTO focus_workflow_presets" in sql:
            now = datetime.now(UTC)
            phases_arg = args[4]
            phases = json.loads(phases_arg) if isinstance(phases_arg, str) else phases_arg
            row = {
                "id": uuid4(),
                "user_id": int(args[0]),
                "name": str(args[1]),
                "focus_duration": int(args[2]),
                "break_duration": int(args[3]),
                "phases": phases,
                "default_focus_timer_mode": str(args[5]),
                "is_default": bool(args[6]),
                "created_at": now,
                "updated_at": now,
            }
            self.rows.append(row)
            return row
        if "SELECT id, is_default FROM focus_workflow_presets" in sql:
            preset_id = args[0]
            user_id = int(args[1])
            return next((row for row in self.rows if row["id"] == preset_id and int(row["user_id"]) == user_id), None)
        if "FROM focus_workflow_presets" in sql and "WHERE id = $1 AND user_id = $2" in sql and sql.strip().startswith("SELECT"):
            preset_id = args[0]
            user_id = int(args[1])
            return next((row for row in self.rows if row["id"] == preset_id and int(row["user_id"]) == user_id), None)
        if (
            "UPDATE focus_workflow_presets" in sql
            and "RETURNING id, user_id, name, focus_duration, break_duration" in sql
            and "default_focus_timer_mode" in sql
            and "phases" in sql
            and "is_default" in sql
            and "created_at" in sql
            and "updated_at" in sql
        ):
            if "SET is_default = TRUE" in sql:
                preset_id = args[0]
                user_id = int(args[1])
                target = next((row for row in self.rows if row["id"] == preset_id and int(row["user_id"]) == user_id), None)
                if target is None:
                    return None
                target["is_default"] = True
                target["updated_at"] = datetime.now(UTC)
                return target
            preset_id = args[-2]
            user_id = int(args[-1])
            target = next((row for row in self.rows if row["id"] == preset_id and int(row["user_id"]) == user_id), None)
            if target is None:
                return None
            if "name =" in sql:
                target["name"] = str(args[0])
            if "focus_duration =" in sql:
                target["focus_duration"] = int(args[1 if "name =" in sql else 0])
            if "break_duration =" in sql:
                idx = 2 if "name =" in sql else (1 if "focus_duration =" in sql else 0)
                target["break_duration"] = int(args[idx])
            if "phases =" in sql:
                phases_arg = args[-4] if "is_default =" in sql else args[-3]
                target["phases"] = json.loads(phases_arg) if isinstance(phases_arg, str) else phases_arg
            if "default_focus_timer_mode =" in sql:
                mode_idx = len(args) - 4 if "is_default =" in sql else len(args) - 3
                target["default_focus_timer_mode"] = str(args[mode_idx])
            if "is_default =" in sql:
                target["is_default"] = bool(args[-3])
            target["updated_at"] = datetime.now(UTC)
            return target
        if "SELECT id" in sql and "FROM focus_workflow_presets" in sql and "LIMIT 1" in sql:
            user_id = int(args[0])
            items = [row for row in self.rows if int(row["user_id"]) == user_id]
            if not items:
                return None
            items.sort(key=lambda row: row["updated_at"], reverse=True)
            return {"id": items[0]["id"]}
        return None

    async def execute(self, sql: str, *args: Any) -> str:
        if "UPDATE focus_workflow_presets SET is_default = FALSE" in sql:
            user_id = int(args[0])
            for row in self.rows:
                if int(row["user_id"]) == user_id:
                    row["is_default"] = False
                    row["updated_at"] = datetime.now(UTC)
            return "UPDATE 1"
        if sql.startswith("DELETE FROM focus_workflow_presets"):
            preset_id = args[0]
            user_id = int(args[1])
            before = len(self.rows)
            self.rows = [row for row in self.rows if not (row["id"] == preset_id and int(row["user_id"]) == user_id)]
            return f"DELETE {before - len(self.rows)}"
        if "UPDATE focus_workflow_presets SET is_default = TRUE" in sql:
            preset_id = args[0]
            for row in self.rows:
                if row["id"] == preset_id:
                    row["is_default"] = True
                    row["updated_at"] = datetime.now(UTC)
            return "UPDATE 1"
        return "UPDATE 1"

    def transaction(self):
        return _TxCtx()


class _WorkflowPresetPool:
    def __init__(self, conn: _WorkflowPresetConn) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireCtx:
        return _AcquireCtx(self._conn)


def test_create_and_list_focus_workflow_presets(monkeypatch) -> None:
    conn = _WorkflowPresetConn()
    task_id = uuid4()
    conn.tasks = [{"id": task_id, "user_id": 7, "status": "todo", "is_deleted": False, "title": "Task A"}]
    pool = _WorkflowPresetPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    create_resp = client.post(
        "/todo/focus/workflows",
        json={
            "name": "默认番茄",
            "focus_duration": 1500,
            "break_duration": 300,
            "default_focus_timer_mode": "countup",
            "phases": [
                {"phase_type": "focus", "duration": 1500, "timer_mode": "countup", "task_id": str(task_id)},
                {"phase_type": "break", "duration": 300},
            ],
            "is_default": True,
        },
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["is_default"] is True
    assert create_resp.json()["default_focus_timer_mode"] == "countup"
    assert create_resp.json()["phases"][0]["timer_mode"] == "countup"
    assert create_resp.json()["phases"][0]["task_id"] == str(task_id)

    list_resp = client.get("/todo/focus/workflows")
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) == 1
    assert items[0]["name"] == "默认番茄"


def test_create_focus_workflow_preset_rejects_completed_task_binding(monkeypatch) -> None:
    conn = _WorkflowPresetConn()
    task_id = uuid4()
    conn.tasks = [{"id": task_id, "user_id": 7, "status": "done", "is_deleted": False, "title": "Done Task"}]
    pool = _WorkflowPresetPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    resp = client.post(
        "/todo/focus/workflows",
        json={
            "name": "失败案例",
            "focus_duration": 1500,
            "break_duration": 300,
            "phases": [{"phase_type": "focus", "duration": 1500, "task_id": str(task_id)}],
        },
    )

    assert resp.status_code == 422


def test_set_default_and_delete_focus_workflow_preset(monkeypatch) -> None:
    conn = _WorkflowPresetConn()
    pool = _WorkflowPresetPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    first = client.post(
        "/todo/focus/workflows",
        json={"name": "A", "focus_duration": 1500, "break_duration": 300, "is_default": True},
    ).json()
    second = client.post(
        "/todo/focus/workflows",
        json={"name": "B", "focus_duration": 1800, "break_duration": 600, "is_default": False},
    ).json()

    set_default_resp = client.post(f"/todo/focus/workflows/{second['id']}/default")
    assert set_default_resp.status_code == 200
    assert set_default_resp.json()["is_default"] is True

    delete_resp = client.delete(f"/todo/focus/workflows/{second['id']}")
    assert delete_resp.status_code == 200
    assert delete_resp.json()["ok"] is True

    list_resp = client.get("/todo/focus/workflows")
    assert list_resp.status_code == 200
    rows = list_resp.json()
    assert len(rows) == 1
    assert rows[0]["id"] == first["id"]
    assert rows[0]["is_default"] is True
