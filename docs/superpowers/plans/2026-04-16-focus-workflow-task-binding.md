# Focus Workflow Task Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-focus-phase task binding, countup timer support with a 2-hour safety cap, and runtime task selection/auto-skip behavior for focus workflows.

**Architecture:** Extend the existing workflow JSON shape and active workflow state instead of introducing runtime phase tables. Centralize “find next executable phase” logic in backend helpers, then update the frontend workflow editor and runtime card UI to expose the richer phase model and blocking task-selection state.

**Tech Stack:** FastAPI, asyncpg, pytest, React, TypeScript, Vitest

---

### Task 1: Backend phase model and preset validation

**Files:**
- Modify: `backend/routes/todo_routes.py`
- Test: `backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write failing backend tests for richer phases**

```python
def test_create_focus_workflow_preset_persists_timer_mode_and_task_binding(monkeypatch) -> None:
    conn = _WorkflowPresetConn()
    task_id = uuid4()
    conn.tasks = [{"id": task_id, "user_id": 7, "status": "todo", "is_deleted": False, "title": "Task A"}]
    pool = _WorkflowPresetPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    resp = client.post(
        "/todo/focus/workflows",
        json={
            "name": "深度工作",
            "default_focus_timer_mode": "countup",
            "phases": [
                {"phase_type": "focus", "duration": 1500, "timer_mode": "countup", "task_id": str(task_id)},
                {"phase_type": "break", "duration": 300},
            ],
            "focus_duration": 1500,
            "break_duration": 300,
            "is_default": True,
        },
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["default_focus_timer_mode"] == "countup"
    assert data["phases"][0]["timer_mode"] == "countup"
    assert data["phases"][0]["task_id"] == str(task_id)


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
            "name": "深度工作",
            "phases": [{"phase_type": "focus", "duration": 1500, "task_id": str(task_id)}],
            "focus_duration": 1500,
            "break_duration": 300,
        },
    )

    assert resp.status_code == 422
```

- [ ] **Step 2: Run backend preset tests to verify they fail**

Run: `uv run pytest tests/test_todo_routes.py -k "workflow_preset and (timer_mode or completed_task_binding)" -v`

Expected: FAIL because preset API models and fake preset connection do not understand `timer_mode`, `task_id`, or `default_focus_timer_mode`.

- [ ] **Step 3: Implement backend phase model and validation**

```python
class FocusTimerMode(StrEnum):
    COUNTDOWN = "countdown"
    COUNTUP = "countup"


class FocusWorkflowPhase(BaseModel):
    phase_type: Literal["focus", "break"]
    duration: int = Field(ge=60, le=24 * 60 * 60)
    timer_mode: Literal["countdown", "countup"] | None = None
    task_id: UUID | None = None
```

Add:
- preset-level `default_focus_timer_mode`
- phase normalization that fills `timer_mode`
- task validation helper that only permits non-deleted, non-done tasks
- preset row serialization with the new fields

- [ ] **Step 4: Run backend preset tests to verify they pass**

Run: `uv run pytest tests/test_todo_routes.py -k "workflow_preset" -v`

Expected: PASS with the richer preset tests included.

- [ ] **Step 5: Commit backend phase model work**

```bash
git add backend/routes/todo_routes.py backend/tests/test_todo_routes.py
git commit -m "feat(backend): add workflow phase timer and task binding"
```

### Task 2: Active workflow runtime state and next-phase resolution

**Files:**
- Modify: `backend/routes/todo_routes.py`
- Test: `backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write failing tests for runtime selection and countup safety**

```python
def test_get_focus_workflow_current_marks_pending_task_selection_for_unbound_focus(monkeypatch) -> None:
    conn = _WorkflowConn()
    conn.workflow["phases"] = [{"phase_type": "focus", "duration": 1500, "timer_mode": "countup", "task_id": None}]
    conn.workflow["pending_task_selection"] = False
    conn.workflow["runtime_task_id"] = None
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/workflow/current")
    assert resp.status_code == 200
    assert resp.json()["pending_task_selection"] is True


def test_get_focus_workflow_current_finishes_countup_phase_at_two_hours(monkeypatch) -> None:
    conn = _WorkflowConn()
    conn.workflow["phases"] = [{"phase_type": "focus", "duration": 1500, "timer_mode": "countup", "task_id": str(conn.task_id)}]
    conn.workflow["phase_started_at"] = datetime.now(UTC) - timedelta(hours=2, minutes=5)
    conn.workflow["phase_planned_duration"] = 1500
    conn.workflow["pending_confirmation"] = False
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/focus/workflow/current")
    assert resp.status_code == 200
    assert resp.json()["state"] == "normal"
    assert resp.json()["completed_workflow_name"] == "测试流"
```

- [ ] **Step 2: Run runtime workflow tests to verify they fail**

Run: `uv run pytest tests/test_todo_routes.py -k "pending_task_selection or two_hours" -v`

Expected: FAIL because active workflow state does not expose `pending_task_selection`, `runtime_task_id`, or countup semantics.

- [ ] **Step 3: Implement active workflow resolution helpers**

```python
def _resolve_phase_task_id(phase: dict[str, Any], runtime_task_id: UUID | None) -> UUID | None:
    if runtime_task_id is not None:
        return runtime_task_id
    return phase.get("task_id")


async def _advance_focus_workflow_to_next_executable_phase(conn: Any, workflow_row: Any, user_id: int) -> Any | None:
    ...
```

Add:
- `pending_task_selection` and `runtime_task_id` columns
- richer `FocusWorkflowOut` payload fields
- countup elapsed/remaining handling and 2-hour cap
- helper-driven resolution from current phase to next executable phase

- [ ] **Step 4: Run workflow runtime tests to verify they pass**

Run: `uv run pytest tests/test_todo_routes.py -k "workflow and not preset" -v`

Expected: PASS including current, confirm, pending selection, and countup safety tests.

- [ ] **Step 5: Commit runtime workflow work**

```bash
git add backend/routes/todo_routes.py backend/tests/test_todo_routes.py
git commit -m "feat(backend): add runtime workflow task resolution"
```

### Task 3: Runtime task selection endpoint and task-completion re-evaluation

**Files:**
- Modify: `backend/routes/todo_routes.py`
- Test: `backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write failing tests for selecting tasks and auto-skip**

```python
def test_select_focus_workflow_task_starts_pending_phase(monkeypatch) -> None:
    conn = _WorkflowConn()
    next_task_id = uuid4()
    conn.tasks = [{"id": next_task_id, "user_id": 7, "status": "todo", "is_deleted": False, "title": "Task B"}]
    conn.workflow["phases"] = [{"phase_type": "focus", "duration": 1500, "timer_mode": "countup", "task_id": None}]
    conn.workflow["pending_task_selection"] = True
    pool = _WorkflowPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    resp = client.post("/todo/focus/workflow/select-task", json={"task_id": str(next_task_id)})
    assert resp.status_code == 200
    assert resp.json()["task_id"] == str(next_task_id)
    assert resp.json()["pending_task_selection"] is False


def test_completing_current_phase_task_skips_done_future_focus_phases(monkeypatch) -> None:
    ...
```

- [ ] **Step 2: Run task-selection tests to verify they fail**

Run: `uv run pytest tests/test_todo_routes.py -k "select_focus_workflow_task or skips_done_future_focus" -v`

Expected: FAIL because the endpoint and skip behavior do not exist yet.

- [ ] **Step 3: Implement selection endpoint and completion-triggered workflow sync**

```python
@router.post("/focus/workflow/select-task", response_model=FocusWorkflowOut)
async def select_focus_workflow_task(...):
    ...
```

Also update task status mutation paths so completed tasks trigger workflow re-evaluation before response/next read.

- [ ] **Step 4: Run task-selection backend tests to verify they pass**

Run: `uv run pytest tests/test_todo_routes.py -k "select_focus_workflow_task or skips_done_future_focus" -v`

Expected: PASS with the new endpoint and skip behavior.

- [ ] **Step 5: Commit task-selection backend work**

```bash
git add backend/routes/todo_routes.py backend/tests/test_todo_routes.py
git commit -m "feat(backend): add workflow task selection flow"
```

### Task 4: Frontend workflow editor and runtime card UI

**Files:**
- Modify: `frontend/src/components/PlaceholderCard.tsx`
- Modify: `frontend/src/components/workflowProgress.ts`
- Modify: `frontend/src/components/WorkflowProgressBar.tsx`
- Modify: `frontend/src/components/WorkflowNavProgress.tsx`
- Test: `frontend/src/components/__tests__/WorkflowProgressBar.test.tsx`
- Test: `frontend/src/components/__tests__/PlaceholderCard.taskAssistant.test.tsx`

- [ ] **Step 1: Write failing frontend tests for countup and pending selection**

```tsx
it('renders countup focus phases with elapsed time and target hint', () => {
  render(
    <WorkflowProgressBar
      workflow={{
        state: 'focus',
        phases: [{ phase_type: 'focus', duration: 1500, timer_mode: 'countup', task_id: null }],
        current_phase_index: 0,
        pending_confirmation: false,
        pending_task_selection: false,
        remaining_seconds: null,
        elapsed_seconds: 600,
      }}
    />,
  );

  expect(screen.getByText('10:00')).toBeInTheDocument();
  expect(screen.getByText('目标 25:00')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run frontend workflow tests to verify they fail**

Run: `pnpm test -- --run src/components/__tests__/WorkflowProgressBar.test.tsx`

Expected: FAIL because workflow UI types and rendering do not support countup or pending task selection.

- [ ] **Step 3: Implement frontend workflow model and UI updates**

```tsx
type WorkflowPhase = {
  phase_type: 'focus' | 'break';
  duration: number;
  timer_mode?: 'countdown' | 'countup';
  task_id?: string | null;
};
```

Update:
- workflow preset form with default timer mode and per-phase task binding
- runtime card to block on `pending_task_selection`
- phase picker to choose only unfinished tasks
- progress components to render countdown vs countup correctly

- [ ] **Step 4: Run targeted frontend tests to verify they pass**

Run: `pnpm test -- --run src/components/__tests__/WorkflowProgressBar.test.tsx`

Expected: PASS with countup rendering coverage.

- [ ] **Step 5: Commit frontend workflow UI work**

```bash
git add frontend/src/components/PlaceholderCard.tsx frontend/src/components/workflowProgress.ts frontend/src/components/WorkflowProgressBar.tsx frontend/src/components/WorkflowNavProgress.tsx frontend/src/components/__tests__/WorkflowProgressBar.test.tsx frontend/src/components/__tests__/PlaceholderCard.taskAssistant.test.tsx
git commit -m "feat(frontend): add workflow phase task binding UI"
```

### Task 5: Full verification

**Files:**
- Modify: `backend/tests/test_todo_routes.py`
- Modify: `frontend/src/components/__tests__/WorkflowProgressBar.test.tsx`
- Modify: `frontend/src/components/__tests__/PlaceholderCard.taskAssistant.test.tsx`

- [ ] **Step 1: Run focused backend verification**

Run: `uv run pytest tests/test_todo_routes.py -k workflow -v`

Expected: PASS with the expanded workflow behavior coverage.

- [ ] **Step 2: Run focused frontend verification**

Run: `pnpm test -- --run src/components/__tests__/WorkflowProgressBar.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run type/build check for frontend**

Run: `pnpm check`

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Review diff for accidental scope creep**

Run: `git diff --stat HEAD~1..HEAD`

Expected: Only workflow/task-focus related files changed.

- [ ] **Step 5: Final commit if verification required follow-up edits**

```bash
git add backend/routes/todo_routes.py backend/tests/test_todo_routes.py frontend/src/components/PlaceholderCard.tsx frontend/src/components/workflowProgress.ts frontend/src/components/WorkflowProgressBar.tsx frontend/src/components/WorkflowNavProgress.tsx frontend/src/components/__tests__/WorkflowProgressBar.test.tsx frontend/src/components/__tests__/PlaceholderCard.taskAssistant.test.tsx
git commit -m "test: verify workflow task binding behavior"
```
