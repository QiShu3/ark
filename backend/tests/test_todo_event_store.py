from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from routes.todo.event_store import create_event_row, update_event_row
from routes.todo.schemas import EventCreateRequest
from tests.test_todo_routes import _appointment_row, _FakeTodoConn, _task_row


@pytest.mark.asyncio
async def test_create_event_row_clears_existing_primary() -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    existing_event_id = uuid4()
    conn.events = [
        {
            "id": existing_event_id,
            "user_id": 7,
            "name": "旧主事件",
            "start_date": datetime(2026, 3, 1, tzinfo=UTC).date(),
            "due_at": datetime(2026, 3, 20, 8, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        }
    ]

    row = await create_event_row(
        conn,
        user_id=7,
        body=EventCreateRequest(
            name="新主事件",
            start_date=datetime(2026, 4, 1, tzinfo=UTC).date(),
            due_at=datetime(2026, 4, 20, 8, tzinfo=UTC),
            is_primary=True,
        ),
    )

    assert row is not None
    assert row["name"] == "新主事件"
    assert row["is_primary"] is True
    assert next(event for event in conn.events if event["id"] == existing_event_id)["is_primary"] is False


@pytest.mark.asyncio
async def test_update_event_row_propagates_due_at_to_inheriting_arrangements() -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    event_id = uuid4()
    due_at = datetime(2026, 4, 28, 9, tzinfo=UTC)
    task_id = uuid4()
    appointment_id = uuid4()
    conn.events = [
        {
            "id": event_id,
            "user_id": 7,
            "name": "论文投稿",
            "start_date": datetime(2026, 4, 1, tzinfo=UTC).date(),
            "due_at": datetime(2026, 4, 25, 12, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        }
    ]
    conn.tasks = [
        {
            **_task_row(title="Draft"),
            "id": task_id,
            "event_id": event_id,
            "time_inherits_from_event": True,
            "time_overridden": False,
        }
    ]
    conn.appointments = [
        {
            **_appointment_row(title="Advisor check"),
            "id": appointment_id,
            "event_id": event_id,
            "time_inherits_from_event": True,
            "time_overridden": False,
        }
    ]

    row = await update_event_row(conn, user_id=7, event_id=event_id, patch={"due_at": due_at})

    assert row is not None
    assert row["due_at"] == due_at
    assert conn.tasks[0]["due_date"] == due_at
    assert conn.appointments[0]["ends_at"] == due_at
