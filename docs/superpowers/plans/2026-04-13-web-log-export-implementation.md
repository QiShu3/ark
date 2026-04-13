# Web Log Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `下载日志` workflow to `/web` that opens a modal, defaults all log groups to selected, and downloads the currently selected session's full debugging context as a ZIP archive.

**Architecture:** Keep the existing FastAPI-served static `/web` surface and implement the feature in the vendored mini-agent web app. The HTML and CSS add a session-scoped export button plus modal, while `app.js` re-fetches session data, combines it with browser-local diagnostics, and assembles the selected files into one ZIP download. Static integration checks live in `backend/tests/test_mini_agent_integration.py` because the older `backend/2ms/tests/test_web_runtime.py` suite is globally skipped.

**Tech Stack:** FastAPI, pytest, static HTML/CSS/JavaScript, browser `Blob` download flow, JSZip (vendored static asset)

---

## File Structure

- Modify: `backend/tests/test_mini_agent_integration.py`
  - Add active regression coverage for the `/web` export button, modal controls, and ZIP helper asset wiring.
- Modify: `backend/mini_agent_integration.py`
  - Extend cache-busting replacement to cover the new static ZIP helper asset.
- Add: `backend/2ms/mini_agent/server/web/jszip.min.js`
  - Vendor the pinned browser ZIP library used by the static `/web` page.
- Modify: `backend/2ms/mini_agent/server/web/index.html`
  - Add the `下载日志` button, export modal markup, and JSZip script tag.
- Modify: `backend/2ms/mini_agent/server/web/styles.css`
  - Style the export button, modal layout, checkbox list, error state, and loading state.
- Modify: `backend/2ms/mini_agent/server/web/app.js`
  - Add export state, modal behavior, backend refresh helpers, JSON/JSONL builders, client-debug serialization, ZIP assembly, and browser download logic.

### Task 1: Add Static Export Controls And Asset Wiring

**Files:**
- Modify: `backend/tests/test_mini_agent_integration.py`
- Modify: `backend/mini_agent_integration.py`
- Add: `backend/2ms/mini_agent/server/web/jszip.min.js`
- Modify: `backend/2ms/mini_agent/server/web/index.html`

- [ ] **Step 1: Write the failing integration test for `/web` export controls**

Add this test to `backend/tests/test_mini_agent_integration.py`:

```python
def test_web_page_exposes_log_export_controls() -> None:
    app = FastAPI()
    register_mini_agent(app)
    client = TestClient(app)

    response = client.get("/web")

    assert response.status_code == 200
    assert 'id="download-session-logs-button"' in response.text
    assert 'id="log-export-modal"' in response.text
    assert 'id="log-export-session-summary"' in response.text
    assert 'id="log-export-session-events"' in response.text
    assert 'id="log-export-runs"' in response.text
    assert 'id="log-export-client-debug"' in response.text
    assert 'id="log-export-tts-debug"' in response.text
    assert "/static/jszip.min.js?v=" in response.text
```

- [ ] **Step 2: Run the targeted integration test to verify it fails**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run pytest tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_controls -v
```

Expected:

```text
FAILED tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_controls
```

- [ ] **Step 3: Add the static asset and markup**

Vendor JSZip into `backend/2ms/mini_agent/server/web/jszip.min.js`:

```bash
curl -L https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js -o /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/jszip.min.js
```

Update `backend/mini_agent_integration.py` so the `/web` HTML cache-busts the new asset:

```python
        app_js = f"/static/app.js?v={_asset_version(_MINI_AGENT_WEB_DIR / 'app.js')}"
        styles_css = f"/static/styles.css?v={_asset_version(_MINI_AGENT_WEB_DIR / 'styles.css')}"
        jszip_js = f"/static/jszip.min.js?v={_asset_version(_MINI_AGENT_WEB_DIR / 'jszip.min.js')}"
        html = html.replace("/static/app.js", app_js)
        html = html.replace("/static/styles.css", styles_css)
        html = html.replace("/static/jszip.min.js", jszip_js)
```

Update the chat header area in `backend/2ms/mini_agent/server/web/index.html` to add the session-scoped export button:

```html
<div class="chat-actions">
    <button
        id="download-session-logs-button"
        class="secondary-button small-button"
        onclick="openLogExportModal()"
        disabled
    >
        下载日志
    </button>
    <span id="tts-state-badge" class="status-badge secondary">tts: off</span>
    <button id="tts-toggle-button" class="secondary-button small-button" onclick="toggleTtsPlayback()" disabled>启用朗读</button>
    <button id="tts-stop-button" class="danger-button small-button" onclick="stopTtsPlayback('manual_stop')" disabled>停止朗读</button>
    <span id="session-status-badge" class="status-badge">idle</span>
</div>
```

Add this modal before the closing `</div>` for `#app`:

```html
<div id="log-export-modal" class="modal hidden">
    <div class="modal-content session-modal">
        <span class="close" onclick="closeLogExportModal()">&times;</span>
        <h2>下载调试日志</h2>
        <p class="field-hint" id="log-export-session-label">请选择会话后导出。</p>
        <div class="checkbox-grid log-export-grid">
            <label><input type="checkbox" id="log-export-session-summary" checked> 会话/Profile 摘要</label>
            <label><input type="checkbox" id="log-export-session-events" checked> 会话事件流</label>
            <label><input type="checkbox" id="log-export-runs" checked> Run 摘要</label>
            <label><input type="checkbox" id="log-export-client-debug" checked> 浏览器调试信息</label>
            <label><input type="checkbox" id="log-export-tts-debug" checked> TTS 调试日志</label>
        </div>
        <div id="log-export-error" class="error hidden"></div>
        <div class="input-actions">
            <button type="button" class="secondary-button" onclick="closeLogExportModal()">取消</button>
            <button type="button" id="log-export-confirm-button" onclick="downloadSelectedSessionLogs()">下载 ZIP</button>
        </div>
    </div>
</div>
```

Load the ZIP helper before `app.js`:

```html
<script src="/static/jszip.min.js"></script>
<script src="/static/app.js"></script>
```

- [ ] **Step 4: Re-run the targeted integration test to verify it passes**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run pytest tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_controls -v
```

Expected:

```text
PASSED tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_controls
```

- [ ] **Step 5: Commit**

```bash
git add /Users/qishu/.codex/worktrees/8f50/ark/backend/tests/test_mini_agent_integration.py /Users/qishu/.codex/worktrees/8f50/ark/backend/mini_agent_integration.py /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/index.html /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/jszip.min.js
git commit -m "feat(web): add log export shell"
```

### Task 2: Implement Export Modal State And Selection Behavior

**Files:**
- Modify: `backend/2ms/mini_agent/server/web/styles.css`
- Modify: `backend/2ms/mini_agent/server/web/app.js`

- [ ] **Step 1: Add the failing static regression test for modal state hooks**

Extend `backend/tests/test_mini_agent_integration.py` with:

```python
def test_web_page_exposes_log_export_state_hooks() -> None:
    app = FastAPI()
    register_mini_agent(app)
    client = TestClient(app)

    response = client.get("/web")

    assert response.status_code == 200
    assert 'id="log-export-confirm-button"' in response.text
    assert 'id="log-export-error"' in response.text
    assert "openLogExportModal()" in response.text
    assert "closeLogExportModal()" in response.text
    assert "downloadSelectedSessionLogs()" in response.text
```

- [ ] **Step 2: Run the targeted regression test to verify it fails**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run pytest tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_state_hooks -v
```

Expected:

```text
FAILED tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_state_hooks
```

- [ ] **Step 3: Add modal state, defaults, and button enablement**

Add export state near the top of `backend/2ms/mini_agent/server/web/app.js`:

```javascript
const LOG_EXPORT_DEFAULTS = Object.freeze({
    sessionSummary: true,
    sessionEvents: true,
    runs: true,
    clientDebug: true,
    ttsDebug: true,
});

let logExportState = {
    isOpen: false,
    isDownloading: false,
    error: '',
    selected: { ...LOG_EXPORT_DEFAULTS },
};
```

Add these helpers in `backend/2ms/mini_agent/server/web/app.js`:

```javascript
function logExportCheckboxMap() {
    return {
        sessionSummary: document.getElementById('log-export-session-summary'),
        sessionEvents: document.getElementById('log-export-session-events'),
        runs: document.getElementById('log-export-runs'),
        clientDebug: document.getElementById('log-export-client-debug'),
        ttsDebug: document.getElementById('log-export-tts-debug'),
    };
}

function selectedLogExportCount() {
    return Object.values(logExportState.selected).filter(Boolean).length;
}

function setLogExportError(message) {
    logExportState.error = message ? String(message) : '';
    renderLogExportModal();
}

function resetLogExportState() {
    logExportState = {
        isOpen: false,
        isDownloading: false,
        error: '',
        selected: { ...LOG_EXPORT_DEFAULTS },
    };
}
```

Add the modal open/close/render functions:

```javascript
function openLogExportModal() {
    if (!currentSession) {
        return;
    }
    logExportState.isOpen = true;
    logExportState.isDownloading = false;
    logExportState.error = '';
    logExportState.selected = { ...LOG_EXPORT_DEFAULTS };
    renderLogExportModal();
}

function closeLogExportModal() {
    logExportState.isOpen = false;
    logExportState.isDownloading = false;
    logExportState.error = '';
    renderLogExportModal();
}

function toggleLogExportOption(key) {
    logExportState.selected[key] = !logExportState.selected[key];
    renderLogExportModal();
}
```

Render checkbox state and disabled state in one place:

```javascript
function renderLogExportModal() {
    const modal = document.getElementById('log-export-modal');
    const errorNode = document.getElementById('log-export-error');
    const labelNode = document.getElementById('log-export-session-label');
    const confirmButton = document.getElementById('log-export-confirm-button');
    const checkboxMap = logExportCheckboxMap();
    const hasSelection = selectedLogExportCount() > 0;

    modal.classList.toggle('hidden', !logExportState.isOpen);
    labelNode.textContent = currentSession
        ? `当前会话：${currentSession.name || currentSession.id} (${currentSession.id})`
        : '请选择会话后导出。';

    Object.entries(checkboxMap).forEach(([key, node]) => {
        if (!node) {
            return;
        }
        node.checked = Boolean(logExportState.selected[key]);
        node.disabled = logExportState.isDownloading;
        node.onchange = () => toggleLogExportOption(key);
    });

    errorNode.textContent = logExportState.error;
    errorNode.classList.toggle('hidden', !logExportState.error);
    confirmButton.disabled = !currentSession || !hasSelection || logExportState.isDownloading;
    confirmButton.textContent = logExportState.isDownloading ? '正在生成 ZIP...' : '下载 ZIP';
}
```

Update existing session-selection and teardown paths to keep the export button and modal in sync:

```javascript
function updateRunControls() {
    const sendButton = document.getElementById('send-button');
    const cancelButton = document.getElementById('cancel-button');
    const downloadButton = document.getElementById('download-session-logs-button');

    sendButton.disabled = !currentSession || runInProgress;
    cancelButton.classList.toggle('hidden', !runInProgress);
    downloadButton.disabled = !currentSession || logExportState.isDownloading;
}
```

Style the modal state in `backend/2ms/mini_agent/server/web/styles.css`:

```css
.log-export-grid {
    margin: 16px 0;
}

.log-export-grid label {
    display: flex;
    align-items: center;
    gap: 10px;
}

#log-export-error {
    margin-bottom: 12px;
}
```

- [ ] **Step 4: Re-run the targeted regression test to verify it passes**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run pytest tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_state_hooks -v
```

Expected:

```text
PASSED tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_state_hooks
```

- [ ] **Step 5: Commit**

```bash
git add /Users/qishu/.codex/worktrees/8f50/ark/backend/tests/test_mini_agent_integration.py /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/styles.css /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/app.js
git commit -m "feat(web): add log export modal state"
```

### Task 3: Build ZIP Contents From Session Data And Browser Diagnostics

**Files:**
- Modify: `backend/2ms/mini_agent/server/web/app.js`

- [ ] **Step 1: Add a failing static regression test for export data hooks**

Extend `backend/tests/test_mini_agent_integration.py` with:

```python
def test_web_page_exposes_log_export_builders() -> None:
    app = FastAPI()
    register_mini_agent(app)
    client = TestClient(app)

    response = client.get("/web")

    assert response.status_code == 200
    assert "buildLogExportSummary" in response.text
    assert "buildSessionEventsJsonl" in response.text
    assert "buildClientDebugPayload" in response.text
    assert "downloadSelectedSessionLogs" in response.text
```

- [ ] **Step 2: Run the targeted regression test to verify it fails**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run pytest tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_builders -v
```

Expected:

```text
FAILED tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_builders
```

- [ ] **Step 3: Implement export builders and ZIP download flow**

Add backend refresh and filename helpers in `backend/2ms/mini_agent/server/web/app.js`:

```javascript
function sanitizeExportFilenamePart(value) {
    return String(value || 'session')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'session';
}

function buildExportZipFilename(session) {
    const timestamp = nowIsoString().replace(/[:.]/g, '-');
    const label = sanitizeExportFilenamePart(session?.name || session?.id || 'session');
    return `agent-debug-${label}-${timestamp}.zip`;
}

async function fetchExportSessionData(sessionId) {
    const [session, runs, messages] = await Promise.all([
        api(`/sessions/${sessionId}`),
        api(`/sessions/${sessionId}/runs`),
        api(`/sessions/${sessionId}/messages`),
    ]);
    return { session, runs, messages };
}
```

Serialize each selected file with focused builders:

```javascript
function buildSessionEventsJsonl(messages) {
    return messages
        .map((message) => JSON.stringify({
            id: message.id,
            session_id: message.session_id,
            run_id: message.run_id,
            role: message.role,
            content: message.content,
            event_type: message.event_type,
            sequence_no: message.sequence_no,
            name: message.name,
            tool_call_id: message.tool_call_id,
            metadata_json: message.metadata_json,
            created_at: message.created_at,
        }))
        .join('\n');
}

function buildClientDebugPayload(session, runs, messages) {
    return {
        websocket: {
            url: buildSessionWebSocketUrl(true),
            state: sessionSocketStateLabel(),
        },
        ui_state: {
            run_in_progress: runInProgress,
            raw_event_count: currentSessionEvents.length,
            filtered_event_count: currentSessionEvents.filter((event) => isFilteredChatEvent(event)).length,
            streaming_visible: Boolean(streamingAssistantMessage),
            current_message_count: messages.length,
        },
        selection_context: {
            session_id: session.id,
            profile_id: session.profile_id,
            latest_run_id: runs.length > 0 ? runs[runs.length - 1].id : null,
        },
        recent_errors: {
            tts_last_error: ttsDebug.lastError || null,
        },
        export_context: {
            exported_at: nowIsoString(),
            selected_logs: { ...logExportState.selected },
        },
    };
}
```

Build `summary.json` with explicit counts:

```javascript
function buildLogExportSummary(session, profile, runs, messages) {
    return {
        exported_at: nowIsoString(),
        session: {
            id: session.id,
            name: session.name,
            status: session.status,
            workspace_path: session.workspace_path,
            created_at: session.created_at,
            updated_at: session.updated_at,
        },
        profile: profile ? {
            id: profile.id,
            key: profile.key,
            name: profile.name,
            updated_at: profile.updated_at,
        } : null,
        selected_logs: { ...logExportState.selected },
        counts: {
            runs: runs.length,
            events: messages.length,
            filtered_chat_events: messages.filter((message) => ['user', 'assistant_message'].includes(message.event_type || message.role)).length,
            tts_debug_entries: ttsDebug.detailedLogs.length,
        },
        latest_run_id: runs.length > 0 ? runs[runs.length - 1].id : null,
        web_version_context: {
            path: window.location.pathname,
            user_agent: navigator.userAgent,
        },
    };
}
```

Implement the ZIP assembly and download flow:

```javascript
async function downloadSelectedSessionLogs() {
    if (!currentSession || logExportState.isDownloading || selectedLogExportCount() === 0) {
        return;
    }

    logExportState.isDownloading = true;
    setLogExportError('');
    renderLogExportModal();

    try {
        const { session, runs, messages } = await fetchExportSessionData(currentSession.id);
        const profile = profiles.find((item) => item.id === session.profile_id) || null;
        const zip = new JSZip();

        zip.file('summary.json', JSON.stringify(buildLogExportSummary(session, profile, runs, messages), null, 2));

        if (logExportState.selected.sessionEvents) {
            zip.file('session-events.jsonl', buildSessionEventsJsonl(messages));
        }
        if (logExportState.selected.runs) {
            zip.file('runs.json', JSON.stringify(runs, null, 2));
        }
        if (logExportState.selected.sessionSummary) {
            zip.file('session-profile-summary.json', JSON.stringify({
                session,
                profile,
            }, null, 2));
        }
        if (logExportState.selected.clientDebug) {
            zip.file('client-debug.json', JSON.stringify(buildClientDebugPayload(session, runs, messages), null, 2));
        }
        if (logExportState.selected.ttsDebug) {
            zip.file('tts-debug.log', buildTtsDebugLogText());
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const filename = buildExportZipFilename(session);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);

        appendTtsDebugLog('session_log_exported', {
            file_name: filename,
            selected_logs: { ...logExportState.selected },
            run_count: runs.length,
            event_count: messages.length,
        });

        closeLogExportModal();
        renderInfoPanel();
    } catch (error) {
        setLogExportError(error instanceof Error ? error.message : '日志导出失败');
    } finally {
        logExportState.isDownloading = false;
        renderLogExportModal();
        updateRunControls();
    }
}
```

- [ ] **Step 4: Re-run the targeted regression test to verify it passes**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run pytest tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_builders -v
```

Expected:

```text
PASSED tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_builders
```

- [ ] **Step 5: Commit**

```bash
git add /Users/qishu/.codex/worktrees/8f50/ark/backend/tests/test_mini_agent_integration.py /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/app.js
git commit -m "feat(web): export selected session logs as zip"
```

### Task 4: Verify The End-To-End Export Workflow

**Files:**
- Modify: `backend/tests/test_mini_agent_integration.py`
- Modify: `backend/2ms/mini_agent/server/web/styles.css`
- Modify: `backend/2ms/mini_agent/server/web/app.js`

- [ ] **Step 1: Add one final static regression test for default selections**

Extend `backend/tests/test_mini_agent_integration.py` with:

```python
def test_web_page_log_export_defaults_are_checked() -> None:
    app = FastAPI()
    register_mini_agent(app)
    client = TestClient(app)

    response = client.get("/web")

    assert response.status_code == 200
    assert 'id="log-export-session-summary" checked' in response.text
    assert 'id="log-export-session-events" checked' in response.text
    assert 'id="log-export-runs" checked' in response.text
    assert 'id="log-export-client-debug" checked' in response.text
    assert 'id="log-export-tts-debug" checked' in response.text
```

- [ ] **Step 2: Run the focused regression test to verify it passes after the modal work**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run pytest tests/test_mini_agent_integration.py::test_web_page_log_export_defaults_are_checked -v
```

Expected:

```text
PASSED tests/test_mini_agent_integration.py::test_web_page_log_export_defaults_are_checked
```

- [ ] **Step 3: Run the broader backend integration suite covering `/web`**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run pytest tests/test_mini_agent_integration.py -v
```

Expected:

```text
PASSED tests/test_mini_agent_integration.py::test_web_page_serves_static_assets_with_cache_busting
PASSED tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_controls
PASSED tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_state_hooks
PASSED tests/test_mini_agent_integration.py::test_web_page_exposes_log_export_builders
PASSED tests/test_mini_agent_integration.py::test_web_page_log_export_defaults_are_checked
```

- [ ] **Step 4: Run a manual browser smoke test against `/web`**

Run the backend locally:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend && uv run uvicorn main:app --reload
```

Manual verification checklist:

```text
1. Open http://localhost:8000/web and log in.
2. Select an existing session.
3. Confirm the “下载日志” button becomes enabled.
4. Click the button and verify the modal opens with all five checkboxes selected.
5. Uncheck every item and verify the “下载 ZIP” button becomes disabled.
6. Re-check all items and click “下载 ZIP”.
7. Confirm the browser downloads a .zip file named agent-debug-<session>-<timestamp>.zip.
8. Unzip it and verify summary.json, session-events.jsonl, runs.json, client-debug.json, and tts-debug.log are present.
9. Open client-debug.json and confirm the WebSocket URL is redacted rather than containing a real token.
10. Return to /web and confirm the page still shows the active session without disconnecting the WebSocket unexpectedly.
```

- [ ] **Step 5: Commit**

```bash
git add /Users/qishu/.codex/worktrees/8f50/ark/backend/tests/test_mini_agent_integration.py /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/styles.css /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/app.js
git commit -m "test(web): verify log export workflow"
```
