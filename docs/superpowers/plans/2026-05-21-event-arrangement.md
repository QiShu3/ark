# Event Arrangement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the event workbench surface to "安排" and implement two-column arrangement content editing.

**Architecture:** Keep the existing backend `workbench` and `plan_draft` APIs. Change the React presentation layer so task and schedule items are edited through column-specific inline editors while preserving existing payloads.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, existing Ark event APIs.

---

### Task 1: Add-Event Arrangement Editor

**Files:**
- Modify: `frontend/src/components/__tests__/EventCountdownCard.test.tsx`
- Modify: `frontend/src/components/EventCountdownCard.tsx`

- [ ] Write failing tests for "安排", two equal content columns, "添加任务", "添加日程", and clicking an item title to edit.
- [ ] Run `pnpm test -- EventCountdownCard.test.tsx` from `frontend/` and verify the new tests fail.
- [ ] Implement column rendering and inline add/edit state in `EventCountdownCard.tsx`.
- [ ] Run `pnpm test -- EventCountdownCard.test.tsx` and verify it passes.

### Task 2: Created-Event Arrangement Modal

**Files:**
- Modify: `frontend/src/components/__tests__/EventWorkbenchModal.test.tsx`
- Modify: `frontend/src/components/events/EventWorkbenchModal.tsx`

- [ ] Write failing tests for modal label "安排", two-column arrangement content, add task/schedule actions, and click-to-edit title behavior.
- [ ] Run `pnpm test -- EventWorkbenchModal.test.tsx` from `frontend/` and verify the new tests fail.
- [ ] Implement column rendering, creation through `createEventPlanDraftItem`, and title-click editing in `EventWorkbenchModal.tsx`.
- [ ] Run `pnpm test -- EventWorkbenchModal.test.tsx` and verify it passes.

### Task 3: Verification

**Files:**
- Modify as needed: `frontend/src/components/__tests__/EventCountdownCard.test.tsx`
- Modify as needed: `frontend/src/components/__tests__/EventWorkbenchModal.test.tsx`

- [ ] Run `pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx`.
- [ ] Run `pnpm check`.
- [ ] Browser-check the add-event arrangement surface on `http://localhost:5173/`.
