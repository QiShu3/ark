# ERC Config Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ERC behave as one event-bound reading-training configuration with two independently enabled modules: practice and review.

**Architecture:** Preserve the existing ERC business flows and focus-work adapters. Add a consolidated ERC configuration surface that reads and saves both module settings together, while keeping module task completion independent. Update the ERC home page and event-workbench configuration entry to treat ERC as one application with two modules.

**Tech Stack:** FastAPI, asyncpg, Pydantic, pytest, React, TypeScript, Vitest, Testing Library.

---

## Scope

In scope:

- One ERC configuration UX containing practice and review module settings.
- Practice and review modules can be enabled or disabled independently.
- Disabled modules hide execution entry points and do not sync to today's plan.
- Re-enabled modules restore/sync the existing module task instead of creating a user-visible new module concept.
- ERC Home can create the current primary event's ERC configuration and must tell the user it binds to the primary event.
- If a module task has user-managed outer planning changes, the user is asked whether to resync or keep the manual arrangement.

Out of scope:

- New schedule generation.
- New achievement generation.
- Event-level sub-app recap.
- Rewriting Vocab.
- Renaming user-facing labels unless required for clarity.

## Files

- Modify: `docs/superpowers/specs/2026-05-29-erc-config-consolidation-design.md`
- Modify: `backend/routes/todo/schemas.py`
- Modify: `backend/routes/todo/routes.py`
- Modify: `backend/routes/todo/helpers.py`
- Modify: `backend/tests/test_todo_routes.py`
- Modify: `frontend/src/lib/erc/types.ts`
- Modify: `frontend/src/lib/erc/api.ts`
- Modify: `frontend/src/pages/ERC/Home.tsx`
- Modify: `frontend/src/pages/ERC/__tests__/Home.test.tsx`
- Modify: `frontend/src/components/events/EventWorkbenchModal.tsx`
- Modify: `frontend/src/components/__tests__/EventWorkbenchModal.test.tsx`

## Tasks

### Task 1: Backend Consolidated ERC Config Contract

- [ ] Add failing backend tests proving a single ERC config save can enable both practice and review modules.
- [ ] Verify the test fails against the current split endpoints.
- [ ] Add request/response models for the consolidated ERC config.
- [ ] Add consolidated GET and save endpoints that return both module statuses together.
- [ ] Verify backend tests pass.

### Task 2: Module Disable/Restore Semantics

- [ ] Add failing tests for disabling review while keeping practice enabled.
- [ ] Add failing tests for re-enabling a disabled module without losing task history.
- [ ] Implement disabled module behavior by removing it from today's active arrangement while preserving existing records.
- [ ] Verify task completion states remain independent.
- [ ] Verify backend tests pass.

### Task 3: Manual Arrangement Conflict Prompt Contract

- [ ] Add tests for a save response that reports a module task needs user confirmation before resync.
- [ ] Implement a response shape that tells the frontend which module has manual changes and what choices are available.
- [ ] Add a save option for "resync" vs "keep manual arrangement".
- [ ] Verify backend tests pass.

### Task 4: ERC Frontend Single Configuration Surface

- [ ] Add failing ERC Home tests for one settings surface with two modules.
- [ ] Add frontend ERC API helpers/types for the consolidated config.
- [ ] Update ERC Home to read/save the consolidated config.
- [ ] Show the primary-event binding notice when creating config from ERC Home.
- [ ] Hide disabled module entry points.
- [ ] Show the manual-arrangement confirmation prompt when the backend reports a conflict.
- [ ] Verify ERC Home tests pass.

### Task 5: Event Workbench ERC App Config Entry

- [ ] Add failing EventWorkbenchModal tests that ERC is configured as one application with two module sections.
- [ ] Update the event-workbench app config editor so ERC is one app config entry.
- [ ] Preserve Vocab behavior.
- [ ] Verify EventWorkbenchModal tests pass.

### Task 6: Verification

- [ ] Run targeted backend tests for app-task and focus-work behavior.
- [ ] Run targeted frontend tests for ERC Home and EventWorkbenchModal.
- [ ] Run broader checks if targeted tests pass: backend pytest subset, frontend test subset, and frontend type check.
- [ ] If UI behavior changed materially, start the app and browser-check ERC Home.
