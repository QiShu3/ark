# 事件模板与事件工作台统一实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make event templates behave like prefilled event workbench snapshots so users can hard-code event name, start date, due time, and primary flag in templates while keeping the existing event workbench as the editable runtime surface.

**Architecture:** Extend the existing `routes.todo` event/template model instead of introducing a parallel template system. Add four default-event fields to template persistence and expose them through the existing template CRUD/apply/save APIs. On the frontend, keep `EventCountdownCard` as the entry/editor surface and `EventWorkbenchModal` as the runtime workbench, but align their shared editable content and labels around “事件模板 / 工作台内容” instead of “计划模板 / 计划项目”.

**Tech Stack:** FastAPI + asyncpg + Pydantic on the backend; React + TypeScript + Vite + Vitest + Testing Library on the frontend; PostgreSQL DDL in `backend/routes/todo/db.py`.

---

### Task 1: Add default event fields to template persistence and APIs

**Files:**
- Modify: `backend/routes/todo/schemas.py`
- Modify: `backend/routes/todo/db.py`
- Modify: `backend/routes/todo/routes.py`
- Test: `backend/tests/test_todo_routes.py`

- [x] **Step 1: Write the failing backend tests**

  Add a template CRUD test that creates, lists, copies, and updates a template with these extra fields:

  ```python
  json={
      "name": "考试模板",
      "description": "可直接预填事件信息",
      "schedule_mode": "before_due",
      "default_event_name": "高数期末",
      "default_start_date": "2026-05-20",
      "default_due_at": "2026-06-20T09:00:00Z",
      "default_is_primary": True,
      "items": [],
  }
  ```

  Assert the response echoes those fields, list returns them, and copy preserves them.

  Add a save-as-template test that hits `POST /todo/events/{event_id}/plan-draft/save-as-template` and asserts the returned template also carries the event defaults from the source event.

- [x] **Step 2: Run the backend tests to see them fail**

  Run:
  ```bash
  cd backend && uv run pytest tests/test_todo_routes.py -k event_plan_template -q
  ```

  Expected: schema validation or response mismatch until the new fields exist.

- [x] **Step 3: Implement the backend fields**

  Add these fields to template request/output models:

  ```python
  default_event_name: str | None = None
  default_start_date: date | None = None
  default_due_at: datetime | None = None
  default_is_primary: bool | None = None
  ```

  Add matching columns to `event_plan_templates` in `db.py` and update all template queries in `routes.py`:

  - create
  - list
  - get
  - update
  - copy
  - save-as-template
  - update-source-template
  - apply-template response shape

  Keep existing template items and draft generation logic intact for now.

- [x] **Step 4: Re-run the backend tests**

  Run:
  ```bash
  cd backend && uv run pytest tests/test_todo_routes.py -k event_plan_template -q
  ```

  Expected: the new template-default tests pass.

### Task 2: Let the event editor use template defaults

**Files:**
- Modify: `frontend/src/lib/events/types.ts`
- Modify: `frontend/src/lib/events/api.ts`
- Modify: `frontend/src/components/EventCountdownCard.tsx`
- Test: `frontend/src/components/__tests__/EventCountdownCard.test.tsx`

- [x] **Step 1: Write the failing frontend test**

  Add a test that loads one template with default event fields, selects it in the event editor, and asserts the form is prefilled before submission:

  ```tsx
  expect(screen.getByLabelText('事件名称')).toHaveValue('高数期末');
  expect(screen.getByLabelText('开始日期')).toHaveValue('2026-05-20');
  expect(screen.getByLabelText('到期时间')).toHaveValue('2026-06-20T09:00');
  ```

  Add another assertion that clicking `套用模板` still creates the event first and then opens the workbench.

- [x] **Step 2: Run the frontend test to watch it fail**

  Run:
  ```bash
  cd frontend && pnpm test -- EventCountdownCard.test.tsx
  ```

  Expected: template data does not yet populate event defaults.

- [x] **Step 3: Implement the event editor changes**

  Extend `EventPlanTemplate` in `types.ts` and the API payloads in `api.ts` with the new default event fields.

  In `EventCountdownCard.tsx`:

  - rename the template label from `计划模板` to `事件模板`
  - when a template is selected, prefill any empty event fields from template defaults
  - keep the current hard-coded form values if the user already typed them
  - keep `套用模板` as the action that creates the event and applies the selected template
  - keep the gear button as the template manager entry

- [x] **Step 4: Re-run the frontend test**

  Run:
  ```bash
  cd frontend && pnpm test -- EventCountdownCard.test.tsx
  ```

  Expected: the selection/fill behavior passes.

### Task 3: Align template/workbench wording and template editing surface

**Files:**
- Modify: `frontend/src/components/events/EventWorkbenchModal.tsx`
- Modify: `frontend/src/components/events/EventTemplateManagerModal.tsx`
- Modify: `frontend/src/components/__tests__/EventWorkbenchModal.test.tsx`

- [x] **Step 1: Write the failing UI tests**

  Add a test that checks the template manager and workbench use “事件模板 / 工作台内容” wording instead of “计划模板 / 计划项”, and that the template editor still exposes the same editable event info block as the workbench.

- [x] **Step 2: Run the UI test to see it fail**

  Run:
  ```bash
  cd frontend && pnpm test -- EventWorkbenchModal.test.tsx
  ```

- [x] **Step 3: Implement the wording and surface alignment**

  Update labels in the template manager and workbench so the user sees a single vocabulary:

  - `事件模板`
  - `工作台内容`
  - `模板工作台`

  Keep the runtime-only sections out of the template editor:

  - 已创建安排
  - 成就摘要

  Keep the workbench runtime sections intact.

- [x] **Step 4: Run the full verification set**

  Run:
  ```bash
  cd backend && uv run pytest tests/test_todo_routes.py -q
  cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx
  cd frontend && pnpm check
  ```

  Expected: all pass.
