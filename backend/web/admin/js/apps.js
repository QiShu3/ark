// backend/web/admin/js/apps.js
// Sub-app pages logic

document.addEventListener('DOMContentLoaded', () => {
  if (!initPage()) return;

  const page = window.location.pathname.split('/').pop();
  if (page === 'apps.html') loadAppsGrid();
  else if (page === 'apps-vocab.html') loadVocabDetail();
  else if (page === 'apps-vocab-deck.html') loadVocabDeckDetail();
  else if (page === 'apps-erc.html') loadErcDetail();
});

async function loadAppsGrid() {
  try {
    const data = await api.get('/apps');
    const grid = document.querySelector('[data-apps-grid]');
    if (!grid) return;

    grid.innerHTML = data.apps.map(app => `
      <a href="${app.url}" class="app-card admin-card" style="text-decoration:none;color:inherit;">
        <div class="app-icon">${app.icon}</div>
        <div class="app-title" style="font-size:18px;font-weight:600;">${app.name}</div>
        <div class="app-desc" style="font-size:14px;color:var(--muted);margin-top:8px;">${app.description}</div>
        <div class="app-stats" style="font-family:var(--font-mono);font-size:13px;color:var(--muted);margin-top:12px;">
          ${app.stats}
        </div>
      </a>
    `).join('');
  } catch (e) {
    showToast('加载子应用失败', 'error');
  }
}

async function loadVocabDetail() {
  try {
    const [stats, decks] = await Promise.all([
      api.get('/apps/vocab/stats'),
      api.get('/apps/vocab/decks'),
    ]);

    // Update stats
    const statEls = document.querySelectorAll('[data-vocab-stat]');
    if (statEls.length >= 3) {
      statEls[0].textContent = stats.total_words_learned.toLocaleString();
      statEls[1].textContent = stats.today_reviews.toLocaleString();
      statEls[2].textContent = stats.avg_accuracy + '%';
    }

    // Update deck table
    renderVocabDeckTable(decks);

    // Bind toolbar buttons
    initVocabToolbar();
  } catch (e) {
    showToast('加载词汇数据失败', 'error');
  }
}

function renderVocabDeckTable(decks) {
  const tbody = document.querySelector('[data-vocab-decks]');
  if (!tbody) return;
  tbody.innerHTML = decks.map(d => {
    const pubClass = d.is_published ? 'published' : 'unpublished';
    const pubLabel = d.is_published ? '已上架' : '未上架';
    return `
      <tr>
        <td><a href="apps-vocab-deck.html?id=${d.id}" style="font-weight:500;color:var(--accent);text-decoration:none;">${d.name}</a></td>
        <td style="font-family:var(--font-mono);">${d.word_count.toLocaleString()}</td>
        <td style="font-family:var(--font-mono);">${d.learner_count.toLocaleString()}</td>
        <td>
          <button class="toggle-btn ${pubClass}" data-deck-id="${d.id}" data-action="toggle-publish" type="button">
            <span class="toggle-dot"></span>${pubLabel}
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Bind toggle buttons
  tbody.querySelectorAll('[data-action="toggle-publish"]').forEach(btn => {
    btn.addEventListener('click', () => handleTogglePublish(btn));
  });
}

async function handleTogglePublish(btn) {
  const deckId = btn.dataset.deckId;
  btn.disabled = true;
  try {
    const result = await api.patch(`/apps/vocab/decks/${deckId}/publish`);
    const published = result.is_published;
    btn.className = `toggle-btn ${published ? 'published' : 'unpublished'}`;
    btn.innerHTML = `<span class="toggle-dot"></span>${published ? '已上架' : '未上架'}`;
    showToast(published ? '已上架' : '已下架', 'success');
  } catch (e) {
    showToast('操作失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function initVocabToolbar() {
  // Template modal
  const btnTemplate = document.getElementById('btn-template');
  const modalTemplate = document.getElementById('modal-template');
  const btnModalClose = document.getElementById('modal-template-close');
  if (btnTemplate && modalTemplate) {
    btnTemplate.addEventListener('click', () => modalTemplate.classList.add('active'));
    btnModalClose?.addEventListener('click', () => modalTemplate.classList.remove('active'));
    modalTemplate.addEventListener('click', (e) => {
      if (e.target === modalTemplate) modalTemplate.classList.remove('active');
    });
  }

  // File import
  const btnImport = document.getElementById('btn-import');
  const fileInput = document.getElementById('file-import');
  if (btnImport && fileInput) {
    btnImport.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => handleFileImport(fileInput));
  }
}

async function handleFileImport(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = '';

  const formData = new FormData();
  formData.append('file', file);

  const token = getAuthToken();
  if (!token) {
    window.location.href = '/#/login';
    return;
  }

  try {
    showToast('正在导入...', 'info');
    const resp = await fetch(`${API_BASE}/apps/vocab/decks/import`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body.detail || `HTTP ${resp.status}`);
    }

    const result = await resp.json();
    showToast(`导入成功: ${result.name}（${result.word_count} 词）`, 'success');

    // Reload deck list
    const decks = await api.get('/apps/vocab/decks');
    renderVocabDeckTable(decks);
  } catch (e) {
    showToast('导入失败: ' + e.message, 'error');
  }
}

async function loadErcDetail() {
  try {
    const [stats, sets] = await Promise.all([
      api.get('/apps/erc/stats'),
      api.get('/apps/erc/sets'),
    ]);

    // Update stats
    const statEls = document.querySelectorAll('[data-erc-stat]');
    if (statEls.length >= 3) {
      statEls[0].textContent = stats.total_questions.toLocaleString();
      statEls[1].textContent = stats.today_questions.toLocaleString();
      statEls[2].textContent = stats.avg_accuracy + '%';
    }

    // Update sets table
    const tbody = document.querySelector('[data-erc-sets]');
    if (tbody) {
      tbody.innerHTML = sets.map(s => `
        <tr>
          <td style="font-weight:500;">${s.name}</td>
          <td style="font-family:var(--font-mono);">${s.article_count.toLocaleString()}</td>
          <td style="font-family:var(--font-mono);">${s.attempt_count.toLocaleString()}</td>
        </tr>
      `).join('');
    }
  } catch (e) {
    showToast('加载ERC数据失败', 'error');
  }
}

// --- Vocab deck detail page ---

let _deckWords = [];

async function loadVocabDeckDetail() {
  const params = new URLSearchParams(window.location.search);
  const deckId = params.get('id');
  if (!deckId) {
    showToast('缺少词书 ID', 'error');
    return;
  }

  try {
    const deck = await api.get(`/apps/vocab/decks/${deckId}`);

    document.title = `Ark Admin · ${deck.name}`;
    document.getElementById('deck-breadcrumb').textContent = deck.name;
    document.getElementById('deck-name').textContent = deck.name;
    document.getElementById('deck-description').textContent = deck.description;
    document.getElementById('deck-word-count').textContent = `${deck.word_count.toLocaleString()} 词`;

    _deckWords = deck.words || [];
    renderDeckWords(_deckWords);

    // Search
    const searchInput = document.getElementById('word-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        if (!q) {
          renderDeckWords(_deckWords);
        } else {
          renderDeckWords(_deckWords.filter(w =>
            w.word.toLowerCase().includes(q) ||
            w.translations.some(t => t.translation.toLowerCase().includes(q))
          ));
        }
      });
    }

    // Delete button
    initDeckActions(deckId, deck.name);
  } catch (e) {
    showToast('加载词书详情失败: ' + e.message, 'error');
  }
}

function initDeckActions(deckId, deckName) {
  // Delete with confirmation
  const btnDelete = document.getElementById('btn-delete');
  const confirmOverlay = document.getElementById('confirm-delete');
  const confirmName = document.getElementById('confirm-deck-name');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');

  if (btnDelete && confirmOverlay) {
    btnDelete.addEventListener('click', () => {
      confirmName.textContent = deckName;
      confirmOverlay.classList.add('active');
    });
    confirmCancel?.addEventListener('click', () => confirmOverlay.classList.remove('active'));
    confirmOverlay.addEventListener('click', (e) => {
      if (e.target === confirmOverlay) confirmOverlay.classList.remove('active');
    });
    confirmOk?.addEventListener('click', async () => {
      confirmOk.disabled = true;
      confirmOk.textContent = '删除中...';
      try {
        await api.delete(`/apps/vocab/decks/${deckId}`);
        showToast(`已删除: ${deckName}`, 'success');
        window.location.href = 'apps-vocab.html';
      } catch (e) {
        showToast('删除失败: ' + e.message, 'error');
        confirmOk.disabled = false;
        confirmOk.textContent = '确认删除';
      }
    });
  }

  // Update (re-upload JSON)
  const btnUpdate = document.getElementById('btn-update');
  const fileUpdate = document.getElementById('file-update');
  if (btnUpdate && fileUpdate) {
    btnUpdate.addEventListener('click', () => fileUpdate.click());
    fileUpdate.addEventListener('change', async () => {
      const file = fileUpdate.files[0];
      if (!file) return;
      fileUpdate.value = '';

      const formData = new FormData();
      formData.append('file', file);

      const token = getAuthToken();
      if (!token) { window.location.href = '/#/login'; return; }

      try {
        showToast('正在更新...', 'info');
        const resp = await fetch(`${API_BASE}/apps/vocab/decks/${deckId}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${resp.status}`);
        }
        const result = await resp.json();
        showToast(`更新成功: ${result.name}（${result.word_count} 词）`, 'success');
        // Reload page to show new data
        window.location.reload();
      } catch (e) {
        showToast('更新失败: ' + e.message, 'error');
      }
    });
  }
}

function renderDeckWords(words) {
  const tbody = document.getElementById('words-tbody');
  if (!tbody) return;

  if (!words.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">暂无单词</td></tr>';
    return;
  }

  tbody.innerHTML = words.map((w, i) => {
    const pron = [w.us_pronunciation, w.uk_pronunciation].filter(Boolean).join(' / ') || '—';
    const translations = w.translations.length
      ? w.translations.map(t => {
          const pos = t.pos ? `<span class="pos-tag">${t.pos}</span>` : '';
          return `${pos}<span class="translation-tag">${t.translation}</span>`;
        }).join('')
      : '<span style="color:var(--muted);">—</span>';

    return `
      <tr>
        <td style="color:var(--muted);font-family:var(--font-mono);">${i + 1}</td>
        <td style="font-weight:500;">${w.word}</td>
        <td class="pronunciation">${pron}</td>
        <td>${translations}</td>
      </tr>
    `;
  }).join('');
}
