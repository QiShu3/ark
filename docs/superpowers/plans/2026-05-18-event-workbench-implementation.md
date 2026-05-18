# Event Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-screen event workbench opened from the Home event countdown card, with required event start dates, a global event-plan template library, one persistent plan draft per event, and generation of formal tasks/appointments from that draft.

**Architecture:** Keep the backend in the existing `routes.todo` domain, extending the current event/task/appointment model rather than introducing a separate event app. Add focused frontend event namespace files so `EventCountdownCard.tsx` remains only the countdown/entry component while the workbench, template manager, and plan draft UI live under `frontend/src/components/events/` and `frontend/src/lib/events/`.

**Tech Stack:** FastAPI + asyncpg + Pydantic on the backend; React + TypeScript + Vite + Vitest + Testing Library on the frontend; PostgreSQL DDL through the existing startup migration style in `backend/routes/todo/db.py`.

---

### Task 1: Event `start_date` Model

**Files:**
- Modify: `backend/routes/todo/schemas.py`
- Modify: `backend/routes/todo/db.py`
- Modify: `backend/routes/todo/helpers.py`
- Modify: `backend/routes/todo/routes.py`
- Test: `backend/tests/test_todo_routes.py`
- Modify: `frontend/src/components/EventCountdownCard.tsx`
- Modify: `frontend/src/components/TaskEditModal.tsx`
- Modify: `frontend/src/components/AppointmentEditModal.tsx`
- Test: `frontend/src/components/__tests__/EventCountdownCard.test.tsx`

- [ ] **Step 1: Write failing backend tests for required `start_date`**

  Add tests beside the existing event tests in `backend/tests/test_todo_routes.py`:

  ```python
  def test_create_event_requires_start_date(monkeypatch) -> None:
      conn = _FakeTodoConn()
      pool = _FakePool(conn)
      monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

      app = _build_app()
      client = TestClient(app)

      resp = client.post("/todo/events", json={"name": "DDL", "due_at": "2026-03-20T08:00:00Z"})

      assert resp.status_code == 422


  def test_create_event_persists_start_date(monkeypatch) -> None:
      conn = _FakeTodoConn()
      pool = _FakePool(conn)
      monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

      app = _build_app()
      client = TestClient(app)

      resp = client.post(
          "/todo/events",
          json={
              "name": "DDL",
              "start_date": "2026-03-01",
              "due_at": "2026-03-20T08:00:00Z",
              "is_primary": True,
          },
      )

      assert resp.status_code == 200
      data = resp.json()
      assert data["start_date"] == "2026-03-01"
      assert conn.events[0]["start_date"].isoformat() == "2026-03-01"
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `cd backend && uv run pytest tests/test_todo_routes.py::test_create_event_requires_start_date tests/test_todo_routes.py::test_create_event_persists_start_date -q`

  Expected: the first test fails because `start_date` is not required yet, and the second fails because event rows do not include `start_date`.

- [ ] **Step 3: Implement backend `start_date` support**

  Update `EventCreateRequest`, `EventUpdateRequest`, and `EventOut` with `start_date: date`. Import `date` from `datetime`.

  Update `events` DDL to include `start_date DATE`, backfill with `DATE(due_at AT TIME ZONE 'UTC')`, then set `NOT NULL`.

  Update event `SELECT`, `INSERT`, `UPDATE`, and `_row_to_event` to include `start_date`.

  Update `_FakeTodoConn` event handlers in `backend/tests/test_todo_routes.py` so inserted and selected fake event rows carry `start_date`.

- [ ] **Step 4: Update frontend event forms**

  Extend the local `EventItem` type in `EventCountdownCard.tsx`, `TaskEditModal.tsx`, and `AppointmentEditModal.tsx` with `start_date: string`.

  Add a required start-date field to create/edit event forms in `EventCountdownCard.tsx`, and submit `start_date`.

- [ ] **Step 5: Run verification**

  Run: `cd backend && uv run pytest tests/test_todo_routes.py -q`

  Run: `cd frontend && pnpm test -- EventCountdownCard`

- [ ] **Step 6: Commit**

  ```bash
  git add backend/routes/todo/schemas.py backend/routes/todo/db.py backend/routes/todo/helpers.py backend/routes/todo/routes.py backend/tests/test_todo_routes.py frontend/src/components/EventCountdownCard.tsx frontend/src/components/TaskEditModal.tsx frontend/src/components/AppointmentEditModal.tsx frontend/src/components/__tests__/EventCountdownCard.test.tsx docs/开发日志.md
  git commit -m "feat: require event start dates"
  ```

### Task 2: Backend Template Library

**Files:**
- Modify: `backend/routes/todo/schemas.py`
- Modify: `backend/routes/todo/db.py`
- Modify: `backend/routes/todo/helpers.py`
- Modify: `backend/routes/todo/routes.py`
- Test: `backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write failing tests for template CRUD and copy**

  Add tests that create a template with task and appointment template items, list it, update it, copy it, and delete it. Assert templates are isolated by user and template items preserve `kind`, `title`, `content`, `offset_days`, and `sort_order`.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `cd backend && uv run pytest tests/test_todo_routes.py -k event_plan_template -q`

  Expected: 404 because routes do not exist.

- [ ] **Step 3: Add template schemas**

  Add Pydantic models:

  ```python
  EventPlanScheduleMode = Literal["from_start", "before_due"]
  EventPlanItemKind = Literal["task", "appointment"]

  class EventPlanTemplateItemIn(BaseModel):
      kind: EventPlanItemKind
      title: str = Field(min_length=1, max_length=255)
      content: str | None = None
      offset_days: int = Field(ge=0)
      sort_order: int = Field(default=0, ge=0)

  class EventPlanTemplateCreateRequest(BaseModel):
      name: str = Field(min_length=1, max_length=255)
      description: str | None = None
      schedule_mode: EventPlanScheduleMode
      items: list[EventPlanTemplateItemIn] = Field(default_factory=list)
  ```

  Add update and output models with `id`, `user_id`, timestamps, and item lists.

- [ ] **Step 4: Add DDL**

  Add `event_plan_templates` and `event_plan_template_items` tables in `backend/routes/todo/db.py` with indexes on `(user_id, updated_at DESC)` and `(template_id, sort_order ASC)`.

- [ ] **Step 5: Add CRUD routes**

  Add routes under `/todo/event-plan-templates`. Use transactions for create/update/copy/delete so template item replacement is atomic.

- [ ] **Step 6: Run verification**

  Run: `cd backend && uv run pytest tests/test_todo_routes.py -k event_plan_template -q`

- [ ] **Step 7: Commit**

  ```bash
  git add backend/routes/todo/schemas.py backend/routes/todo/db.py backend/routes/todo/helpers.py backend/routes/todo/routes.py backend/tests/test_todo_routes.py docs/开发日志.md
  git commit -m "feat: add event plan templates"
  ```

### Task 3: Backend Event Plan Drafts and Generation

**Files:**
- Modify: `backend/routes/todo/schemas.py`
- Modify: `backend/routes/todo/db.py`
- Modify: `backend/routes/todo/helpers.py`
- Modify: `backend/routes/todo/routes.py`
- Test: `backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write failing tests for draft application**

  Add tests that create an event and template, apply the template, and assert the generated draft item dates:

  ```python
  assert task_draft["scheduled_for"].startswith("2026-03-15")
  assert appointment_draft["ends_at"].startswith("2026-03-19")
  ```

  Cover both `from_start` and `before_due`, and assert applying a second template replaces the existing event draft.

- [ ] **Step 2: Write failing tests for formal generation**

  Add tests that update a draft item payload, call `POST /todo/events/{event_id}/plan-draft/generate`, and assert:

  - a task is created with `event_id`
  - an appointment is created with `event_id`
  - generated draft items get `created_subject_id`
  - workbench output returns formal records in created-arrangements sections

- [ ] **Step 3: Run tests to verify they fail**

  Run: `cd backend && uv run pytest tests/test_todo_routes.py -k plan_draft -q`

  Expected: 404 because draft routes do not exist.

- [ ] **Step 4: Add draft schemas and DDL**

  Add `event_plan_drafts` and `event_plan_draft_items` tables and output/update/generate request models. Keep each event to one draft with a unique index on `event_id`.

- [ ] **Step 5: Add apply-template route**

  Implement `POST /todo/events/{event_id}/plan-draft/apply-template`. In a transaction, delete or replace the existing draft, create a new draft, calculate concrete dates from `start_date` or `due_at`, and insert draft items.

- [ ] **Step 6: Add draft item editing and deletion routes**

  Implement `PATCH /todo/events/{event_id}/plan-draft/items/{item_id}` and `DELETE /todo/events/{event_id}/plan-draft/items/{item_id}`. Verify event ownership through the draft/event join.

- [ ] **Step 7: Add generation route**

  Implement `POST /todo/events/{event_id}/plan-draft/generate`. In one transaction, create formal tasks and appointments from uncreated draft items, bind `event_id`, set `created_subject_id`, and return the refreshed workbench payload.

- [ ] **Step 8: Add workbench route**

  Implement `GET /todo/events/{event_id}/workbench`. Return event, current draft with uncreated items visible, formal tasks, formal appointments, and existing achievement summary for the event.

- [ ] **Step 9: Run verification**

  Run: `cd backend && uv run pytest tests/test_todo_routes.py -k "plan_draft or event_plan_template or event" -q`

- [ ] **Step 10: Commit**

  ```bash
  git add backend/routes/todo/schemas.py backend/routes/todo/db.py backend/routes/todo/helpers.py backend/routes/todo/routes.py backend/tests/test_todo_routes.py docs/开发日志.md
  git commit -m "feat: generate event plan drafts"
  ```

### Task 4: Frontend Event Workbench Shell

**Files:**
- Create: `frontend/src/lib/events/types.ts`
- Create: `frontend/src/lib/events/api.ts`
- Create: `frontend/src/components/events/EventWorkbenchModal.tsx`
- Create: `frontend/src/components/events/EventOverviewPanel.tsx`
- Create: `frontend/src/components/events/EventCreatedArrangementsPanel.tsx`
- Modify: `frontend/src/components/EventCountdownCard.tsx`
- Test: `frontend/src/components/__tests__/EventWorkbenchModal.test.tsx`
- Test: `frontend/src/components/__tests__/EventCountdownCard.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

  Test that clicking the event countdown opens `EventWorkbenchModal`, loads `/todo/events/{id}/workbench`, and renders event overview plus created task/appointment sections.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `cd frontend && pnpm test -- EventWorkbenchModal EventCountdownCard`

- [ ] **Step 3: Add event types and API wrappers**

  Define `EventItem`, `EventWorkbench`, `EventPlanTemplate`, `EventPlanDraft`, `EventPlanDraftItem`, and wrapper functions for workbench/template/draft endpoints in `frontend/src/lib/events/`.

- [ ] **Step 4: Add modal shell**

  Build a full-screen modal with focus management, close behavior, event overview, created arrangements, and achievement summary placeholder from the workbench payload.

- [ ] **Step 5: Wire countdown card**

  Change `EventCountdownCard` so clicking a primary event opens `EventWorkbenchModal`. Keep a create-event path for no primary event and refresh primary data after event changes.

- [ ] **Step 6: Run verification**

  Run: `cd frontend && pnpm test -- EventWorkbenchModal EventCountdownCard`

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/lib/events frontend/src/components/events frontend/src/components/EventCountdownCard.tsx frontend/src/components/__tests__/EventWorkbenchModal.test.tsx frontend/src/components/__tests__/EventCountdownCard.test.tsx docs/开发日志.md
  git commit -m "feat(frontend): add event workbench shell"
  ```

### Task 5: Frontend Template Manager and Plan Draft UI

**Files:**
- Create: `frontend/src/components/events/EventTemplatePanel.tsx`
- Create: `frontend/src/components/events/EventTemplateManagerModal.tsx`
- Create: `frontend/src/components/events/EventPlanDraftPanel.tsx`
- Modify: `frontend/src/components/events/EventWorkbenchModal.tsx`
- Test: `frontend/src/components/__tests__/EventTemplateManagerModal.test.tsx`
- Test: `frontend/src/components/__tests__/EventPlanDraftPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

  Cover template list/create/edit/copy/delete interactions, applying a template with overwrite confirmation, editing plan draft task/appointment fields, and generating formal arrangements.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `cd frontend && pnpm test -- EventTemplateManagerModal EventPlanDraftPanel`

- [ ] **Step 3: Implement template panel and manager**

  Add template selection, apply button, manage-template modal, task/appointment template item sections, and schedule mode controls.

- [ ] **Step 4: Implement plan draft panel**

  Add task draft and appointment draft sections. Use clear wording: `计划草稿`, `任务草稿`, `日程草稿`, and `生成正式安排`.

- [ ] **Step 5: Implement save-as/update-source template actions**

  Wire buttons to `save-as-template` and `update-source-template` endpoints. Hide update-source when the draft has no source template.

- [ ] **Step 6: Run verification**

  Run: `cd frontend && pnpm test -- EventTemplateManagerModal EventPlanDraftPanel EventWorkbenchModal`

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/components/events frontend/src/lib/events frontend/src/components/__tests__/EventTemplateManagerModal.test.tsx frontend/src/components/__tests__/EventPlanDraftPanel.test.tsx docs/开发日志.md
  git commit -m "feat(frontend): manage event plan templates"
  ```

### Task 6: Final Integration, Checks, and Dev Log

**Files:**
- Modify: `docs/开发日志.md`
- Modify as needed: files touched by Tasks 1-5

- [ ] **Step 1: Run backend checks**

  Run: `cd backend && uv run pytest`

  Run: `cd backend && uv run ruff check .`

- [ ] **Step 2: Run frontend checks**

  Run: `cd frontend && pnpm test`

  Run: `cd frontend && pnpm check`

- [ ] **Step 3: Run visual smoke test**

  Run: `cd frontend && pnpm dev`, open the app, click the event countdown card, create an event with start date, open the workbench, create/apply a template, edit a plan draft, and generate formal arrangements. Confirm the created task and appointment appear in the workbench created sections.

- [ ] **Step 4: Update dev log**

  Add a `codex/event-workbench` branch entry to `docs/开发日志.md` with:

  - User request wording: `开，进行开发吧，记得另起分支开发，不要在main分支上进行开发`
  - Commit hashes for implementation commits
  - Completed work
  - Verification notes

- [ ] **Step 5: Commit final fixes**

  ```bash
  git add docs/开发日志.md backend frontend
  git commit -m "chore: verify event workbench"
  ```

## Self-Review

- Spec coverage: covered event `start_date`, full-screen workbench entry, global template CRUD, one event plan draft, template application, draft editing, formal task/appointment generation, created arrangement aggregation, achievement summary, and frontend tests.
- Scope intentionally deferred: custom achievements, AI decomposition, event stages, standalone event routes, and multiple event-local drafts remain out of scope.
- Placeholder scan: no TBD/TODO placeholders remain in this plan.
- Type consistency: uses `start_date`, `schedule_mode`, `kind`, `offset_days`, `source_template_id`, `created_subject_id`, `计划草稿`, `任务草稿`, `日程草稿`, and `生成正式安排` consistently with the design spec.
