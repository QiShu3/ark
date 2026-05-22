# Start Workflow Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the home right-panel primary entry into a selected-workflow launcher: `开始工作流` starts the currently selected workflow, and the workflow-name sub-action switches the selected preset.

**Architecture:** Add a backend endpoint that starts a workflow from a preset without modifying the preset or the default flag. Keep the home launcher state local to `PlaceholderCard`, persist only the selected preset id in localStorage, and continue to let `WorkflowNavProgress` plus `FocusWorkProvider` own active runtime display. The lightweight picker switches selection only; preset creation and editing stay inside the existing `WorkflowPresetModal`.

**Tech Stack:** FastAPI, asyncpg-style route helpers, pytest/FastAPI TestClient, React 19, TypeScript, Vitest, Testing Library, Tailwind CSS.

---

## File Structure

- Modify `backend/routes/todo/routes.py`
  - Add `POST /todo/focus/workflows/{preset_id}/start`.
  - Import `_phase_focus_work_type_value` and `_phase_task_id_value`.
  - Keep route logic near the existing workflow preset routes.
- Modify `backend/tests/test_todo_routes.py`
  - Extend `_WorkflowPresetConn` so it can fake workflow runtime inserts and focus log inserts.
  - Add endpoint coverage for unbound first focus phase, bound first focus phase, ownership rejection, and active-workflow conflict.
- Modify `frontend/src/components/PlaceholderCard.tsx`
  - Add selected workflow persistence.
  - Replace the normal-state `开始专注` behavior with `开始工作流`.
  - Add a lightweight workflow picker for switching selection.
  - Keep current active-workflow controls unchanged.
- Modify `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`
  - Add launcher tests for fallback selection, persisted selection, direct start, picker switching, and empty-state new workflow.
- Modify `docs/开发日志.md`
  - After code commits, add entries under the current branch section for the implementation commits.

## Shared Implementation Decisions

- localStorage key: `ark-home-selected-workflow-preset-id`
- Start endpoint: `POST /todo/focus/workflows/{preset_id}/start`
- Main action label: `开始工作流`
- Switch action label pattern: `切换工作流 {name}`
- Empty-state main label: `新建工作流`
- Empty-state helper text: `还没有可启动的工作流`

---

### Task 1: Backend Preset Start Endpoint

**Files:**
- Modify: `backend/tests/test_todo_routes.py`
- Modify: `backend/routes/todo/routes.py`

- [ ] **Step 1: Write failing backend tests**

Append these tests after `test_set_default_and_delete_focus_workflow_preset` in `backend/tests/test_todo_routes.py`. Extend `_WorkflowPresetConn` first so the tests can observe runtime inserts.

```python
def _preset_row(
    *,
    preset_id=None,
    user_id: int = 7,
    name: str = "深度工作流",
    phases: list[dict[str, Any]] | None = None,
    is_default: bool = False,
) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "id": preset_id or uuid4(),
        "user_id": user_id,
        "name": name,
        "focus_duration": 1500,
        "break_duration": 300,
        "default_focus_timer_mode": "countdown",
        "phases": phases
        or [
            {"phase_type": "focus", "duration": 1500, "timer_mode": "countdown", "task_id": None},
            {"phase_type": "break", "duration": 300},
        ],
        "is_default": is_default,
        "created_at": now,
        "updated_at": now,
    }
```

Add these fields to `_WorkflowPresetConn.__init__`:

```python
self.active_workflow: dict[str, Any] | None = None
self.inserted_focus_task_id: Any = None
self.started_app_work_type: str | None = None
```

Replace the existing `_WorkflowPresetConn.fetchrow` task branch with the first branch below so `_get_bindable_task()` receives source metadata. Add the remaining branches before the final `return None`:

```python
if "SELECT id, status, is_deleted, title, source_type, app_id, app_task_type, app_config_id" in sql:
    task_id = args[0]
    user_id = int(args[1])
    return next(
        (
            {
                "id": item["id"],
                "status": item["status"],
                "is_deleted": item["is_deleted"],
                "title": item["title"],
                "source_type": item.get("source_type", "user"),
                "app_id": item.get("app_id"),
                "app_task_type": item.get("app_task_type"),
                "app_config_id": item.get("app_config_id"),
                "app_instance_key": item.get("app_instance_key"),
                "managed_by_app": item.get("managed_by_app", False),
            }
            for item in self.tasks
            if item["id"] == task_id and int(item["user_id"]) == user_id
        ),
        None,
    )
if "SELECT id FROM focus_workflows WHERE user_id = $1 AND status = 'active'" in sql:
    return self.active_workflow
if "INSERT INTO focus_workflows" in sql:
    now = datetime.now(UTC)
    phases_arg = args[4]
    phases = json.loads(phases_arg) if isinstance(phases_arg, str) else phases_arg
    row = {
        "id": uuid4(),
        "user_id": int(args[0]),
        "task_id": args[1],
        "runtime_task_id": args[2],
        "workflow_name": str(args[3]),
        "phases": phases,
        "current_phase_index": 0,
        "focus_duration": int(args[5]),
        "break_duration": int(args[6]),
        "current_phase": str(args[7]),
        "phase_started_at": now,
        "phase_planned_duration": int(args[8]),
        "pending_confirmation": False,
        "pending_task_selection": bool(args[9]),
        "active_focus_work_type": args[10],
        "focus_work_display_state": args[11],
        "focus_work_result": None,
        "focus_work_progress_snapshot": None,
        "is_paused": False,
        "paused_at": None,
        "record_focus": bool(args[12]),
    }
    self.active_workflow = row
    return row
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
```

Add this branch to `_WorkflowPresetConn.execute` before the final `return "UPDATE 1"`:

```python
if "INSERT INTO focus_app_work_logs" in sql:
    self.started_app_work_type = str(args[2])
    return "INSERT 1"
```

Add these tests:

```python
def test_start_focus_workflow_preset_waits_for_task_when_first_focus_is_unbound(monkeypatch) -> None:
    conn = _WorkflowPresetConn()
    preset = _preset_row(name="无绑定工作流")
    conn.rows.append(preset)
    pool = _WorkflowPresetPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    resp = client.post(f"/todo/focus/workflows/{preset['id']}/start")

    assert resp.status_code == 200
    data = resp.json()
    assert data["workflow_name"] == "无绑定工作流"
    assert data["state"] == "focus"
    assert data["pending_task_selection"] is True
    assert data["task_id"] is None
    assert conn.inserted_focus_task_id is None
```

```python
def test_start_focus_workflow_preset_enters_bound_task_focus(monkeypatch) -> None:
    conn = _WorkflowPresetConn()
    task_id = uuid4()
    conn.tasks.append(
        {
            "id": task_id,
            "user_id": 7,
            "title": "写方案",
            "status": "todo",
            "is_deleted": False,
            "source_type": "user",
            "app_id": None,
            "app_task_type": None,
            "app_config_id": None,
            "app_instance_key": None,
            "managed_by_app": False,
        }
    )
    preset = _preset_row(
        name="写作工作流",
        phases=[
            {"phase_type": "focus", "duration": 1500, "timer_mode": "countdown", "task_id": str(task_id)},
            {"phase_type": "break", "duration": 300},
        ],
    )
    conn.rows.append(preset)
    pool = _WorkflowPresetPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    resp = client.post(f"/todo/focus/workflows/{preset['id']}/start")

    assert resp.status_code == 200
    data = resp.json()
    assert data["workflow_name"] == "写作工作流"
    assert data["pending_task_selection"] is False
    assert data["task_id"] == str(task_id)
    assert data["task_title"] == "写方案"
    assert data["active_focus_work_type"] == "task_focus"
    assert data["focus_work_display_state"] == "fullscreen"
    assert conn.inserted_focus_task_id == task_id
```

```python
def test_start_focus_workflow_preset_rejects_other_user_preset(monkeypatch) -> None:
    conn = _WorkflowPresetConn()
    preset = _preset_row(user_id=8, name="别人的工作流")
    conn.rows.append(preset)
    pool = _WorkflowPresetPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    resp = client.post(f"/todo/focus/workflows/{preset['id']}/start")

    assert resp.status_code == 404
    assert resp.json()["detail"] == "工作流不存在"
```

```python
def test_start_focus_workflow_preset_rejects_when_workflow_is_active(monkeypatch) -> None:
    conn = _WorkflowPresetConn()
    preset = _preset_row(name="深度工作流")
    conn.rows.append(preset)
    conn.active_workflow = {"id": uuid4()}
    pool = _WorkflowPresetPool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)
    app = _build_app()
    client = TestClient(app)

    resp = client.post(f"/todo/focus/workflows/{preset['id']}/start")

    assert resp.status_code == 409
    assert resp.json()["detail"] == "已有活动工作流"
```

- [ ] **Step 2: Run backend tests and verify they fail**

Run from `backend/`:

```bash
uv run pytest tests/test_todo_routes.py -q -k "start_focus_workflow_preset"
```

Expected: four failures with `404 Not Found` because `POST /todo/focus/workflows/{preset_id}/start` does not exist yet.

- [ ] **Step 3: Implement the backend route**

In `backend/routes/todo/routes.py`, add these imports from `.helpers`:

```python
    _phase_focus_work_type_value,
    _phase_task_id_value,
```

Add this route after `set_default_focus_workflow_preset`:

```python
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
                """
                SELECT id, user_id, name, focus_duration, break_duration, default_focus_timer_mode, phases, is_default, created_at, updated_at
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
                if phase_task_id is None or task_row is None or bool(task_row["is_deleted"]) or str(task_row["status"]) == "done":
                    pending_task_selection = True
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
```

- [ ] **Step 4: Run backend tests and verify they pass**

Run from `backend/`:

```bash
uv run pytest tests/test_todo_routes.py -q -k "start_focus_workflow_preset or focus_workflow_presets"
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit backend endpoint**

Run from repo root:

```bash
git add backend/routes/todo/routes.py backend/tests/test_todo_routes.py
git commit -m "feat(backend): start focus workflow presets"
```

Then add a matching `docs/开发日志.md` entry for this code commit before the next code commit.

---

### Task 2: Frontend Launcher State and Start Action

**Files:**
- Modify: `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`
- Modify: `frontend/src/components/PlaceholderCard.tsx`

- [ ] **Step 1: Write failing launcher tests**

In `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`, update `beforeEach`:

```ts
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockApiJson.mockImplementation((path: string) => defaultApiResponse(path));
});
```

Append these tests inside `describe('PlaceholderCard workflow UI', () => { ... })`:

```tsx
it('shows the default workflow as the selected start target and starts it directly', async () => {
  const user = userEvent.setup();
  const preset = buildWorkflowPreset({ id: 'preset-default', name: '深度工作流', is_default: true });

  mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/todo/focus/workflows') return Promise.resolve([preset]);
    if (path === '/todo/focus/workflows/preset-default/start' && init?.method === 'POST') {
      return Promise.resolve({
        state: 'focus',
        workflow_name: preset.name,
        current_phase_index: 0,
        phases: preset.phases,
        task_id: null,
        task_title: null,
        pending_confirmation: false,
        pending_task_selection: true,
        remaining_seconds: null,
      });
    }
    return defaultApiResponse(path);
  });

  renderCard();

  expect(await screen.findByText('开始工作流')).toBeInTheDocument();
  expect(screen.getByText('深度工作流')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '开始工作流 深度工作流' }));

  await waitFor(() => {
    expect(mockApiJson).toHaveBeenCalledWith('/todo/focus/workflows/preset-default/start', { method: 'POST' });
  });
});
```

```tsx
it('uses the last selected workflow from localStorage before the default workflow', async () => {
  window.localStorage.setItem('ark-home-selected-workflow-preset-id', 'preset-last');
  const defaultPreset = buildWorkflowPreset({ id: 'preset-default', name: '默认工作流', is_default: true });
  const lastPreset = buildWorkflowPreset({ id: 'preset-last', name: '上次工作流', is_default: false });

  mockApiJson.mockImplementation((path: string) => {
    if (path === '/todo/focus/workflows') return Promise.resolve([defaultPreset, lastPreset]);
    return defaultApiResponse(path);
  });

  renderCard();

  expect(await screen.findByText('开始工作流')).toBeInTheDocument();
  expect(screen.getByText('上次工作流')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run frontend tests and verify they fail**

Run from `frontend/`:

```bash
pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx
```

Expected: new tests fail because `开始工作流` and `aria-label="开始工作流 ..."` are not implemented.

- [ ] **Step 3: Add launcher state helpers**

In `frontend/src/components/PlaceholderCard.tsx`, add the storage key near the form defaults:

```ts
const SELECTED_WORKFLOW_PRESET_STORAGE_KEY = 'ark-home-selected-workflow-preset-id';
```

Add state beside existing workflow state:

```ts
const [selectedWorkflowPresetId, setSelectedWorkflowPresetId] = useState<string | null>(() => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(SELECTED_WORKFLOW_PRESET_STORAGE_KEY);
});
const [showWorkflowPicker, setShowWorkflowPicker] = useState(false);
const [startingWorkflow, setStartingWorkflow] = useState(false);
```

Replace `defaultWorkflowName` with these derived values:

```ts
const sortedWorkflowPresets = React.useMemo(() => {
  return [...workflowPresets].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}, [workflowPresets]);

const effectiveSelectedWorkflow = React.useMemo(() => {
  const saved = selectedWorkflowPresetId
    ? workflowPresets.find((item) => item.id === selectedWorkflowPresetId)
    : null;
  return saved ?? workflowPresets.find((item) => item.is_default) ?? sortedWorkflowPresets[0] ?? null;
}, [selectedWorkflowPresetId, sortedWorkflowPresets, workflowPresets]);
```

Add this effect after the derived values:

```ts
useEffect(() => {
  if (!selectedWorkflowPresetId) return;
  if (workflowPresets.length === 0) return;
  if (workflowPresets.some((item) => item.id === selectedWorkflowPresetId)) return;
  setSelectedWorkflowPresetId(null);
  window.localStorage.removeItem(SELECTED_WORKFLOW_PRESET_STORAGE_KEY);
}, [selectedWorkflowPresetId, workflowPresets]);
```

Add this helper near `_setDefaultWorkflowPreset`:

```ts
async function _startSelectedWorkflow() {
  if (startingWorkflow) return;
  if (!effectiveSelectedWorkflow) {
    _replaceWorkflowDraft(createDefaultWorkflowForm(workflowPresets.length === 0), null);
    setShowWorkflowModal(true);
    return;
  }
  setStartingWorkflow(true);
  try {
    const res = await apiJson(`/todo/focus/workflows/${effectiveSelectedWorkflow.id}/start`, { method: 'POST' }) as FocusWorkflow;
    setFocusWorkflow(res);
    await Promise.all([_loadCurrentFocus(), _loadTodayFocus(), _loadFocusWorkflow(), _loadTasks()]);
    window.dispatchEvent(new CustomEvent('ark:reload-focus'));
  } catch (e) {
    console.error('Failed to start workflow', e);
    alert(e instanceof Error ? e.message : '开始工作流失败');
  } finally {
    setStartingWorkflow(false);
  }
}
```

- [ ] **Step 4: Replace normal-state main entry**

Inside the `index === 0` render path, replace the non-active label in the main click area:

```tsx
<div
  role="button"
  tabIndex={0}
  aria-label={effectiveSelectedWorkflow ? `开始工作流 ${effectiveSelectedWorkflow.name}` : '新建工作流'}
  className={`group relative flex-[2] bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer ${
    isFocusing || isWorkflowActive ? 'bg-blue-500/10 border border-blue-500/20' : ''
  }`}
  onClick={isWorkflowActive || isFocusing ? _handleFocusToggle : () => void _startSelectedWorkflow()}
  onKeyDown={(e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (isWorkflowActive || isFocusing) {
      void _handleFocusToggle(e as unknown as React.MouseEvent);
    } else {
      void _startSelectedWorkflow();
    }
  }}
>
```

Replace the non-active hover text with:

```tsx
{isWorkflowActive
  ? (hasPendingTaskSelection ? '选择任务' : (hasPendingTransition ? '确认流转' : '跳过阶段'))
  : (isFocusing ? '结束专注' : (effectiveSelectedWorkflow ? '开始工作流' : '新建工作流'))}
```

Replace the non-active subtext with:

```tsx
{isWorkflowActive && isBreakPhase ? '' : (isFocusing || isWorkflowActive ? '正在专注于：' : '')}
{isFocusing || isWorkflowActive ? displayTaskTitle : (effectiveSelectedWorkflow?.name ?? '还没有可启动的工作流')}
```

- [ ] **Step 5: Run frontend tests and verify launcher tests pass**

Run from `frontend/`:

```bash
pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx
```

Expected: the two new launcher tests pass along with existing workflow tests.

- [ ] **Step 6: Commit frontend start action**

Run from repo root:

```bash
git add frontend/src/components/PlaceholderCard.tsx frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx
git commit -m "feat(frontend): start selected workflow from home"
```

Then add a matching `docs/开发日志.md` entry for this code commit.

---

### Task 3: Workflow Switcher Panel and Empty State

**Files:**
- Modify: `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`
- Modify: `frontend/src/components/PlaceholderCard.tsx`

- [ ] **Step 1: Write failing switcher tests**

Append these tests inside the existing PlaceholderCard workflow UI describe block:

```tsx
it('opens the workflow picker from the workflow name and switches without starting', async () => {
  const user = userEvent.setup();
  const first = buildWorkflowPreset({ id: 'preset-a', name: 'A 工作流', is_default: true });
  const second = buildWorkflowPreset({ id: 'preset-b', name: 'B 工作流', is_default: false });

  mockApiJson.mockImplementation((path: string) => {
    if (path === '/todo/focus/workflows') return Promise.resolve([first, second]);
    return defaultApiResponse(path);
  });

  renderCard();

  await user.click(await screen.findByRole('button', { name: '切换工作流 A 工作流' }));
  await user.click(screen.getByRole('button', { name: '选择工作流 B 工作流' }));

  expect(window.localStorage.getItem('ark-home-selected-workflow-preset-id')).toBe('preset-b');
  expect(screen.getByText('B 工作流')).toBeInTheDocument();
  expect(mockApiJson.mock.calls.some(([path]) => path === '/todo/focus/workflows/preset-b/start')).toBe(false);
});
```

```tsx
it('opens the workflow preset modal when creating from the picker', async () => {
  const user = userEvent.setup();
  const preset = buildWorkflowPreset({ id: 'preset-a', name: 'A 工作流', is_default: true });

  mockApiJson.mockImplementation((path: string) => {
    if (path === '/todo/focus/workflows') return Promise.resolve([preset]);
    return defaultApiResponse(path);
  });

  renderCard();

  await user.click(await screen.findByRole('button', { name: '切换工作流 A 工作流' }));
  await user.click(screen.getByRole('button', { name: '新建工作流' }));

  expect(await screen.findByRole('heading', { name: '工作流预设' })).toBeInTheDocument();
});
```

```tsx
it('opens the workflow preset modal from the empty workflow state', async () => {
  const user = userEvent.setup();

  mockApiJson.mockImplementation((path: string) => {
    if (path === '/todo/focus/workflows') return Promise.resolve([]);
    return defaultApiResponse(path);
  });

  renderCard();

  await user.click(await screen.findByRole('button', { name: '新建工作流' }));

  expect(await screen.findByRole('heading', { name: '工作流预设' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run switcher tests and verify they fail**

Run from `frontend/`:

```bash
pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx
```

Expected: new switcher tests fail because `切换工作流 ...` and the picker dialog do not exist.

- [ ] **Step 3: Add switch helper functions**

In `frontend/src/components/PlaceholderCard.tsx`, add these helpers near `_startSelectedWorkflow`:

```ts
function _selectWorkflowPreset(presetId: string) {
  setSelectedWorkflowPresetId(presetId);
  window.localStorage.setItem(SELECTED_WORKFLOW_PRESET_STORAGE_KEY, presetId);
  setShowWorkflowPicker(false);
}

function _openNewWorkflowFromPicker() {
  setShowWorkflowPicker(false);
  _replaceWorkflowDraft(createDefaultWorkflowForm(workflowPresets.length === 0), null);
  setShowWorkflowModal(true);
}
```

- [ ] **Step 4: Add switch button to the normal-state entry**

Inside the main entry, render this button only when there is no active workflow and no current focus:

```tsx
{!isWorkflowActive && !isFocusing && effectiveSelectedWorkflow ? (
  <button
    type="button"
    aria-label={`切换工作流 ${effectiveSelectedWorkflow.name}`}
    className="absolute bottom-3 rounded-full border border-white/12 bg-black/25 px-3 py-1 text-xs text-white/65 transition hover:border-white/24 hover:bg-black/40 hover:text-white"
    onClick={(event) => {
      event.stopPropagation();
      setShowWorkflowPicker(true);
    }}
  >
    {effectiveSelectedWorkflow.name}
  </button>
) : null}
```

- [ ] **Step 5: Add the picker dialog**

Place this block near `showFocusTaskPicker` in the `index === 0` returned fragment:

```tsx
{showWorkflowPicker && (
  <div
    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    onClick={() => setShowWorkflowPicker(false)}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-picker-title"
      className="w-[520px] max-w-[92vw] max-h-[72vh] overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex h-14 items-center justify-between border-b border-white/10 bg-white/5 px-5">
        <h3 id="workflow-picker-title" className="text-lg font-bold text-white">选择工作流</h3>
        <button
          type="button"
          onClick={() => setShowWorkflowPicker(false)}
          className="rounded-full p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="关闭选择工作流"
        >
          ×
        </button>
      </div>
      <div className="flex max-h-[calc(72vh-56px)] flex-col gap-2 overflow-y-auto p-4">
        {workflowPresets.map((preset) => {
          const selected = preset.id === effectiveSelectedWorkflow?.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-label={`选择工作流 ${preset.name}`}
              onClick={() => _selectWorkflowPreset(preset.id)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                selected
                  ? 'border-blue-400/40 bg-blue-400/12 text-white'
                  : 'border-white/10 bg-white/5 text-white/85 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{preset.name}</span>
                {preset.is_default ? <span className="text-xs text-blue-200/70">默认</span> : null}
              </div>
              <div className="mt-1 text-xs text-white/45">共 {preset.phases.length} 个阶段</div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={_openNewWorkflowFromPicker}
          className="mt-2 rounded-xl border border-dashed border-white/18 bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-white/75 transition hover:border-white/30 hover:bg-white/8 hover:text-white"
        >
          新建工作流
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Run frontend tests and verify switcher tests pass**

Run from `frontend/`:

```bash
pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx
```

Expected: all PlaceholderCard workflow tests pass.

- [ ] **Step 7: Commit switcher UI**

Run from repo root:

```bash
git add frontend/src/components/PlaceholderCard.tsx frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx
git commit -m "feat(frontend): switch selected home workflow"
```

Then add a matching `docs/开发日志.md` entry for this code commit.

---

### Task 4: Verification and Browser Acceptance

**Files:**
- Modify: `docs/开发日志.md`

- [ ] **Step 1: Run backend targeted tests**

Run from `backend/`:

```bash
uv run pytest tests/test_todo_routes.py -q -k "start_focus_workflow_preset or focus_workflow_presets or select_focus_workflow_task"
```

Expected: selected backend tests pass.

- [ ] **Step 2: Run frontend targeted tests**

Run from `frontend/`:

```bash
pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/PlaceholderCard.arrangements.test.tsx
```

Expected: both frontend test files pass.

- [ ] **Step 3: Run static checks**

Run from `frontend/`:

```bash
pnpm check
```

Expected: TypeScript check passes.

Run from `backend/`:

```bash
uv run ruff check .
```

Expected: Ruff check passes.

- [ ] **Step 4: Browser acceptance**

Start the app if needed:

```bash
cd backend && uv run uvicorn main:app --reload
```

```bash
cd frontend && pnpm dev
```

Open the actual Vite URL and verify:

- The home launcher shows `开始工作流`.
- The helper text shows the current selected workflow name.
- Clicking the workflow name opens `选择工作流`.
- Selecting a different workflow closes the picker and updates the helper text.
- Reloading the page keeps the selected workflow.
- Clicking `开始工作流` starts that workflow.
- If the first focus phase has no task binding, the UI enters `选择任务`.
- Clicking `新建工作流` opens the existing `工作流预设` modal.

- [ ] **Step 5: Update development log**

In `docs/开发日志.md`, add entries for each code commit under the current branch section. Include:

```markdown
- commit: <hash>
  用户需求：我想让这个入口重构成 开始工作流 的入口，和工作流深度绑定
  完成内容：<one sentence summary>
  验证：<commands or browser checks>
```

- [ ] **Step 6: Commit log update**

Run from repo root:

```bash
git add docs/开发日志.md
git commit -m "docs: log start workflow entry work"
```

---

## Self-Review

- Spec coverage:
  - Current selected workflow with local persistence: Task 2.
  - Main entry direct start: Task 2.
  - Workflow-name switch action and lightweight picker: Task 3.
  - Empty state opens preset management: Task 3.
  - Backend preset start endpoint: Task 1.
  - Existing active runtime semantics remain with `WorkflowNavProgress` and `FocusWorkProvider`: Task 1 returns `FocusWorkflowOut`, Task 2 dispatches `ark:reload-focus`.
  - Browser acceptance: Task 4.
- Placeholder scan:
  - The plan contains no placeholder markers or unfilled requirement slots.
  - Each code-changing task includes concrete snippets and commands.
- Type consistency:
  - localStorage key is consistently `ark-home-selected-workflow-preset-id`.
  - Start endpoint is consistently `/todo/focus/workflows/{preset_id}/start`.
  - Frontend state names are consistently `selectedWorkflowPresetId`, `showWorkflowPicker`, and `startingWorkflow`.
