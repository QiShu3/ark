# Task Focus Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `task_focus` runtime so workflow-bound custom tasks open the same fullscreen focus-work shell as Vocab/ERC, with task-specific pause/resume behavior.

**Architecture:** Extend the existing focus-work runtime instead of creating a second task-focus stack. Backend keeps the workflow state machine as `normal / focus / break`, adds paused runtime fields plus `task_focus` activation for task-bound focus phases, and exposes pause/resume endpoints; frontend reuses `FocusWorkProvider` and `focusWorkRegistry`, adds a task-focus renderer, and teaches the capsule to freeze and label paused task focus correctly.

**Tech Stack:** FastAPI, asyncpg/PostgreSQL, Pydantic, React, TypeScript, Vitest, Testing Library, pytest, Ruff.

---

## File Structure

- Modify `backend/routes/todo/schemas.py`: extend `FocusWorkType`, workflow output fields, and add pause/resume response fields.
- Modify `backend/routes/todo/db.py`: add `is_paused` and `paused_at` columns to `focus_workflows`.
- Modify `backend/routes/todo/helpers.py`: derive `task_focus` for task-bound focus phases, carry paused runtime state, and encapsulate pause/resume timestamp math.
- Modify `backend/routes/todo/routes.py`: add pause/resume endpoints, include paused columns in workflow queries, and ensure task-bound focus phases hydrate fullscreen task focus.
- Modify `backend/tests/test_focus_workflow_app_work.py`: add helper/schema coverage for `task_focus`, `is_paused`, and resume timestamp adjustments.
- Modify `backend/tests/test_todo_routes.py`: add route coverage for pause/resume, task-focus current snapshot, and “complete task then finish phase”.
- Modify `frontend/src/components/focus-work/focusWorkTypes.ts`: add `task_focus`, paused snapshot fields, and pass the current workflow snapshot into registered focus-work renderers.
- Modify `frontend/src/components/focus-work/focusWorkRegistry.tsx`: register the new task-focus renderer.
- Modify `frontend/src/components/focus-work/FocusWorkProvider.tsx`: pass live workflow snapshot into renderers and keep fullscreen task focus mounted while paused.
- Create `frontend/src/components/focus-work/TaskFocusWork.tsx`: render the minimal immersive task-focus UI, load task detail from `/todo/tasks/:id`, and manage pause overlay/actions.
- Modify `frontend/src/components/WorkflowNavProgress.tsx`: freeze chip timing and show paused copy when `task_focus` is paused.
- Modify `frontend/src/components/Navigation.tsx`: keep fullscreen task focus navigation lock behavior unchanged when `is_paused` is true.
- Modify `frontend/src/components/workflowProgress.ts`: carry `is_paused` in `WorkflowSnapshot` and freeze derived progress/clock math for paused task focus.
- Create `frontend/src/components/__tests__/FocusWorkProvider.test.tsx`: provider/runtime rendering tests for task focus and pause overlay.
- Create `frontend/src/components/__tests__/TaskFocusWork.test.tsx`: task-focus renderer tests for content loading, pause/resume, and finish actions.
- Modify `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`: paused chip coverage.
- Modify `frontend/src/components/__tests__/Navigation.test.tsx`: confirm nav remains locked while task focus is fullscreen and paused.

## Data Decisions

- `task_focus` is a real `FocusWorkType`, not an implicit frontend-only alias.
- Paused task focus remains `state = 'focus'`; pause is expressed with `is_paused = true`.
- `paused_at` is the sole timestamp needed for accurate resume. Resume shifts `phase_started_at` forward by the paused duration.
- Task detail for the expandable panel comes from the existing `GET /todo/tasks/{task_id}` endpoint. V1 uses `title`, `content`, `tags`, and cycle metadata already present on `TaskOut`; it does not invent a new checklist data model.
- `skip_phase` remains “finish current phase early”; it must not be reused or renamed for pause.

---

### Task 1: Backend Runtime Fields For `task_focus` And Pause State

**Files:**
- Modify: `backend/routes/todo/schemas.py`
- Modify: `backend/routes/todo/db.py`
- Test: `backend/tests/test_focus_workflow_app_work.py`

- [ ] **Step 1: Add failing schema/runtime tests**

Append these tests to `backend/tests/test_focus_workflow_app_work.py`:

```python
def test_focus_workflow_phase_accepts_task_focus_type():
    phase = FocusWorkflowPhase(
        phase_type="focus",
        duration=1500,
        timer_mode="countdown",
        focus_work_type="task_focus",
    )

    assert phase.focus_work_type == "task_focus"


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
```

- [ ] **Step 2: Run RED backend schema tests**

Run: `cd backend && uv run pytest tests/test_focus_workflow_app_work.py -q`

Expected: FAIL because `task_focus` is not an allowed literal and `FocusWorkflowOut` does not expose `is_paused`.

- [ ] **Step 3: Extend workflow schemas**

In `backend/routes/todo/schemas.py`, change the focus-work literals to:

```python
FocusWorkType = Literal["vocab_today", "erc_review", "task_focus"]
FocusWorkDisplayState = Literal["fullscreen", "minimized", "closed"]
FocusWorkResult = Literal["completed", "interrupted", "abandoned"]
```

Extend `FocusWorkflowOut` with:

```python
is_paused: bool = False
```

Keep `FocusWorkflowPhase.focus_work_type` nullable so existing presets remain valid.

- [ ] **Step 4: Add database columns**

In `backend/routes/todo/db.py`, add these migrations inside `init_todo`:

```sql
ALTER TABLE focus_workflows
ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE focus_workflows
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ NULL;
```

Also widen the existing focus-work type check to accept `task_focus` anywhere `focus_work_type` is validated.

- [ ] **Step 5: Run GREEN backend schema tests**

Run: `cd backend && uv run pytest tests/test_focus_workflow_app_work.py -q`

Expected: PASS.

- [ ] **Step 6: Commit backend runtime field scaffolding**

```bash
git add backend/routes/todo/schemas.py backend/routes/todo/db.py backend/tests/test_focus_workflow_app_work.py
git commit -m "feat(backend): add task focus runtime fields"
```

---

### Task 2: Backend Workflow Semantics For Task Focus, Pause, Resume, And Finish Actions

**Files:**
- Modify: `backend/routes/todo/helpers.py`
- Modify: `backend/routes/todo/routes.py`
- Test: `backend/tests/test_focus_workflow_app_work.py`
- Test: `backend/tests/test_todo_routes.py`

- [ ] **Step 1: Add failing helper tests for task-focus activation and resume math**

Append to `backend/tests/test_focus_workflow_app_work.py`:

```python
def test_row_to_focus_workflow_marks_task_bound_focus_phase_as_task_focus():
    row = Row(
        id="00000000-0000-0000-0000-000000000002",
        user_id=1,
        task_id="00000000-0000-0000-0000-000000000101",
        runtime_task_id="00000000-0000-0000-0000-000000000101",
        workflow_name="Task Focus",
        phases=[{"phase_type": "focus", "duration": 1500, "timer_mode": "countdown", "task_id": "00000000-0000-0000-0000-000000000101"}],
        current_phase_index=0,
        focus_duration=1500,
        break_duration=300,
        current_phase="focus",
        phase_started_at=datetime.now(UTC),
        phase_planned_duration=1500,
        pending_confirmation=False,
        pending_task_selection=False,
        active_focus_work_type=None,
        focus_work_display_state=None,
        focus_work_result=None,
        focus_work_progress_snapshot=None,
        is_paused=False,
        record_focus=True,
    )

    out = _row_to_focus_workflow(row, task_title="撰写周报")

    assert out.active_focus_work_type == "task_focus"
    assert out.focus_work_display_state == "fullscreen"


def test_row_to_focus_workflow_exposes_paused_task_focus():
    row = Row(
        id="00000000-0000-0000-0000-000000000003",
        user_id=1,
        task_id="00000000-0000-0000-0000-000000000102",
        runtime_task_id="00000000-0000-0000-0000-000000000102",
        workflow_name="Task Focus",
        phases=[{"phase_type": "focus", "duration": 1500, "timer_mode": "countdown", "task_id": "00000000-0000-0000-0000-000000000102"}],
        current_phase_index=0,
        focus_duration=1500,
        break_duration=300,
        current_phase="focus",
        phase_started_at=datetime.now(UTC),
        phase_planned_duration=1500,
        pending_confirmation=False,
        pending_task_selection=False,
        active_focus_work_type="task_focus",
        focus_work_display_state="fullscreen",
        focus_work_result=None,
        focus_work_progress_snapshot=None,
        is_paused=True,
        record_focus=True,
    )

    out = _row_to_focus_workflow(row, task_title="撰写周报")

    assert out.active_focus_work_type == "task_focus"
    assert out.is_paused is True
```

- [ ] **Step 2: Add failing route tests for pause/resume**

Add targeted tests in `backend/tests/test_todo_routes.py` that assert:

```python
def test_pause_focus_workflow_marks_task_focus_as_paused(client, token_headers, conn):
    conn.workflow.update(
        {
            "current_phase": "focus",
            "task_id": uuid4(),
            "runtime_task_id": uuid4(),
            "pending_confirmation": False,
            "pending_task_selection": False,
            "active_focus_work_type": "task_focus",
            "focus_work_display_state": "fullscreen",
            "is_paused": False,
            "paused_at": None,
        }
    )

    resp = client.post("/todo/focus/workflow/pause", headers=token_headers)

    assert resp.status_code == 200
    assert resp.json()["is_paused"] is True
    assert resp.json()["active_focus_work_type"] == "task_focus"


def test_resume_focus_workflow_clears_paused_state(client, token_headers, conn):
    conn.workflow.update(
        {
            "current_phase": "focus",
            "task_id": uuid4(),
            "runtime_task_id": uuid4(),
            "pending_confirmation": False,
            "pending_task_selection": False,
            "active_focus_work_type": "task_focus",
            "focus_work_display_state": "fullscreen",
            "is_paused": True,
            "paused_at": datetime.now(UTC),
        }
    )

    resp = client.post("/todo/focus/workflow/resume", headers=token_headers)

    assert resp.status_code == 200
    assert resp.json()["is_paused"] is False
```

- [ ] **Step 3: Run RED backend workflow tests**

Run:

```bash
cd backend && uv run pytest tests/test_focus_workflow_app_work.py tests/test_todo_routes.py -q
```

Expected: FAIL because task-bound phases do not auto-activate `task_focus` and pause/resume routes do not exist.

- [ ] **Step 4: Implement helper semantics**

In `backend/routes/todo/helpers.py`, add or update logic so `_row_to_focus_workflow(...)` derives `task_focus` automatically when all of the following are true:

```python
current_phase_is_focus = row["current_phase"] == "focus"
has_bound_task = _record_get(row, "task_id") is not None
has_runtime_task = _record_get(row, "runtime_task_id") is not None
not_pending = not pending and not pending_task_selection
active_focus_work_type is None
```

Then synthesize:

```python
active_focus_work_type = "task_focus"
focus_work_display_state = "fullscreen"
```

Also expose:

```python
is_paused = bool(_record_get(row, "is_paused", False))
```

When paused, keep `remaining_seconds` frozen by using stored `phase_started_at` + `phase_planned_duration` without advancing phase state.

- [ ] **Step 5: Implement pause/resume helpers and routes**

Add helper functions like:

```python
async def _pause_task_focus_phase(conn, workflow_id):
    await conn.execute(
        """
        UPDATE focus_workflows
        SET is_paused = TRUE,
            paused_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        """,
        workflow_id,
    )


async def _resume_task_focus_phase(conn, workflow_id, paused_at):
    await conn.execute(
        """
        UPDATE focus_workflows
        SET phase_started_at = phase_started_at + (NOW() - $2::timestamptz),
            is_paused = FALSE,
            paused_at = NULL,
            updated_at = NOW()
        WHERE id = $1
        """,
        workflow_id,
        paused_at,
    )
```

Add routes to `backend/routes/todo/routes.py`:

```python
@router.post("/focus/workflow/pause", response_model=FocusWorkflowOut)
async def pause_focus_workflow(...):
    ...


@router.post("/focus/workflow/resume", response_model=FocusWorkflowOut)
async def resume_focus_workflow(...):
    ...
```

Rules:
- only allow when `state == 'focus'`
- only allow when `active_focus_work_type == 'task_focus'`
- forbid pause if `pending_confirmation` or `pending_task_selection`
- forbid resume unless `is_paused == True`
- do not close the open focus log on pause
- do not advance the workflow on pause or resume

- [ ] **Step 6: Wire finish actions for task focus**

When the task-focus renderer completes:
- `完成本轮专注` should reuse the existing phase-finish path by posting `focus-work-result` with `focus_work_type = 'task_focus'` and `result = 'completed'`.
- `完成任务并结束专注` should:
  1. call `POST /todo/tasks/{task_id}/complete`
  2. then submit `focus-work-result` with `completed`

Backend validation for `focus-work-result` must accept `task_focus`.

- [ ] **Step 7: Run GREEN backend route + helper tests**

Run:

```bash
cd backend && uv run pytest tests/test_focus_workflow_app_work.py tests/test_todo_routes.py -q
cd backend && uv run ruff check routes/todo tests/test_focus_workflow_app_work.py tests/test_todo_routes.py
```

Expected: PASS.

- [ ] **Step 8: Commit backend task-focus runtime behavior**

```bash
git add backend/routes/todo/helpers.py backend/routes/todo/routes.py backend/tests/test_focus_workflow_app_work.py backend/tests/test_todo_routes.py
git commit -m "feat(backend): add task focus pause runtime"
```

---

### Task 3: Frontend Task-Focus Renderer And Provider Integration

**Files:**
- Modify: `frontend/src/components/focus-work/focusWorkTypes.ts`
- Modify: `frontend/src/components/focus-work/focusWorkRegistry.tsx`
- Modify: `frontend/src/components/focus-work/FocusWorkProvider.tsx`
- Create: `frontend/src/components/focus-work/TaskFocusWork.tsx`
- Create: `frontend/src/components/__tests__/FocusWorkProvider.test.tsx`
- Create: `frontend/src/components/__tests__/TaskFocusWork.test.tsx`

- [ ] **Step 1: Add failing provider/runtime tests**

Create `frontend/src/components/__tests__/FocusWorkProvider.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import FocusWorkProvider from '../focus-work/FocusWorkProvider';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(async (path: string) => {
    if (path === '/todo/focus/workflow/current') {
      return {
        state: 'focus',
        current_phase_index: 0,
        phases: [{ phase_type: 'focus', duration: 1500, task_id: 'task-1' }],
        task_id: 'task-1',
        task_title: '撰写周报',
        pending_confirmation: false,
        pending_task_selection: false,
        remaining_seconds: 1200,
        elapsed_seconds: 300,
        active_focus_work_type: 'task_focus',
        focus_work_display_state: 'fullscreen',
        is_paused: false,
        record_focus: true,
      };
    }
    if (path === '/todo/tasks/task-1') {
      return { id: 'task-1', title: '撰写周报', content: '整理本周交付内容', tags: ['report'], status: 'todo' };
    }
    return { state: 'normal' };
  }),
}));

it('renders fullscreen task focus when current workflow exposes task_focus', async () => {
  render(
    <FocusWorkProvider>
      <div>Page</div>
    </FocusWorkProvider>,
  );

  expect(await screen.findByText('撰写周报')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '暂停专注' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Add failing task-focus renderer tests**

Create `frontend/src/components/__tests__/TaskFocusWork.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import TaskFocusWork from '../focus-work/TaskFocusWork';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(async (path: string) => {
    if (path === '/todo/tasks/task-1') {
      return {
        id: 'task-1',
        title: '撰写周报',
        content: '整理本周交付内容',
        tags: ['report'],
        status: 'todo',
        target_duration: 1500,
        actual_duration: 600,
        current_cycle_count: 0,
        target_cycle_count: 0,
      };
    }
    return {};
  }),
}));

it('shows title, timer actions, and collapsed detail toggle', async () => {
  render(
    <TaskFocusWork
      workflow={{
        state: 'focus',
        task_id: 'task-1',
        task_title: '撰写周报',
        remaining_seconds: 1200,
        elapsed_seconds: 300,
        pending_confirmation: false,
        pending_task_selection: false,
        is_paused: false,
      }}
      recordFocus
      onPause={vi.fn()}
      onResume={vi.fn()}
      onComplete={vi.fn()}
      onCompleteTaskAndFinish={vi.fn()}
      onAbandon={vi.fn()}
    />,
  );

  expect(await screen.findByText('撰写周报')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '暂停专注' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '完成本轮专注' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '完成任务并结束专注' })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run RED frontend task-focus tests**

Run:

```bash
cd frontend && pnpm test -- FocusWorkProvider.test.tsx TaskFocusWork.test.tsx
```

Expected: FAIL because `task_focus` is not registered and `TaskFocusWork` does not exist.

- [ ] **Step 4: Extend focus-work types and provider protocol**

In `frontend/src/components/focus-work/focusWorkTypes.ts`, update the shared types to:

```ts
export type FocusWorkType = 'vocab_today' | 'erc_review' | 'task_focus';

export type FocusWorkSnapshot = {
  state: 'normal' | 'focus' | 'break';
  task_id?: string | null;
  task_title?: string | null;
  active_focus_work_type?: FocusWorkType | null;
  focus_work_display_state?: FocusWorkDisplayState | null;
  record_focus?: boolean;
  remaining_seconds?: number | null;
  elapsed_seconds?: number | null;
  pending_confirmation?: boolean;
  pending_task_selection?: boolean;
  is_paused?: boolean;
};

export type FocusWorkRendererProps = {
  workflow: FocusWorkSnapshot;
  recordFocus: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onComplete: (progressSnapshot?: Record<string, unknown>) => void;
  onCompleteTaskAndFinish?: () => void;
  onAbandon: (progressSnapshot?: Record<string, unknown>) => void;
};
```

Keep existing Vocab/ERC renderers compatible by treating the new props as optional.

- [ ] **Step 5: Implement `TaskFocusWork`**

Create `frontend/src/components/focus-work/TaskFocusWork.tsx` with this structure:

```tsx
export default function TaskFocusWork({ workflow, onPause, onResume, onComplete, onAbandon, onCompleteTaskAndFinish }: TaskFocusWorkProps) {
  const [task, setTask] = React.useState<Task | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!workflow.task_id) return;
    void apiJson<Task>(`/todo/tasks/${workflow.task_id}`).then(setTask);
  }, [workflow.task_id]);

  return (
    <div className="relative flex h-full flex-col">
      <main className="mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center px-8 text-center">
        <div className="text-xs uppercase tracking-[0.24em] text-white/40">Task Focus</div>
        <h1 className="mt-6 text-4xl font-semibold text-white">{workflow.task_title ?? task?.title ?? '未命名任务'}</h1>
        <p className="mt-8 font-mono text-6xl text-white">{timerText}</p>
        <button type="button" onClick={() => setDetailsOpen((open) => !open)}>查看任务细节</button>
      </main>
      {workflow.is_paused ? <PauseOverlay onResume={onResume} /> : null}
      <footer className="flex items-center justify-center gap-3 border-t border-white/10 px-6 py-5">
        <button type="button" onClick={onPause}>暂停专注</button>
        <button type="button" onClick={() => onComplete({ taskId: workflow.task_id })}>完成本轮专注</button>
        <button type="button" onClick={onCompleteTaskAndFinish}>完成任务并结束专注</button>
        <button type="button" onClick={() => onAbandon({ taskId: workflow.task_id })}>放弃本阶段</button>
      </footer>
    </div>
  );
}
```

Use the existing `workflow.remaining_seconds` / `workflow.elapsed_seconds` as the source of truth, and freeze the visible timer whenever `workflow.is_paused` is true.

- [ ] **Step 6: Register and mount task focus**

In `frontend/src/components/focus-work/focusWorkRegistry.tsx`:

```tsx
import TaskFocusWork from './TaskFocusWork';

task_focus: {
  type: 'task_focus',
  title: '任务专注',
  subtitle: '自定义任务',
  render: (props) => <TaskFocusWork {...props} />,
},
```

In `FocusWorkProvider.tsx`, pass the current workflow snapshot into renderers and add actions:

```tsx
activeDefinition.render({
  workflow: snapshot,
  recordFocus,
  onPause: () => void pauseFocusWork(),
  onResume: () => void resumeFocusWork(),
  onComplete: (progressSnapshot) => void submitResult('completed', progressSnapshot),
  onCompleteTaskAndFinish: () => void completeTaskAndFinishCurrentFocus(),
  onAbandon: (progressSnapshot) => void submitResult('abandoned', progressSnapshot),
})
```

Add provider methods:

```tsx
async function pauseFocusWork() {
  const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/pause', { method: 'POST' });
  setSnapshot(next);
}

async function resumeFocusWork() {
  const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/resume', { method: 'POST' });
  setSnapshot(next);
}

async function completeTaskAndFinishCurrentFocus() {
  if (!snapshot?.task_id) return;
  await apiJson(`/todo/tasks/${snapshot.task_id}/complete`, { method: 'POST' });
  const next = await apiJson<FocusWorkSnapshot>('/todo/focus/workflow/focus-work-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      focus_work_type: 'task_focus',
      result: 'completed',
      progress_snapshot: { taskId: snapshot.task_id, completedTask: true },
    }),
  });
  setSnapshot(next);
}
```

- [ ] **Step 7: Run GREEN frontend task-focus tests**

Run:

```bash
cd frontend && pnpm test -- FocusWorkProvider.test.tsx TaskFocusWork.test.tsx
cd frontend && pnpm check
```

Expected: PASS.

- [ ] **Step 8: Commit frontend task-focus renderer**

```bash
git add frontend/src/components/focus-work/focusWorkTypes.ts frontend/src/components/focus-work/focusWorkRegistry.tsx frontend/src/components/focus-work/FocusWorkProvider.tsx frontend/src/components/focus-work/TaskFocusWork.tsx frontend/src/components/__tests__/FocusWorkProvider.test.tsx frontend/src/components/__tests__/TaskFocusWork.test.tsx
git commit -m "feat(frontend): add task focus work view"
```

---

### Task 4: Capsule, Navigation Lock, And Final Integration Coverage

**Files:**
- Modify: `frontend/src/components/workflowProgress.ts`
- Modify: `frontend/src/components/WorkflowNavProgress.tsx`
- Modify: `frontend/src/components/Navigation.tsx`
- Modify: `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`
- Modify: `frontend/src/components/__tests__/Navigation.test.tsx`
- Modify: `frontend/src/lib/__tests__/workflowNotifications.test.ts`

- [ ] **Step 1: Add failing paused-chip tests**

Append to `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`:

```tsx
it('shows paused task focus copy and hides pulse while task focus is paused', () => {
  render(
    <WorkflowNavProgress
      workflow={makeWorkflow({
        task_title: '撰写周报',
        active_focus_work_type: 'task_focus',
        focus_work_display_state: 'fullscreen',
        is_paused: true,
        remaining_seconds: 754,
      })}
    />,
  );

  expect(screen.getByText('已暂停')).toBeInTheDocument();
  expect(screen.getByText('12:34')).toBeInTheDocument();
  expect(screen.queryByTestId('workflow-nav-pulse')).not.toBeInTheDocument();
});
```

Append to `frontend/src/components/__tests__/Navigation.test.tsx`:

```tsx
it('keeps navigation locked while fullscreen task focus is paused', async () => {
  mockApiJson.mockResolvedValue({
    state: 'focus',
    current_phase_index: 0,
    phases: [{ phase_type: 'focus', duration: 1500, task_id: 'task-1' }],
    task_id: 'task-1',
    task_title: '撰写周报',
    pending_confirmation: false,
    pending_task_selection: false,
    remaining_seconds: 1200,
    elapsed_seconds: 300,
    active_focus_work_type: 'task_focus',
    focus_work_display_state: 'fullscreen',
    is_paused: true,
  });

  renderNavigation();

  await waitFor(() => expect(screen.getByRole('button', { name: 'Home' })).toBeDisabled());
});
```

- [ ] **Step 2: Run RED integration tests**

Run:

```bash
cd frontend && pnpm test -- WorkflowNavProgress.test.tsx Navigation.test.tsx workflowNotifications.test.ts
```

Expected: FAIL because paused task-focus state is not surfaced in snapshot types or chip rendering.

- [ ] **Step 3: Update snapshot/progress math**

In `frontend/src/components/workflowProgress.ts`, add:

```ts
is_paused?: boolean;
```

When deriving current elapsed or remaining seconds, treat paused task focus as frozen:

```ts
if (workflow.is_paused) {
  return workflow.remaining_seconds ?? null;
}
```

Do not treat pause as `pending_confirmation`.

- [ ] **Step 4: Update chip copy and nav locking**

In `WorkflowNavProgress.tsx`, branch title/copy like:

```tsx
const isPausedTaskFocus = workflowForMetrics.state === 'focus'
  && workflowForMetrics.active_focus_work_type === 'task_focus'
  && workflowForMetrics.is_paused;

const titleText = isPausedTaskFocus ? '已暂停' : existingTitleText;
const showPulse = !isPausedTaskFocus && !workflowForMetrics.pending_confirmation && !workflowForMetrics.pending_task_selection;
```

In `Navigation.tsx`, keep fullscreen lock behavior based on:

```ts
workflow?.state === 'focus' && workflow?.focus_work_display_state === 'fullscreen'
```

Paused task focus still satisfies that condition; no separate unlock rule should be introduced.

- [ ] **Step 5: Run GREEN frontend integration tests**

Run:

```bash
cd frontend && pnpm test -- WorkflowNavProgress.test.tsx Navigation.test.tsx workflowNotifications.test.ts
cd frontend && pnpm check
```

Expected: PASS.

- [ ] **Step 6: Full-stack verification and commit**

Run:

```bash
cd backend && uv run pytest tests/test_focus_workflow_app_work.py tests/test_todo_routes.py -q
cd backend && uv run ruff check routes/todo tests/test_focus_workflow_app_work.py tests/test_todo_routes.py
cd frontend && pnpm test -- FocusWorkProvider.test.tsx TaskFocusWork.test.tsx WorkflowNavProgress.test.tsx Navigation.test.tsx workflowNotifications.test.ts
cd frontend && pnpm check
```

Expected:
- backend pytest: PASS
- backend ruff: PASS
- frontend vitest target set: PASS
- frontend type-check: PASS

Commit:

```bash
git add backend/routes/todo backend/tests/test_focus_workflow_app_work.py backend/tests/test_todo_routes.py frontend/src/components/focus-work frontend/src/components/WorkflowNavProgress.tsx frontend/src/components/Navigation.tsx frontend/src/components/workflowProgress.ts frontend/src/components/__tests__/FocusWorkProvider.test.tsx frontend/src/components/__tests__/TaskFocusWork.test.tsx frontend/src/components/__tests__/WorkflowNavProgress.test.tsx frontend/src/components/__tests__/Navigation.test.tsx frontend/src/lib/__tests__/workflowNotifications.test.ts
git commit -m "feat: add task focus work pause runtime"
```

---

## Spec Coverage Review

- Unified runtime with `task_focus`: covered by Tasks 1-3.
- Minimal immersive task page with collapsible details: covered by Task 3.
- Pause/resume as in-phase state, not `skip_phase`: covered by Task 2 and Task 4.
- Existing finish actions preserved: covered by Task 2 and Task 3.
- Capsule paused copy and frozen time: covered by Task 4.
- Navigation remains locked during fullscreen paused task focus: covered by Task 4.

## Placeholder Scan

- No `TODO`/`TBD` placeholders remain.
- All new endpoints, fields, and component names are explicitly named.
- Every task includes concrete files, concrete tests, concrete commands, and expected outcomes.

## Type Consistency Review

- Backend `FocusWorkType` uses `task_focus` everywhere.
- Pause fields use `is_paused` and `paused_at` consistently in schema, DB, helpers, and frontend snapshots.
- Frontend renderer props consistently use `workflow`, `onPause`, and `onResume`.
