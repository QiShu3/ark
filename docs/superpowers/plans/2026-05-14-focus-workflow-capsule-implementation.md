# Focus Workflow Capsule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable version of page-level focus work for Vocab and ERC, strongly bound to the existing workflow capsule and workflow phases.

**Architecture:** Extend the existing focus workflow runtime instead of creating a separate focus system. Backend workflow phases gain `focus_work_type`, runtime display/result fields, and app-work log records; frontend gains a `FocusWorkProvider` that opens the 90% main-area modal, blocks underlying content, and lets Vocab/ERC register page-level focus work.

**Tech Stack:** FastAPI, asyncpg/PostgreSQL JSONB, Pydantic, React, TypeScript, Vite, Vitest, Testing Library, pytest.

---

## File Structure

- Modify `backend/routes/todo/schemas.py`: add focus-work literals, request/response models, and workflow output fields.
- Modify `backend/routes/todo/db.py`: add workflow runtime columns and a separate `focus_app_work_logs` table so app work does not depend on `focus_logs.task_id`.
- Modify `backend/routes/todo/helpers.py`: normalize phase `focus_work_type`, derive display state, start/finish app-work logs, advance phases with minimized/closed/fullscreen rules.
- Modify `backend/routes/todo/routes.py`: add child-app entry and focus-work result endpoints; include new columns in workflow queries.
- Modify `frontend/src/components/workflowProgress.ts`: add shared focus-work types to workflow snapshots.
- Modify `frontend/src/components/workflowPresetForm.ts`: allow workflow preset focus phases to bind page-level focus work.
- Modify `frontend/src/components/WorkflowPresetModal.tsx`: expose focus-work binding selector in phase configuration.
- Modify `frontend/src/components/WorkflowNavProgress.tsx`: display workflow state as `default / focus / break`, active page-level work, record state, and minimized marker.
- Create `frontend/src/components/focus-work/focusWorkTypes.ts`: shared focus-work protocol for page registration and result payloads.
- Create `frontend/src/components/focus-work/FocusWorkProvider.tsx`: owns modal state, record prompt, app-work entry, and backend result submission.
- Create `frontend/src/components/focus-work/FocusWorkModalShell.tsx`: 90% main-content modal below navbar with inert dim layer.
- Create `frontend/src/components/focus-work/focusWorkRegistry.tsx`: maps `vocab_today` and `erc_review` to registered renderers.
- Modify `frontend/src/App.tsx` or the root layout file that wraps routes: mount `FocusWorkProvider` below `Navigation` and above route content.
- Modify `frontend/src/pages/Vocab/Home.tsx`: change `开始今日单词/继续今日单词` from route link to focus-work entry.
- Create `frontend/src/components/Vocab/VocabTodayFocusWork.tsx`: modal-compatible wrapper around the existing Today learning UI.
- Modify `frontend/src/pages/ERC/Home.tsx`: change `开始复习` from route link to focus-work entry.
- Create `frontend/src/components/ERC/ERCReviewFocusWork.tsx`: modal-compatible wrapper around the existing ERC review UI.
- Modify `frontend/src/pages/Vocab/Today.tsx` and `frontend/src/pages/ERC/Review.tsx`: reuse the extracted focus-work components for normal route compatibility.
- Add/update backend tests under `backend/tests/`.
- Add/update frontend tests under `frontend/src/components/__tests__/` and existing page tests.

---

## Data Decisions

- App-work focus records use a new table `focus_app_work_logs`, not `focus_logs`, because `focus_logs.task_id` is intentionally task-bound and currently `NOT NULL`.
- `resultDetail` is not used. Runtime and logs use `focus_work_type`, `result`, `progress_snapshot`, `display_state`, and `record_focus`.
- `completed`, `interrupted`, and `abandoned` end only the current focus phase. The whole workflow remains controlled by its own stop button.
- A child-app temporary entry prompts for `record_focus` only when the entry comes from the child app, not when the workflow preset advances into the focus phase.
- When no workflow is active, child-app temporary entry creates a temporary workflow with one temporary focus phase.
- When the active workflow is in `break`, child-app temporary entry inserts a temporary focus phase and a following 5-minute break after the current break.
- During `focus`, child-app temporary entry is not reachable because the main content is inert.

---

## Task 1: Backend Models And App-Work Log Schema

**Files:**
- Modify: `backend/routes/todo/schemas.py`
- Modify: `backend/routes/todo/db.py`
- Test: `backend/tests/test_focus_workflow_app_work.py`

- [ ] **Step 1: Write failing backend schema tests**

Create `backend/tests/test_focus_workflow_app_work.py` with tests that assert:

```python
from backend.routes.todo.schemas import FocusWorkflowPhase, FocusWorkflowOut


def test_focus_workflow_phase_accepts_focus_work_type():
    phase = FocusWorkflowPhase(phase_type="focus", duration=1500, timer_mode="countdown", focus_work_type="vocab_today")

    assert phase.focus_work_type == "vocab_today"
    assert phase.task_id is None


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
```

- [ ] **Step 2: Run schema tests and verify RED**

Run: `cd backend && uv run pytest tests/test_focus_workflow_app_work.py -q`

Expected: FAIL because `focus_work_type` and runtime output fields do not exist yet.

- [ ] **Step 3: Add schemas**

Add literals and models:

```python
FocusWorkType = Literal["vocab_today", "erc_review"]
FocusWorkDisplayState = Literal["fullscreen", "minimized", "closed"]
FocusWorkResult = Literal["completed", "interrupted", "abandoned"]


class FocusWorkflowStartAppWorkRequest(BaseModel):
    focus_work_type: FocusWorkType
    record_focus: bool = True


class FocusWorkflowResultRequest(BaseModel):
    focus_work_type: FocusWorkType
    result: FocusWorkResult
    progress_snapshot: dict[str, object] = Field(default_factory=dict)
```

Extend `FocusWorkflowPhase` with:

```python
focus_work_type: FocusWorkType | None = None
is_temporary: bool = False
record_focus: bool = True
```

Extend `FocusWorkflowOut` with:

```python
active_focus_work_type: FocusWorkType | None = None
focus_work_display_state: FocusWorkDisplayState | None = None
focus_work_result: FocusWorkResult | None = None
focus_work_progress_snapshot: dict[str, object] | None = None
next_focus_work_type: FocusWorkType | None = None
has_minimized_work: bool = False
record_focus: bool = True
```

- [ ] **Step 4: Add database columns and table**

In `init_todo`, add `ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS ...` for:

```sql
active_focus_work_type VARCHAR(40) NULL;
focus_work_display_state VARCHAR(20) NULL;
focus_work_result VARCHAR(20) NULL;
focus_work_progress_snapshot JSONB NULL;
record_focus BOOLEAN NOT NULL DEFAULT TRUE;
```

Create app-work log table:

```sql
CREATE TABLE IF NOT EXISTS focus_app_work_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  workflow_id UUID NULL REFERENCES focus_workflows(id) ON DELETE SET NULL,
  focus_work_type VARCHAR(40) NOT NULL,
  result VARCHAR(20) NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at TIMESTAMPTZ NULL,
  progress_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_focus BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_focus_app_work_logs_type CHECK (focus_work_type IN ('vocab_today', 'erc_review')),
  CONSTRAINT chk_focus_app_work_logs_result CHECK (result IS NULL OR result IN ('completed', 'interrupted', 'abandoned')),
  CONSTRAINT chk_focus_app_work_logs_duration CHECK (duration >= 0),
  CONSTRAINT chk_focus_app_work_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time)
);
```

Add unique open-log index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uniq_focus_app_work_open_per_user
ON focus_app_work_logs(user_id)
WHERE end_at IS NULL AND record_focus = TRUE;
```

- [ ] **Step 5: Run backend schema tests and verify GREEN**

Run: `cd backend && uv run pytest tests/test_focus_workflow_app_work.py -q`

Expected: PASS.

---

## Task 2: Backend Workflow Runtime Semantics

**Files:**
- Modify: `backend/routes/todo/helpers.py`
- Modify: `backend/routes/todo/routes.py`
- Test: `backend/tests/test_focus_workflow_app_work.py`

- [ ] **Step 1: Add failing tests for phase normalization and runtime output**

Append tests for `_normalize_workflow_phases` and `_row_to_focus_workflow`:

```python
from datetime import datetime, timezone

from backend.routes.todo.helpers import _normalize_workflow_phases, _row_to_focus_workflow


class Row(dict):
    def __getattr__(self, name):
        return self[name]


def test_normalize_workflow_phases_preserves_focus_work_type():
    phases = _normalize_workflow_phases(
        [{"phase_type": "focus", "duration": 900, "timer_mode": "countdown", "focus_work_type": "vocab_today"}],
        fallback_focus_duration=1500,
        fallback_break_duration=300,
    )

    assert phases[0]["focus_work_type"] == "vocab_today"
    assert phases[0]["task_id"] is None


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
        phase_started_at=datetime.now(timezone.utc),
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
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend && uv run pytest tests/test_focus_workflow_app_work.py -q`

Expected: FAIL because helpers do not preserve or expose focus-work fields.

- [ ] **Step 3: Implement helper support**

Update helper functions so that:

```python
def _phase_focus_work_type_value(phase: dict[str, Any] | FocusWorkflowPhase) -> str | None:
    ...
```

Preserve `focus_work_type`, `is_temporary`, and `record_focus` during normalization for focus phases. Clear `focus_work_type` for break phases.

Extend `_phase_models_from_row` to pass these fields into `FocusWorkflowPhase`.

Extend `_row_to_focus_workflow` to:

```python
active_focus_work_type = row.get("active_focus_work_type") if hasattr(row, "get") else row["active_focus_work_type"]
display_state = row.get("focus_work_display_state") if hasattr(row, "get") else row["focus_work_display_state"]
next_focus_work_type = _next_focus_phase_work_type(phases, current_phase_index)
has_minimized_work = display_state == "minimized" and active_focus_work_type is not None
```

- [ ] **Step 4: Implement app-work log helpers**

Add helpers:

```python
async def _start_focus_app_work_log(conn, user_id: int, workflow_id: UUID, focus_work_type: str, record_focus: bool) -> None:
    if not record_focus:
        return
    await conn.execute(...)


async def _close_open_focus_app_work_log(conn, user_id: int, result: str, progress_snapshot: dict[str, Any]) -> dict[str, Any] | None:
    ...
```

- [ ] **Step 5: Add routes**

Add `POST /todo/focus/workflow/start-app-work`:

```python
@router.post("/focus/workflow/start-app-work", response_model=FocusWorkflowOut)
async def start_focus_workflow_app_work(...):
    ...
```

Behavior:
- no active workflow: create temporary workflow with one focus phase bound to `focus_work_type`.
- active break: insert temporary focus phase and following 300-second break immediately after the current break.
- active focus: return `409`.
- set `active_focus_work_type`, `focus_work_display_state = 'fullscreen'`, `record_focus`.
- start app-work log only when `record_focus` is true.

Add `POST /todo/focus/workflow/focus-work-result`:

```python
@router.post("/focus/workflow/focus-work-result", response_model=FocusWorkflowOut)
async def submit_focus_work_result(...):
    ...
```

Behavior:
- verify active workflow and active focus work match the request.
- close app-work log with `result` and `progress_snapshot`.
- if result is `interrupted` and next focus phase has same `focus_work_type`, move to break with `focus_work_display_state = 'minimized'`.
- otherwise set `focus_work_display_state = 'closed'`.
- advance only the current phase, never stop the whole workflow.

- [ ] **Step 6: Run backend tests**

Run: `cd backend && uv run pytest tests/test_focus_workflow_app_work.py -q`

Expected: PASS.

---

## Task 3: Frontend Focus-Work Runtime Shell

**Files:**
- Create: `frontend/src/components/focus-work/focusWorkTypes.ts`
- Create: `frontend/src/components/focus-work/FocusWorkModalShell.tsx`
- Create: `frontend/src/components/focus-work/focusWorkRegistry.tsx`
- Create: `frontend/src/components/focus-work/FocusWorkProvider.tsx`
- Modify: root app layout file
- Test: `frontend/src/components/__tests__/FocusWorkProvider.test.tsx`

- [ ] **Step 1: Write failing provider tests**

Create `frontend/src/components/__tests__/FocusWorkProvider.test.tsx` with tests that:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FocusWorkProvider from '../focus-work/FocusWorkProvider';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/todo/focus/workflow/start-app-work') {
      return {
        state: 'focus',
        active_focus_work_type: 'vocab_today',
        focus_work_display_state: 'fullscreen',
        pending_confirmation: false,
        remaining_seconds: 1500,
      };
    }
    if (path === '/todo/focus/workflow/focus-work-result') {
      return { state: 'break', focus_work_display_state: 'closed', pending_confirmation: false, remaining_seconds: 300 };
    }
    return { state: 'normal' };
  }),
}));

describe('FocusWorkProvider', () => {
  it('prompts for recording before child-app focus work starts', async () => {
    render(
      <FocusWorkProvider>
        <button onClick={() => window.dispatchEvent(new CustomEvent('ark:start-focus-work', { detail: { focusWorkType: 'vocab_today' } }))}>
          Start
        </button>
      </FocusWorkProvider>,
    );

    await userEvent.click(screen.getByText('Start'));

    expect(await screen.findByText('记录这次专注吗？')).toBeInTheDocument();
  });

  it('shows skip copy when the user enters without recording', async () => {
    render(
      <FocusWorkProvider>
        <button onClick={() => window.dispatchEvent(new CustomEvent('ark:start-focus-work', { detail: { focusWorkType: 'vocab_today' } }))}>
          Start
        </button>
      </FocusWorkProvider>,
    );

    await userEvent.click(screen.getByText('Start'));
    await userEvent.click(await screen.findByText('不记录，直接进入'));

    expect(await screen.findByText('本次工作将不记录在专注时间中')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run provider tests and verify RED**

Run: `cd frontend && pnpm test -- FocusWorkProvider.test.tsx`

Expected: FAIL because provider and event protocol do not exist.

- [ ] **Step 3: Implement shared types and registry**

Define:

```ts
export type FocusWorkType = 'vocab_today' | 'erc_review';
export type FocusWorkResult = 'completed' | 'interrupted' | 'abandoned';
export type FocusWorkDisplayState = 'fullscreen' | 'minimized' | 'closed';
export type FocusWorkStartDetail = { focusWorkType: FocusWorkType };
export type FocusWorkRendererProps = {
  onComplete: (progressSnapshot?: Record<string, unknown>) => void;
  onInterrupt: (progressSnapshot?: Record<string, unknown>) => void;
  onAbandon: (progressSnapshot?: Record<string, unknown>) => void;
  recordFocus: boolean;
};
```

- [ ] **Step 4: Implement modal shell**

`FocusWorkModalShell` renders:
- fixed overlay starting at `top-16`
- dim/inert layer over main content
- modal panel around `w-[90vw] h-[calc((100vh-4rem)*0.9)]`
- close/abandon button with confirmation
- children content in an overflow container

- [ ] **Step 5: Implement provider**

`FocusWorkProvider` listens to:
- `ark:start-focus-work` for child-app entry and record prompt.
- `ark:reload-focus` to refresh current workflow.

It calls:
- `POST /todo/focus/workflow/start-app-work`
- `POST /todo/focus/workflow/focus-work-result`
- `GET /todo/focus/workflow/current`

- [ ] **Step 6: Mount provider at app root**

Wrap the route content so navbar remains outside the blocked content layer.

- [ ] **Step 7: Run provider tests**

Run: `cd frontend && pnpm test -- FocusWorkProvider.test.tsx`

Expected: PASS.

---

## Task 4: Workflow Preset Binding UI And Capsule Output

**Files:**
- Modify: `frontend/src/components/workflowProgress.ts`
- Modify: `frontend/src/components/workflowPresetForm.ts`
- Modify: `frontend/src/components/WorkflowPresetModal.tsx`
- Modify: `frontend/src/components/WorkflowNavProgress.tsx`
- Test: `frontend/src/components/__tests__/WorkflowNavProgress.test.tsx`
- Test: `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Add assertions that:
- preset submit payload includes `focus_work_type` for focus phases.
- break phases clear `focus_work_type`.
- capsule shows `背单词` for `active_focus_work_type: 'vocab_today'`.
- capsule shows minimized marker during break when `has_minimized_work` is true.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd frontend && pnpm test -- WorkflowNavProgress.test.tsx PlaceholderCard.workflow.test.tsx`

Expected: FAIL because focus-work binding fields are not present.

- [ ] **Step 3: Add frontend types**

Extend `WorkflowPhase` and workflow preset types with:

```ts
focus_work_type?: FocusWorkType | null;
is_temporary?: boolean;
record_focus?: boolean;
```

Extend `WorkflowSnapshot` with backend runtime fields.

- [ ] **Step 4: Update preset form and modal**

For each focus phase, add a selector:

```tsx
<option value="">不绑定页面专注工作</option>
<option value="vocab_today">背单词：今日单词</option>
<option value="erc_review">ERC：开始复习</option>
```

When a focus work is selected, keep task binding optional but visually label it as separate from page-level focus work.

- [ ] **Step 5: Update payload serialization**

In `_submitWorkflowPreset`, include:

```ts
focus_work_type: phase.phase_type === 'focus' ? phase.focus_work_type : undefined
```

- [ ] **Step 6: Redesign capsule copy**

Use labels:

```ts
const FOCUS_WORK_LABELS = {
  vocab_today: '背单词',
  erc_review: 'ERC 复习',
};
```

Show:
- `focus`: active focus work and timer.
- `break`: break timer and next focus work.
- minimized: `已挂起`.
- default/normal: keep hidden unless existing product behavior requires otherwise.

- [ ] **Step 7: Run frontend workflow tests**

Run: `cd frontend && pnpm test -- WorkflowNavProgress.test.tsx PlaceholderCard.workflow.test.tsx`

Expected: PASS.

---

## Task 5: Vocab And ERC Focus Work Components

**Files:**
- Create: `frontend/src/components/Vocab/VocabTodayFocusWork.tsx`
- Modify: `frontend/src/pages/Vocab/Today.tsx`
- Modify: `frontend/src/pages/Vocab/Home.tsx`
- Create: `frontend/src/components/ERC/ERCReviewFocusWork.tsx`
- Modify: `frontend/src/pages/ERC/Review.tsx`
- Modify: `frontend/src/pages/ERC/Home.tsx`
- Test: `frontend/src/pages/Vocab/__tests__/Home.test.tsx`
- Test: `frontend/src/pages/ERC/__tests__/Home.test.tsx`

- [ ] **Step 1: Write failing page tests**

Update Vocab Home test to expect clicking `开始今日单词/继续今日单词` dispatches:

```ts
new CustomEvent('ark:start-focus-work', { detail: { focusWorkType: 'vocab_today' } })
```

Update ERC Home test to expect clicking `开始复习` dispatches:

```ts
new CustomEvent('ark:start-focus-work', { detail: { focusWorkType: 'erc_review' } })
```

- [ ] **Step 2: Run page tests and verify RED**

Run: `cd frontend && pnpm test -- Vocab/__tests__/Home.test.tsx ERC/__tests__/Home.test.tsx`

Expected: FAIL because buttons still navigate via links.

- [ ] **Step 3: Extract Vocab Today UI**

Move the current Today inner work UI into `VocabTodayFocusWork`.

The component accepts `FocusWorkRendererProps` and calls:
- `onComplete({ completedCount, totalCount })` when the session has no current item and no batch review.
- `onAbandon({ memorizedCount, currentBatchNumber })` from shell close confirmation.

- [ ] **Step 4: Keep Vocab Today route working**

`Vocab/Today.tsx` renders `VocabTodayFocusWork` with no-op route-safe callbacks, so old route remains usable.

- [ ] **Step 5: Change Vocab Home entry**

Replace the route `<a>` with a button that dispatches `ark:start-focus-work`.

- [ ] **Step 6: Extract ERC Review UI**

Move the current Review inner work UI into `ERCReviewFocusWork`.

The component accepts `FocusWorkRendererProps` and calls:
- `onComplete({ hasItem: false })` when there is no due review.
- `onComplete({ answered: true, isCorrect })` after a submitted answer if this is the last item.
- `onInterrupt({ questionId })` if the workflow forces a transition.

- [ ] **Step 7: Keep ERC Review route working**

`ERC/Review.tsx` renders `ERCReviewFocusWork` with no-op route-safe callbacks.

- [ ] **Step 8: Change ERC Home entry**

Replace the route `<Link to="/erc/review">` with a button dispatching `ark:start-focus-work`.

- [ ] **Step 9: Run page tests**

Run: `cd frontend && pnpm test -- Vocab/__tests__/Home.test.tsx ERC/__tests__/Home.test.tsx`

Expected: PASS.

---

## Task 6: Integration Verification

**Files:**
- All changed files

- [ ] **Step 1: Run backend focused tests**

Run: `cd backend && uv run pytest tests/test_focus_workflow_app_work.py -q`

Expected: PASS.

- [ ] **Step 2: Run frontend focused tests**

Run: `cd frontend && pnpm test -- FocusWorkProvider.test.tsx WorkflowNavProgress.test.tsx PlaceholderCard.workflow.test.tsx Vocab/__tests__/Home.test.tsx ERC/__tests__/Home.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run broader checks**

Run: `cd frontend && pnpm check`

Expected: PASS.

Run: `cd backend && uv run ruff check .`

Expected: PASS.

- [ ] **Step 4: Manual browser smoke test**

Start backend and frontend if needed, then verify:
- Vocab Home click opens record prompt.
- Choosing record opens the 90% modal below navbar.
- Underlying main content is dimmed and cannot be clicked.
- Completing/abandoning exits focus state and reloads capsule.
- ERC Home `开始复习` follows the same entry flow.
- Workflow preset can bind `vocab_today` and `erc_review`.

---

## Self-Review

- Spec coverage: covers child-app entry, workflow preset binding, modal shape, inert main area, record/skip prompt, result semantics, minimized same-next-focus rule, and Vocab/ERC first integrations.
- Known narrow scope: app-work logs are separate from task focus logs in first version; aggregate stats can be extended later if product wants app-work time merged into existing task-focused statistics.
- Placeholder scan: no `TBD` or unspecified implementation slots remain.
- Type consistency: uses `focus_work_type`, `active_focus_work_type`, `focus_work_display_state`, `focus_work_result`, `focus_work_progress_snapshot`, `record_focus`, and no `resultDetail`.
