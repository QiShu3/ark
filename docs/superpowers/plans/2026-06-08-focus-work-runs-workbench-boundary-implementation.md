# Focus Work Runs And Workbench Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `focus_work_runs`, move task business back into the fullscreen workbench, and strip task/workflow business logic out of sub-app focus-work components.

**Architecture:** Keep `focus_workflows` as the phase/workflow runtime and add `focus_work_runs` as the source of truth for one concrete round of work. The backend will own run creation and state transitions, the frontend workbench will render workflow runtime states from backend snapshots, and Vocab/ERC focus-work components will become pure content runners that only save content progress and emit a content-complete signal.

**Tech Stack:** FastAPI, asyncpg/PostgreSQL, Pydantic, React, TypeScript, Vitest, Testing Library, pytest.

---

## Scope Check

This implementation is one coherent vertical slice:

1. Backend run model and runtime state.
2. Backend API changes for run creation/completion/phase ending.
3. Frontend workbench state surfaces and button semantics.
4. Sub-app focus-work de-taskification.

Do not expand scope into:

- redesigning Vocab/ERC study algorithms,
- redesigning task list pages,
- adding run analytics pages,
- rewriting break phase behavior beyond snapshot compatibility.

Before implementing, run:

```bash
git status --short --branch
```

Expected: the branch is `codex/focus-work-runs-workbench-boundary` and there may be unrelated existing doc/devlog changes in the worktree. Do not revert them. Stage only files touched by the current task.

## File Structure

Backend:

- Modify `backend/routes/todo/db.py`: add `focus_work_runs` table and new workflow runtime columns.
- Modify `backend/routes/todo/schemas.py`: add run/runtime literals, request/response models, and snapshot fields.
- Modify `backend/routes/todo/helpers.py`: add run creation/query/update helpers, map workflow rows to new runtime state, and gradually stop relying on `active_focus_work_type`/`focus_work_progress_snapshot`.
- Modify `backend/routes/todo/routes.py`: replace `start-app-work` / `focus-work-result` semantics with run-centric endpoints and phase ending semantics.
- Modify `backend/tests/test_focus_workflow_app_work.py`: cover run helpers and snapshot mapping.
- Modify `backend/tests/test_todo_routes.py`: cover new endpoints and task completion rules.

Frontend:

- Modify `frontend/src/components/focus-work/focusWorkTypes.ts`: replace task-heavy renderer props with run/content semantics and add new runtime snapshot types.
- Modify `frontend/src/components/focus-work/focusWorkRegistry.tsx`: keep adapter lookup but feed pure content props.
- Modify `frontend/src/components/focus-work/FocusWorkProvider.tsx`: drive fullscreen workbench from `active_run_id`, `phase_runtime_state`, and new run/phase actions.
- Modify `frontend/src/components/focus-work/FocusWorkModalShell.tsx`: remove `结束本轮专注`, support new header actions and status surfaces.
- Modify `frontend/src/components/Vocab/VocabTodayFocusWork.tsx`: remove workflow/task coupling and reset-command extra-practice hooks.
- Modify `frontend/src/components/ERC/ERCReviewFocusWork.tsx`: remove task completion state and reset-command extra-practice logic.
- Modify `frontend/src/components/ERC/ERCPracticeFocusWork.tsx`: remove task completion state and reset-command extra-practice logic.
- Modify or create `frontend/src/components/__tests__/FocusWorkProvider.test.tsx`: cover new workbench states.
- Modify `frontend/src/components/Vocab/VocabTodayFocusWork.test.tsx`, `frontend/src/components/ERC/ERCReviewFocusWork.test.tsx`, and `frontend/src/components/ERC/ERCPracticeFocusWork.test.tsx`: assert content-only contracts.

Docs:

- Modify `docs/开发日志.md` and `docs/devlogs/codex-focus-work-runs-workbench-boundary.md` after code commits, per repo rules.

---

### Task 1: Add Run Data Model and Snapshot Types

**Files:**
- Modify: `backend/routes/todo/db.py`
- Modify: `backend/routes/todo/schemas.py`
- Modify: `backend/routes/todo/helpers.py`
- Test: `backend/tests/test_focus_workflow_app_work.py`

- [ ] **Step 1: Write failing backend tests for run-aware snapshot fields**

Add tests to `backend/tests/test_focus_workflow_app_work.py`:

```python
def test_focus_workflow_out_exposes_run_runtime_fields():
    payload = FocusWorkflowOut(
        state="focus",
        phase_runtime_state="running_run",
        active_run_id="00000000-0000-0000-0000-000000000001",
        active_run={
            "id": "00000000-0000-0000-0000-000000000001",
            "focus_work_type": "vocab_today",
            "counts_for_task_completion": True,
            "status": "running",
            "progress_snapshot": None,
        },
    )

    assert payload.phase_runtime_state == "running_run"
    assert payload.active_run_id == "00000000-0000-0000-0000-000000000001"
    assert payload.active_run["status"] == "running"


def test_row_to_focus_workflow_prefers_phase_runtime_state_and_active_run():
    row = Row(
        id="00000000-0000-0000-0000-000000000001",
        user_id=1,
        task_id=None,
        runtime_task_id=None,
        workflow_name="Vocabulary Loop",
        phases=[{"phase_type": "focus", "duration": 900, "timer_mode": "countdown"}],
        current_phase_index=0,
        focus_duration=900,
        break_duration=300,
        current_phase="focus",
        phase_started_at=datetime.now(UTC),
        phase_planned_duration=900,
        pending_confirmation=False,
        pending_task_selection=False,
        phase_runtime_state="running_run",
        phase_runtime_state_before_timeout_prompt=None,
        active_run_id="00000000-0000-0000-0000-000000000101",
        is_paused=False,
        paused_at=None,
        record_focus=True,
    )

    out = _row_to_focus_workflow(row)
    assert out.phase_runtime_state == "running_run"
    assert out.active_run_id == "00000000-0000-0000-0000-000000000101"
```

- [ ] **Step 2: Run the backend test to verify it fails**

Run:

```bash
cd backend && uv run pytest tests/test_focus_workflow_app_work.py::test_focus_workflow_out_exposes_run_runtime_fields -q
```

Expected: FAIL because `FocusWorkflowOut` does not yet expose `phase_runtime_state`, `active_run_id`, or `active_run`.

- [ ] **Step 3: Extend schema literals and output models**

In `backend/routes/todo/schemas.py`, add new literals near existing focus workflow types:

```python
FocusWorkRunStatus = Literal["running", "paused", "content_completed", "completed", "abandoned"]
FocusWorkRunMode = Literal["counted", "extra"]
FocusPhaseRuntimeState = Literal[
    "running_run",
    "counted_run_completed_confirming",
    "extra_run_completed",
    "task_already_completed",
    "phase_time_expired_prompt",
    "pending_task_selection",
    "break_running",
]
```

Add run summary models:

```python
class FocusWorkRunSummaryOut(BaseModel):
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
```

Extend `FocusWorkflowOut`:

```python
phase_runtime_state: FocusPhaseRuntimeState | None = None
phase_runtime_state_before_timeout_prompt: FocusPhaseRuntimeState | None = None
active_run_id: UUID | None = None
active_run: FocusWorkRunSummaryOut | None = None
```

Add new request models for run actions:

```python
class FocusWorkRunCreateRequest(BaseModel):
    mode: FocusWorkRunMode


class FocusWorkRunContentCompleteRequest(BaseModel):
    progress_snapshot: dict[str, Any] = Field(default_factory=dict)


class FocusWorkflowExtendPhaseRequest(BaseModel):
    extend_seconds: int = Field(default=300, ge=60, le=24 * 60 * 60)
```

- [ ] **Step 4: Add database columns and `focus_work_runs` table**

In `backend/routes/todo/db.py`, add idempotent workflow columns:

```python
await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS active_run_id UUID NULL;")
await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS phase_runtime_state VARCHAR(80) NULL;")
await conn.execute(
    "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS phase_runtime_state_before_timeout_prompt VARCHAR(80) NULL;"
)
```

Create the run table:

```python
await conn.execute(
    """
    CREATE TABLE IF NOT EXISTS focus_work_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      workflow_id UUID NOT NULL REFERENCES focus_workflows(id) ON DELETE CASCADE,
      phase_index INTEGER NOT NULL,
      task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
      focus_work_type VARCHAR(80) NOT NULL,
      app_id VARCHAR(40) NULL,
      app_task_type VARCHAR(80) NULL,
      counts_for_task_completion BOOLEAN NOT NULL DEFAULT TRUE,
      status VARCHAR(40) NOT NULL,
      record_focus BOOLEAN NOT NULL DEFAULT TRUE,
      config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      progress_snapshot JSONB NULL,
      completion_reason VARCHAR(80) NULL,
      source_run_id UUID NULL REFERENCES focus_work_runs(id) ON DELETE SET NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paused_at TIMESTAMPTZ NULL,
      ended_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_focus_work_runs_status CHECK (status IN ('running', 'paused', 'content_completed', 'completed', 'abandoned')),
      CONSTRAINT chk_focus_work_runs_app_id CHECK (app_id IS NULL OR app_id IN ('vocab', 'erc')),
      CONSTRAINT chk_focus_work_runs_app_task_type CHECK (app_task_type IS NULL OR app_task_type IN ('vocab_today', 'erc_review', 'erc_practice'))
    );
    """
)
await conn.execute(
    "CREATE INDEX IF NOT EXISTS idx_focus_work_runs_workflow_phase ON focus_work_runs(workflow_id, phase_index, created_at ASC);"
)
```

- [ ] **Step 5: Add run-row mapping helpers**

In `backend/routes/todo/helpers.py`, add small helpers near `_row_to_focus_workflow`:

```python
def _row_to_focus_work_run_summary(row: asyncpg.Record | dict[str, Any]) -> FocusWorkRunSummaryOut:
    progress_snapshot = _record_get(row, "progress_snapshot")
    if not isinstance(progress_snapshot, dict):
        progress_snapshot = None
    config_snapshot = _record_get(row, "config_snapshot")
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
```

Update `_row_to_focus_workflow` to prefer the new fields:

```python
phase_runtime_state = _record_get(row, "phase_runtime_state")
active_run_id = _record_get(row, "active_run_id")
...
return FocusWorkflowOut(
    ...,
    phase_runtime_state=phase_runtime_state,
    phase_runtime_state_before_timeout_prompt=_record_get(row, "phase_runtime_state_before_timeout_prompt"),
    active_run_id=active_run_id,
    active_run=active_run,
)
```

- [ ] **Step 6: Run the focused backend tests**

Run:

```bash
cd backend && uv run pytest tests/test_focus_workflow_app_work.py -q
```

Expected: PASS with new run-aware schema and row mapping tests green.

- [ ] **Step 7: Commit only the backend model/scaffolding files**

Run:

```bash
git add backend/routes/todo/db.py backend/routes/todo/schemas.py backend/routes/todo/helpers.py backend/tests/test_focus_workflow_app_work.py
git commit -m "feat(backend): add focus work run model scaffolding"
```


### Task 2: Implement Run-Centric Workflow Endpoints and Task Completion Rules

**Files:**
- Modify: `backend/routes/todo/helpers.py`
- Modify: `backend/routes/todo/routes.py`
- Test: `backend/tests/test_focus_workflow_app_work.py`
- Test: `backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write failing backend tests for run lifecycle**

Add tests to `backend/tests/test_focus_workflow_app_work.py`:

```python
@pytest.mark.asyncio
async def test_create_counted_run_sets_workflow_runtime_state():
    conn = FakeWorkflowConn()
    workflow_id = uuid4()
    task_id = uuid4()

    run = await _create_focus_work_run(
        conn,
        user_id=1,
        workflow_id=workflow_id,
        phase_index=0,
        task_id=task_id,
        focus_work_type="vocab_today",
        app_id="vocab",
        app_task_type="vocab_today",
        counts_for_task_completion=True,
        record_focus=True,
        config_snapshot={"target_word_count": 100},
    )

    assert run.status == "running"
    assert run.counts_for_task_completion is True


@pytest.mark.asyncio
async def test_complete_counted_run_requires_explicit_task_confirmation(client, auth_headers):
    start = await client.post(
        "/todo/focus/workflow/runs",
        json={"mode": "counted"},
        headers=auth_headers,
    )
    assert start.status_code == 200
    run_id = start.json()["active_run"]["id"]

    complete = await client.post(
        f"/todo/focus/workflow/runs/{run_id}/content-complete",
        json={"progress_snapshot": {"completed_word_count": 100, "target_word_count": 100}},
        headers=auth_headers,
    )
    assert complete.status_code == 200
    assert complete.json()["phase_runtime_state"] == "counted_run_completed_confirming"
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
cd backend && uv run pytest tests/test_focus_workflow_app_work.py::test_create_counted_run_sets_workflow_runtime_state tests/test_todo_routes.py::test_complete_counted_run_requires_explicit_task_confirmation -q
```

Expected: FAIL because `_create_focus_work_run` and the new run endpoints do not exist yet.

- [ ] **Step 3: Add helper functions for run creation and state transitions**

In `backend/routes/todo/helpers.py`, add focused helpers instead of extending `focus-work-result` further:

```python
async def _create_focus_work_run(
    conn: Any,
    *,
    user_id: int,
    workflow_id: UUID,
    phase_index: int,
    task_id: UUID | None,
    focus_work_type: FocusWorkType,
    app_id: AppTaskId | None,
    app_task_type: AppTaskType | None,
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
    return _row_to_focus_work_run_summary(row)
```

Add helpers:

```python
async def _set_workflow_active_run(...): ...
async def _mark_run_content_completed(...): ...
async def _complete_focus_work_run(...): ...
async def _abandon_active_focus_work_run(...): ...
async def _load_active_run(...): ...
```

Use `completion_reason` values from the spec:

```python
"task_confirmed"
"extra_phase_ended"
"phase_time_expired_ended"
"run_again"
"phase_abandoned"
```

- [ ] **Step 4: Replace route semantics with run-centric endpoints**

In `backend/routes/todo/routes.py`, add or replace endpoints:

```python
@router.post("/focus/workflow/runs", response_model=FocusWorkflowOut)
async def create_focus_work_run(...): ...


@router.post("/focus/workflow/runs/{run_id}/content-complete", response_model=FocusWorkflowOut)
async def complete_focus_work_run_content(...): ...


@router.post("/focus/workflow/runs/{run_id}/complete-task-and-end-phase", response_model=FocusWorkflowOut)
async def complete_task_and_end_focus_phase(...): ...


@router.post("/focus/workflow/end-phase", response_model=FocusWorkflowOut)
async def end_focus_phase(...): ...


@router.post("/focus/workflow/extend-phase", response_model=FocusWorkflowOut)
async def extend_focus_phase(...): ...
```

Route behavior to implement:

- `POST /runs`:
  - `mode="counted"` creates the phase’s main counted run.
  - `mode="extra"` creates a non-counted run and sets runtime state back to `running_run`.
- `POST /runs/{id}/content-complete`:
  - run -> `content_completed`
  - counted run => `phase_runtime_state="counted_run_completed_confirming"`
  - extra run => `phase_runtime_state="extra_run_completed"`
- `POST /runs/{id}/complete-task-and-end-phase`:
  - verify counted run + `content_completed`
  - run -> `completed`
  - insert `completion_records`
  - end phase
- `POST /focus/workflow/end-phase`:
  - if active run is `content_completed`, mark it `completed`
  - do not insert task completion unless coming through explicit task confirmation
  - end phase
- `POST /focus/workflow/extend-phase`:
  - clear `phase_runtime_state_before_timeout_prompt`
  - return to prior state

- [ ] **Step 5: Stop using `focus-work-result` as the main control path**

In `backend/routes/todo/routes.py`, keep `/focus/workflow/focus-work-result` only as a temporary compatibility path and reduce it to:

```python
raise HTTPException(
    status_code=status.HTTP_410_GONE,
    detail="focus-work-result 已废弃，请使用 run 级接口",
)
```

If a hard cut-over is too risky for this repo state, keep it temporarily but make it internally call the new helpers and never write task completion from `progress_snapshot.completedTask`.

- [ ] **Step 6: Update pause/resume/skip-phase to respect active runs**

In `backend/routes/todo/routes.py` and `helpers.py`, update pause/resume paths:

```python
if active_run is not None:
    await conn.execute(
        "UPDATE focus_work_runs SET status = 'paused', paused_at = NOW(), updated_at = NOW() WHERE id = $1",
        active_run["id"],
    )
```

On resume:

```python
await conn.execute(
    """
    UPDATE focus_work_runs
    SET status = CASE WHEN status = 'paused' THEN 'running' ELSE status END,
        paused_at = NULL,
        updated_at = NOW()
    WHERE id = $1
    """,
    active_run["id"],
)
```

On `放弃本阶段`, call `_abandon_active_focus_work_run(...)` before ending the phase.

- [ ] **Step 7: Run backend route coverage**

Run:

```bash
cd backend && uv run pytest tests/test_focus_workflow_app_work.py tests/test_todo_routes.py -q
```

Expected: PASS with new run lifecycle endpoints, explicit task-confirmation behavior, and abandon/end-phase semantics covered.

- [ ] **Step 8: Commit the backend runtime/API slice**

Run:

```bash
git add backend/routes/todo/helpers.py backend/routes/todo/routes.py backend/tests/test_focus_workflow_app_work.py backend/tests/test_todo_routes.py
git commit -m "feat(backend): add run-centric focus workflow actions"
```


### Task 3: Rebuild the Fullscreen Workbench Around Phase Runtime State

**Files:**
- Modify: `frontend/src/components/focus-work/focusWorkTypes.ts`
- Modify: `frontend/src/components/focus-work/focusWorkRegistry.tsx`
- Modify: `frontend/src/components/focus-work/FocusWorkProvider.tsx`
- Modify: `frontend/src/components/focus-work/FocusWorkModalShell.tsx`
- Test: `frontend/src/components/__tests__/FocusWorkProvider.test.tsx`

- [ ] **Step 1: Write failing frontend workbench tests**

Create or update `frontend/src/components/__tests__/FocusWorkProvider.test.tsx`:

```tsx
it('shows counted confirmation actions after counted run content completes', async () => {
  apiJsonMock.mockResolvedValueOnce({
    state: 'focus',
    phase_runtime_state: 'counted_run_completed_confirming',
    active_run_id: 'run-1',
    active_run: {
      id: 'run-1',
      focus_work_type: 'vocab_today',
      counts_for_task_completion: true,
      status: 'content_completed',
      progress_snapshot: { completed_word_count: 100, target_word_count: 100 },
    },
    is_paused: false,
    record_focus: true,
  });

  render(<FocusWorkProvider><div>app</div></FocusWorkProvider>);

  expect(await screen.findByRole('button', { name: '完成任务并结束阶段' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '再来一轮' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '结束本轮专注' })).not.toBeInTheDocument();
});
```

Add an extra-completed test:

```tsx
it('shows extra-run actions when phase runtime is extra_run_completed', async () => {
  ...
  expect(await screen.findByRole('button', { name: '结束阶段' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '再来一轮' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused frontend test to verify it fails**

Run:

```bash
cd frontend && pnpm test src/components/__tests__/FocusWorkProvider.test.tsx
```

Expected: FAIL because the current provider still expects `active_focus_work_type` and renders `结束本轮专注`.

- [ ] **Step 3: Replace renderer props with content-only props**

In `frontend/src/components/focus-work/focusWorkTypes.ts`, replace `FocusWorkRendererProps` with a content-focused contract:

```ts
export type FocusWorkRunSummary = {
  id: string;
  workflow_id: string;
  phase_index: number;
  task_id?: string | null;
  focus_work_type: FocusWorkType;
  app_id?: AppTaskId | null;
  app_task_type?: AppTaskType | null;
  counts_for_task_completion: boolean;
  status: 'running' | 'paused' | 'content_completed' | 'completed' | 'abandoned';
  progress_snapshot?: Record<string, unknown> | null;
  config_snapshot?: Record<string, unknown> | null;
  completion_reason?: string | null;
  source_run_id?: string | null;
};

export type FocusWorkRendererProps = {
  run: FocusWorkRunSummary;
  disabled: boolean;
  onContentCompleted: (progressSnapshot?: Record<string, unknown>) => void;
};
```

Extend `FocusWorkSnapshot`:

```ts
phase_runtime_state?: 'running_run' | 'counted_run_completed_confirming' | 'extra_run_completed' | 'task_already_completed' | 'phase_time_expired_prompt' | 'pending_task_selection' | 'break_running' | null;
phase_runtime_state_before_timeout_prompt?: FocusWorkSnapshot['phase_runtime_state'];
active_run_id?: string | null;
active_run?: FocusWorkRunSummary | null;
```

- [ ] **Step 4: Remove `结束本轮专注` from the shell and add runtime action slots**

In `frontend/src/components/focus-work/FocusWorkModalShell.tsx`, update props:

```ts
type FocusWorkModalShellProps = {
  title: string;
  subtitle: string;
  recordFocus: boolean;
  isPaused?: boolean;
  busy?: boolean;
  onPause: () => void;
  onResume: () => void;
  onAbandon: () => void;
  headerBadge?: React.ReactNode;
  footerActions?: React.ReactNode;
  children: React.ReactNode;
};
```

Delete the `结束本轮专注` button and keep only:

```tsx
<button ...>{isPaused ? '继续专注' : '暂停专注'}</button>
<button ...>放弃本阶段</button>
```

Render contextual actions in the body/footer instead:

```tsx
{footerActions ? <div className="mt-4 flex flex-wrap gap-3">{footerActions}</div> : null}
```

- [ ] **Step 5: Rewrite `FocusWorkProvider` around `phase_runtime_state`**

In `frontend/src/components/focus-work/FocusWorkProvider.tsx`, delete the old `pendingStart`, `forceStart`, `isSubAppFinished`, and `resetCommandRef` flow. Replace it with:

```ts
const activeRun = snapshot?.active_run ?? null;
const phaseRuntimeState = snapshot?.phase_runtime_state ?? null;
const activeDefinition = getFocusWorkDefinition(activeRun?.focus_work_type);
const isFullscreen = snapshot?.state === 'focus' && activeDefinition && phaseRuntimeState !== 'break_running';
```

Add API calls:

```ts
async function createRun(mode: 'counted' | 'extra') { ...POST /todo/focus/workflow/runs... }
async function completeRunContent(progressSnapshot = {}) { ...POST /todo/focus/workflow/runs/{id}/content-complete... }
async function completeTaskAndEndPhase() { ...POST /todo/focus/workflow/runs/{id}/complete-task-and-end-phase... }
async function endPhase() { ...POST /todo/focus/workflow/end-phase... }
async function extendPhase() { ...POST /todo/focus/workflow/extend-phase... }
```

Map state surfaces:

```tsx
if (phaseRuntimeState === 'counted_run_completed_confirming') {
  body = <CountedRunCompletedPanel ... />;
} else if (phaseRuntimeState === 'extra_run_completed') {
  body = <ExtraRunCompletedPanel ... />;
} else if (phaseRuntimeState === 'task_already_completed') {
  body = <TaskAlreadyCompletedPanel ... />;
} else if (phaseRuntimeState === 'phase_time_expired_prompt') {
  body = <PhaseExpiredPanel ... />;
} else if (phaseRuntimeState === 'running_run' && activeRun && activeDefinition) {
  body = activeDefinition.render({
    run: activeRun,
    disabled: snapshot?.is_paused === true,
    onContentCompleted: (progress) => void completeRunContent(progress),
  });
}
```

- [ ] **Step 6: Run the focused frontend tests**

Run:

```bash
cd frontend && pnpm test src/components/__tests__/FocusWorkProvider.test.tsx
```

Expected: PASS with workbench state surfaces driven by backend runtime state and no `结束本轮专注` control left in the shell.

- [ ] **Step 7: Commit the workbench runtime refactor**

Run:

```bash
git add frontend/src/components/focus-work/focusWorkTypes.ts frontend/src/components/focus-work/focusWorkRegistry.tsx frontend/src/components/focus-work/FocusWorkProvider.tsx frontend/src/components/focus-work/FocusWorkModalShell.tsx frontend/src/components/__tests__/FocusWorkProvider.test.tsx
git commit -m "feat(frontend): rebuild focus workbench around run runtime states"
```


### Task 4: De-Taskify Vocab and ERC Focus-Work Components

**Files:**
- Modify: `frontend/src/components/Vocab/VocabTodayFocusWork.tsx`
- Modify: `frontend/src/components/ERC/ERCReviewFocusWork.tsx`
- Modify: `frontend/src/components/ERC/ERCPracticeFocusWork.tsx`
- Test: `frontend/src/components/Vocab/VocabTodayFocusWork.test.tsx`
- Test: `frontend/src/components/ERC/ERCReviewFocusWork.test.tsx`
- Test: `frontend/src/components/ERC/ERCPracticeFocusWork.test.tsx`

- [ ] **Step 1: Write failing component-contract tests**

In `frontend/src/components/Vocab/VocabTodayFocusWork.test.tsx`, replace reset-command/task-workflow coupling assertions with content-only behavior:

```tsx
it('calls onContentCompleted when the current vocab round naturally ends', () => {
  useVocabTodaySession.mockReturnValue({
    ready: true,
    loading: false,
    error: null,
    isBatchReview: false,
    currentItem: null,
    currentBatchNumber: 0,
    totalBatchCount: 0,
    memorizedCount: 100,
    currentMode: 'study',
    submitting: false,
    batchReviewCount: 0,
    batchReviewGroups: [],
    batchReviewActionLabel: '继续',
    continueBatchReview: vi.fn(),
    submit: vi.fn(),
    lastResult: null,
  });

  const onContentCompleted = vi.fn();
  render(<VocabTodayFocusWork run={mockRun()} disabled={false} onContentCompleted={onContentCompleted} />);
  expect(onContentCompleted).toHaveBeenCalled();
});
```

In `frontend/src/components/ERC/ERCReviewFocusWork.test.tsx`:

```tsx
it('calls onContentCompleted when there are no due review items in the current round', async () => {
  fetchERCReviewNext.mockResolvedValue({ has_item: false, next_due_at: null, article: null, paragraphs: [], question: null });
  const onContentCompleted = vi.fn();
  render(<ERCReviewFocusWork run={mockRun('erc_review')} disabled={false} onContentCompleted={onContentCompleted} />);
  await waitFor(() => expect(onContentCompleted).toHaveBeenCalled());
});
```

In `frontend/src/components/ERC/ERCPracticeFocusWork.test.tsx`:

```tsx
it('calls onContentCompleted when no recommended article exists for the current round', async () => {
  fetchERCOverview.mockResolvedValue({ recommended_article: null });
  const onContentCompleted = vi.fn();
  render(<ERCPracticeFocusWork run={mockRun('erc_practice')} disabled={false} onContentCompleted={onContentCompleted} />);
  await waitFor(() => expect(onContentCompleted).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run the focused sub-app tests to verify they fail**

Run:

```bash
cd frontend && pnpm test src/components/Vocab/VocabTodayFocusWork.test.tsx src/components/ERC/ERCReviewFocusWork.test.tsx src/components/ERC/ERCPracticeFocusWork.test.tsx
```

Expected: FAIL because the components still expect `workflow`, `registerResetCommand`, and task-completion semantics.

- [ ] **Step 3: Strip task/workflow props out of `VocabTodayFocusWork.tsx`**

Refactor the component signature:

```tsx
type VocabTodayFocusWorkProps = FocusWorkRendererProps;

export default function VocabTodayFocusWork({
  run,
  disabled,
  onContentCompleted,
}: VocabTodayFocusWorkProps) {
  ...
}
```

Delete:

```tsx
workflow
onCompleteTaskAndFinish
onFinished
registerResetCommand
isExtraPractice
extraQueue
extraIndex
handlePracticeAgain
```

Replace completion behavior with:

```tsx
React.useEffect(() => {
  if (!activeDeck) return;
  if (!session.ready || session.loading || session.error || session.isBatchReview) return;
  if (session.currentItem) return;
  onContentCompleted({
    completed_word_count: session.memorizedCount,
    target_word_count: Number(run.config_snapshot?.target_word_count ?? session.memorizedCount),
  });
}, [activeDeck, session.ready, session.loading, session.error, session.isBatchReview, session.currentItem, session.memorizedCount, onContentCompleted, run.config_snapshot]);
```

- [ ] **Step 4: Strip task/workflow props out of ERC components**

In `frontend/src/components/ERC/ERCReviewFocusWork.tsx`, remove:

```tsx
workflow
onCompleteTaskAndFinish
onFinished
registerResetCommand
isExtraPractice
handlePracticeAgain
```

Replace the completion path with:

```tsx
useEffect(() => {
  if (item && !item.has_item) {
    onContentCompleted({ answered_count: answeredCount });
  }
}, [item, answeredCount, onContentCompleted]);
```

In `frontend/src/components/ERC/ERCPracticeFocusWork.tsx`, remove:

```tsx
workflow
onCompleteTaskAndFinish
onFinished
registerResetCommand
isExtraPractice
handlePracticeAgain
```

Replace empty/recommended-article completion with:

```tsx
useEffect(() => {
  if (phase === 'empty') {
    onContentCompleted({ article_count: 0 });
  }
}, [phase, onContentCompleted]);
```

Keep all domain-progress APIs (`submitERCVocabularyPreheat`, `submitERCArticle`, `session.submit`, etc.) unchanged.

- [ ] **Step 5: Run the focused sub-app tests**

Run:

```bash
cd frontend && pnpm test src/components/Vocab/VocabTodayFocusWork.test.tsx src/components/ERC/ERCReviewFocusWork.test.tsx src/components/ERC/ERCPracticeFocusWork.test.tsx
```

Expected: PASS with content-only contracts and no reset-command/task-state coupling left.

- [ ] **Step 6: Run the broader frontend regression set**

Run:

```bash
cd frontend && pnpm test src/components/__tests__/FocusWorkProvider.test.tsx src/components/Vocab/VocabTodayFocusWork.test.tsx src/components/ERC/ERCReviewFocusWork.test.tsx src/components/ERC/ERCPracticeFocusWork.test.tsx
cd frontend && pnpm check
```

Expected: PASS. If `pnpm check` fails, fix the type contract drift before committing.

- [ ] **Step 7: Commit the de-taskified sub-app adapters**

Run:

```bash
git add frontend/src/components/Vocab/VocabTodayFocusWork.tsx frontend/src/components/ERC/ERCReviewFocusWork.tsx frontend/src/components/ERC/ERCPracticeFocusWork.tsx frontend/src/components/Vocab/VocabTodayFocusWork.test.tsx frontend/src/components/ERC/ERCReviewFocusWork.test.tsx frontend/src/components/ERC/ERCPracticeFocusWork.test.tsx
git commit -m "refactor(frontend): de-taskify sub-app focus work components"
```


### Task 5: Cleanup, Compatibility Review, and Docs

**Files:**
- Modify: `backend/routes/todo/routes.py`
- Modify: `backend/routes/todo/helpers.py`
- Modify: `docs/devlogs/codex-focus-work-runs-workbench-boundary.md`
- Modify: `docs/开发日志.md`

- [ ] **Step 1: Remove or isolate obsolete workflow fields**

Search for obsolete workflow fields:

```bash
rg -n "active_focus_work_type|focus_work_result|focus_work_progress_snapshot|start-app-work|focus-work-result" backend/routes/todo frontend/src/components/focus-work
```

Expected: only intentional compatibility shims remain.

Delete or isolate any remaining primary-control usage so that:

```python
active_focus_work_type
focus_work_result
focus_work_progress_snapshot
```

are no longer the main runtime source for the fullscreen workbench.

- [ ] **Step 2: Run backend and frontend end-to-end verification sets**

Run:

```bash
cd backend && uv run pytest tests/test_focus_workflow_app_work.py tests/test_todo_routes.py -q
cd frontend && pnpm test src/components/__tests__/FocusWorkProvider.test.tsx src/components/Vocab/VocabTodayFocusWork.test.tsx src/components/ERC/ERCReviewFocusWork.test.tsx src/components/ERC/ERCPracticeFocusWork.test.tsx
cd frontend && pnpm check
```

Expected: all commands PASS. If anything fails, fix before updating docs or claiming completion.

- [ ] **Step 3: Update branch devlog shard**

Append an entry to `docs/devlogs/codex-focus-work-runs-workbench-boundary.md` with:

```md
## 2026-06-08

- User request: “对子应用去除专注工作的任务业务功能，并将全屏工作台重构为 run 驱动运行时。”
- Commit: <fill-after-commits>
- Completed:
  - Added `focus_work_runs` model and workflow runtime state
  - Rebuilt fullscreen workbench around counted/extra run states
  - Removed task business semantics from Vocab/ERC focus-work adapters
- Verification:
  - `cd backend && uv run pytest tests/test_focus_workflow_app_work.py tests/test_todo_routes.py -q`
  - `cd frontend && pnpm test src/components/__tests__/FocusWorkProvider.test.tsx src/components/Vocab/VocabTodayFocusWork.test.tsx src/components/ERC/ERCReviewFocusWork.test.tsx src/components/ERC/ERCPracticeFocusWork.test.tsx`
  - `cd frontend && pnpm check`
```

- [ ] **Step 4: Refresh `docs/开发日志.md` summary/index only**

Update the recent summary and shard index in `docs/开发日志.md` to include the branch shard:

```md
- `codex/focus-work-runs-workbench-boundary` → `docs/devlogs/codex-focus-work-runs-workbench-boundary.md`
```

Do not rewrite unrelated history.

- [ ] **Step 5: Commit cleanup and docs**

Run:

```bash
git add backend/routes/todo/routes.py backend/routes/todo/helpers.py docs/devlogs/codex-focus-work-runs-workbench-boundary.md docs/开发日志.md
git commit -m "chore: document focus work run boundary refactor"
```

## Self-Review

### Spec Coverage

- `focus_work_runs` model: covered by Task 1 and Task 2.
- Workbench owns task business: covered by Task 2 and Task 3.
- Remove `结束本轮专注`: covered by Task 3.
- Counted/extra run lifecycle: covered by Task 2 and Task 3.
- Time-expired prompt and end-phase semantics: covered by Task 2 and Task 3.
- Sub-app de-taskification: covered by Task 4.
- Migration/cleanup of old fields: covered by Task 5.

No major spec gap remains.

### Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each task includes concrete files, code snippets, commands, and expected results.

### Type Consistency

- Backend naming uses `FocusWorkRunStatus`, `FocusWorkRunMode`, `FocusPhaseRuntimeState`, and `FocusWorkRunSummaryOut`.
- Frontend naming mirrors backend via `FocusWorkRunSummary` and `phase_runtime_state`.
- UI action names are consistent with the spec: `完成任务并结束阶段`, `再来一轮`, `结束阶段`, `延长时间`, `放弃本阶段`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-08-focus-work-runs-workbench-boundary-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
