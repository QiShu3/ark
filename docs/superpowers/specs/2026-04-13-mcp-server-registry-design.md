# MCP Server Registry Design

## Goal

Replace freeform profile-level `MCP JSON` editing in the developer-facing `/web` console with a structured MCP server registry plus profile bindings, while keeping the user-facing frontend unchanged.

## Context

This repository has two frontends:

- The React app in `frontend/` is for end users and should not expose MCP configuration.
- The static `/web` app in `backend/2ms/mini_agent/server/web/` is for developers and already manages profiles, sessions, and skills.

Profiles are pre-bound by the developer console, so MCP management belongs entirely in `/web`.

## Requirements

- Developers can manage reusable MCP server definitions in `/web`.
- Profile editing switches from raw `MCP JSON` input to selecting zero or more registered MCP servers.
- Runtime resolves the selected server set for the active profile and loads only those MCP servers.
- Existing profiles with `mcp_config_json` must keep working during the transition.
- The user-facing React frontend must not gain MCP management controls.

## Non-Goals

- Tool-level filtering within a single MCP server.
- Exposing MCP configuration to end users.
- Reworking the full `/web` navigation structure into multiple pages.

## Proposed UX

### Developer Console

Keep `/web` as a single page.

- Add a `管理 MCP Servers` button near the profile controls.
- Clicking the button opens an MCP management modal.
- The modal shows the MCP registry and supports:
  - list registered servers
  - create/edit a server
  - delete a server
  - import servers from an MCP JSON blob

### Profile Editing

- Keep the `enable_mcp` checkbox.
- Remove the freeform `MCP JSON` textarea from the profile form.
- Add a multi-select checklist sourced from the MCP registry.
- Show a compact summary such as the selected server names and count.

## Data Model

Add two new tables:

- `agent_mcp_servers`
  - one row per reusable MCP server definition
  - stores the server config payload in JSONB
- `agent_profile_mcp_servers`
  - join table between profiles and MCP servers
  - preserves explicit profile selections

This separates reusable server definitions from profile capability assignment.

## API Shape

Add developer APIs under `/api/mcp-servers`:

- `GET /api/mcp-servers`
- `POST /api/mcp-servers`
- `PUT /api/mcp-servers/{server_id}`
- `DELETE /api/mcp-servers/{server_id}`
- `POST /api/mcp-servers/import`

Profile APIs stay in place, but profile responses should include selected MCP server ids so `/web` can populate the selector without reconstructing from raw JSON.

## Runtime Resolution

When running a session:

1. Load the profile.
2. If the profile has explicit MCP bindings, build an in-memory `mcp_config_json` from the bound registry servers.
3. Otherwise, fall back to the existing `profile.mcp_config_json`.
4. If neither exists, fall back to the configured global `mcp.json`.

This preserves compatibility while shifting new configuration toward the registry model.

## Error Handling

- Reject invalid server definitions before persistence.
- Reject duplicate server names.
- Prevent profile binding to missing servers.
- Import should skip malformed entries with a clear error rather than silently persisting partial garbage.

## Testing

- Schema/API tests for MCP server CRUD and import.
- Runtime tests proving profile bindings produce the expected in-memory MCP config.
- `/web` static integration tests proving the MCP management button, modal shell, and profile selector controls are present.

## Rollout

- Existing profiles continue to run because `mcp_config_json` fallback remains.
- New edits in `/web` should write profile bindings instead of raw profile-level MCP JSON.
- A later migration can optionally backfill old `mcp_config_json` data into registry rows, but that is not required for the first implementation.
