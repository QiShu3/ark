// backend/web/admin/js/templates.js
// Event template store management for admin panel

let _allTemplates = [];
let _vocabDecks = [];

// App config state
let _appConfigs = [];   // Array of { client_id, app_type, config }
let _appEditorIdx = null; // null = new, number = editing

// Workflow state
let _workflows = [];     // Array of { client_id, name, focus_duration, break_duration, default_focus_timer_mode, phases }
let _wfEditorIdx = null; // null = new, number = editing

document.addEventListener('DOMContentLoaded', () => {
  if (!initPage()) return;
  loadTemplates();
  loadVocabDecks();
  initSearch();
  initCreateButton();
  initModal();
  initDeleteConfirm();
  initAppConfigEditor();
  initWorkflowEditor();
});

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadTemplates() {
  try {
    const data = await api.get('/templates');
    _allTemplates = data.templates || [];
    renderTable(_allTemplates);
  } catch (e) {
    showToast('加载模板列表失败: ' + e.message, 'error');
  }
}

async function loadVocabDecks() {
  try {
    _vocabDecks = await api.get('/apps/vocab/decks');
  } catch (e) {
    console.error('Failed to load vocab decks', e);
  }
}

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

function renderTable(templates) {
  const tbody = document.getElementById('templates-tbody');
  if (!tbody) return;

  if (!templates.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted);">暂无模板</td></tr>';
    return;
  }

  tbody.innerHTML = templates.map(t => {
    const pubClass = t.is_published ? 'published' : 'unpublished';
    const pubLabel = t.is_published ? '已上架' : '未上架';
    return `
      <tr>
        <td style="font-weight: 500;">${escapeHtml(t.name)}</td>
        <td><span class="pill" style="background: #e8f5e9; color: #2e7d32;">${escapeHtml(t.category)}</span></td>
        <td style="font-family: var(--font-mono); font-size: 13px; color: var(--muted);">${escapeHtml(t.slug)}</td>
        <td style="font-family: var(--font-mono);">${t.item_count}</td>
        <td>
          <button class="toggle-btn ${pubClass}" data-template-id="${t.id}" data-action="toggle-publish" type="button">
            <span class="toggle-dot"></span>${pubLabel}
          </button>
        </td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="btn-ghost" style="padding: 4px; font-size: 12px;" data-template-id="${t.id}" data-action="edit">编辑</button>
            <button class="btn-ghost" style="padding: 4px; font-size: 12px; color: var(--danger);" data-template-id="${t.id}" data-action="delete">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-action="toggle-publish"]').forEach(btn => {
    btn.addEventListener('click', () => handleTogglePublish(btn));
  });
  tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.templateId));
  });
  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => openDeleteConfirm(btn.dataset.templateId));
  });
}

// ---------------------------------------------------------------------------
// Toggle publish
// ---------------------------------------------------------------------------

async function handleTogglePublish(btn) {
  const templateId = btn.dataset.templateId;
  btn.disabled = true;
  try {
    const result = await api.patch(`/templates/${templateId}/publish`);
    const published = result.is_published;
    btn.className = `toggle-btn ${published ? 'published' : 'unpublished'}`;
    btn.innerHTML = `<span class="toggle-dot"></span>${published ? '已上架' : '未上架'}`;
    showToast(published ? '已上架' : '已下架', 'success');
    const t = _allTemplates.find(x => x.id === templateId);
    if (t) t.is_published = published;
  } catch (e) {
    showToast('操作失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      renderTable(_allTemplates);
    } else {
      renderTable(_allTemplates.filter(t =>
        t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
      ));
    }
  });
}

// ---------------------------------------------------------------------------
// Modal open/close
// ---------------------------------------------------------------------------

function initCreateButton() {
  document.getElementById('btn-create')?.addEventListener('click', () => openCreateModal());
}

let _editingId = null;

function initModal() {
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-template')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-template') closeModal();
  });
  document.getElementById('template-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSave();
  });
  document.getElementById('btn-add-item')?.addEventListener('click', addItemRow);
}

function openCreateModal() {
  _editingId = null;
  document.getElementById('modal-title').textContent = '新建模板';
  document.getElementById('modal-submit').textContent = '创建';
  resetForm();
  document.getElementById('modal-template').classList.add('active');
}

async function openEditModal(templateId) {
  _editingId = templateId;
  document.getElementById('modal-title').textContent = '编辑模板';
  document.getElementById('modal-submit').textContent = '保存';

  try {
    const t = await api.get(`/templates/${templateId}`);

    document.getElementById('form-name').value = t.name || '';
    document.getElementById('form-slug').value = t.slug || '';
    document.getElementById('form-category').value = t.category || '';
    document.getElementById('form-schedule-mode').value = t.schedule_mode || 'from_start';
    document.getElementById('form-description').value = t.description || '';
    document.getElementById('form-event-name').value = t.default_event_name || '';
    document.getElementById('form-sort-order').value = t.sort_order ?? 0;
    document.getElementById('form-start-date').value = t.default_start_date || '';
    document.getElementById('form-due-at').value = t.default_due_at ? t.default_due_at.slice(0, 16) : '';

    // Items
    const container = document.getElementById('items-container');
    container.innerHTML = '';
    (t.items || []).forEach(item => addItemRow(null, item));

    // App configs
    _appConfigs = (t.app_configs || []).map(ac => ({
      client_id: ac.client_id,
      app_type: ac.app_type,
      config: { ...ac.config },
    }));
    _appEditorIdx = null;
    renderAppsList();
    renderAppEditor();

    // Workflows
    _workflows = (t.workflows || []).map(wf => ({
      client_id: wf.client_id,
      name: wf.name,
      focus_duration: wf.focus_duration,
      break_duration: wf.break_duration,
      default_focus_timer_mode: wf.default_focus_timer_mode,
      phases: (wf.phases || []).map(p => ({ ...p })),
    }));
    _wfEditorIdx = null;
    renderWorkflowsList();
    renderWfEditor();

    document.getElementById('modal-template').classList.add('active');
  } catch (e) {
    showToast('加载模板详情失败: ' + e.message, 'error');
  }
}

function closeModal() {
  document.getElementById('modal-template').classList.remove('active');
  _editingId = null;
}

function resetForm() {
  document.getElementById('template-form').reset();
  document.getElementById('form-sort-order').value = '0';
  document.getElementById('items-container').innerHTML = '';
  _appConfigs = [];
  _appEditorIdx = null;
  renderAppsList();
  renderAppEditor();
  _workflows = [];
  _wfEditorIdx = null;
  renderWorkflowsList();
  renderWfEditor();
}

// ---------------------------------------------------------------------------
// Items (workbench content)
// ---------------------------------------------------------------------------

function makeItemClientId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function addItemRow(_e, item) {
  const container = document.getElementById('items-container');
  const clientId = item?.details?.client_id || makeItemClientId();
  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.clientId = clientId;
  row.innerHTML = `
    <select class="item-kind">
      <option value="task" ${item?.kind === 'appointment' ? '' : 'selected'}>任务</option>
      <option value="appointment" ${item?.kind === 'appointment' ? 'selected' : ''}>日程</option>
    </select>
    <input type="text" class="item-title" placeholder="标题" value="${escapeHtml(item?.title || '')}" />
    <input type="number" class="item-offset" placeholder="天数" value="${item?.offset_days ?? 0}" min="0" style="width:80px;" />
    <input type="number" class="item-sort" placeholder="排序" value="${item?.sort_order ?? 0}" min="0" style="width:60px;" />
    <button type="button" class="remove-item" title="移除">&times;</button>
  `;
  row.querySelector('.remove-item').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

// ---------------------------------------------------------------------------
// App config editor
// ---------------------------------------------------------------------------

const APP_TYPES = [
  { value: 'vocab_today', label: '今日单词' },
  { value: 'erc_practice', label: '真题练习' },
  { value: 'erc_review', label: '错题复习' },
];

function initAppConfigEditor() {
  document.getElementById('btn-add-app')?.addEventListener('click', () => {
    _appEditorIdx = null;
    renderAppEditor();
  });
}

function getUsedAppTypes() {
  return new Set(_appConfigs.map(a => a.app_type));
}

function getAppTypeName(appType) {
  return APP_TYPES.find(t => t.value === appType)?.label || appType;
}

function getAppConfigSummary(app) {
  const c = app.config || {};
  if (app.app_type === 'vocab_today') {
    const deck = _vocabDecks.find(d => d.id === c.deckId);
    return `词书: ${deck?.name || c.deckName || c.deckId || '未选'}, 每日 ${c.dailyTargetCount || 20} 词, 专注 ${Math.round((c.defaultFocusDuration || 1500) / 60)} 分钟`;
  }
  if (app.app_type === 'erc_practice') {
    return `每日 ${c.dailyArticleTarget || 1} 篇文章, 专注 ${Math.round((c.defaultFocusDuration || 1500) / 60)} 分钟`;
  }
  const scopeLabel = c.reviewScope === 'due' ? '到期复习' : c.reviewScope === 'mistakes' ? '错题复习' : '全部';
  return `范围: ${scopeLabel}, 每日 ${c.dailyQuestionTarget || 10} 题, 专注 ${Math.round((c.defaultFocusDuration || 1500) / 60)} 分钟`;
}

function renderAppsList() {
  const container = document.getElementById('apps-list');
  if (!container) return;

  if (!_appConfigs.length) {
    container.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:8px 0;">暂无应用配置</div>';
    return;
  }

  container.innerHTML = _appConfigs.map((app, i) => `
    <div class="app-card-item">
      <div class="app-info">
        <div class="app-name">${getAppTypeName(app.app_type)}</div>
        <div class="app-summary">${escapeHtml(getAppConfigSummary(app))}</div>
      </div>
      <div class="app-actions">
        <button type="button" class="btn-ghost" style="padding:3px 8px;font-size:12px;" data-app-idx="${i}" data-action="edit-app">编辑</button>
        <button type="button" class="btn-ghost" style="padding:3px 8px;font-size:12px;color:var(--danger);" data-app-idx="${i}" data-action="delete-app">删除</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-action="edit-app"]').forEach(btn => {
    btn.addEventListener('click', () => {
      _appEditorIdx = parseInt(btn.dataset.appIdx);
      renderAppEditor();
    });
  });
  container.querySelectorAll('[data-action="delete-app"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.appIdx);
      _appConfigs.splice(idx, 1);
      if (_appEditorIdx === idx) _appEditorIdx = null;
      else if (_appEditorIdx !== null && _appEditorIdx > idx) _appEditorIdx--;
      renderAppsList();
      renderAppEditor();
    });
  });
}

function renderAppEditor() {
  const container = document.getElementById('app-editor-container');
  if (!container) return;

  const isNew = _appEditorIdx === null;
  const editing = !isNew ? _appConfigs[_appEditorIdx] : null;
  const usedTypes = getUsedAppTypes();

  // Determine available types
  const availableTypes = APP_TYPES.filter(t =>
    !usedTypes.has(t.value) || (editing && editing.app_type === t.value)
  );

  if (!availableTypes.length && isNew) {
    container.innerHTML = '';
    return;
  }

  const currentType = editing ? editing.app_type : (availableTypes[0]?.value || 'vocab_today');
  const config = editing ? editing.config : {};

  const deckOptions = _vocabDecks.map(d =>
    `<option value="${d.id}" ${config.deckId === d.id ? 'selected' : ''}>${escapeHtml(d.name)} (${d.word_count}词)</option>`
  ).join('');

  const focusMin = Math.round((config.defaultFocusDuration || 1500) / 60);

  let typeSpecificFields = '';
  if (currentType === 'vocab_today') {
    typeSpecificFields = `
      <div class="editor-row">
        <div>
          <label>词书</label>
          <select id="app-edit-deckId">
            <option value="">选择词书</option>
            ${deckOptions}
          </select>
        </div>
        <div>
          <label>每日目标词数</label>
          <input type="number" id="app-edit-dailyTargetCount" min="1" max="500" value="${config.dailyTargetCount || 20}" />
        </div>
      </div>
    `;
  } else if (currentType === 'erc_practice') {
    typeSpecificFields = `
      <div class="editor-row">
        <div>
          <label>每日目标文章数</label>
          <input type="number" id="app-edit-dailyArticleTarget" min="1" max="50" value="${config.dailyArticleTarget || 1}" />
        </div>
      </div>
    `;
  } else if (currentType === 'erc_review') {
    typeSpecificFields = `
      <div class="editor-row">
        <div>
          <label>复习范围</label>
          <select id="app-edit-reviewScope">
            <option value="due" ${config.reviewScope === 'due' ? 'selected' : ''}>到期复习</option>
            <option value="mistakes" ${config.reviewScope === 'mistakes' ? 'selected' : ''}>错题复习</option>
            <option value="all" ${config.reviewScope === 'all' ? 'selected' : ''}>全部</option>
          </select>
        </div>
        <div>
          <label>每日题目数</label>
          <input type="number" id="app-edit-dailyQuestionTarget" min="1" max="100" value="${config.dailyQuestionTarget || 10}" />
        </div>
      </div>
    `;
  }

  const typeSelector = isNew ? `
    <div class="editor-row">
      <div>
        <label>应用类型</label>
        <select id="app-edit-type">
          ${availableTypes.map(t => `<option value="${t.value}" ${t.value === currentType ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
    </div>
  ` : `
    <div style="font-size:13px;font-weight:600;margin-bottom:10px;">${getAppTypeName(currentType)}</div>
  `;

  container.innerHTML = `
    <div class="app-editor-form">
      ${typeSelector}
      ${typeSpecificFields}
      <div class="editor-row">
        <div>
          <label>专注时长（分钟）</label>
          <input type="number" id="app-edit-focusDuration" min="1" max="180" value="${focusMin}" />
        </div>
        <div style="display:flex;align-items:flex-end;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="app-edit-addToTodayPlan" ${config.addToTodayPlan !== false ? 'checked' : ''} />
            加入今日计划
          </label>
        </div>
      </div>
      <div class="editor-actions">
        <button type="button" class="btn btn-secondary" id="app-edit-cancel" style="padding:5px 12px;font-size:12px;">取消</button>
        <button type="button" class="btn btn-primary" id="app-edit-save" style="padding:5px 12px;font-size:12px;">${isNew ? '添加' : '保存'}</button>
      </div>
    </div>
  `;

  // Re-render on type change (for new)
  if (isNew) {
    document.getElementById('app-edit-type')?.addEventListener('change', () => {
      _appEditorIdx = null; // stay in new mode
      renderAppEditor();
    });
  }

  document.getElementById('app-edit-cancel')?.addEventListener('click', () => {
    _appEditorIdx = null;
    renderAppEditor();
  });

  document.getElementById('app-edit-save')?.addEventListener('click', saveAppEditor);
}

function saveAppEditor() {
  const isNew = _appEditorIdx === null;
  const typeEl = document.getElementById('app-edit-type');
  const appType = isNew ? typeEl?.value : _appConfigs[_appEditorIdx]?.app_type;
  if (!appType) return;

  const focusDuration = (parseInt(document.getElementById('app-edit-focusDuration')?.value) || 25) * 60;
  const addToTodayPlan = document.getElementById('app-edit-addToTodayPlan')?.checked ?? true;

  const config = { defaultFocusDuration: focusDuration, addToTodayPlan };

  if (appType === 'vocab_today') {
    const deckId = document.getElementById('app-edit-deckId')?.value;
    if (!deckId) { showToast('请选择词书', 'error'); return; }
    const deck = _vocabDecks.find(d => d.id === deckId);
    config.deckId = deckId;
    config.deckName = deck?.name || '';
    config.dailyTargetCount = parseInt(document.getElementById('app-edit-dailyTargetCount')?.value) || 20;
  } else if (appType === 'erc_practice') {
    config.dailyArticleTarget = parseInt(document.getElementById('app-edit-dailyArticleTarget')?.value) || 1;
  } else if (appType === 'erc_review') {
    config.reviewScope = document.getElementById('app-edit-reviewScope')?.value || 'due';
    config.dailyQuestionTarget = parseInt(document.getElementById('app-edit-dailyQuestionTarget')?.value) || 10;
  }

  const entry = {
    client_id: isNew ? appType : _appConfigs[_appEditorIdx].client_id,
    app_type: appType,
    config,
  };

  if (isNew) {
    _appConfigs.push(entry);
  } else {
    _appConfigs[_appEditorIdx] = entry;
  }

  _appEditorIdx = null;
  renderAppsList();
  renderAppEditor();
}

// ---------------------------------------------------------------------------
// Workflow editor
// ---------------------------------------------------------------------------

function initWorkflowEditor() {
  document.getElementById('btn-add-wf')?.addEventListener('click', () => {
    _wfEditorIdx = null;
    renderWfEditor();
  });
}

function getWfSummary(wf) {
  const focusMin = Math.round(wf.focus_duration / 60);
  const breakMin = Math.round(wf.break_duration / 60);
  const phaseCount = Math.ceil((wf.phases || []).length / 2);
  const modeLabel = wf.default_focus_timer_mode === 'countdown' ? '倒计时' : '正计时';
  return `${focusMin}/${breakMin} 分钟 · ${phaseCount} 轮 · ${modeLabel}`;
}

function getWfTaskOptions() {
  // Build task binding options from workbench items + app configs
  const options = [{ value: '', label: '无绑定' }];
  // From items (use client_id stored in data attribute)
  document.querySelectorAll('#items-container .item-row').forEach((row) => {
    const title = row.querySelector('.item-title')?.value?.trim();
    const clientId = row.dataset.clientId;
    if (title && clientId) {
      options.push({ value: clientId, label: `安排: ${title}` });
    }
  });
  // From app configs
  _appConfigs.forEach(app => {
    options.push({ value: app.client_id, label: `应用: ${getAppTypeName(app.app_type)}` });
  });
  return options;
}

function renderWorkflowsList() {
  const container = document.getElementById('workflows-list');
  if (!container) return;

  if (!_workflows.length) {
    container.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:8px 0;">暂无工作流</div>';
    return;
  }

  container.innerHTML = _workflows.map((wf, i) => `
    <div class="wf-card-item">
      <div class="wf-info">
        <div class="wf-name">${escapeHtml(wf.name)}</div>
        <div class="wf-summary">${escapeHtml(getWfSummary(wf))}</div>
      </div>
      <div class="wf-actions">
        <button type="button" class="btn-ghost" style="padding:3px 8px;font-size:12px;" data-wf-idx="${i}" data-action="edit-wf">编辑</button>
        <button type="button" class="btn-ghost" style="padding:3px 8px;font-size:12px;color:var(--danger);" data-wf-idx="${i}" data-action="delete-wf">删除</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-action="edit-wf"]').forEach(btn => {
    btn.addEventListener('click', () => {
      _wfEditorIdx = parseInt(btn.dataset.wfIdx);
      renderWfEditor();
    });
  });
  container.querySelectorAll('[data-action="delete-wf"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.wfIdx);
      _workflows.splice(idx, 1);
      if (_wfEditorIdx === idx) _wfEditorIdx = null;
      else if (_wfEditorIdx !== null && _wfEditorIdx > idx) _wfEditorIdx--;
      renderWorkflowsList();
      renderWfEditor();
    });
  });
}

function renderWfEditor() {
  const container = document.getElementById('wf-editor-container');
  if (!container) return;

  const isNew = _wfEditorIdx === null;
  const editing = !isNew ? _workflows[_wfEditorIdx] : null;

  const name = editing?.name || '';
  const focusMin = Math.round((editing?.focus_duration || 1500) / 60);
  const breakMin = Math.round((editing?.break_duration || 300) / 60);
  const timerMode = editing?.default_focus_timer_mode || 'countdown';
  const phases = editing?.phases || [];

  const taskOptions = getWfTaskOptions();
  const taskOptionsHtml = taskOptions.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');

  // Build phase pairs
  let phaseRowsHtml = '';
  for (let i = 0; i < phases.length; i += 2) {
    const focus = phases[i];
    const brk = phases[i + 1] || null;
    const pairIdx = i / 2;
    phaseRowsHtml += `
      <div class="phase-row" data-pair="${pairIdx}">
        <span style="font-weight:600;color:var(--fg-2);">${pairIdx + 1}.</span>
        <div>
          <label style="font-size:11px;color:var(--muted);">专注</label>
          <input type="number" class="phase-focus-duration" min="60" value="${focus.duration}" style="width:100%;" />
        </div>
        <div>
          <label style="font-size:11px;color:var(--muted);">绑定任务</label>
          <select class="phase-focus-task">${taskOptionsHtml}</select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--muted);">休息</label>
          <input type="number" class="phase-break-duration" min="60" value="${brk?.duration || 300}" style="width:100%;" />
        </div>
        <button type="button" class="remove-phase" title="移除">&times;</button>
      </div>
    `;
    // Set selected task after render (can't do inline with template)
  }

  container.innerHTML = `
    <div class="wf-editor-form">
      <div class="editor-row">
        <div>
          <label>工作流名称</label>
          <input type="text" id="wf-edit-name" value="${escapeHtml(name)}" placeholder="如：考研英语" />
        </div>
        <div>
          <label>计时模式</label>
          <select id="wf-edit-timerMode">
            <option value="countdown" ${timerMode === 'countdown' ? 'selected' : ''}>倒计时</option>
            <option value="countup" ${timerMode === 'countup' ? 'selected' : ''}>正计时</option>
          </select>
        </div>
      </div>
      <div class="editor-row">
        <div>
          <label>专注时长（分钟）</label>
          <input type="number" id="wf-edit-focusMin" min="1" max="180" value="${focusMin}" />
        </div>
        <div>
          <label>休息时长（分钟）</label>
          <input type="number" id="wf-edit-breakMin" min="1" max="60" value="${breakMin}" />
        </div>
      </div>

      <div style="margin-top:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:13px;font-weight:500;">阶段</span>
          <button type="button" class="btn btn-secondary" id="btn-add-phase" style="padding:3px 10px;font-size:11px;">+ 添加阶段</button>
        </div>
        <div class="phase-list" id="wf-phase-list">${phaseRowsHtml}</div>
      </div>

      <div class="editor-actions">
        <button type="button" class="btn btn-secondary" id="wf-edit-cancel" style="padding:5px 12px;font-size:12px;">取消</button>
        <button type="button" class="btn btn-primary" id="wf-edit-save" style="padding:5px 12px;font-size:12px;">${isNew ? '添加' : '保存'}</button>
      </div>
    </div>
  `;

  // Set task binding values after DOM insertion
  for (let i = 0; i < phases.length; i += 2) {
    const focus = phases[i];
    const brk = phases[i + 1];
    const pairIdx = i / 2;
    const row = container.querySelector(`.phase-row[data-pair="${pairIdx}"]`);
    if (row) {
      const focusTaskSelect = row.querySelector('.phase-focus-task');
      if (focusTaskSelect && focus.task_id) {
        focusTaskSelect.value = focus.task_id;
      }
    }
  }

  // Bind events
  document.getElementById('btn-add-phase')?.addEventListener('click', () => addPhaseRow(taskOptionsHtml));
  container.querySelectorAll('.remove-phase').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.phase-row').remove());
  });
  document.getElementById('wf-edit-cancel')?.addEventListener('click', () => {
    _wfEditorIdx = null;
    renderWfEditor();
  });
  document.getElementById('wf-edit-save')?.addEventListener('click', saveWfEditor);
}

function addPhaseRow(taskOptionsHtml) {
  const list = document.getElementById('wf-phase-list');
  if (!list) return;
  const count = list.querySelectorAll('.phase-row').length;
  const row = document.createElement('div');
  row.className = 'phase-row';
  row.dataset.pair = count;
  row.innerHTML = `
    <span style="font-weight:600;color:var(--fg-2);">${count + 1}.</span>
    <div>
      <label style="font-size:11px;color:var(--muted);">专注</label>
      <input type="number" class="phase-focus-duration" min="60" value="1500" style="width:100%;" />
    </div>
    <div>
      <label style="font-size:11px;color:var(--muted);">绑定任务</label>
      <select class="phase-focus-task">${taskOptionsHtml || '<option value="">无绑定</option>'}</select>
    </div>
    <div>
      <label style="font-size:11px;color:var(--muted);">休息</label>
      <input type="number" class="phase-break-duration" min="60" value="300" style="width:100%;" />
    </div>
    <button type="button" class="remove-phase" title="移除">&times;</button>
  `;
  row.querySelector('.remove-phase').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

function saveWfEditor() {
  const name = document.getElementById('wf-edit-name')?.value?.trim();
  if (!name) { showToast('请填写工作流名称', 'error'); return; }

  const focusDuration = (parseInt(document.getElementById('wf-edit-focusMin')?.value) || 25) * 60;
  const breakDuration = (parseInt(document.getElementById('wf-edit-breakMin')?.value) || 5) * 60;
  const timerMode = document.getElementById('wf-edit-timerMode')?.value || 'countdown';

  // Collect phases
  const phases = [];
  document.querySelectorAll('#wf-phase-list .phase-row').forEach((row, pairIdx) => {
    const focusDurationSec = parseInt(row.querySelector('.phase-focus-duration')?.value) || 1500;
    const breakDurationSec = parseInt(row.querySelector('.phase-break-duration')?.value) || 300;
    const taskId = row.querySelector('.phase-focus-task')?.value || null;

    phases.push({
      phase_type: 'focus',
      duration: focusDurationSec,
      timer_mode: timerMode,
      task_id: taskId || null,
      focus_work_type: null,
      is_temporary: false,
      record_focus: true,
    });
    phases.push({
      phase_type: 'break',
      duration: breakDurationSec,
      timer_mode: null,
      task_id: null,
      focus_work_type: null,
      is_temporary: false,
      record_focus: true,
    });
  });

  if (!phases.length) { showToast('请至少添加一个阶段', 'error'); return; }

  const isNew = _wfEditorIdx === null;
  const entry = {
    client_id: isNew ? `wf-${Date.now()}-${Math.random().toString(36).slice(2,6)}` : _workflows[_wfEditorIdx].client_id,
    name,
    focus_duration: focusDuration,
    break_duration: breakDuration,
    default_focus_timer_mode: timerMode,
    phases,
  };

  if (isNew) {
    _workflows.push(entry);
  } else {
    _workflows[_wfEditorIdx] = entry;
  }

  _wfEditorIdx = null;
  renderWorkflowsList();
  renderWfEditor();
}

// ---------------------------------------------------------------------------
// Save (create / update)
// ---------------------------------------------------------------------------

async function handleSave() {
  const name = document.getElementById('form-name').value.trim();
  const slug = document.getElementById('form-slug').value.trim();
  const category = document.getElementById('form-category').value.trim();

  if (!name || !slug || !category) {
    showToast('请填写必填字段', 'error');
    return;
  }

  // Collect items
  const itemRows = document.querySelectorAll('#items-container .item-row');
  const items = [];
  itemRows.forEach((row, i) => {
    const title = row.querySelector('.item-title').value.trim();
    if (!title) return;
    items.push({
      kind: row.querySelector('.item-kind').value,
      title,
      offset_days: parseInt(row.querySelector('.item-offset').value) || 0,
      sort_order: parseInt(row.querySelector('.item-sort').value) || i,
      details: { client_id: row.dataset.clientId || makeItemClientId() },
    });
  });

  const payload = {
    name,
    slug,
    category,
    schedule_mode: document.getElementById('form-schedule-mode').value,
    description: document.getElementById('form-description').value.trim() || null,
    default_event_name: document.getElementById('form-event-name').value.trim() || null,
    default_start_date: document.getElementById('form-start-date').value || null,
    default_due_at: document.getElementById('form-due-at').value || null,
    default_is_primary: null,
    sort_order: parseInt(document.getElementById('form-sort-order').value) || 0,
    items,
    app_configs: _appConfigs.map(ac => ({ ...ac, config: { ...ac.config } })),
    workflows: _workflows.map(wf => ({ ...wf, phases: wf.phases.map(p => ({ ...p })) })),
  };

  const submitBtn = document.getElementById('modal-submit');
  submitBtn.disabled = true;

  try {
    if (_editingId) {
      await api.put(`/templates/${_editingId}`, payload);
      showToast('模板已更新', 'success');
    } else {
      await api.post('/templates', payload);
      showToast('模板已创建（未上架）', 'success');
    }
    closeModal();
    await loadTemplates();
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

let _deleteId = null;

function initDeleteConfirm() {
  document.getElementById('confirm-delete-cancel')?.addEventListener('click', closeDeleteConfirm);
  document.getElementById('modal-confirm-delete')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-confirm-delete') closeDeleteConfirm();
  });
  document.getElementById('confirm-delete-ok')?.addEventListener('click', handleDelete);
}

function openDeleteConfirm(templateId) {
  _deleteId = templateId;
  const t = _allTemplates.find(x => x.id === templateId);
  document.getElementById('confirm-delete-text').innerHTML =
    `确定要删除模板 <strong>${escapeHtml(t?.name || '')}</strong> 吗？此操作不可撤销。`;
  document.getElementById('modal-confirm-delete').classList.add('active');
}

function closeDeleteConfirm() {
  document.getElementById('modal-confirm-delete').classList.remove('active');
  _deleteId = null;
}

async function handleDelete() {
  if (!_deleteId) return;
  const okBtn = document.getElementById('confirm-delete-ok');
  okBtn.disabled = true;
  okBtn.textContent = '删除中...';
  try {
    await api.delete(`/templates/${_deleteId}`);
    showToast('模板已删除', 'success');
    closeDeleteConfirm();
    await loadTemplates();
  } catch (e) {
    showToast('删除失败: ' + e.message, 'error');
  } finally {
    okBtn.disabled = false;
    okBtn.textContent = '确认删除';
  }
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
