# Arrangements and Appointments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independent appointments, evolve the task modal into an arrangement modal, and support both structured and quick creation flows without breaking task-specific focus behavior.

**Architecture:** Keep `task` and `appointment` as separate entities across backend and frontend. Reuse the current modal shell in `PlaceholderCard.tsx`, but split inventory management by top-level type tabs while expanding the summary column to show both tasks and appointments. Introduce appointment-specific backend routes and frontend types first, then layer UI and assistant parsing on top.

**Tech Stack:** FastAPI, asyncpg, React, TypeScript, Vitest, Testing Library, pytest

---

## File Map

- Modify: `/Users/qishu/Project/ark/backend/routes/todo_routes.py`
- Modify: `/Users/qishu/Project/ark/backend/tests/test_todo_routes.py`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/PlaceholderCard.tsx`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/taskTypes.ts`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/TaskEditModal.tsx`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/MultiWeekCalendarModal.tsx`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/calendarUtils.ts`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.taskAssistant.test.tsx`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx`
- Create: `/Users/qishu/Project/ark/frontend/src/components/AppointmentEditModal.tsx`
- Create: `/Users/qishu/Project/ark/frontend/src/components/__tests__/AppointmentEditModal.test.tsx`
- Create: `/Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.arrangements.test.tsx`

### Task 1: Add appointment backend primitives

**Files:**
- Modify: `/Users/qishu/Project/ark/backend/routes/todo_routes.py`
- Test: `/Users/qishu/Project/ark/backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write failing backend tests for appointment CRUD and confirmation states**

Add pytest coverage that asserts:

- `POST /todo/appointments` creates a pending appointment with required `ends_at`
- `GET /todo/appointments` returns appointments separately from tasks
- an appointment past `ends_at` is serialized as `needs_confirmation`
- `PATCH /todo/appointments/{id}` can mark the result as `attended`, `missed`, or `cancelled`

- [ ] **Step 2: Run the targeted backend tests and verify they fail**

Run: `uv run pytest /Users/qishu/Project/ark/backend/tests/test_todo_routes.py -k appointment -v`

Expected: failing tests because appointment routes and models do not exist yet.

- [ ] **Step 3: Add appointment models, schema initialization, row mapping, and CRUD routes**

Implement in `/Users/qishu/Project/ark/backend/routes/todo_routes.py`:

- appointment request/response models
- table creation for appointments and appointment occurrences/results
- helper logic to derive `needs_confirmation`
- appointment CRUD endpoints
- confirmation result update endpoint

- [ ] **Step 4: Re-run the targeted backend tests and verify they pass**

Run: `uv run pytest /Users/qishu/Project/ark/backend/tests/test_todo_routes.py -k appointment -v`

Expected: PASS for new appointment coverage.

### Task 2: Add appointment-aware arrangement summary endpoints

**Files:**
- Modify: `/Users/qishu/Project/ark/backend/routes/todo_routes.py`
- Test: `/Users/qishu/Project/ark/backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write failing tests for arrangement summary/calendar behavior**

Add tests that assert:

- arrangement calendar responses can represent task blocks and dot-based appointment items distinctly
- appointment queries can filter `today`, `needs_confirmation`, and `repeating`
- one-to-one task/appointment linkage is validated

- [ ] **Step 2: Run the summary-focused backend tests and verify they fail**

Run: `uv run pytest /Users/qishu/Project/ark/backend/tests/test_todo_routes.py -k 'calendar or summary or linkage' -v`

Expected: FAIL because backend does not yet expose appointment-aware summary behavior.

- [ ] **Step 3: Implement minimal summary/query support**

Add:

- appointment list filters
- appointment calendar query shape
- optional arrangement summary helper endpoint if the modal needs a combined payload
- validation for one-to-one task/appointment linking

- [ ] **Step 4: Re-run the targeted tests and verify they pass**

Run: `uv run pytest /Users/qishu/Project/ark/backend/tests/test_todo_routes.py -k 'calendar or summary or linkage' -v`

Expected: PASS.

### Task 3: Introduce frontend appointment types and editor

**Files:**
- Modify: `/Users/qishu/Project/ark/frontend/src/components/taskTypes.ts`
- Create: `/Users/qishu/Project/ark/frontend/src/components/AppointmentEditModal.tsx`
- Create: `/Users/qishu/Project/ark/frontend/src/components/__tests__/AppointmentEditModal.test.tsx`

- [ ] **Step 1: Write failing frontend tests for appointment editing**

Add tests that assert:

- appointment editor renders `title`, `starts_at`, `ends_at`, repeating controls, and confirmation actions
- `needs_confirmation` appointments can be confirmed as `attended`, `missed`, or `cancelled`
- `cancelled` appointments remain editable and visible

- [ ] **Step 2: Run the appointment editor tests and verify they fail**

Run: `pnpm test -- /Users/qishu/Project/ark/frontend/src/components/__tests__/AppointmentEditModal.test.tsx`

Expected: FAIL because appointment types and editor do not exist.

- [ ] **Step 3: Add the minimal appointment type definitions and editor component**

Implement:

- `Appointment` and arrangement helper types in `taskTypes.ts` or a nearby shared types file
- `AppointmentEditModal.tsx` following the existing direct-edit modal conventions from `TaskEditModal.tsx`

- [ ] **Step 4: Re-run the appointment editor tests and verify they pass**

Run: `pnpm test -- /Users/qishu/Project/ark/frontend/src/components/__tests__/AppointmentEditModal.test.tsx`

Expected: PASS.

### Task 4: Evolve the management modal into arrangements

**Files:**
- Modify: `/Users/qishu/Project/ark/frontend/src/components/PlaceholderCard.tsx`
- Create: `/Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.arrangements.test.tsx`

- [ ] **Step 1: Write failing modal tests for arrangement structure**

Add tests that assert:

- the home entry label becomes `安排`
- opening the modal shows left-column sections in the order `今日任务`, `今日日程`, `待确认日程`
- a reminder appears when confirmation-needed appointments exist
- the right column switches between `任务` and `日程` tabs
- clicking a summary appointment opens the appointment editor directly

- [ ] **Step 2: Run the new modal tests and verify they fail**

Run: `pnpm test -- /Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.arrangements.test.tsx`

Expected: FAIL because the modal is still task-only.

- [ ] **Step 3: Implement the arrangement modal shell changes**

Update `PlaceholderCard.tsx` to:

- rename user-facing task entry labels to arrangement labels
- load appointments alongside tasks
- replace the current right-column task-only header with `任务 / 日程` tabs
- render appointment sections in the summary column
- keep direct-open editing behavior in the summary column

- [ ] **Step 4: Re-run the modal tests and verify they pass**

Run: `pnpm test -- /Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.arrangements.test.tsx`

Expected: PASS.

### Task 5: Upgrade quick creation into quick arrangements

**Files:**
- Modify: `/Users/qishu/Project/ark/frontend/src/components/PlaceholderCard.tsx`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.taskAssistant.test.tsx`

- [ ] **Step 1: Write failing assistant-flow tests**

Add tests that assert:

- the helper copy reflects `快捷安排`
- natural language parsing can produce either task or appointment drafts
- structured creation can explicitly choose `任务` or `日程`

- [ ] **Step 2: Run the assistant tests and verify they fail**

Run: `pnpm test -- /Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.taskAssistant.test.tsx`

Expected: FAIL because the assistant is task-only.

- [ ] **Step 3: Implement minimal assistant and create-form changes**

Update `PlaceholderCard.tsx` so that:

- quick parsing accepts both kinds
- draft confirmation reflects the detected arrangement type
- structured creation starts with a type choice before showing task-specific or appointment-specific fields

- [ ] **Step 4: Re-run the assistant tests and verify they pass**

Run: `pnpm test -- /Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.taskAssistant.test.tsx`

Expected: PASS.

### Task 6: Extend calendar rendering to appointments and dot semantics

**Files:**
- Modify: `/Users/qishu/Project/ark/frontend/src/components/MultiWeekCalendarModal.tsx`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/calendarUtils.ts`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx`

- [ ] **Step 1: Write failing calendar tests**

Add tests that assert:

- appointments render as dots anchored to `ends_at`
- deadline-only tasks render as dots
- scheduled tasks still render as blocks
- the combined arrangement calendar can open task or appointment editors appropriately

- [ ] **Step 2: Run the calendar tests and verify they fail**

Run: `pnpm test -- /Users/qishu/Project/ark/frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx`

Expected: FAIL because the calendar is task-only and block-oriented.

- [ ] **Step 3: Implement minimal calendar support for arrangement items**

Update the calendar data model and rendering helpers so the UI can distinguish:

- scheduled task block segments
- deadline dots
- appointment dots

- [ ] **Step 4: Re-run the calendar tests and verify they pass**

Run: `pnpm test -- /Users/qishu/Project/ark/frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx`

Expected: PASS.

### Task 7: Regression verification

**Files:**
- Modify as needed based on failures

- [ ] **Step 1: Run focused frontend regression tests**

Run:

- `pnpm test -- /Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`
- `pnpm test -- /Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.taskAssistant.test.tsx`
- `pnpm test -- /Users/qishu/Project/ark/frontend/src/components/__tests__/MultiWeekCalendarModal.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run focused backend regression tests**

Run:

- `uv run pytest /Users/qishu/Project/ark/backend/tests/test_todo_routes.py -v`

Expected: PASS.

- [ ] **Step 3: Run type/lint checks for touched surfaces**

Run:

- `cd /Users/qishu/Project/ark/frontend && pnpm check`
- `cd /Users/qishu/Project/ark/backend && uv run ruff check .`

Expected: PASS.

## Self-Review

Spec coverage check:

- independent appointment entity: covered in Tasks 1-4
- arrangement modal evolution: covered in Tasks 4-5
- combined calendar semantics: covered in Task 6
- one-to-one task/appointment relation: covered in Task 2
- quick arrangement assistant: covered in Task 5

Placeholder scan:

- no `TODO` or `TBD` markers remain in the execution tasks

Type consistency:

- use `Appointment`, `Task`, and arrangement-aware helper models consistently
- keep appointment state names aligned with the approved design: `pending`, `needs_confirmation`, `attended`, `missed`, `cancelled`
