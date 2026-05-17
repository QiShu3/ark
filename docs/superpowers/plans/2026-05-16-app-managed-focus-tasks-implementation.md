# App-Managed Focus Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Vocab and ERC focus work enter Ark through app-managed recurring tasks created by explicit sub-app initialization.

**Architecture:** Extend the existing `tasks` model with app source metadata and add a lightweight app-task config table. Vocab/ERC initialization creates one recurring managed task each, and focus execution starts from `task_id`; the workflow snapshot carries enough adapter metadata for the existing focus-work runtime to render Vocab/ERC content while logging time through `focus_logs`.

**Tech Stack:** FastAPI, asyncpg/PostgreSQL, Pydantic, React, TypeScript, Vite, Vitest, pytest, Ruff.

---

## Scope Check

This feature touches multiple surfaces, but they form one coherent vertical slice: app initialization -> app-managed task -> focus workflow -> completion/statistics. Do not implement unrelated redesigns such as a new task list page, a full workflow engine, or new Vocab/ERC study algorithms in this pass.

Before implementing, run:

```bash
git status --short --branch
```

Expected: you may see unrelated existing frontend changes in this worktree. Do not revert them. Only stage files touched by the current task.

## File Structure

Backend:

- Modify `backend/routes/todo/db.py`: add task source columns and `app_task_configs` table.
- Modify `backend/routes/todo/schemas.py`: add app task literals, request/response models, task output fields, workflow adapter fields.
- Modify `backend/routes/todo/helpers.py`: map rows to new fields, create/reuse app-managed tasks, resolve task adapter type, and close focus logs without app-log dependency.
- Modify `backend/routes/todo/routes.py`: add `/todo/app-tasks/{app_id}/status`, `/todo/app-tasks/vocab/init`, `/todo/app-tasks/erc/init`, and completion/focus workflow adapter behavior.
- Modify `backend/tests/test_todo_routes.py`: cover schema output, initialization, status, completion state, and focus start behavior.
- Modify `backend/tests/test_focus_workflow_app_work.py`: adjust expectations for app-managed task focus where needed.

Frontend:

- Modify `frontend/src/components/taskTypes.ts`: add app-managed task metadata fields.
- Modify `frontend/src/components/workflowProgress.ts` and `frontend/src/components/focus-work/focusWorkTypes.ts`: add adapter metadata needed by focus-work rendering.
- Modify `frontend/src/components/focus-work/FocusWorkProvider.tsx`: allow app-managed task focus to render Vocab/ERC by adapter while completing the bound task.
- Modify `frontend/src/components/focus-work/FocusWorkModalShell.tsx`: prepare common completion controls for app task adapters.
- Modify `frontend/src/components/Vocab/VocabTodayFocusWork.tsx` and `frontend/src/components/ERC/ERCReviewFocusWork.tsx`: stop treating every app-internal submit as workflow completion; completion should mean the app task is complete.
- Modify `frontend/src/lib/vocab/types.ts`, `frontend/src/lib/vocab/api.ts`, `frontend/src/lib/erc/types.ts`, `frontend/src/lib/erc/api.ts`: add init/status API types and calls.
- Modify `frontend/src/pages/Vocab/Home.tsx` and `frontend/src/pages/ERC/Home.tsx`: show initialization states and start focus by `task_id`.
- Modify `frontend/src/components/PlaceholderCard.tsx`: split app-managed tasks from ordinary tasks in today/action views.
- Update relevant frontend tests in `frontend/src/pages/Vocab/__tests__/Home.test.tsx`, `frontend/src/pages/ERC/__tests__/Home.test.tsx`, `frontend/src/components/__tests__/FocusWorkProvider.test.tsx`, and `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`.

Docs:

- Modify `docs/开发日志.md` after every code commit on this branch, per repository guidelines.

---

### Task 1: Backend Data Model and Schemas

**Files:**
- Modify: `backend/routes/todo/db.py`
- Modify: `backend/routes/todo/schemas.py`
- Modify: `backend/routes/todo/helpers.py`
- Test: `backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write failing backend schema tests**

Add tests to `backend/tests/test_todo_routes.py`:

```python
async def test_task_out_includes_app_managed_metadata(client, auth_headers):
    task_payload = {
        "title": "普通任务",
        "content": None,
        "is_recurring": False,
        "period_type": "once",
    }
    response = await client.post("/todo/tasks", json=task_payload, headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["source_type"] == "user"
    assert payload["app_id"] is None
    assert payload["app_task_type"] is None
    assert payload["app_config_id"] is None
    assert payload["app_instance_key"] is None
    assert payload["managed_by_app"] is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd backend && uv run pytest tests/test_todo_routes.py::test_task_out_includes_app_managed_metadata -q
```

Expected: FAIL because `TaskOut` and task rows do not include app-managed metadata yet.

- [ ] **Step 3: Extend `schemas.py`**

In `backend/routes/todo/schemas.py`, add literals near existing task literals:

```python
TaskSourceType = Literal["user", "app"]
AppTaskId = Literal["vocab", "erc"]
AppTaskType = Literal["vocab_today", "erc_review"]
AppTaskConfigStatus = Literal["active", "disabled", "invalid"]
AppTaskRuntimeState = Literal["uninitialized", "ready", "completed_today", "blocked", "config_invalid"]
```

Add fields to `TaskCreateRequest` with user-safe defaults:

```python
source_type: TaskSourceType = "user"
app_id: AppTaskId | None = None
app_task_type: AppTaskType | None = None
app_config_id: UUID | None = None
app_instance_key: str | None = Field(default=None, max_length=160)
managed_by_app: bool = False
```

Add the same fields to `TaskUpdateRequest` as optional fields:

```python
source_type: TaskSourceType | None = None
app_id: AppTaskId | None = None
app_task_type: AppTaskType | None = None
app_config_id: UUID | None = None
app_instance_key: str | None = Field(default=None, max_length=160)
managed_by_app: bool | None = None
```

Add fields to `TaskOut`:

```python
source_type: TaskSourceType = "user"
app_id: AppTaskId | None = None
app_task_type: AppTaskType | None = None
app_config_id: UUID | None = None
app_instance_key: str | None = None
managed_by_app: bool = False
```

Add request/response models after focus workflow request models:

```python
class AppTaskInitRequest(BaseModel):
    default_focus_duration: int = Field(default=1500, ge=60, le=24 * 60 * 60)
    add_to_today_plan: bool = True
    event_id: UUID | None = None


class VocabAppTaskInitRequest(AppTaskInitRequest):
    deck_id: str
    daily_target_count: int = Field(default=20, ge=1, le=500)


class ERCAppTaskInitRequest(AppTaskInitRequest):
    review_scope: Literal["due", "mistakes", "all"] = "due"
    daily_question_target: int = Field(default=10, ge=1, le=200)


class AppTaskStatusOut(BaseModel):
    state: AppTaskRuntimeState
    task_id: UUID | None = None
    config_id: UUID | None = None
    completion_state: CompletionStateOut | None = None
    blocked_reason: str | None = None
    config: dict[str, object] = Field(default_factory=dict)
```

Extend `FocusWorkflowOut` with adapter metadata:

```python
active_task_source_type: TaskSourceType | None = None
active_task_app_id: AppTaskId | None = None
active_task_app_task_type: AppTaskType | None = None
active_task_app_config_id: UUID | None = None
```

- [ ] **Step 4: Extend `db.py`**

In the task table create statement and idempotent migrations, add:

```sql
source_type VARCHAR(20) NOT NULL DEFAULT 'user',
app_id VARCHAR(40) NULL,
app_task_type VARCHAR(80) NULL,
app_config_id UUID NULL,
app_instance_key VARCHAR(160) NULL,
managed_by_app BOOLEAN NOT NULL DEFAULT FALSE,
CONSTRAINT chk_tasks_source_type CHECK (source_type IN ('user', 'app')),
CONSTRAINT chk_tasks_app_id CHECK (app_id IS NULL OR app_id IN ('vocab', 'erc')),
CONSTRAINT chk_tasks_app_task_type CHECK (app_task_type IS NULL OR app_task_type IN ('vocab_today', 'erc_review'))
```

Add idempotent `ALTER TABLE` calls:

```python
await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'user';")
await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_id VARCHAR(40) NULL;")
await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_task_type VARCHAR(80) NULL;")
await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_config_id UUID NULL;")
await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_instance_key VARCHAR(160) NULL;")
await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS managed_by_app BOOLEAN NOT NULL DEFAULT FALSE;")
await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_source_type;")
await conn.execute("ALTER TABLE tasks ADD CONSTRAINT chk_tasks_source_type CHECK (source_type IN ('user', 'app'));")
await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_app_id;")
await conn.execute("ALTER TABLE tasks ADD CONSTRAINT chk_tasks_app_id CHECK (app_id IS NULL OR app_id IN ('vocab', 'erc'));")
await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_app_task_type;")
await conn.execute("ALTER TABLE tasks ADD CONSTRAINT chk_tasks_app_task_type CHECK (app_task_type IS NULL OR app_task_type IN ('vocab_today', 'erc_review'));")
```

Add the config table:

```python
await conn.execute(
    """
    CREATE TABLE IF NOT EXISTS app_task_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      app_id VARCHAR(40) NOT NULL,
      app_task_type VARCHAR(80) NOT NULL,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_app_task_configs_app_id CHECK (app_id IN ('vocab', 'erc')),
      CONSTRAINT chk_app_task_configs_app_task_type CHECK (app_task_type IN ('vocab_today', 'erc_review')),
      CONSTRAINT chk_app_task_configs_status CHECK (status IN ('active', 'disabled', 'invalid'))
    );
    """
)
await conn.execute(
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_app_task_configs_user_app_type_active
    ON app_task_configs(user_id, app_id, app_task_type)
    WHERE status = 'active';
    """
)
```

- [ ] **Step 5: Extend task row mapping**

In `backend/routes/todo/helpers.py`, update `_row_to_task` to include:

```python
source_type=str(row["source_type"] or "user"),
app_id=row["app_id"],
app_task_type=row["app_task_type"],
app_config_id=row["app_config_id"],
app_instance_key=row["app_instance_key"],
managed_by_app=bool(row["managed_by_app"]),
```

Update every task `SELECT` and `RETURNING` projection in `backend/routes/todo/routes.py` and `backend/routes/todo/helpers.py` to include:

```sql
source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
```

Update task `INSERT` statements so user-created tasks always write user defaults:

```sql
source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
```

with values:

```python
body.source_type,
body.app_id,
body.app_task_type,
body.app_config_id,
body.app_instance_key,
body.managed_by_app,
```

For public user-created `/todo/tasks`, reject app-managed metadata unless an internal helper is creating the task:

```python
if body.source_type != "user" or body.managed_by_app or body.app_id or body.app_task_type or body.app_config_id:
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="应用托管任务只能由子应用初始化创建")
```

- [ ] **Step 6: Run backend tests**

Run:

```bash
cd backend && uv run pytest tests/test_todo_routes.py::test_task_out_includes_app_managed_metadata -q
cd backend && uv run ruff check routes/todo tests/test_todo_routes.py
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/todo/db.py backend/routes/todo/schemas.py backend/routes/todo/helpers.py backend/routes/todo/routes.py backend/tests/test_todo_routes.py
git commit -m "feat(backend): add app managed task metadata"
```

Then update `docs/开发日志.md` under `codex/focus-work-capsule` with commit hash, original user request, work summary, and verification.

---

### Task 2: Backend App Task Initialization and Status APIs

**Files:**
- Modify: `backend/routes/todo/routes.py`
- Modify: `backend/routes/todo/helpers.py`
- Test: `backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write failing init/status tests**

Add to `backend/tests/test_todo_routes.py`:

```python
async def test_vocab_app_task_status_starts_uninitialized(client, auth_headers):
    response = await client.get("/todo/app-tasks/vocab/status", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["state"] == "uninitialized"
    assert payload["task_id"] is None
    assert payload["config_id"] is None


async def test_vocab_app_task_init_creates_recurring_managed_task(client, auth_headers, vocab_deck_id):
    response = await client.post(
        "/todo/app-tasks/vocab/init",
        json={
            "deck_id": vocab_deck_id,
            "daily_target_count": 20,
            "default_focus_duration": 1500,
            "add_to_today_plan": True,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["state"] in {"ready", "completed_today", "blocked"}
    assert payload["task_id"]
    assert payload["config_id"]

    task = await client.get(f"/todo/tasks/{payload['task_id']}", headers=auth_headers)
    assert task.status_code == 200
    task_payload = task.json()
    assert task_payload["title"] == "今日单词"
    assert task_payload["source_type"] == "app"
    assert task_payload["app_id"] == "vocab"
    assert task_payload["app_task_type"] == "vocab_today"
    assert task_payload["managed_by_app"] is True
    assert task_payload["is_recurring"] is True
    assert task_payload["period_type"] == "daily"
    assert task_payload["max_completions_per_period"] == 1


async def test_erc_app_task_init_creates_recurring_managed_task(client, auth_headers):
    response = await client.post(
        "/todo/app-tasks/erc/init",
        json={
            "review_scope": "due",
            "daily_question_target": 10,
            "default_focus_duration": 1500,
            "add_to_today_plan": True,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["task_id"]

    task = await client.get(f"/todo/tasks/{payload['task_id']}", headers=auth_headers)
    assert task.status_code == 200
    task_payload = task.json()
    assert task_payload["title"] == "ERC 复习"
    assert task_payload["source_type"] == "app"
    assert task_payload["app_id"] == "erc"
    assert task_payload["app_task_type"] == "erc_review"
    assert task_payload["managed_by_app"] is True
```

If the existing fixtures do not expose `vocab_deck_id`, add a small fixture that queries or imports the first deck used by existing vocab tests.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd backend && uv run pytest tests/test_todo_routes.py::test_vocab_app_task_status_starts_uninitialized tests/test_todo_routes.py::test_vocab_app_task_init_creates_recurring_managed_task tests/test_todo_routes.py::test_erc_app_task_init_creates_recurring_managed_task -q
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Add helper functions**

In `backend/routes/todo/helpers.py`, add:

```python
def _app_task_title(app_id: str, app_task_type: str) -> str:
    if app_id == "vocab" and app_task_type == "vocab_today":
        return "今日单词"
    if app_id == "erc" and app_task_type == "erc_review":
        return "ERC 复习"
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="不支持的应用任务")


async def _get_active_app_task_config(conn: Any, *, user_id: int, app_id: str, app_task_type: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT id, user_id, app_id, app_task_type, config, status, created_task_id, created_at, updated_at
        FROM app_task_configs
        WHERE user_id = $1 AND app_id = $2 AND app_task_type = $3 AND status = 'active'
        """,
        int(user_id),
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
) -> asyncpg.Record:
    existing = await _get_active_app_task_config(conn, user_id=user_id, app_id=app_id, app_task_type=app_task_type)
    if existing is not None:
        row = await conn.fetchrow(
            """
            UPDATE app_task_configs
            SET config = $1::jsonb, updated_at = NOW()
            WHERE id = $2
            RETURNING id, user_id, app_id, app_task_type, config, status, created_task_id, created_at, updated_at
            """,
            _to_jsonb_param(config),
            existing["id"],
        )
        if row is None:
            raise HTTPException(status_code=500, detail="更新应用任务配置失败")
        return row
    row = await conn.fetchrow(
        """
        INSERT INTO app_task_configs(user_id, app_id, app_task_type, config, status)
        VALUES ($1, $2, $3, $4::jsonb, 'active')
        RETURNING id, user_id, app_id, app_task_type, config, status, created_task_id, created_at, updated_at
        """,
        int(user_id),
        app_id,
        app_task_type,
        _to_jsonb_param(config),
    )
    if row is None:
        raise HTTPException(status_code=500, detail="创建应用任务配置失败")
    return row


async def _create_or_update_managed_app_task(
    conn: Any,
    *,
    user_id: int,
    config_id: UUID,
    app_id: str,
    app_task_type: str,
    title: str,
    target_duration: int,
    add_to_today_plan: bool,
    event_id: UUID | None,
) -> asyncpg.Record:
    existing = await conn.fetchrow(
        """
        SELECT id FROM tasks
        WHERE user_id = $1 AND source_type = 'app' AND app_id = $2 AND app_task_type = $3 AND managed_by_app = TRUE AND is_deleted = FALSE
        LIMIT 1
        """,
        int(user_id),
        app_id,
        app_task_type,
    )
    if existing is not None:
        row = await conn.fetchrow(
            """
            UPDATE tasks
            SET title = $1,
                target_duration = $2,
                app_config_id = $3,
                manually_scheduled_for_today = $4,
                event_id = $5,
                updated_at = NOW()
            WHERE id = $6 AND user_id = $7
            RETURNING id, user_id, title, content, status, priority, target_duration,
                      current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                      event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                      weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type, tags,
                      actual_duration, start_date, due_date, source_type, app_id, app_task_type, app_config_id,
                      app_instance_key, managed_by_app, is_deleted, created_at, updated_at
            """,
            title,
            int(target_duration),
            config_id,
            bool(add_to_today_plan),
            event_id,
            existing["id"],
            int(user_id),
        )
    else:
        row = await conn.fetchrow(
            """
            INSERT INTO tasks(
                user_id, title, content, status, priority, target_duration,
                current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type, tags,
                start_date, due_date, source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
            )
            VALUES ($1, $2, NULL, 'todo', 0, $3, 0, 0, 'daily', NULL, '', '{}', $4,
                    TRUE, 'daily', NULL, 1, FALSE, FALSE, FALSE, $5, 'focus', '{}',
                    NULL, NULL, 'app', $6, $7, $8, $9, TRUE)
            RETURNING id, user_id, title, content, status, priority, target_duration,
                      current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
                      event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
                      weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type, tags,
                      actual_duration, start_date, due_date, source_type, app_id, app_task_type, app_config_id,
                      app_instance_key, managed_by_app, is_deleted, created_at, updated_at
            """,
            int(user_id),
            title,
            int(target_duration),
            event_id,
            bool(add_to_today_plan),
            app_id,
            app_task_type,
            config_id,
            f"{app_id}:{app_task_type}",
        )
    if row is None:
        raise HTTPException(status_code=500, detail="创建应用托管任务失败")
    await conn.execute(
        "UPDATE app_task_configs SET created_task_id = $1, updated_at = NOW() WHERE id = $2",
        row["id"],
        config_id,
    )
    return row
```

- [ ] **Step 4: Add route handlers**

In `backend/routes/todo/routes.py`, import new schemas:

```python
AppTaskStatusOut,
ERCAppTaskInitRequest,
VocabAppTaskInitRequest,
```

Import helper functions:

```python
_app_task_title,
_create_or_update_app_task_config,
_create_or_update_managed_app_task,
_get_active_app_task_config,
```

Add a local status builder:

```python
async def _app_task_status(
    conn: Any,
    *,
    user_id: int,
    app_id: str,
    app_task_type: str,
) -> AppTaskStatusOut:
    config = await _get_active_app_task_config(conn, user_id=user_id, app_id=app_id, app_task_type=app_task_type)
    if config is None or config["created_task_id"] is None:
        return AppTaskStatusOut(state="uninitialized")
    task_row = await conn.fetchrow(
        """
        SELECT id, user_id, title, content, status, priority, target_duration,
               current_cycle_count, target_cycle_count, cycle_period, cycle_every_days, event, event_ids,
               event_id, is_recurring, period_type, custom_period_days, max_completions_per_period,
               weekday_only, time_inherits_from_event, time_overridden, manually_scheduled_for_today, task_type, tags,
               actual_duration, start_date, due_date, source_type, app_id, app_task_type, app_config_id,
               app_instance_key, managed_by_app, is_deleted, created_at, updated_at
        FROM tasks
        WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
        """,
        config["created_task_id"],
        int(user_id),
    )
    if task_row is None:
        return AppTaskStatusOut(state="config_invalid", config_id=config["id"], blocked_reason="应用托管任务不存在")
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
        completion_state=completion_state,
        blocked_reason=completion_state.blocked_reason if completion_state else None,
        config=dict(config["config"] or {}),
    )
```

Add routes:

```python
@router.get("/app-tasks/vocab/status", response_model=AppTaskStatusOut)
async def get_vocab_app_task_status(request: Request, user: Annotated[Any, Depends(get_current_user)]) -> AppTaskStatusOut:
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
            deck = await conn.fetchrow("SELECT id FROM vocab_decks WHERE id = $1", body.deck_id)
            if deck is None:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="词书不存在")
            config = await _create_or_update_app_task_config(
                conn,
                user_id=int(user.id),
                app_id="vocab",
                app_task_type="vocab_today",
                config={
                    "deck_id": body.deck_id,
                    "daily_target_count": body.daily_target_count,
                    "default_focus_duration": body.default_focus_duration,
                    "add_to_today_plan": body.add_to_today_plan,
                    "event_id": str(body.event_id) if body.event_id else None,
                },
            )
            await _create_or_update_managed_app_task(
                conn,
                user_id=int(user.id),
                config_id=config["id"],
                app_id="vocab",
                app_task_type="vocab_today",
                title=_app_task_title("vocab", "vocab_today"),
                target_duration=body.default_focus_duration,
                add_to_today_plan=body.add_to_today_plan,
                event_id=body.event_id,
            )
            return await _app_task_status(conn, user_id=int(user.id), app_id="vocab", app_task_type="vocab_today")


@router.get("/app-tasks/erc/status", response_model=AppTaskStatusOut)
async def get_erc_app_task_status(request: Request, user: Annotated[Any, Depends(get_current_user)]) -> AppTaskStatusOut:
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
            config = await _create_or_update_app_task_config(
                conn,
                user_id=int(user.id),
                app_id="erc",
                app_task_type="erc_review",
                config={
                    "review_scope": body.review_scope,
                    "daily_question_target": body.daily_question_target,
                    "default_focus_duration": body.default_focus_duration,
                    "add_to_today_plan": body.add_to_today_plan,
                    "event_id": str(body.event_id) if body.event_id else None,
                },
            )
            await _create_or_update_managed_app_task(
                conn,
                user_id=int(user.id),
                config_id=config["id"],
                app_id="erc",
                app_task_type="erc_review",
                title=_app_task_title("erc", "erc_review"),
                target_duration=body.default_focus_duration,
                add_to_today_plan=body.add_to_today_plan,
                event_id=body.event_id,
            )
            return await _app_task_status(conn, user_id=int(user.id), app_id="erc", app_task_type="erc_review")
```

- [ ] **Step 5: Run backend tests**

Run:

```bash
cd backend && uv run pytest tests/test_todo_routes.py::test_vocab_app_task_status_starts_uninitialized tests/test_todo_routes.py::test_vocab_app_task_init_creates_recurring_managed_task tests/test_todo_routes.py::test_erc_app_task_init_creates_recurring_managed_task -q
cd backend && uv run ruff check routes/todo tests/test_todo_routes.py
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/todo/routes.py backend/routes/todo/helpers.py backend/tests/test_todo_routes.py
git commit -m "feat(backend): add app task initialization"
```

Update `docs/开发日志.md` with the commit record.

---

### Task 3: Backend Focus Workflow Uses App-Managed Task Adapters

**Files:**
- Modify: `backend/routes/todo/helpers.py`
- Modify: `backend/routes/todo/routes.py`
- Modify: `backend/routes/todo/schemas.py`
- Test: `backend/tests/test_focus_workflow_app_work.py`
- Test: `backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write failing workflow adapter tests**

Add to `backend/tests/test_focus_workflow_app_work.py`:

```python
async def test_start_focus_on_vocab_managed_task_exposes_vocab_adapter(client, auth_headers, vocab_deck_id):
    init_response = await client.post(
        "/todo/app-tasks/vocab/init",
        json={"deck_id": vocab_deck_id, "daily_target_count": 20, "default_focus_duration": 1500},
        headers=auth_headers,
    )
    assert init_response.status_code == 200
    task_id = init_response.json()["task_id"]

    response = await client.post(f"/todo/tasks/{task_id}/focus/start", headers=auth_headers)
    assert response.status_code == 200

    workflow = await client.get("/todo/focus/workflow/current", headers=auth_headers)
    assert workflow.status_code == 200
    payload = workflow.json()
    assert payload["task_id"] == task_id
    assert payload["active_focus_work_type"] == "vocab_today"
    assert payload["active_task_source_type"] == "app"
    assert payload["active_task_app_id"] == "vocab"
    assert payload["active_task_app_task_type"] == "vocab_today"
    assert payload["focus_work_display_state"] == "fullscreen"


async def test_complete_app_managed_focus_writes_task_completion_record(client, auth_headers, vocab_deck_id):
    init_response = await client.post(
        "/todo/app-tasks/vocab/init",
        json={"deck_id": vocab_deck_id, "daily_target_count": 20, "default_focus_duration": 1500},
        headers=auth_headers,
    )
    task_id = init_response.json()["task_id"]
    await client.post(f"/todo/tasks/{task_id}/focus/start", headers=auth_headers)

    complete_response = await client.post(
        "/todo/focus/workflow/focus-work-result",
        json={
            "focus_work_type": "vocab_today",
            "result": "completed",
            "progress_snapshot": {"completedAppTask": True},
        },
        headers=auth_headers,
    )
    assert complete_response.status_code == 200

    status_response = await client.get("/todo/app-tasks/vocab/status", headers=auth_headers)
    assert status_response.status_code == 200
    assert status_response.json()["state"] == "completed_today"
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd backend && uv run pytest tests/test_focus_workflow_app_work.py::test_start_focus_on_vocab_managed_task_exposes_vocab_adapter tests/test_focus_workflow_app_work.py::test_complete_app_managed_focus_writes_task_completion_record -q
```

Expected: FAIL because workflow only maps task-bound phases to `task_focus` and result submission does not complete app-managed tasks.

- [ ] **Step 3: Add adapter resolver**

In `backend/routes/todo/helpers.py`, add:

```python
def _focus_work_type_for_task_row(task_row: Any | None) -> FocusWorkType:
    if task_row is None:
        return "task_focus"
    app_task_type = _record_get(task_row, "app_task_type")
    if app_task_type == "vocab_today":
        return "vocab_today"
    if app_task_type == "erc_review":
        return "erc_review"
    return "task_focus"
```

Update `_get_bindable_task` to select app metadata:

```sql
SELECT id, status, is_deleted, title, source_type, app_id, app_task_type, app_config_id, app_instance_key, managed_by_app
FROM tasks
WHERE id = $1 AND user_id = $2
```

Update `_set_workflow_current_phase` calls for task phases so `active_focus_work_type` is `_focus_work_type_for_task_row(task_row)` instead of hard-coded `"task_focus"`.

Update `_row_to_focus_workflow` so when `task_id` is present it can expose adapter metadata. The easiest first pass is to add optional parameters:

```python
def _row_to_focus_workflow(
    row: asyncpg.Record | None,
    *,
    task_title: str | None = None,
    task_source_type: str | None = None,
    task_app_id: str | None = None,
    task_app_task_type: str | None = None,
    task_app_config_id: UUID | None = None,
    completed_workflow_name: str | None = None,
) -> FocusWorkflowOut:
```

and pass those through:

```python
active_task_source_type=task_source_type,
active_task_app_id=task_app_id,
active_task_app_task_type=task_app_task_type,
active_task_app_config_id=task_app_config_id,
```

In route handlers that fetch `task_title`, fetch the new fields too:

```sql
SELECT title, source_type, app_id, app_task_type, app_config_id
FROM tasks
WHERE id = $1 AND user_id = $2
```

- [ ] **Step 4: Complete app-managed tasks on completed focus result**

In `submit_focus_work_result`, after closing focus log and before advancing phase, detect completed app-managed task:

```python
task_id = row.get("task_id") if hasattr(row, "get") else row["task_id"]
if body.result == "completed" and task_id is not None:
    task_row = await conn.fetchrow(
        """
        SELECT id, user_id, status, is_recurring, period_type, custom_period_days,
               max_completions_per_period, weekday_only, source_type, app_id, app_task_type
        FROM tasks
        WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
        """,
        task_id,
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
```

Do not complete ordinary user tasks from `focus-work-result`; ordinary task completion remains the explicit “完成任务并结束专注” action.

- [ ] **Step 5: Keep focus app logs compatible**

For app-managed task execution, time should be counted through `focus_logs`. `focus_app_work_logs` may still be written for compatibility if existing tests expect it, but it must not be the source of truth. If both logs are written, ensure today focus and stats still use `focus_logs`.

- [ ] **Step 6: Run backend workflow tests**

Run:

```bash
cd backend && uv run pytest tests/test_focus_workflow_app_work.py tests/test_todo_routes.py -q
cd backend && uv run ruff check routes/todo tests/test_focus_workflow_app_work.py tests/test_todo_routes.py
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/todo/helpers.py backend/routes/todo/routes.py backend/routes/todo/schemas.py backend/tests/test_focus_workflow_app_work.py backend/tests/test_todo_routes.py
git commit -m "feat(backend): route app tasks through focus workflow"
```

Update `docs/开发日志.md`.

---

### Task 4: Frontend Types and App Task API Clients

**Files:**
- Modify: `frontend/src/components/taskTypes.ts`
- Modify: `frontend/src/components/workflowProgress.ts`
- Modify: `frontend/src/components/focus-work/focusWorkTypes.ts`
- Modify: `frontend/src/lib/vocab/types.ts`
- Modify: `frontend/src/lib/vocab/api.ts`
- Modify: `frontend/src/lib/erc/types.ts`
- Modify: `frontend/src/lib/erc/api.ts`
- Test: typecheck

- [ ] **Step 1: Extend shared task and workflow types**

In `frontend/src/components/taskTypes.ts`, add:

```ts
export type TaskSourceType = 'user' | 'app';
export type AppTaskId = 'vocab' | 'erc';
export type AppTaskType = 'vocab_today' | 'erc_review';
export type AppTaskRuntimeState = 'uninitialized' | 'ready' | 'completed_today' | 'blocked' | 'config_invalid';
```

Extend `Task`:

```ts
source_type: TaskSourceType;
app_id: AppTaskId | null;
app_task_type: AppTaskType | null;
app_config_id: string | null;
app_instance_key: string | null;
managed_by_app: boolean;
```

Add:

```ts
export interface AppTaskStatus {
  state: AppTaskRuntimeState;
  task_id: string | null;
  config_id: string | null;
  completion_state: CompletionState | null;
  blocked_reason: string | null;
  config: Record<string, unknown>;
}
```

In `frontend/src/components/workflowProgress.ts`, add to `WorkflowSnapshot`:

```ts
active_task_source_type?: TaskSourceType | null;
active_task_app_id?: AppTaskId | null;
active_task_app_task_type?: AppTaskType | null;
active_task_app_config_id?: string | null;
```

Import the types from `taskTypes`.

In `frontend/src/components/focus-work/focusWorkTypes.ts`, mirror the same fields in `FocusWorkSnapshot`.

- [ ] **Step 2: Add app task API functions**

In `frontend/src/lib/vocab/types.ts`, import or duplicate narrow API payload types:

```ts
export interface VocabAppTaskInitPayload {
  deck_id: string;
  daily_target_count: number;
  default_focus_duration?: number;
  add_to_today_plan?: boolean;
  event_id?: string | null;
}
```

In `frontend/src/lib/vocab/api.ts`, add:

```ts
import type { AppTaskStatus } from '../../components/taskTypes';
```

and:

```ts
export function fetchVocabAppTaskStatus() {
  return apiJson<AppTaskStatus>('/todo/app-tasks/vocab/status');
}

export function initializeVocabAppTask(payload: VocabAppTaskInitPayload) {
  return apiJson<AppTaskStatus>('/todo/app-tasks/vocab/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
```

In `frontend/src/lib/erc/types.ts`, add:

```ts
export interface ERCAppTaskInitPayload {
  review_scope: 'due' | 'mistakes' | 'all';
  daily_question_target: number;
  default_focus_duration?: number;
  add_to_today_plan?: boolean;
  event_id?: string | null;
}
```

In `frontend/src/lib/erc/api.ts`, add:

```ts
import type { AppTaskStatus } from '../../components/taskTypes';
```

and:

```ts
export function fetchERCAppTaskStatus() {
  return apiJson<AppTaskStatus>('/todo/app-tasks/erc/status');
}

export function initializeERCAppTask(payload: ERCAppTaskInitPayload) {
  return apiJson<AppTaskStatus>('/todo/app-tasks/erc/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd frontend && pnpm check
```

Expected: PASS or only failures from unrelated dirty worktree files. If unrelated failures exist, note them before continuing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/taskTypes.ts frontend/src/components/workflowProgress.ts frontend/src/components/focus-work/focusWorkTypes.ts frontend/src/lib/vocab/types.ts frontend/src/lib/vocab/api.ts frontend/src/lib/erc/types.ts frontend/src/lib/erc/api.ts
git commit -m "feat(frontend): add app task API types"
```

Update `docs/开发日志.md`.

---

### Task 5: Vocab Initialization Flow and Task-Based Start

**Files:**
- Modify: `frontend/src/pages/Vocab/Home.tsx`
- Modify: `frontend/src/pages/Vocab/__tests__/Home.test.tsx`

- [ ] **Step 1: Write failing Vocab Home tests**

Add tests to `frontend/src/pages/Vocab/__tests__/Home.test.tsx`:

```tsx
it('shows initialize button before vocab app task is initialized', async () => {
  mockApi('/todo/app-tasks/vocab/status', { state: 'uninitialized', task_id: null, config_id: null, completion_state: null, blocked_reason: null, config: {} });

  render(<VocabHome />);

  expect(await screen.findByRole('button', { name: '初始化今日单词' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '开始今日单词' })).not.toBeInTheDocument();
});

it('initializes vocab app task from active deck', async () => {
  mockApi('/todo/app-tasks/vocab/status', { state: 'uninitialized', task_id: null, config_id: null, completion_state: null, blocked_reason: null, config: {} });
  const initSpy = mockApi('/todo/app-tasks/vocab/init', {
    state: 'ready',
    task_id: 'task-vocab',
    config_id: 'config-vocab',
    completion_state: null,
    blocked_reason: null,
    config: { deck_id: 'deck-a', daily_target_count: 20 },
  });

  render(<VocabHome />);
  await userEvent.click(await screen.findByRole('button', { name: '初始化今日单词' }));

  expect(initSpy).toHaveBeenCalledWith(expect.objectContaining({
    deck_id: 'deck-a',
    daily_target_count: expect.any(Number),
  }));
});

it('starts vocab focus through the managed task id', async () => {
  mockApi('/todo/app-tasks/vocab/status', {
    state: 'ready',
    task_id: 'task-vocab',
    config_id: 'config-vocab',
    completion_state: { is_completable_now: true, completion_state: 'available' },
    blocked_reason: null,
    config: { deck_id: 'deck-a' },
  });
  const startSpy = mockApi('/todo/tasks/task-vocab/focus/start', { state: 'focus', task_id: 'task-vocab', active_focus_work_type: 'vocab_today', focus_work_display_state: 'fullscreen' });

  render(<VocabHome />);
  await userEvent.click(await screen.findByRole('button', { name: '开始今日单词' }));

  expect(startSpy).toHaveBeenCalled();
});
```

Adjust `mockApi` names to match the existing test helper style in this file.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd frontend && pnpm test -- src/pages/Vocab/__tests__/Home.test.tsx
```

Expected: FAIL because Vocab Home still dispatches `START_FOCUS_WORK_EVENT`.

- [ ] **Step 3: Implement Vocab Home state**

In `frontend/src/pages/Vocab/Home.tsx`, replace `START_FOCUS_WORK_EVENT` usage with APIs:

```ts
import { fetchVocabAppTaskStatus, initializeVocabAppTask } from '../../lib/vocab/api';
import type { AppTaskStatus } from '../../components/taskTypes';
import { apiJson } from '../../lib/api';
```

Add state:

```ts
const [appTaskStatus, setAppTaskStatus] = useState<AppTaskStatus | null>(null);
const [appTaskBusy, setAppTaskBusy] = useState(false);
const [appTaskError, setAppTaskError] = useState<string | null>(null);
```

Load status in an effect:

```ts
useEffect(() => {
  let cancelled = false;
  fetchVocabAppTaskStatus()
    .then((payload) => {
      if (cancelled) return;
      setAppTaskStatus(payload);
      setAppTaskError(null);
    })
    .catch((err: unknown) => {
      if (cancelled) return;
      setAppTaskError(err instanceof Error ? err.message : '应用任务状态加载失败');
    });
  return () => {
    cancelled = true;
  };
}, []);
```

Add handlers:

```ts
const initializeTodayWords = async () => {
  if (!activeDeck) return;
  setAppTaskBusy(true);
  try {
    const payload = await initializeVocabAppTask({
      deck_id: activeDeck.id,
      daily_target_count: summary?.daily_target_count || 20,
      default_focus_duration: 1500,
      add_to_today_plan: true,
    });
    setAppTaskStatus(payload);
    setAppTaskError(null);
  } catch (err) {
    setAppTaskError(err instanceof Error ? err.message : '初始化今日单词失败');
  } finally {
    setAppTaskBusy(false);
  }
};

const startTodayFocusWork = async () => {
  if (!appTaskStatus?.task_id) return;
  setAppTaskBusy(true);
  try {
    await apiJson(`/todo/tasks/${appTaskStatus.task_id}/focus/start`, { method: 'POST' });
    window.dispatchEvent(new CustomEvent('ark:reload-focus'));
  } catch (err) {
    setAppTaskError(err instanceof Error ? err.message : '开始今日单词失败');
  } finally {
    setAppTaskBusy(false);
  }
};
```

Render button logic:

```tsx
{appTaskError ? <p className="mt-3 text-sm text-rose-200">{appTaskError}</p> : null}

{appTaskStatus?.state === 'uninitialized' ? (
  <button type="button" onClick={initializeTodayWords} disabled={!activeDeck || appTaskBusy} className="inline-flex items-center rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:opacity-60">
    初始化今日单词
  </button>
) : appTaskStatus?.state === 'completed_today' || isTodayComplete ? (
  <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex items-center rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90">
    今日已完成
  </button>
) : (
  <button type="button" onClick={startTodayFocusWork} disabled={!appTaskStatus?.task_id || appTaskBusy} className="inline-flex items-center rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:opacity-60">
    {summary && summary.completed_count > 0 ? '继续今日单词' : '开始今日单词'}
  </button>
)}
```

- [ ] **Step 4: Run Vocab tests and typecheck**

Run:

```bash
cd frontend && pnpm test -- src/pages/Vocab/__tests__/Home.test.tsx
cd frontend && pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Vocab/Home.tsx frontend/src/pages/Vocab/__tests__/Home.test.tsx
git commit -m "feat(frontend): initialize vocab app task"
```

Update `docs/开发日志.md`.

---

### Task 6: ERC Initialization Flow and Task-Based Start

**Files:**
- Modify: `frontend/src/pages/ERC/Home.tsx`
- Modify: `frontend/src/pages/ERC/__tests__/Home.test.tsx`

- [ ] **Step 1: Write failing ERC Home tests**

Add tests to `frontend/src/pages/ERC/__tests__/Home.test.tsx`:

```tsx
it('shows initialize button before ERC app task is initialized', async () => {
  mockApi('/todo/app-tasks/erc/status', { state: 'uninitialized', task_id: null, config_id: null, completion_state: null, blocked_reason: null, config: {} });

  render(<ERCHome />);

  expect(await screen.findByRole('button', { name: '初始化 ERC 复习' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '开始复习' })).not.toBeInTheDocument();
});

it('starts ERC review through the managed task id', async () => {
  mockApi('/todo/app-tasks/erc/status', {
    state: 'ready',
    task_id: 'task-erc',
    config_id: 'config-erc',
    completion_state: { is_completable_now: true, completion_state: 'available' },
    blocked_reason: null,
    config: { review_scope: 'due' },
  });
  const startSpy = mockApi('/todo/tasks/task-erc/focus/start', { state: 'focus', task_id: 'task-erc', active_focus_work_type: 'erc_review', focus_work_display_state: 'fullscreen' });

  render(<ERCHome />);
  await userEvent.click(await screen.findByRole('button', { name: '开始复习' }));

  expect(startSpy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd frontend && pnpm test -- src/pages/ERC/__tests__/Home.test.tsx
```

Expected: FAIL because ERC Home still dispatches `START_FOCUS_WORK_EVENT`.

- [ ] **Step 3: Implement ERC Home state**

In `frontend/src/pages/ERC/Home.tsx`, replace `START_FOCUS_WORK_EVENT` usage with:

```ts
import { apiJson } from '../../lib/api';
import type { AppTaskStatus } from '../../components/taskTypes';
import { fetchERCAppTaskStatus, initializeERCAppTask } from '../../lib/erc/api';
```

Add state:

```ts
const [appTaskStatus, setAppTaskStatus] = useState<AppTaskStatus | null>(null);
const [appTaskBusy, setAppTaskBusy] = useState(false);
const [appTaskError, setAppTaskError] = useState<string | null>(null);
```

Load status alongside overview:

```ts
useEffect(() => {
  let cancelled = false;
  Promise.all([fetchERCOverview(), fetchERCAppTaskStatus()])
    .then(([overviewPayload, statusPayload]) => {
      if (cancelled) return;
      setOverview(overviewPayload);
      setAppTaskStatus(statusPayload);
      setError(null);
      setAppTaskError(null);
    })
    .catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : '阅读训练加载失败');
    });
  return () => {
    cancelled = true;
  };
}, []);
```

Add handlers:

```ts
const initializeReviewTask = async () => {
  setAppTaskBusy(true);
  try {
    const payload = await initializeERCAppTask({
      review_scope: 'due',
      daily_question_target: 10,
      default_focus_duration: 1500,
      add_to_today_plan: true,
    });
    setAppTaskStatus(payload);
    setAppTaskError(null);
  } catch (err) {
    setAppTaskError(err instanceof Error ? err.message : '初始化 ERC 复习失败');
  } finally {
    setAppTaskBusy(false);
  }
};

const startReviewFocusWork = async () => {
  if (!appTaskStatus?.task_id) return;
  setAppTaskBusy(true);
  try {
    await apiJson(`/todo/tasks/${appTaskStatus.task_id}/focus/start`, { method: 'POST' });
    window.dispatchEvent(new CustomEvent('ark:reload-focus'));
  } catch (err) {
    setAppTaskError(err instanceof Error ? err.message : '开始 ERC 复习失败');
  } finally {
    setAppTaskBusy(false);
  }
};
```

Render:

```tsx
{appTaskError ? <p className="mt-3 text-sm text-rose-200">{appTaskError}</p> : null}
{appTaskStatus?.state === 'uninitialized' ? (
  <button type="button" onClick={initializeReviewTask} disabled={appTaskBusy} className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm text-white/86 transition hover:border-white/25 hover:bg-white/16 disabled:opacity-60">
    初始化 ERC 复习
  </button>
) : appTaskStatus?.state === 'completed_today' ? (
  <button type="button" disabled className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm text-emerald-100">
    今日已完成
  </button>
) : (
  <button type="button" onClick={startReviewFocusWork} disabled={!appTaskStatus?.task_id || appTaskBusy} className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm text-white/86 transition hover:border-white/25 hover:bg-white/16 disabled:opacity-60">
    开始复习
  </button>
)}
```

- [ ] **Step 4: Run ERC tests and typecheck**

Run:

```bash
cd frontend && pnpm test -- src/pages/ERC/__tests__/Home.test.tsx
cd frontend && pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ERC/Home.tsx frontend/src/pages/ERC/__tests__/Home.test.tsx
git commit -m "feat(frontend): initialize erc app task"
```

Update `docs/开发日志.md`.

---

### Task 7: Focus Runtime Completion Semantics for App-Managed Tasks

**Files:**
- Modify: `frontend/src/components/focus-work/FocusWorkProvider.tsx`
- Modify: `frontend/src/components/focus-work/FocusWorkModalShell.tsx`
- Modify: `frontend/src/components/Vocab/VocabTodayFocusWork.tsx`
- Modify: `frontend/src/components/ERC/ERCReviewFocusWork.tsx`
- Test: `frontend/src/components/__tests__/FocusWorkProvider.test.tsx`

- [ ] **Step 1: Write failing focus runtime tests**

Add to `frontend/src/components/__tests__/FocusWorkProvider.test.tsx`:

```tsx
it('renders vocab adapter for app-managed task focus', async () => {
  mockCurrentWorkflow({
    state: 'focus',
    task_id: 'task-vocab',
    task_title: '今日单词',
    active_focus_work_type: 'vocab_today',
    active_task_source_type: 'app',
    active_task_app_id: 'vocab',
    active_task_app_task_type: 'vocab_today',
    focus_work_display_state: 'fullscreen',
    pending_confirmation: false,
    pending_task_selection: false,
    remaining_seconds: 1500,
  });

  render(<FocusWorkProvider><div>App</div></FocusWorkProvider>);

  expect(await screen.findByText('今日单词')).toBeInTheDocument();
});

it('submits completed result for app-managed vocab completion', async () => {
  const resultSpy = mockApi('/todo/focus/workflow/focus-work-result', {
    state: 'break',
    active_focus_work_type: null,
    focus_work_display_state: 'closed',
  });
  mockCurrentWorkflow({
    state: 'focus',
    task_id: 'task-vocab',
    active_focus_work_type: 'vocab_today',
    active_task_source_type: 'app',
    active_task_app_id: 'vocab',
    active_task_app_task_type: 'vocab_today',
    focus_work_display_state: 'fullscreen',
    pending_confirmation: false,
    pending_task_selection: false,
  });

  render(<FocusWorkProvider><div>App</div></FocusWorkProvider>);
  await userEvent.click(await screen.findByRole('button', { name: '完成今日单词' }));

  expect(resultSpy).toHaveBeenCalledWith(expect.objectContaining({
    focus_work_type: 'vocab_today',
    result: 'completed',
  }));
});
```

Adjust helpers to match existing test utilities.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd frontend && pnpm test -- src/components/__tests__/FocusWorkProvider.test.tsx
```

Expected: FAIL because completion controls and content completion semantics are not unified.

- [ ] **Step 3: Update provider completion action**

In `FocusWorkProvider.tsx`, keep `submitResult('completed')` as the unified app-task completion. For any snapshot with a `task_id`, the backend decides whether app task completion record is written.

Pass a common completion callback to all renderers:

```tsx
onCompleteTaskAndFinish: snapshot.task_id
  ? () => void submitResult('completed', {
      taskId: snapshot.task_id,
      completedTask: true,
      appTaskType: snapshot.active_task_app_task_type ?? null,
    })
  : undefined,
```

Keep the existing explicit ordinary task completion endpoint only for `task_focus` user tasks if needed:

```ts
const isUserTaskFocus = snapshot.active_focus_work_type === 'task_focus'
  && (snapshot.active_task_source_type ?? 'user') === 'user';
```

If `isUserTaskFocus`, `onCompleteTaskAndFinish` should still call `/todo/tasks/{task_id}/complete` before submitting result. If it is app-managed, do not call `/todo/tasks/{task_id}/complete`; let backend `focus-work-result` complete it after adapter confirmation.

- [ ] **Step 4: Update Vocab focus work completion**

In `VocabTodayFocusWork.tsx`, when today session naturally reaches no current item and no batch review, call `onCompleteTaskAndFinish` instead of `onComplete`:

```ts
if (!session.loading && !session.error && !session.isBatchReview && !session.currentItem) {
  completedRef.current = true;
  onCompleteTaskAndFinish?.();
}
```

Expose an explicit button in the empty/completed state:

```tsx
<button type="button" onClick={onCompleteTaskAndFinish} className="mt-5 rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-950">
  完成今日单词
</button>
```

- [ ] **Step 5: Update ERC focus work completion**

In `ERCReviewFocusWork.tsx`, remove `onComplete` from `handleSubmit`; submitting one answer must not end the whole focus workflow.

When `loadNext` receives `has_item: false`, show a completed panel with:

```tsx
<button type="button" onClick={onCompleteTaskAndFinish} className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm text-slate-950">
  完成今日 ERC 复习
</button>
```

For first version, do not auto-complete ERC immediately on no item; require the explicit button so the user can see why the focus ended.

- [ ] **Step 6: Run focus tests**

Run:

```bash
cd frontend && pnpm test -- src/components/__tests__/FocusWorkProvider.test.tsx
cd frontend && pnpm check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/focus-work/FocusWorkProvider.tsx frontend/src/components/focus-work/FocusWorkModalShell.tsx frontend/src/components/Vocab/VocabTodayFocusWork.tsx frontend/src/components/ERC/ERCReviewFocusWork.tsx frontend/src/components/__tests__/FocusWorkProvider.test.tsx
git commit -m "feat(frontend): complete app managed focus tasks"
```

Update `docs/开发日志.md`.

---

### Task 8: Today View Separates App-Managed Tasks

**Files:**
- Modify: `frontend/src/components/PlaceholderCard.tsx`
- Modify: `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`

- [ ] **Step 1: Write failing task grouping test**

Add to `frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`:

```tsx
it('groups app-managed tasks separately from user tasks', async () => {
  mockTasks([
    {
      id: 'task-user',
      title: '写论文摘要',
      source_type: 'user',
      managed_by_app: false,
      completion_state: { hidden_from_action_list: false, is_completable_now: true },
    },
    {
      id: 'task-vocab',
      title: '今日单词',
      source_type: 'app',
      app_id: 'vocab',
      app_task_type: 'vocab_today',
      managed_by_app: true,
      completion_state: { hidden_from_action_list: false, is_completable_now: true },
    },
  ]);

  render(<PlaceholderCard />);

  expect(await screen.findByText('今日任务')).toBeInTheDocument();
  expect(screen.getByText('写论文摘要')).toBeInTheDocument();
  expect(screen.getByText('应用任务')).toBeInTheDocument();
  expect(screen.getByText('今日单词')).toBeInTheDocument();
});
```

Adjust `mockTasks` object shape to include all required `Task` fields used by local helpers.

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd frontend && pnpm test -- src/components/__tests__/PlaceholderCard.workflow.test.tsx
```

Expected: FAIL because tasks are not grouped by source.

- [ ] **Step 3: Implement grouping**

In `PlaceholderCard.tsx`, wherever actionable/today tasks are derived, split:

```ts
const visibleActionTasks = tasks.filter((task) => !_isTaskHiddenFromActionList(task));
const userActionTasks = visibleActionTasks.filter((task) => task.source_type !== 'app' && !task.managed_by_app);
const appActionTasks = visibleActionTasks.filter((task) => task.source_type === 'app' || task.managed_by_app);
```

Render app tasks in their own section:

```tsx
{appActionTasks.length > 0 ? (
  <section className="mt-6">
    <div className="text-xs uppercase tracking-[0.2em] text-white/40">应用任务</div>
    <div className="mt-3 space-y-2">
      {appActionTasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </div>
  </section>
) : null}
```

Use the existing local task row/card renderer rather than introducing a separate visual system.

- [ ] **Step 4: Run frontend tests**

Run:

```bash
cd frontend && pnpm test -- src/components/__tests__/PlaceholderCard.workflow.test.tsx
cd frontend && pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PlaceholderCard.tsx frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx
git commit -m "feat(frontend): separate app tasks in today view"
```

Update `docs/开发日志.md`.

---

### Task 9: Verification Pass and Dev Log

**Files:**
- Modify: `docs/开发日志.md`

- [ ] **Step 1: Run backend verification**

Run:

```bash
cd backend && uv run pytest tests/test_todo_routes.py tests/test_focus_workflow_app_work.py tests/test_vocab_routes.py tests/test_erc_routes.py -q
cd backend && uv run ruff check routes/todo routes/vocab routes/erc tests/test_todo_routes.py tests/test_focus_workflow_app_work.py tests/test_vocab_routes.py tests/test_erc_routes.py
```

Expected: PASS.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
cd frontend && pnpm test -- src/pages/Vocab/__tests__/Home.test.tsx src/pages/ERC/__tests__/Home.test.tsx src/components/__tests__/FocusWorkProvider.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx
cd frontend && pnpm check
```

Expected: PASS.

- [ ] **Step 3: Manual smoke checklist**

Start dev servers if needed:

```bash
cd backend && uv run uvicorn main:app --reload
cd frontend && pnpm dev
```

Smoke test in browser:

1. Open Vocab home with no app task initialized.
2. Confirm “初始化今日单词” appears and no “开始今日单词” appears.
3. Initialize Vocab.
4. Confirm “开始今日单词” appears.
5. Start focus and confirm fullscreen Vocab focus opens from a real task.
6. Complete today words or use test data that reaches completion.
7. Confirm app task status becomes `completed_today`.
8. Repeat the same high-level flow for ERC.
9. Confirm Today view shows user tasks and app tasks in separate sections.

- [ ] **Step 4: Final dev log update**

If any commits did not yet have dev log entries, add them under `## codex/focus-work-capsule` in `docs/开发日志.md`. Each entry must include:

```markdown
### 2026-05-16 HH:MM · <hash> · <commit message>

- 用户提出的需求：
  - “我想的是回到子应用中，在子应用增加一个 初始化 button，用户必须在子应用中初始化后才可以使用，初始化的作用是填入子应用所需的信息，再根据这些信息自动生成任务。”
  - “可以，继续吧”

- 本次完成的工作：
  - ...

- 验证情况：
  - ...
```

- [ ] **Step 5: Commit dev log if changed**

```bash
git add docs/开发日志.md
git commit -m "docs: update app managed task dev log"
```

---

## Self-Review

Spec coverage:

- Initialization before use is covered by Tasks 2, 5, and 6.
- App-managed recurring tasks and completion records are covered by Tasks 1, 2, and 3.
- Task-based focus entry and adapter rendering are covered by Tasks 3 and 7.
- Vocab/ERC separate initialization flows are covered by Tasks 5 and 6.
- Avoiding task list pollution is covered by Task 8.
- Statistics reuse `focus_logs + tasks` because Task 3 routes app-managed focus through `focus_logs`; Task 9 verifies existing stats paths indirectly through backend tests.
- Pause/continue unification is acknowledged in Task 7 as shell responsibility, but full pause-time accounting may need a follow-up implementation plan if not already handled by current branch changes.

Placeholder scan:

- This plan avoids placeholder markers and gives concrete files, test names, commands, and code snippets for the first implementation pass.

Type consistency:

- Backend literals use `source_type`, `app_id`, `app_task_type`, `app_config_id`, `app_instance_key`, and `managed_by_app`.
- Frontend uses the same property names.
- Workflow adapter fields are named `active_task_source_type`, `active_task_app_id`, `active_task_app_task_type`, and `active_task_app_config_id`.
