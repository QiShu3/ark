# Web Log Export Design

## Context

The `/web` page already exposes a strong debugging foundation for developers:

- The backend persists session events in `agent_message_history`
- The runtime streams structured event packets over WebSocket
- The web UI shows both a raw event stream and a filtered chat view
- TTS debugging already has local browser-side detailed logs

The current gap is not lack of debugging data, but lack of a convenient export workflow. Developers can inspect information in the page, but they cannot package the current session's full debugging context into a single downloadable artifact for offline inspection, issue reports, or sharing with collaborators.

The goal of this change is to add a detailed log download feature centered on the currently selected session, with developer control over which log groups are exported.

## Goals

- Add a clear `下载日志` entry point to the `/web` session UI
- Export logs for the currently selected entire session rather than only the latest run
- Let developers choose which log groups to include from a modal dialog
- Default the modal to all log groups selected
- Download the result as a single `.zip` file
- Include both backend-derived session data and browser-side debugging context
- Keep the exported files easy to inspect manually without custom tooling

## Non-Goals

- Exporting only a single run instead of the full selected session
- Building a server-side archival system for historical exports
- Uploading exported logs anywhere automatically
- Redesigning the existing raw event view beyond what is needed to expose the new action
- Adding new persistent database tables for this iteration

## Recommended Approach

Implement a frontend-led export flow with a modal for log selection and a ZIP assembly step in the browser, while re-fetching authoritative session data from the backend at export time.

This hybrid approach combines the best properties of both layers:

- Backend APIs provide authoritative session metadata, runs, and persisted event history
- Frontend state contributes browser-only debugging information such as WebSocket state and TTS playback diagnostics
- The export stays tightly aligned with the currently selected session in the `/web` page
- No new backend file-generation endpoint is required in the first iteration

The export flow will produce a ZIP archive containing multiple plain-text and JSON files rather than a single combined JSON blob. This keeps different debugging concerns separated and makes the artifact easier to inspect quickly.

## Alternatives Considered

### 1. Frontend-only export from currently loaded memory

Trade-offs:

- Fastest to implement
- Avoids additional API calls during export
- Risks incomplete exports if the page has not loaded all relevant data or the in-memory state is stale
- Makes the export less trustworthy as a diagnostic artifact

### 2. Backend-generated ZIP download endpoint

Trade-offs:

- Produces consistent server-authored artifacts
- Good for large exports in the future
- Does not naturally include browser-only debugging state without adding a client-to-server upload path
- Adds server complexity that is not necessary for the current scope

### 3. Hybrid export with backend refresh and frontend packaging

Trade-offs:

- Slightly more implementation work than frontend-only export
- Best fit for the current `/web` architecture
- Preserves both authoritative session history and local debug context

This is the recommended approach.

## UX Design

### Entry Point

The `/web` page will add a `下载日志` button in the session-level action area near other debugging-oriented controls.

Behavior rules:

- The button is disabled when no session is selected
- The button opens a modal instead of downloading immediately
- The feature always operates on the currently selected session

### Export Modal

The modal presents a short explanation, the selected session name and ID, and a checkbox list of exportable log groups.

The initial checkbox set is:

- `会话事件流`
- `Run 摘要`
- `会话/Profile 摘要`
- `浏览器调试信息`
- `TTS 调试日志`

Default behavior:

- All checkboxes are selected when the modal opens
- The developer may uncheck any subset before confirming
- If every option is unchecked, the confirm button is disabled and the modal explains that at least one log group must be selected

Modal actions:

- `取消`
- `下载 ZIP`

### Export Feedback

During ZIP generation:

- The confirm button enters a loading state
- The modal remains open
- Repeated clicks are prevented until export completes or fails

If export fails:

- The modal stays open
- A visible error message explains whether the failure came from data fetching or ZIP creation

If export succeeds:

- The browser starts a file download
- The modal closes
- The local TTS debug log records that an export occurred

## Archive Format

### File Name

The ZIP file name should be deterministic and readable:

- `agent-debug-<session-name-or-id>-<timestamp>.zip`

Sanitization rules:

- Prefer the selected session name when present
- Fall back to the session ID if the name is missing
- Replace unsafe filename characters with `-`

### ZIP Contents

The ZIP will contain only the files corresponding to the selected checkbox groups.

Recommended first-iteration file set:

- `summary.json`
- `session-events.jsonl`
- `runs.json`
- `client-debug.json`
- `tts-debug.log`

### File Semantics

#### `summary.json`

Purpose:

- Provide a compact overview of what was exported
- Help engineers quickly understand the artifact contents before opening the larger files

Expected fields:

- `exported_at`
- `session`
- `profile`
- `selected_logs`
- `counts`
- `latest_run_id`
- `web_version_context` where available

#### `session-events.jsonl`

Purpose:

- Provide a line-oriented export of the full persisted event history for the selected session
- Make it easy to grep, diff, and process with scripts

Expected content:

- One JSON object per line
- Ordered by `sequence_no` and timestamp
- Derived from backend session message history rather than current DOM state

Included fields should match the persisted message/event model where available:

- `id`
- `session_id`
- `run_id`
- `role`
- `content`
- `event_type`
- `sequence_no`
- `name`
- `tool_call_id`
- `metadata_json`
- `created_at`

#### `runs.json`

Purpose:

- Expose the session's run list and each run's high-level snapshot metadata
- Help correlate event history to individual runs

Expected content:

- Array of runs for the selected session
- Includes run status, timestamps, workspace path, and snapshot summary

The file should avoid dumping oversized prompt text blindly if the snapshot becomes very large in future iterations. The first iteration may include the current snapshot object if it is already available from existing APIs, but the structure should stay explicit so it can be trimmed later if needed.

#### `client-debug.json`

Purpose:

- Capture browser-local diagnostics that are not persisted by the backend
- Help explain issues such as connection state, playback state, or UI timing mismatches

Expected sections:

- `websocket`
- `ui_state`
- `selection_context`
- `recent_errors`
- `export_context`

Representative fields:

- Redacted WebSocket URL
- Current socket state
- Whether a run is in progress
- Raw event count currently loaded in the page
- Filtered chat event count
- Current session ID and selected profile ID
- Streaming UI state
- Last known frontend-side error messages

#### `tts-debug.log`

Purpose:

- Preserve the existing TTS-focused debug log in a human-readable format
- Keep continuity with the page's current TTS debugging workflow

Expected content:

- The current textual TTS debug dump already generated by the page
- Existing redaction or summarization rules for audio payloads remain in place

## Data Boundaries

### Backend-authored export data

The export should re-fetch these data sets when the user confirms export:

- Current session details
- Current session run list
- Current session persisted message history
- Current profile details if already available through existing page data or existing API access patterns

This avoids relying purely on whatever the page happened to cache during browsing.

### Frontend-authored export data

The export should capture these ephemeral data sets from the browser at export time:

- Current WebSocket connection label and redacted URL
- Whether the browser believes a run is in progress
- Current TTS state and queue statistics
- TTS detailed log entries
- Frontend-only errors or playback failures

### Redaction and Safety

The export must not include secrets unnecessarily.

Rules:

- Redact auth tokens from WebSocket URLs
- Preserve the existing omission behavior for raw `audio_b64`
- Do not dump password fields, API keys, or raw auth storage into the artifact
- Keep `metadata_json` as exported from persisted events, but continue avoiding frontend-only secret interpolation

## Architecture and Code Boundaries

### Frontend responsibilities

The `/web` frontend will own:

- Rendering the `下载日志` button
- Managing modal open/close state
- Tracking selected export groups
- Re-fetching backend data needed for export
- Building ZIP contents
- Starting the browser download
- Showing loading and failure feedback

Suggested frontend refactoring boundary:

- Extract export helpers away from the main page flow where possible
- Keep file-content builders as small focused functions such as:
  - `buildExportSummary(...)`
  - `buildSessionEventsJsonl(...)`
  - `buildClientDebugJson(...)`
  - `buildZipFilename(...)`

### Backend responsibilities

The backend is not required to add a new ZIP endpoint in this iteration.

However, the design assumes the existing APIs already used by `/web` remain the source of truth for:

- Session detail
- Session message history
- Session run list

If current APIs are insufficient, the implementation may add a lightweight read endpoint only for data retrieval, not for file generation.

## Error Handling

- If no session is selected, the export action cannot begin
- If one selected log group fails to build after confirm, the export fails as a whole in the first iteration
- The modal should surface a concrete error message rather than failing silently
- If backend refresh requests fail, the UI should explain which fetch step failed
- If ZIP assembly fails in the browser, the UI should report it and keep the user in the modal

Future iterations could support partial exports with warnings, but that is not required now.

## Testing Strategy

### Frontend interaction coverage

- `下载日志` button is disabled without a selected session
- Clicking the button opens the modal for the selected session
- All checkbox options are selected by default
- Unchecking all options disables confirm
- Confirm shows loading state while export is in progress
- Successful export closes the modal
- Failed export keeps the modal open and shows an error

### Export content coverage

- ZIP filename uses session name when available
- ZIP contains only the files for selected log groups
- `summary.json` reflects the actual selected groups and counts
- `session-events.jsonl` preserves event ordering
- `client-debug.json` contains a redacted WebSocket URL rather than a raw tokenized URL
- `tts-debug.log` is omitted when that group is unchecked

### Regression coverage

- Existing TTS debug log download still works or is cleanly folded into the new export path
- Existing session browsing and raw event rendering continue to function
- Export does not mutate the active session or interfere with the current WebSocket connection

## Open Implementation Notes

- The ZIP implementation will likely need a browser-side ZIP library if none is already vendored
- If a new dependency is introduced, it should be lightweight and browser-friendly
- `session-events.jsonl` is preferred over a large JSON array because it scales better for debugging workflows
- The export summary should include counts based on the exported datasets so engineers can quickly validate completeness
