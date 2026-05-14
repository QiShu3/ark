from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from routes.todo.helpers import _create_workflow_with_focus_phase, _normalize_workflow_phases, _row_to_focus_workflow
from routes.todo.schemas import FocusWorkflowOut, FocusWorkflowPhase


class Row(dict):
    def __getattr__(self, name: str):
        return self[name]


class FakeWorkflowConn:
    def __init__(self):
        self.execute_calls: list[tuple[str, tuple[object, ...]]] = []
        self.fetchrow_calls: list[tuple[str, tuple[object, ...]]] = []
        self.workflow_id = uuid4()

    async def execute(self, query: str, *args: object):
        self.execute_calls.append((query, args))
        return "INSERT 0 1"

    async def fetchrow(self, query: str, *args: object):
        self.fetchrow_calls.append((query, args))
        if "INSERT INTO focus_workflows" in query:
            return Row(id=self.workflow_id)
        if "INSERT INTO focus_logs" in query:
            return Row(
                id=uuid4(),
                user_id=args[0],
                task_id=args[1],
                duration=0,
                start_time=datetime.now(UTC),
                end_at=None,
                created_at=datetime.now(UTC),
            )
        raise AssertionError(f"Unexpected fetchrow query: {query}")


def test_focus_workflow_phase_accepts_focus_work_type():
    phase = FocusWorkflowPhase(
        phase_type="focus",
        duration=1500,
        timer_mode="countdown",
        focus_work_type="vocab_today",
    )

    assert phase.focus_work_type == "vocab_today"
    assert phase.task_id is None


def test_focus_workflow_phase_accepts_task_focus_type():
    phase = FocusWorkflowPhase(
        phase_type="focus",
        duration=1500,
        timer_mode="countdown",
        focus_work_type="task_focus",
    )

    assert phase.focus_work_type == "task_focus"


def test_focus_workflow_out_exposes_focus_work_runtime_fields():
    payload = FocusWorkflowOut(
        state="focus",
        active_focus_work_type="erc_review",
        focus_work_display_state="fullscreen",
        focus_work_result=None,
        focus_work_progress_snapshot={"answered": 1},
        next_focus_work_type=None,
        has_minimized_work=False,
    )

    assert payload.active_focus_work_type == "erc_review"
    assert payload.focus_work_display_state == "fullscreen"
    assert payload.focus_work_progress_snapshot == {"answered": 1}


def test_focus_workflow_out_exposes_paused_runtime_fields():
    payload = FocusWorkflowOut(
        state="focus",
        active_focus_work_type="task_focus",
        focus_work_display_state="fullscreen",
        focus_work_result=None,
        focus_work_progress_snapshot=None,
        next_focus_work_type=None,
        has_minimized_work=False,
        is_paused=True,
    )

    assert payload.active_focus_work_type == "task_focus"
    assert payload.is_paused is True


def test_normalize_workflow_phases_preserves_focus_work_type():
    phases = _normalize_workflow_phases(
        [{"phase_type": "focus", "duration": 900, "timer_mode": "countdown", "focus_work_type": "vocab_today"}],
        fallback_focus_duration=1500,
        fallback_break_duration=300,
    )

    assert phases[0]["focus_work_type"] == "vocab_today"
    assert phases[0]["task_id"] is None


@pytest.mark.asyncio
async def test_create_workflow_activates_first_bound_focus_work():
    conn = FakeWorkflowConn()
    task_id = uuid4()
    phases = [
        {
            "phase_type": "focus",
            "duration": 60,
            "timer_mode": "countdown",
            "task_id": None,
            "focus_work_type": "erc_review",
            "record_focus": True,
        },
        {"phase_type": "break", "duration": 60, "timer_mode": None, "task_id": None, "focus_work_type": None},
    ]

    await _create_workflow_with_focus_phase(
        conn,
        user_id=1,
        task_id=task_id,
        workflow_name="Bound App Work",
        phases=phases,
        focus_duration=60,
        break_duration=60,
    )

    workflow_insert_query, workflow_insert_args = conn.fetchrow_calls[0]
    assert "active_focus_work_type" in workflow_insert_query
    assert "focus_work_display_state" in workflow_insert_query
    assert "erc_review" in workflow_insert_args
    assert "fullscreen" in workflow_insert_args
    assert any("focus_app_work_logs" in query and args[2] == "erc_review" for query, args in conn.execute_calls)


def test_row_to_focus_workflow_reports_next_same_focus_work_type_for_minimize():
    row = Row(
        id="00000000-0000-0000-0000-000000000001",
        user_id=1,
        task_id=None,
        runtime_task_id=None,
        workflow_name="Vocabulary Loop",
        phases=[
            {"phase_type": "focus", "duration": 900, "timer_mode": "countdown", "focus_work_type": "vocab_today"},
            {"phase_type": "break", "duration": 300},
            {"phase_type": "focus", "duration": 900, "timer_mode": "countdown", "focus_work_type": "vocab_today"},
        ],
        current_phase_index=1,
        focus_duration=900,
        break_duration=300,
        current_phase="break",
        phase_started_at=datetime.now(UTC),
        phase_planned_duration=300,
        pending_confirmation=False,
        pending_task_selection=False,
        active_focus_work_type="vocab_today",
        focus_work_display_state="minimized",
        focus_work_result="interrupted",
        focus_work_progress_snapshot={"memorized": 4},
        record_focus=True,
    )

    out = _row_to_focus_workflow(row)

    assert out.state == "break"
    assert out.has_minimized_work is True
    assert out.next_focus_work_type == "vocab_today"
