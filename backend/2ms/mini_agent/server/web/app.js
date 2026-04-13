const API_BASE = '/api';
const RESOLVED_PROMPT_SOURCE_KINDS = Object.freeze({
    RUN_SNAPSHOT: 'run_snapshot',
    PROFILE_RESOLVED: 'profile_resolved',
    PROFILE_RAW: 'profile_raw',
});

let currentUser = null;
let currentSession = null;
let currentSessionRuns = [];
let selectedProfileId = null;
let profiles = [];
let sessions = [];
let availableSkills = [];
let availableMcpServers = [];
let ws = null;
let runInProgress = false;
let currentSessionEvents = [];
let streamingAssistantMessage = null;
let streamingAnimationTimer = null;
let activeInfoPanel = 'none';
let editingProfileId = null;
let editingSessionId = null;
let editingMcpServerId = null;
let resolvedProfilePromptsById = {};
let resolvedPromptLoadingByProfileId = {};
let resolvedPromptErrorByProfileId = {};
let ttsState = {
    enabled: false,
    auto_play: false,
    provider: 'minimax',
    voice: '',
    audio_format: 'mp3',
    streaming_mode: 'buffered_chunk',
    provider_streaming_supported: false,
    status: 'idle',
    error: null,
};
let ttsPlaybackEnabled = false;
let ttsPreferenceLocked = false;
let ttsQueue = [];
let ttsItemsBySequence = new Map();
let currentTtsItem = null;
let currentTtsAudio = null;
let currentTtsAudioUrl = null;
let ttsDebug = {
    lastError: '',
    lastEventAt: '',
    lastChunkAt: '',
    lastChunkFormat: '',
    lastChunkBytes: 0,
    chunksReceived: 0,
    playAttempts: 0,
    successfulPlays: 0,
    stopCount: 0,
    detailedLogs: [],
};

const AUTO_SCROLL_THRESHOLD = 72;
const STREAMING_CHAR_INTERVAL_MS = 28;
const STREAMING_START_DELAY_MS = 120;
const STREAMING_IDLE_GRACE_MS = 90;
const TTS_DEBUG_LOG_LIMIT = 250;
const TTS_DEFAULT_VOICES = {
    minimax: 'female-shaonv',
    edge: 'zh-CN-XiaoxiaoNeural',
};
const DEFAULT_MINIMAX_MODEL = 'speech-02-hd';
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

function nowIsoString() {
    return new Date().toISOString();
}

function resetTtsDebugState() {
    ttsDebug = {
        lastError: '',
        lastEventAt: '',
        lastChunkAt: '',
        lastChunkFormat: '',
        lastChunkBytes: 0,
        chunksReceived: 0,
        playAttempts: 0,
        successfulPlays: 0,
        stopCount: 0,
        detailedLogs: [],
    };
}

function touchTtsDebugEvent() {
    ttsDebug.lastEventAt = nowIsoString();
}

function setTtsDebugError(error) {
    ttsDebug.lastError = error ? String(error) : '';
    touchTtsDebugEvent();
}

function clearTtsDebugError() {
    ttsDebug.lastError = '';
}

function summarizeTtsDebugValue(value, depth = 0) {
    if (value === null || value === undefined) {
        return value;
    }
    if (depth > 3) {
        return '[max_depth_reached]';
    }
    if (Array.isArray(value)) {
        return value.slice(0, 12).map((item) => summarizeTtsDebugValue(item, depth + 1));
    }
    if (typeof value === 'object') {
        const summary = {};
        Object.entries(value).forEach(([key, nestedValue]) => {
            if (key === 'audio_b64' && typeof nestedValue === 'string') {
                summary.audio_b64 = `[omitted base64, length=${nestedValue.length}]`;
                summary.audio_bytes = Math.floor((nestedValue.length * 3) / 4);
                return;
            }
            summary[key] = summarizeTtsDebugValue(nestedValue, depth + 1);
        });
        return summary;
    }
    return value;
}

function appendTtsDebugLog(eventType, payload = {}) {
    const entry = {
        at: nowIsoString(),
        event: eventType,
        payload: summarizeTtsDebugValue(payload),
    };
    ttsDebug.detailedLogs.push(entry);
    if (ttsDebug.detailedLogs.length > TTS_DEBUG_LOG_LIMIT) {
        ttsDebug.detailedLogs.shift();
    }
    ttsDebug.lastEventAt = entry.at;
}

function buildTtsDebugLogText() {
    const profile = currentSessionProfile();
    const headerLines = [
        '# Mini Agent TTS Debug Log',
        `generated_at: ${nowIsoString()}`,
        `session_id: ${currentSession?.id || 'unknown'}`,
        `session_name: ${currentSession?.name || 'unknown'}`,
        `profile_name: ${profile?.name || 'unknown'}`,
        `tts_provider: ${ttsState.provider || 'unknown'}`,
        `tts_voice: ${ttsState.voice || 'unknown'}`,
        `tts_status: ${ttsState.status || 'unknown'}`,
        `tts_streaming_mode: ${ttsState.streaming_mode || 'unknown'}`,
        `playback_enabled: ${ttsPlaybackEnabled}`,
        `queue_length: ${ttsQueue.length}`,
        `active_item: ${currentTtsItem ? currentTtsItem.sequenceNo : 'none'}`,
        '',
        '## Summary',
        JSON.stringify({
            lastError: ttsDebug.lastError,
            lastEventAt: ttsDebug.lastEventAt,
            lastChunkAt: ttsDebug.lastChunkAt,
            lastChunkFormat: ttsDebug.lastChunkFormat,
            lastChunkBytes: ttsDebug.lastChunkBytes,
            chunksReceived: ttsDebug.chunksReceived,
            playAttempts: ttsDebug.playAttempts,
            successfulPlays: ttsDebug.successfulPlays,
            stopCount: ttsDebug.stopCount,
            detailedLogEntries: ttsDebug.detailedLogs.length,
        }, null, 2),
        '',
        '## Events',
    ];

    const eventLines = ttsDebug.detailedLogs.map((entry, index) => (
        `[${index + 1}] ${entry.at} ${entry.event}\n${JSON.stringify(entry.payload, null, 2)}`
    ));

    return [...headerLines, ...eventLines].join('\n');
}

function downloadTtsDebugLog() {
    if (!currentSession) {
        alert('请先选择一个会话。');
        return;
    }
    if (ttsDebug.detailedLogs.length === 0) {
        alert('当前还没有可下载的 TTS 调试日志。');
        return;
    }

    const timestamp = nowIsoString().replace(/[:.]/g, '-');
    const sessionName = (currentSession.name || currentSession.id || 'session')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'session';
    const blob = new Blob([buildTtsDebugLogText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tts-debug-${sessionName}-${timestamp}.log`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    appendTtsDebugLog('debug_log_downloaded', { file_name: anchor.download });
    renderInfoPanel();
}

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

function renderLogExportModal() {
    const modal = document.getElementById('log-export-modal');
    const errorNode = document.getElementById('log-export-error');
    const labelNode = document.getElementById('log-export-session-label');
    const confirmButton = document.getElementById('log-export-confirm-button');
    const checkboxMap = logExportCheckboxMap();

    if (!modal || !errorNode || !labelNode || !confirmButton) {
        return;
    }

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

async function downloadSelectedSessionLogs() {
    if (!currentSession || logExportState.isDownloading || selectedLogExportCount() === 0) {
        return;
    }

    logExportState.isDownloading = true;
    logExportState.error = '';
    updateRunControls();
    renderLogExportModal();

    try {
        const { session, runs, messages } = await fetchExportSessionData(currentSession.id);
        const profile = profiles.find((item) => item.id === session.profile_id) || null;
        const zip = new JSZip();

        zip.file('summary.json', JSON.stringify(buildLogExportSummary(session, profile, runs, messages), null, 2));

        if (logExportState.selected.sessionSummary) {
            zip.file('session-profile-summary.json', JSON.stringify({ session, profile }, null, 2));
        }
        if (logExportState.selected.sessionEvents) {
            zip.file('session-events.jsonl', buildSessionEventsJsonl(messages));
        }
        if (logExportState.selected.runs) {
            zip.file('runs.json', JSON.stringify(runs, null, 2));
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
        updateRunControls();
        renderLogExportModal();
    }
}

function defaultTtsVoiceForProvider(provider) {
    return TTS_DEFAULT_VOICES[provider] || TTS_DEFAULT_VOICES.minimax;
}

function isLikelyEdgeVoice(voice) {
    return /Neural$/i.test(voice);
}

function updateTtsVoiceFieldForProvider({ forceDefault = false } = {}) {
    const providerNode = document.getElementById('tts-provider');
    const voiceNode = document.getElementById('tts-voice');
    const minimaxModelNode = document.getElementById('tts-minimax-model');
    if (!providerNode || !voiceNode) {
        return;
    }

    const provider = providerNode.value;
    const defaultVoice = defaultTtsVoiceForProvider(provider);
    const currentVoice = voiceNode.value.trim();
    const shouldReplace =
        forceDefault ||
        !currentVoice ||
        currentVoice === TTS_DEFAULT_VOICES.minimax ||
        currentVoice === TTS_DEFAULT_VOICES.edge;

    voiceNode.placeholder = provider === 'edge'
        ? 'Edge Voice，例如 zh-CN-XiaoxiaoNeural'
        : 'TTS Voice，例如 female-shaonv';
    if (minimaxModelNode) {
        minimaxModelNode.disabled = provider !== 'minimax';
        minimaxModelNode.placeholder = provider === 'minimax'
            ? 'MiniMax Model，例如 speech-02-hd'
            : 'MiniMax Model 仅在 minimax provider 下生效';
        if (!minimaxModelNode.value.trim()) {
            minimaxModelNode.value = DEFAULT_MINIMAX_MODEL;
        }
    }

    if (shouldReplace) {
        voiceNode.value = defaultVoice;
    }
}

function validateTtsVoice(provider, voice) {
    if (provider !== 'edge') {
        return null;
    }

    if (!isLikelyEdgeVoice(voice)) {
        return '当前选择的是 Edge TTS，请使用 Edge voice，例如 zh-CN-XiaoxiaoNeural。';
    }

    return null;
}

async function api(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        ...options.headers,
    };

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        logout();
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || 'Request failed');
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}

async function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch(`/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Login failed' }));
            throw new Error(error.detail || 'Login failed');
        }

        const data = await response.json();
        localStorage.setItem('token', data.access_token);
        await loadUser();
    } catch (error) {
        showError(error.message);
    }
}

async function register() {
    showError('当前版本不提供注册入口，请先在 Ark 主项目中创建账号。');
}

async function logout() {
    try {
        await fetch('/auth/logout', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
            },
        });
    } catch (error) {
        console.warn('Logout request failed:', error);
    }
    localStorage.removeItem('token');
    closeWebSocket();
    resetTtsDebugState();
    currentUser = null;
    currentSession = null;
    currentSessionRuns = [];
    selectedProfileId = null;
    activeInfoPanel = 'none';
    currentSessionEvents = [];
    profiles = [];
    sessions = [];
    availableSkills = [];
    runInProgress = false;
    resetLogExportState();
    resetStreamingAssistantMessage();
    renderInfoPanel();
    renderLogExportModal();
    showAuthSection();
}

async function loadUser() {
    try {
        const response = await fetch('/auth/me', {
            headers: {
                Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
            },
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Failed to load user' }));
            throw new Error(error.detail || 'Failed to load user');
        }
        currentUser = await response.json();
        document.getElementById('username').textContent = currentUser.username;
        showMainSection();
        await Promise.all([loadProfiles(), loadSessions(), loadSkills(), loadMcpServers()]);
    } catch (error) {
        console.error('Failed to load user:', error);
        logout();
    }
}

async function loadProfiles() {
    profiles = await api('/profiles');
    resolvedProfilePromptsById = {};
    resolvedPromptLoadingByProfileId = {};
    resolvedPromptErrorByProfileId = {};
    if (selectedProfileId && !profiles.some((profile) => profile.id === selectedProfileId)) {
        selectedProfileId = null;
    }
    if (!selectedProfileId && profiles.length > 0) {
        const defaultProfile = profiles.find((profile) => profile.is_default) || profiles[0];
        selectedProfileId = defaultProfile.id;
    }
    renderProfiles();
    renderInfoPanel();
}

async function loadSkills() {
    availableSkills = await api('/skills');
    renderSkillsList();
    const hasExistingSelection = document.querySelector('input[name="profile-allowed-skill"]') !== null;
    renderProfileSkillOptions(hasExistingSelection ? getSelectedAllowedSkillsFromForm() : null);
    renderInfoPanel();
}

async function loadMcpServers() {
    availableMcpServers = await api('/mcp-servers');
    renderMcpServersList();
    const hasExistingSelection = document.querySelector('input[name="profile-mcp-server"]') !== null;
    renderProfileMcpServerOptions(hasExistingSelection ? getSelectedMcpServerIdsFromForm() : null);
    renderInfoPanel();
}

async function loadSessions() {
    sessions = await api('/sessions');
    renderSessions();
    if (currentSession) {
        const refreshed = sessions.find((session) => session.id === currentSession.id);
        if (refreshed) {
            currentSession = refreshed;
            updateSessionHeader();
            renderInfoPanel();
            updateRunControls();
        } else {
            resetCurrentSessionSelection();
        }
    }
}

function renderProfiles() {
    const container = document.getElementById('profiles-list');
    if (profiles.length === 0) {
        container.innerHTML = '<div class="empty-state">还没有 Profile，先创建一个。</div>';
        return;
    }

    container.innerHTML = profiles.map((profile) => `
        <div class="item ${selectedProfileId === profile.id ? 'active' : ''}" onclick="selectProfile('${profile.id}')">
            <div class="item-row">
                <div class="item-title">${escapeHtml(profile.name)}</div>
                <div class="item-actions">
                    <button class="ghost-button tiny-button" onclick="event.stopPropagation(); showEditProfileForm('${profile.id}')">编辑</button>
                    <button class="ghost-button tiny-button danger-text" onclick="event.stopPropagation(); deleteProfile('${profile.id}')">删除</button>
                </div>
            </div>
            <div class="item-subtitle">${escapeHtml(profile.key || '未设置 key')} · ${profile.is_default ? '默认 Profile' : '点击后用于新建会话'}</div>
        </div>
    `).join('');
}

function renderSkillsList() {
    const container = document.getElementById('skills-list');
    if (!container) {
        return;
    }
    if (availableSkills.length === 0) {
        container.innerHTML = '<div class="empty-state">还没有可用的 skills，先上传一个 ZIP skill 包。</div>';
        return;
    }

    container.innerHTML = availableSkills.map((skill) => `
        <div class="item">
            <div class="item-row">
                <div class="item-title">${escapeHtml(skill.name)}</div>
                <div class="item-subtitle">${escapeHtml(skill.source)}</div>
            </div>
            <div class="item-subtitle">${escapeHtml(skill.description || '无描述')}</div>
        </div>
    `).join('');
}

function renderMcpServersList() {
    const container = document.getElementById('mcp-servers-list');
    if (!container) {
        return;
    }
    if (availableMcpServers.length === 0) {
        container.innerHTML = '<div class="empty-state">还没有 MCP Server。你可以导入 MCP JSON，或手动新增一个 server。</div>';
        return;
    }

    container.innerHTML = availableMcpServers.map((server) => {
        const config = server.config_json || {};
        const summary = config.command
            ? `${config.command}${Array.isArray(config.args) && config.args.length > 0 ? ` ${config.args.join(' ')}` : ''}`
            : (config.url || '未配置 command/url');
        return `
            <div class="item">
                <div class="item-row">
                    <div class="item-title">${escapeHtml(server.name)}</div>
                    <div class="item-actions">
                        <button class="ghost-button tiny-button" onclick="editMcpServer('${server.id}')">编辑</button>
                        <button class="ghost-button tiny-button danger-text" onclick="deleteMcpServerById('${server.id}')">删除</button>
                    </div>
                </div>
                <div class="item-subtitle">${escapeHtml(server.description || '无描述')}</div>
                <div class="item-subtitle">${escapeHtml(summary)}</div>
            </div>
        `;
    }).join('');
}

function allAvailableSkillNames() {
    return availableSkills.map((skill) => skill.name);
}

function allAvailableMcpServerIds() {
    return availableMcpServers.map((server) => server.id);
}

function resolveAllowedSkillsForProfile(profile) {
    const config = profile?.config_json || {};
    const tools = config.tools || {};
    if (!tools.enable_skills) {
        return [];
    }
    if (Array.isArray(tools.allowed_skills)) {
        if (availableSkills.length === 0) {
            return [...tools.allowed_skills];
        }
        const known = new Set(allAvailableSkillNames());
        return tools.allowed_skills.filter((name) => known.has(name));
    }
    return allAvailableSkillNames();
}

function getSelectedAllowedSkillsFromForm() {
    return Array.from(document.querySelectorAll('input[name="profile-allowed-skill"]:checked')).map((input) => input.value);
}

function resolveSelectedMcpServerIdsForProfile(profile) {
    if (Array.isArray(profile?.mcp_server_ids)) {
        return profile.mcp_server_ids.filter((serverId) => allAvailableMcpServerIds().includes(serverId));
    }
    return [];
}

function getSelectedMcpServerIdsFromForm() {
    return Array.from(document.querySelectorAll('input[name="profile-mcp-server"]:checked')).map((input) => input.value);
}

function updateProfileSkillSelectorButton() {
    const button = document.getElementById('profile-skill-selector-toggle');
    const skillsEnabled = document.getElementById('tool-enable-skills')?.checked ?? true;
    if (!button) {
        return;
    }

    if (!skillsEnabled) {
        button.textContent = 'Skills 已禁用';
        button.disabled = true;
        return;
    }

    button.disabled = false;
    const selectedCount = getSelectedAllowedSkillsFromForm().length;
    const totalCount = availableSkills.length;
    const isExpanded = !document.getElementById('profile-skill-selector-panel')?.classList.contains('hidden');
    const prefix = isExpanded ? '收起 Skills 选择' : '选择允许的 Skills';
    button.textContent = totalCount > 0
        ? `${prefix} (${selectedCount}/${totalCount})`
        : prefix;
}

function setProfileSkillSelectorExpanded(expanded) {
    const panel = document.getElementById('profile-skill-selector-panel');
    if (!panel) {
        return;
    }
    panel.classList.toggle('hidden', !expanded);
    updateProfileSkillSelectorButton();
}

function toggleProfileSkillSelector() {
    const panel = document.getElementById('profile-skill-selector-panel');
    const skillsEnabled = document.getElementById('tool-enable-skills')?.checked ?? true;
    if (!panel || !skillsEnabled) {
        return;
    }
    setProfileSkillSelectorExpanded(panel.classList.contains('hidden'));
}

function updateProfileMcpServerSelectorButton() {
    const button = document.getElementById('profile-mcp-server-selector-toggle');
    const mcpEnabled = document.getElementById('tool-enable-mcp')?.checked ?? false;
    if (!button) {
        return;
    }

    if (!mcpEnabled) {
        button.textContent = 'MCP 已禁用';
        button.disabled = true;
        return;
    }

    button.disabled = false;
    const selectedCount = getSelectedMcpServerIdsFromForm().length;
    const totalCount = availableMcpServers.length;
    const isExpanded = !document.getElementById('profile-mcp-server-selector-panel')?.classList.contains('hidden');
    const prefix = isExpanded ? '收起 MCP Server 选择' : '选择 MCP Servers';
    button.textContent = totalCount > 0 ? `${prefix} (${selectedCount}/${totalCount})` : prefix;
}

function setProfileMcpServerSelectorExpanded(expanded) {
    const panel = document.getElementById('profile-mcp-server-selector-panel');
    if (!panel) {
        return;
    }
    panel.classList.toggle('hidden', !expanded);
    updateProfileMcpServerSelectorButton();
}

function toggleProfileMcpServerSelector() {
    const panel = document.getElementById('profile-mcp-server-selector-panel');
    const mcpEnabled = document.getElementById('tool-enable-mcp')?.checked ?? false;
    if (!panel || !mcpEnabled) {
        return;
    }
    setProfileMcpServerSelectorExpanded(panel.classList.contains('hidden'));
}

function renderProfileMcpServerOptions(selectedIds = null) {
    const container = document.getElementById('profile-mcp-server-options');
    const mcpEnabled = document.getElementById('tool-enable-mcp')?.checked ?? false;
    if (!container) {
        return;
    }

    container.classList.toggle('is-disabled', !mcpEnabled);

    if (availableMcpServers.length === 0) {
        container.innerHTML = '<div class="empty-state">当前没有可选 MCP Server。先点击“管理 MCP Servers”导入或新增。</div>';
        updateProfileMcpServerSelectorButton();
        return;
    }

    const selected = Array.isArray(selectedIds)
        ? selectedIds
        : (editingProfileId
            ? resolveSelectedMcpServerIdsForProfile(profiles.find((item) => item.id === editingProfileId))
            : []);
    const selectedSet = new Set(selected);

    container.innerHTML = availableMcpServers.map((server) => {
        const config = server.config_json || {};
        const typeLabel = config.type || (config.url ? 'streamable_http' : 'stdio');
        return `
            <label class="skill-option">
                <input
                    type="checkbox"
                    name="profile-mcp-server"
                    value="${escapeHtml(server.id)}"
                    ${selectedSet.has(server.id) ? 'checked' : ''}
                    ${mcpEnabled ? '' : 'disabled'}
                >
                <span>
                    <span class="skill-option-title">
                        <strong>${escapeHtml(server.name)}</strong>
                        <span class="skill-option-source">${escapeHtml(typeLabel)}</span>
                    </span>
                    <span class="skill-option-description">${escapeHtml(server.description || '无描述')}</span>
                </span>
            </label>
        `;
    }).join('');
    updateProfileMcpServerSelectorButton();
}

function renderProfileSkillOptions(selectedNames = null) {
    const container = document.getElementById('profile-allowed-skills');
    const skillsEnabled = document.getElementById('tool-enable-skills')?.checked ?? true;
    if (!container) {
        return;
    }

    container.classList.toggle('is-disabled', !skillsEnabled);

    if (availableSkills.length === 0) {
        container.innerHTML = '<div class="empty-state">当前没有可选 skill。你可以先点击 Skills 按钮，在弹窗中上传 ZIP skill 包。</div>';
        updateProfileSkillSelectorButton();
        return;
    }

    const selected = Array.isArray(selectedNames)
        ? selectedNames
        : (editingProfileId
            ? resolveAllowedSkillsForProfile(profiles.find((item) => item.id === editingProfileId))
            : allAvailableSkillNames());
    const selectedSet = new Set(selected);

    container.innerHTML = availableSkills.map((skill) => `
        <label class="skill-option">
            <input
                type="checkbox"
                name="profile-allowed-skill"
                value="${escapeHtml(skill.name)}"
                ${selectedSet.has(skill.name) ? 'checked' : ''}
                ${skillsEnabled ? '' : 'disabled'}
            >
            <span>
                <span class="skill-option-title">
                    <strong>${escapeHtml(skill.name)}</strong>
                    <span class="skill-option-source">${escapeHtml(skill.source)}</span>
                </span>
                <span class="skill-option-description">${escapeHtml(skill.description || '无描述')}</span>
            </span>
        </label>
    `).join('');
    updateProfileSkillSelectorButton();
}

async function uploadSkill() {
    const input = document.getElementById('skill-upload-input');
    if (!input?.files?.length) {
        alert('请先选择一个 ZIP skill 包。');
        return;
    }

    const formData = new FormData();
    formData.append('file', input.files[0]);

    try {
        await api('/skills/upload', {
            method: 'POST',
            body: formData,
        });
        input.value = '';
        await loadSkills();
    } catch (error) {
        alert(error.message || '上传 Skill 失败');
    }
}

function renderSessions() {
    const container = document.getElementById('sessions-list');
    if (sessions.length === 0) {
        container.innerHTML = '<div class="empty-state">还没有会话。</div>';
        return;
    }

    container.innerHTML = sessions.map((session) => `
        <div class="item ${currentSession?.id === session.id ? 'active' : ''}" onclick="selectSession('${session.id}')">
            <div class="item-row">
                <div class="item-title">${escapeHtml(session.name || `会话 ${session.id.slice(0, 8)}`)}</div>
                <div class="item-actions">
                    <button class="ghost-button tiny-button" onclick="event.stopPropagation(); showEditSessionForm('${session.id}')">编辑</button>
                    <button class="ghost-button tiny-button danger-text" onclick="event.stopPropagation(); deleteSessionById('${session.id}')">删除</button>
                </div>
            </div>
            <div class="item-subtitle">${escapeHtml(session.status)} · ${escapeHtml(session.workspace_path || '未设置工作目录')}</div>
        </div>
    `).join('');
}

function resetCurrentSessionSelection() {
    closeWebSocket();
    currentSession = null;
    currentSessionRuns = [];
    currentSessionEvents = [];
    activeInfoPanel = selectedProfileId ? 'profile' : 'none';
    closeLogExportModal();
    resetStreamingAssistantMessage();
    updateSessionHeader();
    renderInfoPanel();
    renderMessageViews({ forceScroll: true });
    updateRunControls();
}

function selectProfile(profileId) {
    selectedProfileId = profileId;
    activeInfoPanel = 'profile';
    renderProfiles();
    renderInfoPanel();
}

async function createSession() {
    const profileId = selectedProfileId || profiles.find((profile) => profile.is_default)?.id || profiles[0]?.id;
    if (!profileId) {
        alert('请先创建一个 Profile。');
        return;
    }

    try {
        const session = await api('/sessions', {
            method: 'POST',
            body: JSON.stringify({ profile_id: profileId }),
        });
        await loadSessions();
        await selectSession(session.id);
    } catch (error) {
        alert(error.message);
    }
}

async function selectSession(sessionId) {
    closeWebSocket();
    resetTtsDebugState();
    ttsPreferenceLocked = false;
    currentSession = sessions.find((session) => session.id === sessionId) || await api(`/sessions/${sessionId}`);
    activeInfoPanel = 'session';
    updateSessionHeader();
    renderInfoPanel();
    await loadSessionRuns();
    await loadMessages();
    connectWebSocket();
    updateRunControls();
}

async function loadSessionRuns() {
    if (!currentSession) {
        currentSessionRuns = [];
        return;
    }
    currentSessionRuns = await api(`/sessions/${currentSession.id}/runs`);
    renderInfoPanel();
}

async function loadMessages() {
    if (!currentSession) {
        return;
    }

    currentSessionEvents = await api(`/sessions/${currentSession.id}/messages`);
    resetStreamingAssistantMessage();
    renderInfoPanel();
    renderMessageViews({ forceScroll: true });
}

function connectWebSocket() {
    if (!currentSession) {
        return;
    }

    closeWebSocket();
    const wsUrl = buildSessionWebSocketUrl();
    ws = new WebSocket(wsUrl);
    renderInfoPanel();

    ws.onopen = () => {
        renderInfoPanel();
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleSocketMessage(data);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        renderInfoPanel();
    };

    ws.onclose = () => {
        ws = null;
        renderInfoPanel();
    };
}

function closeWebSocket() {
    if (ws) {
        ws.close();
        ws = null;
    }
    stopTtsPlayback('socket_closed');
    renderInfoPanel();
}

function handleSocketMessage(data) {
    if (!currentSession || data.session_id !== currentSession.id) {
        return;
    }

    if (data.type === 'error') {
        alert(data.error);
        return;
    }

    if (data.type === 'pong' || data.type === 'connected') {
        if (data.status) {
            currentSession.status = data.status;
            syncSessionStatus(data.status);
        }
        updateRunControls();
        return;
    }

    if (data.type === 'tts_state') {
        handleTtsStatePacket(data.tts || {});
        return;
    }

    if (data.type === 'tts_chunk') {
        enqueueTtsBufferedChunk(data.tts || {});
        return;
    }

    if (data.type === 'tts_chunk_start') {
        handleTtsChunkStart(data.tts || {});
        return;
    }

    if (data.type === 'tts_chunk_data') {
        handleTtsChunkData(data.tts || {});
        return;
    }

    if (data.type === 'tts_chunk_end') {
        handleTtsChunkEnd(data.tts || {});
        return;
    }

    if (data.type === 'tts_stop') {
        stopTtsPlayback((data.tts || {}).reason || 'server_stop');
        return;
    }

    if (data.event) {
        appendEvent(data.event);
    }

    if (['run_started', 'run_completed', 'run_failed', 'run_cancelled'].includes(data.type)) {
        if (data.type === 'run_started') {
            ensureStreamingAssistantMessage();
            renderMessageViews();
        }
        if (['run_completed', 'run_failed', 'run_cancelled'].includes(data.type)) {
            if (!streamingAssistantMessage?.pendingAssistantEventId) {
                resetStreamingAssistantMessage();
                renderMessageViews();
            }
        }
        const statusMap = {
            run_started: 'running',
            run_completed: 'completed',
            run_failed: 'failed',
            run_cancelled: 'cancelled',
        };
        syncSessionStatus(statusMap[data.type]);
    }
}

function syncSessionStatus(status) {
    if (!currentSession) {
        return;
    }

    currentSession.status = status;
    const session = sessions.find((item) => item.id === currentSession.id);
    if (session) {
        session.status = status;
    }
    renderSessions();
    updateSessionHeader();
    updateRunControls();
}

function appendEvent(event) {
    currentSessionEvents = [...currentSessionEvents, event];
    syncStreamingAssistantMessage(event);
    renderInfoPanel();
    renderMessageViews();
}

function resetStreamingAssistantMessage() {
    if (streamingAnimationTimer) {
        clearTimeout(streamingAnimationTimer);
        streamingAnimationTimer = null;
    }
    streamingAssistantMessage = null;
}

function ensureStreamingAssistantMessage() {
    if (!streamingAssistantMessage) {
        streamingAssistantMessage = {
            content: '',
            displayedContent: '',
            thinking: '',
            status: 'thinking',
            pendingAssistantEventId: null,
        };
    }
    return streamingAssistantMessage;
}

function queueStreamingAnimation(delay = STREAMING_CHAR_INTERVAL_MS) {
    if (streamingAnimationTimer || !streamingAssistantMessage) {
        return;
    }

    streamingAnimationTimer = window.setTimeout(() => {
        streamingAnimationTimer = null;
        stepStreamingAnimation();
    }, delay);
}

function nextStreamingDelay(pendingCharsCount) {
    if (pendingCharsCount >= 20) {
        return 12;
    }

    if (pendingCharsCount >= 10) {
        return 20;
    }

    if (pendingCharsCount >= 4) {
        return 30;
    }

    return 42;
}

function stepStreamingAnimation() {
    if (!streamingAssistantMessage) {
        return;
    }

    const targetChars = Array.from(streamingAssistantMessage.content || '');
    const displayedChars = Array.from(streamingAssistantMessage.displayedContent || '');
    const pendingCharsCount = targetChars.length - displayedChars.length;

    if (
        pendingCharsCount > 0 &&
        displayedChars.length === 0 &&
        !streamingAssistantMessage.pendingAssistantEventId &&
        targetChars.length < 4
    ) {
        queueStreamingAnimation(STREAMING_START_DELAY_MS);
        return;
    }

    if (pendingCharsCount > 0) {
        streamingAssistantMessage.displayedContent = targetChars
            .slice(0, displayedChars.length + 1)
            .join('');
        renderMessageViews();
        queueStreamingAnimation(nextStreamingDelay(pendingCharsCount));
        return;
    }

    if (streamingAssistantMessage.pendingAssistantEventId) {
        resetStreamingAssistantMessage();
        renderMessageViews();
        return;
    }

    queueStreamingAnimation(STREAMING_IDLE_GRACE_MS);
}

function shouldHidePersistedAssistantEvent(event) {
    if (!streamingAssistantMessage?.pendingAssistantEventId) {
        return false;
    }

    return event.event_type === 'assistant_message' && event.id === streamingAssistantMessage.pendingAssistantEventId;
}

function syncStreamingAssistantMessage(event) {
    const eventType = event.event_type || event.role;

    if (eventType === 'thinking_delta') {
        const current = ensureStreamingAssistantMessage();
        current.thinking += event.content || event.metadata_json?.delta || '';
        current.status = 'thinking';
        return;
    }

    if (eventType === 'content_delta') {
        const current = ensureStreamingAssistantMessage();
        current.content += event.content || event.metadata_json?.delta || '';
        current.status = 'responding';
        queueStreamingAnimation(
            current.displayedContent ? STREAMING_CHAR_INTERVAL_MS : STREAMING_START_DELAY_MS
        );
        return;
    }

    if (eventType === 'assistant_message') {
        if (!streamingAssistantMessage) {
            return;
        }

        const current = ensureStreamingAssistantMessage();
        current.content = event.content || current.content;
        current.status = 'responding';
        current.pendingAssistantEventId = event.id || null;
        queueStreamingAnimation();
    }
}

function renderMessageViews({ forceScroll = false } = {}) {
    const filteredEvents = currentSessionEvents
        .filter((event) => isFilteredChatEvent(event))
        .filter((event) => !shouldHidePersistedAssistantEvent(event));
    const filteredHtml = [
        ...filteredEvents.map((event) => renderFilteredMessageCard(event)),
        renderStreamingMessageCard(),
    ].filter(Boolean).join('');

    renderPane(
        document.getElementById('raw-chat-messages'),
        currentSessionEvents.map((event) => renderRawEventCard(event)).join(''),
        {
            forceScroll,
            emptyTitle: '还没有原始事件',
            emptyDescription: '选择会话后，这里会完整显示消息、工具、状态和元数据。',
        },
    );
    renderPane(
        document.getElementById('filtered-chat-messages'),
        filteredHtml,
        {
            forceScroll,
            emptyTitle: '还没有聊天记录',
            emptyDescription: '用户消息和 Agent 回复会显示在这里。',
        },
    );
}

function renderPane(container, html, { forceScroll = false, emptyTitle, emptyDescription } = {}) {
    if (!container) {
        return;
    }

    const shouldStick = forceScroll || shouldAutoScroll(container);
    const bottomOffset = container.scrollHeight - container.scrollTop;
    container.innerHTML = html || renderEmptyPaneState(emptyTitle, emptyDescription);
    requestAnimationFrame(() => {
        if (shouldStick) {
            scrollContainerToBottom(container);
            return;
        }
        container.scrollTop = Math.max(0, container.scrollHeight - bottomOffset);
    });
}

function shouldAutoScroll(container) {
    return getDistanceFromBottom(container) <= AUTO_SCROLL_THRESHOLD;
}

function getDistanceFromBottom(container) {
    return Math.max(0, container.scrollHeight - container.clientHeight - container.scrollTop);
}

function scrollContainerToBottom(container) {
    container.scrollTop = container.scrollHeight;
}

function renderEmptyPaneState(title, description) {
    return `
        <div class="pane-empty-state">
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(description)}</p>
        </div>
    `;
}

function isFilteredChatEvent(event) {
    return ['user', 'assistant_message'].includes(event.event_type || event.role);
}

function renderFilteredMessageCard(event) {
    const label = (event.event_type || event.role) === 'user' ? 'You' : 'Agent';
    const messageClass = (event.event_type || event.role) === 'user' ? 'user' : 'assistant_message';
    return `
        <div class="message ${messageClass}">
            <strong>${escapeHtml(label)}</strong>
            <p>${escapeHtml(event.content || '')}</p>
        </div>
    `;
}

function renderStreamingMessageCard() {
    if (!streamingAssistantMessage) {
        return '';
    }

    const visibleContent = streamingAssistantMessage.displayedContent || '';
    const hasContent = Boolean(visibleContent);
    const hasThinking = Boolean(streamingAssistantMessage.thinking);
    const body = hasContent
        ? `<p>${escapeHtml(visibleContent)}<span class="streaming-cursor"></span></p>`
        : `<p class="streaming-placeholder">${escapeHtml(
            hasThinking ? streamingAssistantMessage.thinking : 'Agent 正在思考...'
        )}<span class="streaming-cursor"></span></p>`;

    const meta = hasThinking && hasContent
        ? `<div class="streaming-meta">Thinking: ${escapeHtml(streamingAssistantMessage.thinking)}</div>`
        : '';

    return `
        <div class="message assistant_message streaming">
            <strong>Agent</strong>
            ${body}
            ${meta}
        </div>
    `;
}

function renderRawEventCard(event) {
    const eventType = event.event_type || event.role || 'system';
    const metadata = event.metadata_json && Object.keys(event.metadata_json).length > 0
        ? event.metadata_json
        : null;

    return `
        <article class="raw-event-card ${escapeHtml(toClassName(eventType))}">
            <div class="raw-event-header">
                <span class="raw-event-chip raw-event-chip-type">${escapeHtml(eventType)}</span>
                ${event.role ? `<span class="raw-event-chip">${escapeHtml(event.role)}</span>` : ''}
                ${event.sequence_no !== undefined && event.sequence_no !== null ? `<span class="raw-event-chip">#${escapeHtml(String(event.sequence_no))}</span>` : ''}
            </div>
            <div class="raw-event-meta">
                ${event.created_at ? renderRawMetaItem('time', formatTimestamp(event.created_at)) : ''}
                ${event.name ? renderRawMetaItem('name', event.name) : ''}
                ${event.tool_call_id ? renderRawMetaItem('tool_call_id', event.tool_call_id) : ''}
            </div>
            ${event.content ? renderRawBlock('content', event.content) : ''}
            ${metadata ? renderRawBlock('metadata_json', prettyJson(metadata), true) : ''}
        </article>
    `;
}

function renderRawMetaItem(label, value) {
    return `
        <div class="raw-meta-item">
            <span class="raw-meta-label">${escapeHtml(label)}</span>
            <span class="raw-meta-value">${escapeHtml(value)}</span>
        </div>
    `;
}

function renderRawBlock(label, value, isJson = false) {
    return `
        <section class="raw-event-block">
            <div class="raw-block-label">${escapeHtml(label)}</div>
            <pre class="raw-block-content ${isJson ? 'raw-block-json' : ''}">${escapeHtml(value)}</pre>
        </section>
    `;
}

function formatTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString('zh-CN', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function toClassName(value) {
    return String(value || 'system')
        .toLowerCase()
        .replaceAll(/[^a-z0-9_-]+/g, '-');
}

function updateSessionHeader() {
    const title = document.getElementById('chat-title');
    const subtitle = document.getElementById('chat-subtitle');
    const badge = document.getElementById('session-status-badge');

    if (!currentSession) {
        title.textContent = '选择一个会话开始';
        subtitle.textContent = '先选择 Profile，再创建会话。';
        badge.textContent = 'idle';
        return;
    }

    title.textContent = currentSession.name || `会话 ${currentSession.id.slice(0, 8)}`;
    subtitle.textContent = `工作目录：${currentSession.workspace_path || '未设置'} | Profile：${profileNameForSession(currentSession)}`;
    badge.textContent = currentSession.status || 'idle';
}

function currentSessionProfile() {
    if (!currentSession) {
        return null;
    }
    return profiles.find((item) => item.id === currentSession.profile_id) || null;
}

function profileNameForSession(session) {
    if (!session) {
        return '未选择';
    }
    const profile = profiles.find((item) => item.id === session.profile_id);
    return profile ? profile.name : session.profile_id || '未选择';
}

function selectedProfileName() {
    const profile = profiles.find((item) => item.id === selectedProfileId) || currentSessionProfile();
    return profile ? profile.name : '未选择';
}

function selectedProfile() {
    if (!selectedProfileId) {
        return null;
    }
    return profiles.find((item) => item.id === selectedProfileId) || null;
}

function buildSessionWebSocketUrlForSession(session, redactToken = false) {
    if (!session) {
        return '';
    }

    const token = localStorage.getItem('token');
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const baseUrl = `${protocol}://${window.location.host}/api/sessions/ws/${session.id}`;
    if (!token) {
        return baseUrl;
    }

    return redactToken ? `${baseUrl}?token=***` : `${baseUrl}?token=${encodeURIComponent(token)}`;
}

function buildSessionWebSocketUrl(redactToken = false) {
    return buildSessionWebSocketUrlForSession(currentSession, redactToken);
}

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

function sessionSocketStateLabel() {
    if (!ws) {
        return 'disconnected';
    }

    const stateMap = {
        [WebSocket.CONNECTING]: 'connecting',
        [WebSocket.OPEN]: 'open',
        [WebSocket.CLOSING]: 'closing',
        [WebSocket.CLOSED]: 'closed',
    };
    return stateMap[ws.readyState] || 'unknown';
}

function formatNullableTimestamp(value) {
    return value ? formatTimestamp(value) : '暂无';
}

function buildCurrentStreamingDebugState() {
    if (!streamingAssistantMessage) {
        return null;
    }

    return {
        status: streamingAssistantMessage.status || 'idle',
        content_length: (streamingAssistantMessage.content || '').length,
        displayed_content_length: (streamingAssistantMessage.displayedContent || '').length,
        thinking_length: (streamingAssistantMessage.thinking || '').length,
        pending_assistant_event_id: streamingAssistantMessage.pendingAssistantEventId || null,
    };
}

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
            filtered_chat_events: messages.filter((message) => isFilteredChatEvent(message)).length,
            tts_debug_entries: ttsDebug.detailedLogs.length,
        },
        latest_run_id: runs.length > 0 ? runs[runs.length - 1].id : null,
        web_version_context: {
            path: window.location.pathname,
            user_agent: navigator.userAgent,
        },
    };
}

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
            url: buildSessionWebSocketUrlForSession(session, true),
            state: sessionSocketStateLabel(),
        },
        ui_state: {
            run_in_progress: runInProgress,
            raw_event_count: currentSessionEvents.length,
            filtered_event_count: currentSessionEvents.filter((event) => isFilteredChatEvent(event)).length,
            persisted_event_count: messages.length,
            streaming: buildCurrentStreamingDebugState(),
        },
        selection_context: {
            session_id: session.id,
            profile_id: session.profile_id,
            latest_run_id: runs.length > 0 ? runs[runs.length - 1].id : null,
            selected_profile_id: selectedProfileId,
        },
        recent_errors: {
            tts_last_error: ttsDebug.lastError || null,
            export_error: logExportState.error || null,
        },
        export_context: {
            exported_at: nowIsoString(),
            selected_logs: { ...logExportState.selected },
            current_page: window.location.href,
        },
        tts_state: {
            ...ttsState,
            playback_enabled: ttsPlaybackEnabled,
            queue_length: ttsQueue.length,
            buffered_items: ttsItemsBySequence.size,
        },
    };
}

async function ensureResolvedProfilePrompt(profileId) {
    if (!profileId) {
        return null;
    }
    if (resolvedProfilePromptsById[profileId]) {
        return resolvedProfilePromptsById[profileId];
    }
    if (resolvedPromptLoadingByProfileId[profileId]) {
        return null;
    }

    resolvedPromptLoadingByProfileId[profileId] = true;
    delete resolvedPromptErrorByProfileId[profileId];

    try {
        const resolvedPrompt = await api(`/profiles/${profileId}/resolved-prompt`);
        resolvedProfilePromptsById[profileId] = resolvedPrompt;
        return resolvedPrompt;
    } catch (error) {
        resolvedPromptErrorByProfileId[profileId] = error.message || 'Resolved prompt request failed';
        return null;
    } finally {
        resolvedPromptLoadingByProfileId[profileId] = false;
        if (currentSession?.profile_id === profileId || selectedProfileId === profileId) {
            renderInfoPanel();
        }
    }
}

function promptSourceBadgeLabel(sourceKind) {
    if (sourceKind === RESOLVED_PROMPT_SOURCE_KINDS.RUN_SNAPSHOT) {
        return 'Run Snapshot';
    }
    if (sourceKind === RESOLVED_PROMPT_SOURCE_KINDS.PROFILE_RESOLVED) {
        return 'Profile Resolved';
    }
    if (sourceKind === RESOLVED_PROMPT_SOURCE_KINDS.PROFILE_RAW) {
        return 'Profile Raw';
    }
    return 'Prompt';
}

function renderSessionOverviewItem(label, value, { monospace = false } = {}) {
    const content = monospace ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value);
    return `
        <article class="session-overview-item">
            <div class="session-overview-label">${escapeHtml(label)}</div>
            <p class="session-overview-value">${content}</p>
        </article>
    `;
}

function renderInfoPanelBlock(label, value, { json = false } = {}) {
    return `
        <section class="raw-event-block">
            <div class="raw-block-label">${escapeHtml(label)}</div>
            <pre class="raw-block-content ${json ? 'raw-block-json' : ''}">${escapeHtml(value || '')}</pre>
        </section>
    `;
}

function setInfoPanelTitle(title) {
    const node = document.getElementById('info-panel-title');
    if (node) {
        node.textContent = title;
    }
}

function renderInfoPanelEmptyState(title, description) {
    const container = document.getElementById('session-overview');
    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="pane-empty-state session-overview-empty">
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(description)}</p>
        </div>
    `;
}

function renderSessionOverview() {
    if (!currentSession) {
        setInfoPanelTitle('信息面板');
        renderInfoPanelEmptyState('还没有会话详情', '点击左侧会话后，这里会显示它关联的 Profile、会话工作目录、WebSocket 地址和最近活动。');
        return;
    }

    setInfoPanelTitle('会话信息');
    const container = document.getElementById('session-overview');
    const profile = currentSessionProfile();
    const latestRun = currentSessionRuns[currentSessionRuns.length - 1] || null;
    const latestRunPrompt = latestRun?.snapshot_json?.system_prompt || '';
    const resolvedProfilePrompt = profile?.id ? resolvedProfilePromptsById[profile.id] || null : null;
    const profilePrompt = profile?.system_prompt || '';
    if (!latestRunPrompt && profile?.id && !resolvedProfilePrompt && !resolvedPromptLoadingByProfileId[profile.id]) {
        void ensureResolvedProfilePrompt(profile.id);
    }
    const promptSourceKind = latestRunPrompt
        ? RESOLVED_PROMPT_SOURCE_KINDS.RUN_SNAPSHOT
        : (resolvedProfilePrompt?.source_kind || (profilePrompt ? RESOLVED_PROMPT_SOURCE_KINDS.PROFILE_RAW : ''));
    const displayedPrompt = latestRunPrompt || resolvedProfilePrompt?.prompt || profilePrompt;
    const promptSource = latestRunPrompt
        ? '最近一次 Run 的已解析 System Prompt'
        : (resolvedProfilePrompt?.source_label || (profilePrompt ? '当前 Profile 的原始 System Prompt' : '暂无可用 Prompt'));
    const filteredEventsCount = currentSessionEvents.filter((event) => isFilteredChatEvent(event)).length;
    const latestEvent = currentSessionEvents[currentSessionEvents.length - 1];
    const details = [
        ['会话名称', currentSession.name || `会话 ${currentSession.id.slice(0, 8)}`, false],
        ['会话 ID', currentSession.id, true],
        ['Profile', profile?.name || '未找到', false],
        ['Profile ID', currentSession.profile_id || '未设置', true],
        ['工作目录', currentSession.workspace_path || '未设置', true],
        ['状态', currentSession.status || 'idle', false],
        ['TTS Provider', ttsState.provider || '未设置', false],
        ['TTS Voice', ttsState.voice || '未设置', false],
        ['TTS 播放', ttsPlaybackEnabled ? '已启用' : '已关闭', false],
        ['TTS 模式', ttsState.streaming_mode || 'buffered_chunk', false],
        ['WebSocket 状态', sessionSocketStateLabel(), false],
        ['WebSocket 地址', buildSessionWebSocketUrl(true), true],
        ['Session API', `${window.location.origin}${API_BASE}/sessions/${currentSession.id}`, true],
        ['事件数', String(currentSessionEvents.length), false],
        ['聊天消息数', String(filteredEventsCount), false],
        ['创建时间', formatNullableTimestamp(currentSession.created_at), false],
        ['更新时间', formatNullableTimestamp(currentSession.updated_at), false],
        ['最近事件', latestEvent ? `${latestEvent.event_type || latestEvent.role} · ${formatNullableTimestamp(latestEvent.created_at)}` : '暂无', false],
        ['最近 Run ID', latestRun?.id || '暂无', true],
        ['Prompt 来源', promptSource, false],
        ['Prompt 长度', String(displayedPrompt.length), false],
    ];
    const ttsDebugDetails = [
        ['最近 TTS 事件', ttsDebug.lastEventAt ? formatNullableTimestamp(ttsDebug.lastEventAt) : '暂无', false],
        ['最近 TTS 错误', ttsDebug.lastError || '无', false],
        ['最近音频块', ttsDebug.lastChunkAt ? formatNullableTimestamp(ttsDebug.lastChunkAt) : '暂无', false],
        ['音频格式 / 大小', ttsDebug.lastChunkFormat ? `${ttsDebug.lastChunkFormat} / ${ttsDebug.lastChunkBytes} bytes` : '暂无', false],
        ['累计分片数', String(ttsDebug.chunksReceived), false],
        ['播放尝试数', String(ttsDebug.playAttempts), false],
        ['成功播放数', String(ttsDebug.successfulPlays), false],
        ['停止次数', String(ttsDebug.stopCount), false],
        ['播放队列长度', String(ttsQueue.length), false],
        ['当前播放中', currentTtsAudio ? '是' : '否', false],
        ['自动播放配置', ttsState.auto_play ? '是' : '否', false],
        ['Provider 流式支持', ttsState.provider_streaming_supported ? '是' : '否', false],
        ['详细日志条数', String(ttsDebug.detailedLogs.length), false],
    ];

    container.innerHTML = `
        <div class="session-overview-grid">
            ${details.map(([label, value, monospace]) => renderSessionOverviewItem(label, value, { monospace })).join('')}
        </div>
        <section class="tts-debug-panel">
            <div class="tts-debug-header">
                <h4>Prompts</h4>
                <span class="tts-debug-pill">${escapeHtml(promptSourceBadgeLabel(promptSourceKind))}</span>
            </div>
            ${renderInfoPanelBlock(promptSource, displayedPrompt || '暂无可展示的 Prompt。')}
        </section>
        <section class="tts-debug-panel">
            <div class="tts-debug-header">
                <h4>TTS 调试</h4>
                <div class="tts-debug-actions">
                    <button
                        class="secondary-button small-button"
                        onclick="downloadTtsDebugLog()"
                        ${ttsDebug.detailedLogs.length === 0 ? 'disabled' : ''}
                    >
                        下载详细日志
                    </button>
                    <span class="tts-debug-pill ${ttsDebug.lastError ? 'is-error' : 'is-ok'}">${ttsDebug.lastError ? '有错误' : '正常'}</span>
                </div>
            </div>
            <div class="session-overview-grid">
                ${ttsDebugDetails.map(([label, value, monospace]) => renderSessionOverviewItem(label, value, { monospace })).join('')}
            </div>
        </section>
    `;
}

function renderProfileOverview() {
    const profile = selectedProfile();
    if (!profile) {
        setInfoPanelTitle('信息面板');
        renderInfoPanelEmptyState('还没有 Profile 详情', '点击左侧 Profile 后，这里会显示模型、工作目录、工具开关和 Prompt 等基础信息。');
        return;
    }

    setInfoPanelTitle('Profile 信息');
    const container = document.getElementById('session-overview');
    const config = profile.config_json || {};
    const llm = config.llm || {};
    const agent = config.agent || {};
    const tts = config.tts || {};
    const tools = config.tools || {};
    const allowedSkills = resolveAllowedSkillsForProfile(profile);
    const enabledTools = [
        tools.enable_file_tools ? 'file' : null,
        tools.enable_bash ? 'bash' : null,
        tools.enable_note ? 'note' : null,
        tools.enable_skills ? 'skills' : null,
        tools.enable_mcp ? 'mcp' : null,
    ].filter(Boolean);
    const selectedMcpServerIds = resolveSelectedMcpServerIdsForProfile(profile);
    const selectedMcpServerNames = selectedMcpServerIds
        .map((serverId) => availableMcpServers.find((server) => server.id === serverId)?.name)
        .filter(Boolean);
    const mcpServerCount = selectedMcpServerIds.length;
    const sessionCount = sessions.filter((session) => session.profile_id === profile.id).length;
    const details = [
        ['Profile 名称', profile.name || '未命名', false],
        ['Profile Key', profile.key || '未设置', true],
        ['Profile ID', profile.id || '未设置', true],
        ['默认 Profile', profile.is_default ? '是' : '否', false],
        ['Provider', llm.provider || '未设置', false],
        ['模型', llm.model || '未设置', false],
        ['API Base', llm.api_base || '未设置', true],
        ['工作目录', agent.workspace_dir || '未设置', true],
        ['最大步数', agent.max_steps ? String(agent.max_steps) : '未设置', false],
        ['已启用工具', enabledTools.length > 0 ? enabledTools.join(', ') : '无', false],
        ['TTS Provider', tts.provider || '未设置', false],
        ['TTS Voice', tts.voice || '未设置', false],
        ['MiniMax Model', tts.minimax_model || '未设置', false],
        ['TTS 自动播放', tts.auto_play ? '是' : '否', false],
        ['允许 Skills', tools.enable_skills ? (allowedSkills.length > 0 ? allowedSkills.join(', ') : '未选择') : '已禁用', false],
        ['可用 Skills 数', String(availableSkills.length), false],
        ['MCP Server 数', String(mcpServerCount), false],
        ['MCP Servers', mcpServerCount > 0 ? selectedMcpServerNames.join(', ') : '未选择', false],
        ['关联会话数', String(sessionCount), false],
        ['Prompt 长度', String((profile.system_prompt || '').length), false],
        ['创建时间', formatNullableTimestamp(profile.created_at), false],
        ['更新时间', formatNullableTimestamp(profile.updated_at), false],
    ];

    container.innerHTML = `
        <div class="session-overview-grid">
            ${details.map(([label, value, monospace]) => renderSessionOverviewItem(label, value, { monospace })).join('')}
        </div>
    `;
}

function renderInfoPanel() {
    if (activeInfoPanel === 'profile') {
        renderProfileOverview();
        return;
    }

    if (activeInfoPanel === 'session') {
        renderSessionOverview();
        return;
    }

    if (currentSession) {
        renderSessionOverview();
        return;
    }

    if (selectedProfileId) {
        renderProfileOverview();
        return;
    }

    setInfoPanelTitle('信息面板');
    renderInfoPanelEmptyState('还没有可展示的信息', '点击左侧 Profile 或会话后，这里会显示对应的配置、上下文和运行信息。');
}

function updateRunControls() {
    runInProgress = currentSession?.status === 'running';
    document.getElementById('send-button').disabled = !currentSession || runInProgress;
    document.getElementById('message-input').disabled = !currentSession || runInProgress;
    document.getElementById('cancel-button').classList.toggle('hidden', !runInProgress);
    document.getElementById('download-session-logs-button').disabled = !currentSession || logExportState.isDownloading;
    updateTtsControls();
}

function handleTtsStatePacket(nextState) {
    ttsState = {
        ...ttsState,
        ...nextState,
    };
    appendTtsDebugLog('tts_state', nextState);
    touchTtsDebugEvent();
    if (ttsState.error) {
        setTtsDebugError(ttsState.error);
    } else {
        clearTtsDebugError();
    }
    if (!ttsPreferenceLocked) {
        ttsPlaybackEnabled = Boolean(ttsState.enabled && ttsState.auto_play);
    }
    updateTtsControls();
    renderInfoPanel();
}

function updateTtsControls() {
    const badge = document.getElementById('tts-state-badge');
    const toggleButton = document.getElementById('tts-toggle-button');
    const stopButton = document.getElementById('tts-stop-button');
    const canUseTts = Boolean(currentSession && ttsState.enabled);
    const providerLabel = ttsState.provider || 'off';

    if (badge) {
        badge.textContent = `tts: ${ttsPlaybackEnabled ? providerLabel : 'off'}`;
        badge.title = ttsState.voice ? `${providerLabel} · ${ttsState.voice}` : providerLabel;
    }
    if (toggleButton) {
        toggleButton.disabled = !canUseTts;
        toggleButton.textContent = ttsPlaybackEnabled ? '关闭朗读' : '启用朗读';
    }
    if (stopButton) {
        stopButton.disabled = !canUseTts || (!currentTtsAudio && !currentTtsItem && ttsQueue.length === 0 && ttsItemsBySequence.size === 0);
    }
}

function toggleTtsPlayback() {
    if (!currentSession || !ttsState.enabled) {
        return;
    }
    ttsPreferenceLocked = true;
    ttsPlaybackEnabled = !ttsPlaybackEnabled;
    appendTtsDebugLog('tts_playback_toggled', {
        enabled: ttsPlaybackEnabled,
        queue_length: ttsQueue.length,
        buffered_items: ttsItemsBySequence.size,
    });
    if (!ttsPlaybackEnabled) {
        stopTtsPlayback('muted');
    } else if (ttsQueue.length > 0 || ttsItemsBySequence.size > 0) {
        playNextTtsChunk();
    }
    updateTtsControls();
}

function mimeTypeForAudioFormat(audioFormat) {
    const mimeMap = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
    };
    return mimeMap[audioFormat] || 'audio/mpeg';
}

function canUseMediaSourceForFormat(audioFormat) {
    if (typeof MediaSource === 'undefined') {
        return false;
    }
    // Incremental append with mp3/wav is unreliable across browsers and can
    // cause replay/freeze behavior when the player falls back mid-sentence.
    if (!audioFormat || ['mp3', 'wav'].includes(String(audioFormat).toLowerCase())) {
        return false;
    }
    return MediaSource.isTypeSupported(mimeTypeForAudioFormat(audioFormat));
}

function decodeAudioBase64(audioB64) {
    const binary = atob(audioB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function createTtsItem(chunk) {
    return {
        sequenceNo: chunk.sequence_no,
        provider: chunk.provider || ttsState.provider,
        voice: chunk.voice || ttsState.voice,
        text: chunk.text || '',
        audioFormat: chunk.audio_format || ttsState.audio_format || 'mp3',
        useMediaSource: ttsState.streaming_mode === 'audio_stream' && canUseMediaSourceForFormat(chunk.audio_format || ttsState.audio_format),
        allChunks: [],
        latestChunk: null,
        appendQueue: [],
        ended: false,
        mediaSource: null,
        sourceBuffer: null,
        mediaSourceEnded: false,
    };
}

function handleTtsChunkStart(chunk) {
    appendTtsDebugLog('tts_chunk_start', chunk);
    touchTtsDebugEvent();
    clearTtsDebugError();
    if (!chunk || chunk.sequence_no === undefined || chunk.sequence_no === null) {
        return;
    }
    if (ttsItemsBySequence.has(chunk.sequence_no)) {
        return;
    }
    const item = createTtsItem(chunk);
    ttsItemsBySequence.set(item.sequenceNo, item);
    ttsQueue.push(item);
    updateTtsControls();
    if (ttsPlaybackEnabled && !currentTtsAudio && !currentTtsItem) {
        playNextTtsChunk();
    }
    renderInfoPanel();
}

function enqueueTtsBufferedChunk(chunk) {
    if (!chunk) {
        return;
    }
    handleTtsChunkStart(chunk);
    handleTtsChunkData({
        sequence_no: chunk.sequence_no,
        chunk_index: 0,
        audio_format: chunk.audio_format,
        audio_b64: chunk.audio_b64,
        is_final: true,
    });
    handleTtsChunkEnd({ sequence_no: chunk.sequence_no });
}

function handleTtsChunkData(chunk) {
    appendTtsDebugLog('tts_chunk_data', chunk);
    touchTtsDebugEvent();
    ttsDebug.chunksReceived += 1;
    ttsDebug.lastChunkAt = nowIsoString();
    ttsDebug.lastChunkFormat = chunk?.audio_format || currentTtsItem?.audioFormat || '';
    ttsDebug.lastChunkBytes = chunk?.audio_b64 ? atob(chunk.audio_b64).length : 0;
    clearTtsDebugError();
    if (!chunk.audio_b64 || chunk.sequence_no === undefined || chunk.sequence_no === null) {
        updateTtsControls();
        renderInfoPanel();
        return;
    }
    const item = ttsItemsBySequence.get(chunk.sequence_no);
    if (!item) {
        return;
    }
    const bytes = decodeAudioBase64(chunk.audio_b64);
    if (item.useMediaSource) {
        item.allChunks.push(bytes);
    } else {
        // Some providers emit cumulative mp3 buffers in streaming mode, so the
        // latest chunk is the safest fallback payload when MediaSource is not
        // available. Keep all chunks for debugging, but prefer the newest one
        // during playback to avoid duplicated speech.
        item.allChunks.push(bytes);
        item.latestChunk = bytes;
    }

    if (item === currentTtsItem && item.useMediaSource && item.sourceBuffer) {
        item.appendQueue.push(bytes);
        flushCurrentTtsAppendQueue(item);
    } else if (item === currentTtsItem && !item.useMediaSource && item.ended && !currentTtsAudio) {
        startBufferedTtsPlayback(item);
        return;
    }

    updateTtsControls();
    if (ttsPlaybackEnabled && !currentTtsAudio && !currentTtsItem) {
        playNextTtsChunk();
    }
    renderInfoPanel();
}

function handleTtsChunkEnd(chunk) {
    appendTtsDebugLog('tts_chunk_end', chunk);
    touchTtsDebugEvent();
    const item = ttsItemsBySequence.get(chunk.sequence_no);
    if (!item) {
        return;
    }
    item.ended = true;

    if (item === currentTtsItem) {
        if (item.useMediaSource) {
            flushCurrentTtsAppendQueue(item);
            finalizeCurrentMediaSourceIfReady(item);
        } else if (!currentTtsAudio) {
            startBufferedTtsPlayback(item);
            return;
        }
    } else if (ttsPlaybackEnabled && !currentTtsAudio && !currentTtsItem) {
        playNextTtsChunk();
        return;
    }

    updateTtsControls();
    renderInfoPanel();
}

function playNextTtsChunk() {
    if (!ttsPlaybackEnabled || currentTtsAudio || currentTtsItem || ttsQueue.length === 0) {
        updateTtsControls();
        renderInfoPanel();
        return;
    }

    ttsDebug.playAttempts += 1;
    touchTtsDebugEvent();
    const item = ttsQueue.shift();
    if (!item) {
        updateTtsControls();
        renderInfoPanel();
        return;
    }
    currentTtsItem = item;
    appendTtsDebugLog('tts_playback_started', {
        sequence_no: item.sequenceNo,
        provider: item.provider,
        voice: item.voice,
        audio_format: item.audioFormat,
        use_media_source: item.useMediaSource,
        text_preview: item.text.slice(0, 160),
    });

    if (item.useMediaSource) {
        startStreamingTtsPlayback(item);
    } else if (item.ended) {
        startBufferedTtsPlayback(item);
    } else {
        updateTtsControls();
        renderInfoPanel();
    }
}

function bindCurrentTtsAudio(audio) {
    currentTtsAudio = audio;
    const boundItem = currentTtsItem;
    currentTtsAudio.onended = () => {
        if (currentTtsAudio !== audio || currentTtsItem !== boundItem) {
            return;
        }
        finishCurrentTtsChunk();
    };
    currentTtsAudio.onerror = () => {
        if (currentTtsAudio !== audio || currentTtsItem !== boundItem) {
            return;
        }
        appendTtsDebugLog('tts_audio_error', {
            sequence_no: currentTtsItem?.sequenceNo || null,
        });
        setTtsDebugError('音频元素播放失败，请检查浏览器音频输出或文件解码。');
        finishCurrentTtsChunk();
    };
}

function beginTtsAudioPlayback(audio, item) {
    audio.play().then(() => {
        if (currentTtsAudio !== audio || currentTtsItem !== item) {
            return;
        }
        ttsDebug.successfulPlays += 1;
        appendTtsDebugLog('tts_audio_playing', {
            sequence_no: currentTtsItem?.sequenceNo || null,
        });
        clearTtsDebugError();
        touchTtsDebugEvent();
        renderInfoPanel();
    }).catch((error) => {
        if (currentTtsAudio !== audio || currentTtsItem !== item) {
            return;
        }
        console.warn('TTS autoplay failed:', error);
        appendTtsDebugLog('tts_audio_play_failed', {
            sequence_no: currentTtsItem?.sequenceNo || null,
            error: error?.message || String(error),
        });
        setTtsDebugError(`自动播放失败: ${error?.message || String(error)}`);
        finishCurrentTtsChunk();
    });
}

function hasSpokenContent(text) {
    return /[A-Za-z0-9\u3400-\u9FFF]/.test(text || '');
}

function resolveBufferedPlaybackChunks(item) {
    if (!item) {
        return [];
    }
    if (item.useMediaSource) {
        return item.allChunks;
    }
    if (ttsState.streaming_mode === 'audio_stream' && item.latestChunk) {
        return [item.latestChunk];
    }
    return item.allChunks;
}

function startBufferedTtsPlayback(item) {
    if (!item) {
        return;
    }
    if (!hasSpokenContent(item.text)) {
        appendTtsDebugLog('tts_playback_skipped', {
            sequence_no: item.sequenceNo,
            reason: 'non_spoken_fragment',
            text_preview: item.text.slice(0, 160),
        });
        finishCurrentTtsChunk();
        return;
    }

    const playbackChunks = resolveBufferedPlaybackChunks(item);
    if (playbackChunks.length === 0) {
        return;
    }

    const blob = new Blob(playbackChunks, { type: mimeTypeForAudioFormat(item.audioFormat) });
    currentTtsAudioUrl = URL.createObjectURL(blob);
    bindCurrentTtsAudio(new Audio(currentTtsAudioUrl));
    beginTtsAudioPlayback(currentTtsAudio, item);
    updateTtsControls();
    renderInfoPanel();
}

function startStreamingTtsPlayback(item) {
    const mediaSource = new MediaSource();
    item.mediaSource = mediaSource;
    currentTtsAudioUrl = URL.createObjectURL(mediaSource);
    bindCurrentTtsAudio(new Audio(currentTtsAudioUrl));
    mediaSource.addEventListener('sourceopen', () => {
        if (currentTtsItem !== item || item.sourceBuffer) {
            return;
        }
        try {
            item.sourceBuffer = mediaSource.addSourceBuffer(mimeTypeForAudioFormat(item.audioFormat));
            item.sourceBuffer.mode = 'sequence';
            item.sourceBuffer.addEventListener('updateend', () => {
                flushCurrentTtsAppendQueue(item);
            });
            item.appendQueue.push(...item.allChunks);
            flushCurrentTtsAppendQueue(item);
        } catch (error) {
            console.warn('Falling back to buffered playback:', error);
            item.useMediaSource = false;
            cleanupCurrentTtsResources({ preserveItem: true });
            startBufferedTtsPlayback(item);
            return;
        }
        finalizeCurrentMediaSourceIfReady(item);
    }, { once: true });
    beginTtsAudioPlayback(currentTtsAudio, item);
    updateTtsControls();
    renderInfoPanel();
}

function flushCurrentTtsAppendQueue(item) {
    if (currentTtsItem !== item || !item?.sourceBuffer || item.sourceBuffer.updating) {
        return;
    }
    if (item.appendQueue.length === 0) {
        finalizeCurrentMediaSourceIfReady(item);
        return;
    }
    const nextChunk = item.appendQueue.shift();
    try {
        item.sourceBuffer.appendBuffer(nextChunk);
    } catch (error) {
        console.warn('SourceBuffer append failed, falling back to buffered playback:', error);
        item.useMediaSource = false;
        cleanupCurrentTtsResources({ preserveItem: true });
        startBufferedTtsPlayback(item);
    }
}

function finalizeCurrentMediaSourceIfReady(item) {
    if (
        currentTtsItem !== item ||
        !item?.useMediaSource ||
        !item.ended ||
        !item.mediaSource ||
        item.mediaSource.readyState !== 'open' ||
        !item.sourceBuffer ||
        item.sourceBuffer.updating ||
        item.appendQueue.length > 0 ||
        item.mediaSourceEnded
    ) {
        return;
    }
    try {
        item.mediaSource.endOfStream();
        item.mediaSourceEnded = true;
    } catch (error) {
        console.warn('MediaSource endOfStream failed:', error);
    }
}

function cleanupCurrentTtsResources({ preserveItem = false } = {}) {
    if (currentTtsAudio) {
        currentTtsAudio.pause();
        currentTtsAudio.onended = null;
        currentTtsAudio.onerror = null;
        currentTtsAudio = null;
    }
    if (currentTtsAudioUrl) {
        URL.revokeObjectURL(currentTtsAudioUrl);
        currentTtsAudioUrl = null;
    }
    if (!preserveItem) {
        currentTtsItem = null;
    }
}

function finishCurrentTtsChunk() {
    const finishedItem = currentTtsItem;
    appendTtsDebugLog('tts_playback_finished', {
        sequence_no: finishedItem?.sequenceNo || null,
        text_preview: finishedItem?.text?.slice(0, 160) || '',
    });
    cleanupCurrentTtsResources();
    if (finishedItem) {
        ttsItemsBySequence.delete(finishedItem.sequenceNo);
    }
    if (ttsPlaybackEnabled) {
        playNextTtsChunk();
    } else {
        updateTtsControls();
    }
    renderInfoPanel();
}

function stopTtsPlayback(reason = 'stopped') {
    appendTtsDebugLog('tts_playback_stopped', {
        reason,
        queue_length: ttsQueue.length,
        buffered_items: ttsItemsBySequence.size,
        active_sequence_no: currentTtsItem?.sequenceNo || null,
    });
    ttsDebug.stopCount += 1;
    touchTtsDebugEvent();
    ttsQueue = [];
    ttsItemsBySequence = new Map();
    if (currentTtsAudio) {
        currentTtsAudio.currentTime = 0;
    }
    cleanupCurrentTtsResources();
    currentTtsItem = null;
    if (reason === 'muted') {
        ttsState.status = 'muted';
    }
    updateTtsControls();
    renderInfoPanel();
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (!content || !currentSession || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }

    resetStreamingAssistantMessage();
    ensureStreamingAssistantMessage();
    renderMessageViews();
    ws.send(JSON.stringify({ type: 'run', content }));
    input.value = '';
}

function cancelRun() {
    if (!currentSession || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    ws.send(JSON.stringify({ type: 'cancel' }));
}

function showNewProfileForm() {
    editingProfileId = null;
    resetProfileForm();
    document.getElementById('profile-modal-title').textContent = '新建 Profile';
    document.getElementById('profile-submit-button').textContent = '创建 Profile';
    document.getElementById('new-profile-modal').classList.remove('hidden');
}

function showEditProfileForm(profileId) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
        return;
    }

    editingProfileId = profileId;
    populateProfileForm(profile);
    document.getElementById('profile-modal-title').textContent = '编辑 Profile';
    document.getElementById('profile-submit-button').textContent = '保存 Profile';
    document.getElementById('new-profile-modal').classList.remove('hidden');
}

function closeNewProfileForm() {
    editingProfileId = null;
    setProfileSkillSelectorExpanded(false);
    setProfileMcpServerSelectorExpanded(false);
    document.getElementById('new-profile-modal').classList.add('hidden');
}

function showSkillsModal() {
    document.getElementById('skills-modal').classList.remove('hidden');
}

function closeSkillsModal() {
    document.getElementById('skills-modal').classList.add('hidden');
}

function showMcpServersModal() {
    resetMcpServerForm();
    document.getElementById('mcp-servers-modal').classList.remove('hidden');
}

function closeMcpServersModal() {
    resetMcpServerForm();
    document.getElementById('mcp-servers-modal').classList.add('hidden');
}

function resetMcpServerForm() {
    editingMcpServerId = null;
    document.getElementById('mcp-server-name').value = '';
    document.getElementById('mcp-server-description').value = '';
    document.getElementById('mcp-server-config-json').value = '';
    document.getElementById('mcp-server-import-input').value = '';
    document.getElementById('mcp-server-save-button').textContent = '添加 MCP Server';
}

function editMcpServer(serverId) {
    const server = availableMcpServers.find((item) => item.id === serverId);
    if (!server) {
        return;
    }
    editingMcpServerId = serverId;
    document.getElementById('mcp-server-name').value = server.name || '';
    document.getElementById('mcp-server-description').value = server.description || '';
    document.getElementById('mcp-server-config-json').value = prettyJson(server.config_json || {});
    document.getElementById('mcp-server-save-button').textContent = '保存 MCP Server';
    document.getElementById('mcp-servers-modal').classList.remove('hidden');
}

async function saveMcpServer() {
    const name = document.getElementById('mcp-server-name').value.trim();
    const description = document.getElementById('mcp-server-description').value.trim();
    const configText = document.getElementById('mcp-server-config-json').value.trim();

    if (!name) {
        alert('请输入 MCP Server 名称。');
        return;
    }
    if (!configText) {
        alert('请输入 MCP Server JSON。');
        return;
    }

    try {
        const payload = {
            name,
            description: description || null,
            config_json: JSON.parse(configText),
        };
        const endpoint = editingMcpServerId ? `/mcp-servers/${editingMcpServerId}` : '/mcp-servers';
        const method = editingMcpServerId ? 'PUT' : 'POST';
        await api(endpoint, {
            method,
            body: JSON.stringify(payload),
        });
        resetMcpServerForm();
        await loadMcpServers();
    } catch (error) {
        alert(error.message || '保存 MCP Server 失败');
    }
}

async function deleteMcpServerById(serverId) {
    if (!confirm('确定删除这个 MCP Server 吗？')) {
        return;
    }
    try {
        await api(`/mcp-servers/${serverId}`, { method: 'DELETE' });
        if (editingMcpServerId === serverId) {
            resetMcpServerForm();
        }
        await loadMcpServers();
    } catch (error) {
        alert(error.message || '删除 MCP Server 失败');
    }
}

async function importMcpServers() {
    const importText = document.getElementById('mcp-server-import-input').value.trim();
    if (!importText) {
        alert('请先粘贴 MCP JSON。');
        return;
    }
    try {
        await api('/mcp-servers/import', {
            method: 'POST',
            body: JSON.stringify({ config_json: JSON.parse(importText) }),
        });
        document.getElementById('mcp-server-import-input').value = '';
        await loadMcpServers();
    } catch (error) {
        alert(error.message || '导入 MCP Servers 失败');
    }
}

async function submitProfileForm() {
    try {
        const profileKey = document.getElementById('profile-key').value.trim();
        const workspaceDir = document.getElementById('profile-workspace-dir').value.trim();
        const maxSteps = document.getElementById('profile-max-steps').value.trim();
        const ttsSentenceBufferChars = document.getElementById('tts-sentence-buffer-chars').value.trim();
        const ttsProvider = document.getElementById('tts-provider').value;
        const ttsVoice = document.getElementById('tts-voice').value.trim() || defaultTtsVoiceForProvider(ttsProvider);
        const ttsMinimaxGroupId = document.getElementById('tts-minimax-group-id').value.trim();
        const ttsMinimaxModel = document.getElementById('tts-minimax-model').value.trim() || DEFAULT_MINIMAX_MODEL;
        const ttsVoiceError = validateTtsVoice(ttsProvider, ttsVoice);

        if (ttsVoiceError) {
            alert(ttsVoiceError);
            return;
        }

        if (!profileKey) {
            alert('请输入 Profile Key。');
            return;
        }

        if (document.getElementById('tts-enable').checked && ttsProvider === 'minimax' && !ttsMinimaxGroupId) {
            alert('MiniMax TTS 需要填写 Group ID。');
            return;
        }

        const configJson = {
            llm: {},
            agent: {},
            tts: {
                enabled: document.getElementById('tts-enable').checked,
                provider: ttsProvider,
                voice: ttsVoice,
                minimax_group_id: ttsMinimaxGroupId,
                minimax_model: ttsMinimaxModel,
                auto_play: document.getElementById('tts-auto-play').checked,
            },
            tools: {
                enable_file_tools: document.getElementById('tool-enable-file').checked,
                enable_bash: document.getElementById('tool-enable-bash').checked,
                enable_note: document.getElementById('tool-enable-note').checked,
                enable_skills: document.getElementById('tool-enable-skills').checked,
                allowed_skills: getSelectedAllowedSkillsFromForm(),
                enable_mcp: document.getElementById('tool-enable-mcp').checked,
            },
        };

        const apiKey = document.getElementById('profile-api-key').value.trim();
        const apiBase = document.getElementById('profile-api-base').value.trim();
        const provider = document.getElementById('profile-provider').value;
        const model = document.getElementById('profile-model').value.trim();

        if (apiKey) configJson.llm.api_key = apiKey;
        if (apiBase) configJson.llm.api_base = apiBase;
        if (provider) configJson.llm.provider = provider;
        if (model) configJson.llm.model = model;
        if (workspaceDir) configJson.agent.workspace_dir = workspaceDir;
        if (maxSteps) configJson.agent.max_steps = Number(maxSteps);
        if (ttsSentenceBufferChars) configJson.tts.sentence_buffer_chars = Number(ttsSentenceBufferChars);

        const payload = {
            key: profileKey,
            name: document.getElementById('profile-name').value.trim(),
            system_prompt: document.getElementById('profile-system-prompt').value.trim() || null,
            config_json: configJson,
            mcp_config_json: null,
            mcp_server_ids: getSelectedMcpServerIdsFromForm(),
            is_default: profiles.length === 0 || document.getElementById('profile-is-default').checked,
        };

        if (!payload.name) {
            alert('请输入 Profile 名称。');
            return;
        }

        const profileIdToUpdate = editingProfileId;
        const endpoint = profileIdToUpdate ? `/profiles/${profileIdToUpdate}` : '/profiles';
        const method = profileIdToUpdate ? 'PUT' : 'POST';
        await api(endpoint, {
            method,
            body: JSON.stringify(payload),
        });
        closeNewProfileForm();
        resetProfileForm();
        await loadProfiles();
        if (profileIdToUpdate && selectedProfileId === profileIdToUpdate) {
            selectedProfileId = profileIdToUpdate;
        }
    } catch (error) {
        alert(error.message || '保存 Profile 失败');
    }
}

function populateProfileForm(profile) {
    const config = profile.config_json || {};
    const llm = config.llm || {};
    const agent = config.agent || {};
    const tts = config.tts || {};
    const tools = config.tools || {};

    document.getElementById('profile-name').value = profile.name || '';
    document.getElementById('profile-key').value = profile.key || '';
    document.getElementById('profile-system-prompt').value = profile.system_prompt || '';
    document.getElementById('profile-workspace-dir').value = agent.workspace_dir || '';
    document.getElementById('profile-provider').value = llm.provider || 'anthropic';
    document.getElementById('profile-model').value = llm.model || '';
    document.getElementById('profile-api-base').value = llm.api_base || '';
    document.getElementById('profile-api-key').value = llm.api_key || '';
    document.getElementById('profile-max-steps').value = agent.max_steps || '';
    document.getElementById('profile-is-default').checked = Boolean(profile.is_default);
    document.getElementById('tts-enable').checked = tts.enabled ?? true;
    document.getElementById('tts-auto-play').checked = Boolean(tts.auto_play);
    document.getElementById('tts-provider').value = tts.provider || 'minimax';
    document.getElementById('tts-voice').value = tts.voice || '';
    document.getElementById('tts-minimax-group-id').value = tts.minimax_group_id || '';
    document.getElementById('tts-minimax-model').value = tts.minimax_model || DEFAULT_MINIMAX_MODEL;
    document.getElementById('tts-sentence-buffer-chars').value = tts.sentence_buffer_chars || '';
    document.getElementById('tool-enable-file').checked = tools.enable_file_tools ?? true;
    document.getElementById('tool-enable-bash').checked = tools.enable_bash ?? true;
    document.getElementById('tool-enable-note').checked = tools.enable_note ?? true;
    document.getElementById('tool-enable-skills').checked = tools.enable_skills ?? true;
    document.getElementById('tool-enable-mcp').checked = Boolean(tools.enable_mcp);
    renderProfileSkillOptions(resolveAllowedSkillsForProfile(profile));
    setProfileSkillSelectorExpanded(false);
    renderProfileMcpServerOptions(resolveSelectedMcpServerIdsForProfile(profile));
    setProfileMcpServerSelectorExpanded(false);
    updateTtsVoiceFieldForProvider();
}

function resetProfileForm() {
    document.getElementById('profile-name').value = '';
    document.getElementById('profile-key').value = '';
    document.getElementById('profile-system-prompt').value = '';
    document.getElementById('profile-workspace-dir').value = '';
    document.getElementById('profile-model').value = '';
    document.getElementById('profile-api-base').value = '';
    document.getElementById('profile-api-key').value = '';
    document.getElementById('profile-max-steps').value = '';
    document.getElementById('profile-is-default').checked = profiles.length === 0;
    document.getElementById('tts-enable').checked = true;
    document.getElementById('tts-auto-play').checked = false;
    document.getElementById('tts-provider').value = 'minimax';
    document.getElementById('tts-voice').value = '';
    document.getElementById('tts-minimax-group-id').value = '';
    document.getElementById('tts-minimax-model').value = DEFAULT_MINIMAX_MODEL;
    document.getElementById('tts-sentence-buffer-chars').value = '';
    document.getElementById('tool-enable-file').checked = true;
    document.getElementById('tool-enable-bash').checked = true;
    document.getElementById('tool-enable-note').checked = true;
    document.getElementById('tool-enable-skills').checked = true;
    document.getElementById('tool-enable-mcp').checked = false;
    renderProfileSkillOptions(allAvailableSkillNames());
    setProfileSkillSelectorExpanded(false);
    renderProfileMcpServerOptions([]);
    setProfileMcpServerSelectorExpanded(false);
    updateTtsVoiceFieldForProvider({ forceDefault: true });
}

async function deleteProfile(profileId) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
        return;
    }

    const confirmed = window.confirm(`确认删除 Profile“${profile.name}”？其关联会话将迁移到新的默认 Profile。`);
    if (!confirmed) {
        return;
    }

    try {
        await api(`/profiles/${profileId}`, { method: 'DELETE' });
        if (selectedProfileId === profileId) {
            selectedProfileId = null;
        }
        await Promise.all([loadProfiles(), loadSessions()]);
        if (currentSession) {
            const refreshed = sessions.find((item) => item.id === currentSession.id);
            if (refreshed) {
                currentSession = refreshed;
                updateSessionHeader();
            }
        }
        renderInfoPanel();
    } catch (error) {
        alert(error.message || '删除 Profile 失败');
    }
}

function showEditSessionForm(sessionId) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
        return;
    }

    editingSessionId = sessionId;
    document.getElementById('session-name-input').value = session.name || '';
    document.getElementById('session-workspace-path').value = session.workspace_path || '';
    const profileSelect = document.getElementById('session-profile-select');
    profileSelect.innerHTML = profiles.map((profile) => `
        <option value="${escapeHtml(profile.id)}" ${profile.id === session.profile_id ? 'selected' : ''}>${escapeHtml(profile.name)}</option>
    `).join('');
    document.getElementById('edit-session-modal').classList.remove('hidden');
}

function closeSessionForm() {
    editingSessionId = null;
    document.getElementById('session-name-input').value = '';
    document.getElementById('session-profile-select').innerHTML = '';
    document.getElementById('session-workspace-path').value = '';
    document.getElementById('edit-session-modal').classList.add('hidden');
}

async function submitSessionForm() {
    if (!editingSessionId) {
        return;
    }

    try {
        const name = document.getElementById('session-name-input').value.trim();
        if (!name) {
            alert('请输入会话名称。');
            return;
        }
        const payload = {
            name,
            profile_id: document.getElementById('session-profile-select').value,
        };
        await api(`/sessions/${editingSessionId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        closeSessionForm();
        await Promise.all([loadProfiles(), loadSessions()]);
        if (currentSession?.id === editingSessionId) {
            currentSession = sessions.find((item) => item.id === editingSessionId) || currentSession;
            updateSessionHeader();
            renderInfoPanel();
        }
    } catch (error) {
        alert(error.message || '保存会话失败');
    }
}

async function deleteSessionById(sessionId) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
        return;
    }

    const confirmed = window.confirm(`确认删除会话“${session.name || session.id.slice(0, 8)}”？这会删除其消息和运行记录。`);
    if (!confirmed) {
        return;
    }

    try {
        await api(`/sessions/${sessionId}`, { method: 'DELETE' });
        if (currentSession?.id === sessionId) {
            resetCurrentSessionSelection();
        }
        await loadSessions();
        renderInfoPanel();
    } catch (error) {
        alert(error.message || '删除会话失败');
    }
}

function showLogin() {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
}

function showRegister() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
}

function showAuthSection() {
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('main-section').classList.add('hidden');
}

function showMainSection() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('main-section').classList.remove('hidden');
}

function showError(message) {
    const node = document.getElementById('auth-error');
    node.textContent = message;
    setTimeout(() => {
        node.textContent = '';
    }, 4000);
}

function prettyJson(value) {
    if (!value || Object.keys(value).length === 0) {
        return '{}';
    }
    return JSON.stringify(value, null, 2);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
    const ttsProviderNode = document.getElementById('tts-provider');
    const skillToggleNode = document.getElementById('tool-enable-skills');
    const mcpToggleNode = document.getElementById('tool-enable-mcp');
    const profileAllowedSkillsNode = document.getElementById('profile-allowed-skills');
    const profileMcpServersNode = document.getElementById('profile-mcp-server-options');
    if (ttsProviderNode) {
        ttsProviderNode.addEventListener('change', () => updateTtsVoiceFieldForProvider());
    }
    if (skillToggleNode) {
        skillToggleNode.addEventListener('change', () => {
            if (!skillToggleNode.checked) {
                setProfileSkillSelectorExpanded(false);
            }
            renderProfileSkillOptions(getSelectedAllowedSkillsFromForm());
        });
    }
    if (mcpToggleNode) {
        mcpToggleNode.addEventListener('change', () => {
            if (!mcpToggleNode.checked) {
                setProfileMcpServerSelectorExpanded(false);
            }
            renderProfileMcpServerOptions(getSelectedMcpServerIdsFromForm());
        });
    }
    if (profileAllowedSkillsNode) {
        profileAllowedSkillsNode.addEventListener('change', (event) => {
            if (event.target instanceof HTMLInputElement && event.target.name === 'profile-allowed-skill') {
                updateProfileSkillSelectorButton();
            }
        });
    }
    if (profileMcpServersNode) {
        profileMcpServersNode.addEventListener('change', (event) => {
            if (event.target instanceof HTMLInputElement && event.target.name === 'profile-mcp-server') {
                updateProfileMcpServerSelectorButton();
            }
        });
    }
    updateTtsVoiceFieldForProvider({ forceDefault: true });
    setProfileSkillSelectorExpanded(false);
    setProfileMcpServerSelectorExpanded(false);
    renderLogExportModal();
    const token = localStorage.getItem('token');
    if (token) {
        loadUser();
    } else {
        showAuthSection();
    }
});
