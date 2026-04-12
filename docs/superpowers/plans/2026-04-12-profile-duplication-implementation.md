# Profile Duplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add profile duplication to `/web`, remove profile-level `workspace_dir` editing, collapse advanced profile fields under `更多`, and convert TTS voice/model inputs into provider-linked selects.

**Architecture:** Keep the existing `/web` FastAPI + static HTML/JS surface, but split the work into a small backend correction and focused frontend changes. The backend change moves default session workspace generation away from profile config, while the frontend reuses the existing profile modal for create/edit/duplicate flows and introduces a small option-table layer for TTS select controls.

**Tech Stack:** FastAPI, asyncpg-backed web routes, vanilla HTML/CSS/JavaScript, pytest

---

## File Structure

- Modify: `backend/2ms/mini_agent/server/runtime.py`
  - Own the default session workspace root helper instead of profile-driven workspace generation.
- Modify: `backend/2ms/mini_agent/server/routers/sessions.py`
  - Stop depending on profile `agent.workspace_dir` when creating sessions.
- Modify: `backend/2ms/tests/test_web_runtime.py`
  - Cover workspace generation, modal markup expectations, and static asset regressions tied to this feature.
- Modify: `backend/2ms/mini_agent/server/web/index.html`
  - Add duplicate-friendly modal structure, `更多` section, and TTS select controls.
- Modify: `backend/2ms/mini_agent/server/web/styles.css`
  - Style the new `更多` section and preserve existing modal density.
- Modify: `backend/2ms/mini_agent/server/web/app.js`
  - Add duplicate mode, centralize payload building, remove `workspace_dir`, and wire TTS provider-linked select options.

### Task 1: Decouple Session Workspace Creation From Profile Config

**Files:**
- Modify: `backend/2ms/tests/test_web_runtime.py`
- Modify: `backend/2ms/mini_agent/server/runtime.py`
- Modify: `backend/2ms/mini_agent/server/routers/sessions.py`

- [ ] **Step 1: Write the failing backend tests**

Add these tests and helper updates in `backend/2ms/tests/test_web_runtime.py`:

```python
def create_profile_payload() -> dict:
    return {
        "name": "Web Profile",
        "system_prompt": "你是一个测试助手。",
        "config_json": {
            "llm": {
                "api_key": "test-key",
                "api_base": "https://example.invalid",
                "model": "fake-model",
                "provider": "anthropic",
            },
            "agent": {
                "max_steps": 5,
            },
            "tools": {
                "enable_file_tools": True,
                "enable_bash": False,
                "enable_note": False,
                "enable_skills": False,
                "enable_mcp": False,
            },
            "tts": {
                "enabled": False,
            },
        },
        "is_default": True,
    }


def expected_session_workspace(session_id: str) -> Path:
    return Path("./workspace").resolve() / "sessions" / session_id


def test_build_session_workspace_path_uses_default_root_without_profile_workspace():
    path = runtime.build_session_workspace_path(session_id="session-123")

    assert path == Path("./workspace").resolve() / "sessions" / "session-123"


def test_create_session_generates_unique_workspace_per_session(web_client):
    client, session_factory, _ = web_client

    headers = create_user_and_headers(session_factory)
    profile_response = client.post("/api/profiles", json=create_profile_payload(), headers=headers)
    assert profile_response.status_code == 201
    profile_id = profile_response.json()["id"]

    first_response = client.post("/api/sessions", json={"profile_id": profile_id}, headers=headers)
    second_response = client.post("/api/sessions", json={"profile_id": profile_id}, headers=headers)

    assert first_response.status_code == 201
    assert second_response.status_code == 201

    first_session = first_response.json()
    second_session = second_response.json()

    assert first_session["workspace_path"] != second_session["workspace_path"]
    assert first_session["workspace_path"] == str(expected_session_workspace(first_session["id"]))
    assert second_session["workspace_path"] == str(expected_session_workspace(second_session["id"]))
```

- [ ] **Step 2: Run the targeted backend tests to verify they fail**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms && uv run pytest tests/test_web_runtime.py::test_build_session_workspace_path_uses_default_root_without_profile_workspace tests/test_web_runtime.py::test_create_session_generates_unique_workspace_per_session -v
```

Expected:

```text
FAILED tests/test_web_runtime.py::test_build_session_workspace_path_uses_default_root_without_profile_workspace
FAILED tests/test_web_runtime.py::test_create_session_generates_unique_workspace_per_session
```

- [ ] **Step 3: Implement the minimal backend change**

Update `backend/2ms/mini_agent/server/runtime.py`:

```python
DEFAULT_WEB_SESSION_WORKSPACE_ROOT = Path("./workspace").resolve()


def build_session_workspace_path(
    session_id: str,
    explicit_workspace_path: str | None = None,
    workspace_root: Path | None = None,
) -> Path:
    """Resolve the effective workspace path for a session."""
    if explicit_workspace_path:
        return Path(explicit_workspace_path).expanduser().absolute()

    resolved_root = (workspace_root or DEFAULT_WEB_SESSION_WORKSPACE_ROOT).expanduser().absolute()
    return resolved_root / "sessions" / session_id
```

Update `backend/2ms/mini_agent/server/routers/sessions.py`:

```python
    workspace_path = str(
        build_session_workspace_path(
            session_id=created.id,
            explicit_workspace_path=session.workspace_path,
        )
    )
```

Also update all `create_profile_payload(...)` call sites in `backend/2ms/tests/test_web_runtime.py` to use the zero-argument helper unless a test is specifically verifying legacy profile `workspace_dir` behavior.

- [ ] **Step 4: Run the targeted backend tests to verify they pass**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms && uv run pytest tests/test_web_runtime.py::test_build_session_workspace_path_uses_default_root_without_profile_workspace tests/test_web_runtime.py::test_create_session_generates_unique_workspace_per_session -v
```

Expected:

```text
PASSED tests/test_web_runtime.py::test_build_session_workspace_path_uses_default_root_without_profile_workspace
PASSED tests/test_web_runtime.py::test_create_session_generates_unique_workspace_per_session
```

- [ ] **Step 5: Commit**

```bash
git add /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/runtime.py /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/routers/sessions.py /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/tests/test_web_runtime.py
git commit -m "fix(backend): decouple session workspace from profiles"
```

### Task 2: Lock In The New Modal Markup

**Files:**
- Modify: `backend/2ms/tests/test_web_runtime.py`
- Modify: `backend/2ms/mini_agent/server/web/index.html`
- Modify: `backend/2ms/mini_agent/server/web/styles.css`

- [ ] **Step 1: Write the failing markup regression test**

Add this test to `backend/2ms/tests/test_web_runtime.py`:

```python
def test_web_page_profile_modal_uses_duplicate_friendly_markup(web_client):
    client, _, _ = web_client

    response = client.get("/web")

    assert response.status_code == 200
    assert 'id="profile-name"' in response.text
    assert 'id="profile-workspace-dir"' not in response.text
    assert 'id="profile-advanced-toggle"' in response.text
    assert 'id="profile-advanced-fields"' in response.text
    assert '<select id="tts-voice">' in response.text
    assert '<select id="tts-minimax-model">' in response.text
```

- [ ] **Step 2: Run the markup test to verify it fails**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms && uv run pytest tests/test_web_runtime.py::test_web_page_profile_modal_uses_duplicate_friendly_markup -v
```

Expected:

```text
FAILED tests/test_web_runtime.py::test_web_page_profile_modal_uses_duplicate_friendly_markup
```

- [ ] **Step 3: Implement the modal structure**

Update `backend/2ms/mini_agent/server/web/index.html` so the profile modal core looks like:

```html
<h2 id="profile-modal-title">新建 Profile</h2>
<input type="text" id="profile-name" placeholder="Profile 名称">
<textarea id="profile-system-prompt" placeholder="System Prompt" rows="5"></textarea>

<div class="grid-two">
    <select id="profile-provider">
        <option value="anthropic">anthropic</option>
        <option value="openai">openai</option>
    </select>
    <input type="text" id="profile-model" placeholder="模型，例如 MiniMax-M2.5">
</div>

<div class="checkbox-grid">
    <label><input type="checkbox" id="profile-is-default"> 设为默认 Profile</label>
    <label><input type="checkbox" id="tts-enable" checked> 启用 TTS</label>
    <label><input type="checkbox" id="tts-auto-play"> Web 自动播放</label>
</div>
<div class="grid-two">
    <select id="tts-provider">
        <option value="minimax">minimax</option>
        <option value="edge">edge</option>
    </select>
    <select id="tts-voice"></select>
</div>
<input type="text" id="tts-minimax-group-id" placeholder="MiniMax Group ID（使用 minimax TTS 时必填）">
<select id="tts-minimax-model"></select>

<button type="button" id="profile-advanced-toggle" class="ghost-button">更多</button>
<div id="profile-advanced-fields" class="hidden">
    <input type="text" id="profile-api-base" placeholder="API Base，例如 https://api.minimax.io">
    <input type="password" id="profile-api-key" placeholder="API Key">
    <input type="number" id="profile-max-steps" placeholder="最大步数 (默认 50)" min="1">
    <input type="number" id="tts-sentence-buffer-chars" placeholder="TTS 分句阈值 (默认 120)" min="1">
    <div class="checkbox-grid">
        <label><input type="checkbox" id="tool-enable-file" checked> 文件工具</label>
        <label><input type="checkbox" id="tool-enable-bash" checked> Bash</label>
        <label><input type="checkbox" id="tool-enable-note" checked> Session Note</label>
        <label><input type="checkbox" id="tool-enable-skills" checked> Skills</label>
        <label><input type="checkbox" id="tool-enable-mcp"> MCP</label>
    </div>
    <input type="text" id="profile-skills-dir" placeholder="Skills 目录，例如 ./skills">
    <textarea id="profile-mcp-config" placeholder='MCP JSON，例如 {"mcpServers": {...}}' rows="6"></textarea>
</div>
```

Add the supporting CSS in `backend/2ms/mini_agent/server/web/styles.css`:

```css
.profile-advanced-toggle-row {
    display: flex;
    justify-content: flex-end;
}

#profile-advanced-fields {
    display: grid;
    gap: 12px;
    margin-top: 12px;
}

#profile-advanced-fields.hidden {
    display: none;
}
```

- [ ] **Step 4: Run the markup test to verify it passes**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms && uv run pytest tests/test_web_runtime.py::test_web_page_profile_modal_uses_duplicate_friendly_markup -v
```

Expected:

```text
PASSED tests/test_web_runtime.py::test_web_page_profile_modal_uses_duplicate_friendly_markup
```

- [ ] **Step 5: Commit**

```bash
git add /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/index.html /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/styles.css /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/tests/test_web_runtime.py
git commit -m "feat(web): restructure profile modal fields"
```

### Task 3: Add Duplicate Mode And Shared Profile Serialization

**Files:**
- Modify: `backend/2ms/tests/test_web_runtime.py`
- Modify: `backend/2ms/mini_agent/server/web/app.js`

- [ ] **Step 1: Write the failing static-asset regression test**

Add this test to `backend/2ms/tests/test_web_runtime.py`:

```python
def test_web_app_script_contains_duplicate_profile_flow(web_client):
    client, _, _ = web_client

    response = client.get("/web")

    assert response.status_code == 200
    assert "showDuplicateProfileForm" in response.text
    assert "duplicateProfileName" in response.text
    assert "serializeProfileForm" in response.text
    assert "创建副本" in response.text
```

- [ ] **Step 2: Run the script regression test to verify it fails**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms && uv run pytest tests/test_web_runtime.py::test_web_app_script_contains_duplicate_profile_flow -v
```

Expected:

```text
FAILED tests/test_web_runtime.py::test_web_app_script_contains_duplicate_profile_flow
```

- [ ] **Step 3: Implement duplicate mode and shared payload building**

Update `backend/2ms/mini_agent/server/web/app.js` with the following core additions:

```javascript
let editingProfileId = null;
let duplicatingProfileId = null;

function duplicateProfileName(name) {
    return name ? `${name} Copy` : 'Profile Copy';
}

function showDuplicateProfileForm(profileId) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
        return;
    }

    editingProfileId = null;
    duplicatingProfileId = profileId;
    populateProfileForm(profile, { duplicate: true });
    document.getElementById('profile-modal-title').textContent = '复制 Profile';
    document.getElementById('profile-submit-button').textContent = '创建副本';
    document.getElementById('new-profile-modal').classList.remove('hidden');
}

function serializeProfileForm() {
    const mcpConfigText = document.getElementById('profile-mcp-config').value.trim();
    const maxSteps = document.getElementById('profile-max-steps').value.trim();
    const skillsDir = document.getElementById('profile-skills-dir').value.trim();
    const apiKey = document.getElementById('profile-api-key').value.trim();
    const apiBase = document.getElementById('profile-api-base').value.trim();

    const configJson = {
        llm: {},
        agent: {},
        tts: {
            enabled: document.getElementById('tts-enable').checked,
            provider: document.getElementById('tts-provider').value,
            voice: document.getElementById('tts-voice').value,
            minimax_group_id: document.getElementById('tts-minimax-group-id').value.trim(),
            minimax_model: document.getElementById('tts-minimax-model').value,
            auto_play: document.getElementById('tts-auto-play').checked,
        },
        tools: {
            enable_file_tools: document.getElementById('tool-enable-file').checked,
            enable_bash: document.getElementById('tool-enable-bash').checked,
            enable_note: document.getElementById('tool-enable-note').checked,
            enable_skills: document.getElementById('tool-enable-skills').checked,
            enable_mcp: document.getElementById('tool-enable-mcp').checked,
        },
    };

    if (apiKey) configJson.llm.api_key = apiKey;
    if (apiBase) configJson.llm.api_base = apiBase;
    if (maxSteps) configJson.agent.max_steps = Number(maxSteps);
    if (skillsDir) configJson.tools.skills_dir = skillsDir;

    return {
        name: document.getElementById('profile-name').value.trim(),
        system_prompt: document.getElementById('profile-system-prompt').value.trim() || null,
        config_json: configJson,
        mcp_config_json: mcpConfigText ? JSON.parse(mcpConfigText) : null,
        is_default: profiles.length === 0 || document.getElementById('profile-is-default').checked,
    };
}
```

Also update:

- `renderProfiles()` to render `复制` between `编辑` and `删除`
- `showNewProfileForm()` to clear `duplicatingProfileId`
- `showEditProfileForm()` to clear `duplicatingProfileId`
- `closeNewProfileForm()` to clear both modal mode ids
- `populateProfileForm(profile, { duplicate: true })` to apply `duplicateProfileName(profile.name)` and uncheck `profile-is-default`
- `submitProfileForm()` to use `serializeProfileForm()` and always send `POST /profiles` when `duplicatingProfileId` is set

- [ ] **Step 4: Run the script regression test to verify it passes**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms && uv run pytest tests/test_web_runtime.py::test_web_app_script_contains_duplicate_profile_flow -v
```

Expected:

```text
PASSED tests/test_web_runtime.py::test_web_app_script_contains_duplicate_profile_flow
```

- [ ] **Step 5: Commit**

```bash
git add /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/app.js /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/tests/test_web_runtime.py
git commit -m "feat(web): add profile duplication flow"
```

### Task 4: Convert TTS Voice And Model To Provider-Linked Selects

**Files:**
- Modify: `backend/2ms/tests/test_web_runtime.py`
- Modify: `backend/2ms/mini_agent/server/web/app.js`

- [ ] **Step 1: Write the failing regression test for TTS option tables**

Add this test to `backend/2ms/tests/test_web_runtime.py`:

```python
def test_web_app_script_defines_tts_select_options(web_client):
    client, _, _ = web_client

    response = client.get("/web")

    assert response.status_code == 200
    assert "const TTS_PROVIDER_OPTIONS" in response.text
    assert "female-shaonv" in response.text
    assert "speech-02-hd" in response.text
    assert "zh-CN-XiaoxiaoNeural" in response.text
    assert "populateTtsOptionsForProvider" in response.text
```

- [ ] **Step 2: Run the TTS regression test to verify it fails**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms && uv run pytest tests/test_web_runtime.py::test_web_app_script_defines_tts_select_options -v
```

Expected:

```text
FAILED tests/test_web_runtime.py::test_web_app_script_defines_tts_select_options
```

- [ ] **Step 3: Implement provider-linked TTS select options**

Add this option table and helper logic to `backend/2ms/mini_agent/server/web/app.js`:

```javascript
const TTS_PROVIDER_OPTIONS = {
    minimax: {
        voices: [
            { value: 'female-shaonv', label: 'female-shaonv' },
        ],
        models: [
            { value: 'speech-02-hd', label: 'speech-02-hd' },
        ],
    },
    edge: {
        voices: [
            { value: 'zh-CN-XiaoxiaoNeural', label: 'zh-CN-XiaoxiaoNeural' },
        ],
        models: [
            { value: '', label: 'Edge 不需要 model' },
        ],
    },
};

function setSelectOptions(selectNode, options, selectedValue) {
    selectNode.innerHTML = options
        .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
        .join('');
    selectNode.value = selectedValue && options.some((option) => option.value === selectedValue)
        ? selectedValue
        : options[0].value;
}

function populateTtsOptionsForProvider({ forceDefault = false } = {}) {
    const providerNode = document.getElementById('tts-provider');
    const voiceNode = document.getElementById('tts-voice');
    const modelNode = document.getElementById('tts-minimax-model');
    if (!providerNode || !voiceNode || !modelNode) {
        return;
    }

    const provider = providerNode.value;
    const providerOptions = TTS_PROVIDER_OPTIONS[provider] || TTS_PROVIDER_OPTIONS.minimax;
    const currentVoice = forceDefault ? '' : voiceNode.value;
    const currentModel = forceDefault ? '' : modelNode.value;

    setSelectOptions(voiceNode, providerOptions.voices, currentVoice);
    setSelectOptions(modelNode, providerOptions.models, currentModel);
    modelNode.disabled = provider !== 'minimax';
}
```

Then replace the old free-text TTS behavior:

- Remove `isLikelyEdgeVoice()` and `validateTtsVoice()` checks tied to manual typing
- Replace `updateTtsVoiceFieldForProvider()` calls with `populateTtsOptionsForProvider()`
- In `populateProfileForm()` and `resetProfileForm()`, call `populateTtsOptionsForProvider()` after setting the provider value
- In initialization wiring, change:

```javascript
ttsProviderNode.addEventListener('change', () => populateTtsOptionsForProvider({ forceDefault: true }));
```

- [ ] **Step 4: Run the TTS regression test to verify it passes**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms && uv run pytest tests/test_web_runtime.py::test_web_app_script_defines_tts_select_options -v
```

Expected:

```text
PASSED tests/test_web_runtime.py::test_web_app_script_defines_tts_select_options
```

- [ ] **Step 5: Commit**

```bash
git add /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/app.js /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/tests/test_web_runtime.py
git commit -m "feat(web): use provider-linked tts selects"
```

### Task 5: Run The Full Focused Regression Suite

**Files:**
- Modify: `backend/2ms/tests/test_web_runtime.py`
- Modify: `backend/2ms/mini_agent/server/runtime.py`
- Modify: `backend/2ms/mini_agent/server/routers/sessions.py`
- Modify: `backend/2ms/mini_agent/server/web/index.html`
- Modify: `backend/2ms/mini_agent/server/web/styles.css`
- Modify: `backend/2ms/mini_agent/server/web/app.js`

- [ ] **Step 1: Run the focused web regression suite**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms && uv run pytest tests/test_web_smoke.py tests/test_web_runtime.py -v
```

Expected:

```text
PASSED tests/test_web_smoke.py::test_web_http_routes_remain_registered
PASSED tests/test_web_smoke.py::test_websocket_route_remains_registered
PASSED tests/test_web_runtime.py::test_web_page_uses_versioned_static_assets
PASSED tests/test_web_runtime.py::test_web_page_profile_modal_uses_duplicate_friendly_markup
PASSED tests/test_web_runtime.py::test_web_app_script_contains_duplicate_profile_flow
PASSED tests/test_web_runtime.py::test_web_app_script_defines_tts_select_options
PASSED tests/test_web_runtime.py::test_create_session_generates_unique_workspace_per_session
```

- [ ] **Step 2: Manually verify the `/web` profile workflow**

Run:

```bash
cd /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms && uv run uvicorn mini_agent.server.main:app --reload
```

Then verify in a browser:

```text
1. Open http://127.0.0.1:8000/web
2. Create one profile and confirm there is no workspace_dir input
3. Expand 更多 and confirm max_steps / api_base / api_key / sentence_buffer_chars / skills_dir / MCP JSON are present
4. Confirm the profile row shows 编辑 / 复制 / 删除
5. Click 复制 and confirm the modal title is 复制 Profile and the name becomes "<original> Copy"
6. Confirm is_default is unchecked in duplicate mode
7. Change TTS provider between minimax and edge and confirm voice/model selects update
8. Create a session from the duplicated profile and confirm the workspace path is under ./workspace/sessions/<session_id>
```

- [ ] **Step 3: Commit the integrated feature**

```bash
git add /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/runtime.py /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/routers/sessions.py /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/index.html /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/styles.css /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/mini_agent/server/web/app.js /Users/qishu/.codex/worktrees/8f50/ark/backend/2ms/tests/test_web_runtime.py
git commit -m "feat(web): streamline profile creation workflow"
```

## Self-Review

### Spec coverage

- Profile duplication is implemented in Task 3
- `workspace_dir` removal and session-owned workspace generation are implemented in Task 1 and Task 2
- `更多` grouping is implemented in Task 2
- TTS select conversion is implemented in Task 4
- Regression coverage is implemented in Task 1, Task 2, Task 3, Task 4, and Task 5

### Placeholder scan

- No `TBD`, `TODO`, or deferred implementation markers remain
- Every task includes exact file targets, commands, and code snippets
- Each test step names the exact pytest target to run

### Type consistency

- `build_session_workspace_path()` is consistently referenced with the new `session_id`/`explicit_workspace_path` signature
- Duplicate mode uses `duplicatingProfileId`, `duplicateProfileName()`, and `serializeProfileForm()` consistently across the plan
- TTS select logic uses `TTS_PROVIDER_OPTIONS` and `populateTtsOptionsForProvider()` consistently across modal initialization and updates
