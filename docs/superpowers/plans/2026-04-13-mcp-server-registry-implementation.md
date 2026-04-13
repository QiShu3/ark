# MCP Server Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable MCP server registry to the developer-facing `/web` console and let profiles select MCP server sets without exposing MCP management in the user-facing frontend.

**Architecture:** Introduce MCP registry tables and APIs in the mini-agent backend, resolve profile-bound MCP config at runtime with backward-compatible fallback to existing `mcp_config_json`, and replace the `/web` profile form's raw MCP JSON input with a modal-driven registry manager plus server checklist.

**Tech Stack:** FastAPI, asyncpg repository helpers, static `/web` HTML/CSS/JS, pytest, TestClient

---

### Task 1: Lock the developer console UI contract with failing static tests

**Files:**
- Modify: `backend/tests/test_mini_agent_integration.py`

- [ ] Add a failing test that expects the `/web` page to expose the MCP management button, modal shell, and profile selector controls.
- [ ] Run `cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run pytest tests/test_mini_agent_integration.py -k mcp -v` and confirm the new assertions fail.

### Task 2: Lock the backend MCP registry contract with failing repository and API tests

**Files:**
- Modify: `backend/tests/test_mini_agent_integration.py`
- Modify: `backend/2ms/tests/test_server_repository.py`

- [ ] Add failing tests for MCP server CRUD, import, and profile binding serialization.
- [ ] Add a failing runtime-focused test that proves explicit profile bindings override legacy `mcp_config_json`.
- [ ] Run the targeted pytest commands and confirm they fail for the expected missing symbols/routes.

### Task 3: Add MCP registry storage and API support

**Files:**
- Modify: `backend/2ms/mini_agent/server/repository.py`
- Modify: `backend/2ms/mini_agent/server/schemas.py`
- Add: `backend/2ms/mini_agent/server/routers/mcp_servers.py`
- Modify: `backend/2ms/mini_agent/server/routers/__init__.py`
- Modify: `backend/mini_agent_integration.py`
- Modify: `backend/2ms/mini_agent/server/main.py`

- [ ] Add MCP registry and profile binding tables plus repository records/helpers.
- [ ] Add schemas and API routes for list/create/update/delete/import.
- [ ] Register the new router in both mini-agent entrypoints.
- [ ] Run the targeted backend tests until they pass.

### Task 4: Resolve profile-bound MCP config in runtime

**Files:**
- Modify: `backend/2ms/mini_agent/server/runtime.py`
- Modify: `backend/2ms/mini_agent/server/routers/profiles.py`

- [ ] Add a runtime helper that composes `mcpServers` from profile bindings and falls back to legacy `mcp_config_json`.
- [ ] Extend profile responses to include selected MCP server ids and lightweight server summaries for `/web`.
- [ ] Re-run the runtime and API tests until green.

### Task 5: Replace `/web` raw MCP JSON editing with modal management and server multi-select

**Files:**
- Modify: `backend/2ms/mini_agent/server/web/index.html`
- Modify: `backend/2ms/mini_agent/server/web/styles.css`
- Modify: `backend/2ms/mini_agent/server/web/app.js`

- [ ] Add the `管理 MCP Servers` button and MCP management modal shell.
- [ ] Add client-side state and API calls for MCP registry CRUD/import.
- [ ] Replace the profile modal's raw MCP JSON textarea with a registry-backed checklist selector.
- [ ] Keep the existing developer console layout compact by opening MCP management in a modal, not a new page.
- [ ] Re-run the `/web` integration tests until green.

### Task 6: Verify the integrated flow

**Files:**
- Modify as needed based on fixes from verification

- [ ] Run `cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run pytest tests/test_mini_agent_integration.py -v`.
- [ ] Run `cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run pytest 2ms/tests/test_server_repository.py -v`.
- [ ] Run any additional focused test commands required by the new router/runtime code.
- [ ] Summarize the backward-compatibility behavior for legacy profiles in the final handoff.
