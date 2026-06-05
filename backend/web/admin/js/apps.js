// backend/web/admin/js/apps.js
// Sub-app pages logic

document.addEventListener('DOMContentLoaded', () => {
  if (!initPage()) return;

  const page = window.location.pathname.split('/').pop();
  if (page === 'apps.html') loadAppsGrid();
  else if (page === 'apps-vocab.html') loadVocabDetail();
  else if (page === 'apps-vocab-deck.html') loadVocabDeckDetail();
  else if (page === 'apps-erc.html') loadErcDetail();
  else if (page === 'apps-erc-set.html') loadErcSetDetail();
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
    renderErcSetTable(sets);

    // Bind toolbar buttons
    initErcToolbar();
  } catch (e) {
    showToast('加载ERC数据失败', 'error');
  }
}

function renderErcSetTable(sets) {
  const tbody = document.querySelector('[data-erc-sets]');
  if (!tbody) return;
  tbody.innerHTML = sets.map(s => {
    const pubClass = s.is_published ? 'published' : 'unpublished';
    const pubLabel = s.is_published ? '已上架' : '未上架';
    return `
      <tr>
        <td><a href="apps-erc-set.html?id=${s.id}" style="font-weight:500;color:var(--accent);text-decoration:none;">${s.name}</a></td>
        <td style="font-family:var(--font-mono);">${s.article_count.toLocaleString()}</td>
        <td style="font-family:var(--font-mono);">${s.attempt_count.toLocaleString()}</td>
        <td>
          <button class="toggle-btn ${pubClass}" data-set-id="${s.id}" data-action="toggle-erc-publish" type="button">
            <span class="toggle-dot"></span>${pubLabel}
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Bind toggle buttons
  tbody.querySelectorAll('[data-action="toggle-erc-publish"]').forEach(btn => {
    btn.addEventListener('click', () => handleErcTogglePublish(btn));
  });
}

async function handleErcTogglePublish(btn) {
  const setId = btn.dataset.setId;
  btn.disabled = true;
  try {
    const result = await api.patch(`/apps/erc/sets/${setId}/publish`);
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

function initErcToolbar() {
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
    fileInput.addEventListener('change', () => handleErcFileImport(fileInput));
  }
}

async function handleErcFileImport(fileInput) {
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
    const resp = await fetch(`${API_BASE}/apps/erc/import`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body.detail || `HTTP ${resp.status}`);
    }

    const result = await resp.json();
    showToast(`导入成功: ${result.set_name}（${result.article_count} 篇文章，${result.question_count} 题）`, 'success');

    // Reload set list
    const sets = await api.get('/apps/erc/sets');
    renderErcSetTable(sets);
  } catch (e) {
    showToast('导入失败: ' + e.message, 'error');
  }
}

// --- Vocab deck detail page ---

let _deckWords = [];
let _currentPage = 1;
const _pageSize = 30;
let _totalWordsCount = 0;
let _totalPages = 1;
let _searchQuery = '';
let _searchTimeout = null;
let _currentDeckId = null;

async function loadVocabDeckDetail() {
  const params = new URLSearchParams(window.location.search);
  const deckId = params.get('id');
  if (!deckId) {
    showToast('缺少词书 ID', 'error');
    return;
  }
  _currentDeckId = deckId;

  // Search
  const searchInput = document.getElementById('word-search');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', () => {
      clearTimeout(_searchTimeout);
      _searchTimeout = setTimeout(() => {
        _searchQuery = searchInput.value.trim();
        _currentPage = 1; // reset to first page on search
        fetchAndRenderDeckWords();
      }, 300);
    });
  }

  // Bind actions
  initDeckActions(deckId);

  // Load first page
  await fetchAndRenderDeckWords();
}

async function fetchAndRenderDeckWords() {
  if (!_currentDeckId) return;

  try {
    const searchParam = _searchQuery ? `&search=${encodeURIComponent(_searchQuery)}` : '';
    const deck = await api.get(`/apps/vocab/decks/${_currentDeckId}?page=${_currentPage}&limit=${_pageSize}${searchParam}`);

    document.title = `Ark Admin · ${deck.name}`;
    document.getElementById('deck-breadcrumb').textContent = deck.name;
    document.getElementById('deck-name').textContent = deck.name;
    document.getElementById('deck-description').textContent = deck.description;

    let countLabel = `${deck.word_count.toLocaleString()} 词`;
    if (_searchQuery) {
      countLabel = `找到 ${deck.total_words.toLocaleString()} 词 / 共 ${deck.word_count.toLocaleString()} 词`;
    }
    document.getElementById('deck-word-count').textContent = countLabel;

    _deckWords = deck.words || [];
    _totalWordsCount = deck.total_words;
    _totalPages = deck.total_pages;
    _currentPage = deck.page;

    renderDeckWords(_deckWords);
    renderPagination();

    // Bind delete button once name is loaded
    const btnDelete = document.getElementById('btn-delete');
    if (btnDelete && !btnDelete.dataset.bound) {
      btnDelete.dataset.bound = 'true';
      const confirmOverlay = document.getElementById('confirm-delete');
      const confirmName = document.getElementById('confirm-deck-name');
      const confirmOk = document.getElementById('confirm-ok');
      const confirmCancel = document.getElementById('confirm-cancel');

      btnDelete.addEventListener('click', () => {
        confirmName.textContent = deck.name;
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
          await api.delete(`/apps/vocab/decks/${_currentDeckId}`);
          showToast(`已删除: ${deck.name}`, 'success');
          window.location.href = 'apps-vocab.html';
        } catch (e) {
          showToast('删除失败: ' + e.message, 'error');
          confirmOk.disabled = false;
          confirmOk.textContent = '确认删除';
        }
      });
    }
  } catch (e) {
    showToast('加载词书详情失败: ' + e.message, 'error');
  }
}

function initDeckActions(deckId) {
  // Update (re-upload JSON)
  const btnUpdate = document.getElementById('btn-update');
  const fileUpdate = document.getElementById('file-update');
  if (btnUpdate && fileUpdate && !btnUpdate.dataset.bound) {
    btnUpdate.dataset.bound = 'true';
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
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无单词</td></tr>';
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

    const sentences = w.sentences.length
      ? `
          <div class="sentence-container">
            <div class="sentence-en">${w.sentences[0].sentence}</div>
            <div class="sentence-zh">${w.sentences[0].translation}</div>
          </div>
        `
      : '<span style="color:var(--muted);">—</span>';

    return `
      <tr>
        <td style="color:var(--muted);font-family:var(--font-mono);">${(_currentPage - 1) * _pageSize + (i + 1)}</td>
        <td style="font-weight:500;">${w.word}</td>
        <td class="pronunciation">${pron}</td>
        <td>${translations}</td>
        <td>${sentences}</td>
      </tr>
    `;
  }).join('');
}

function renderPagination() {
  const container = document.getElementById('pagination-controls');
  if (!container) return;

  if (_totalPages <= 1) {
    container.innerHTML = `<span class="pagination-info">共 ${_totalWordsCount} 个单词</span>`;
    return;
  }

  let html = '';
  // Prev button
  html += `<button class="pagination-btn" ${_currentPage === 1 ? 'disabled' : ''} data-page="${_currentPage - 1}">上一页</button>`;

  // Page Numbers
  const range = 2;
  let startPage = Math.max(1, _currentPage - range);
  let endPage = Math.min(_totalPages, _currentPage + range);

  if (startPage > 1) {
    html += `<button class="pagination-btn ${_currentPage === 1 ? 'active' : ''}" data-page="1">1</button>`;
    if (startPage > 2) {
      html += `<span style="padding: 0 4px; color: var(--muted);">...</span>`;
    }
  }

  for (let p = startPage; p <= endPage; p++) {
    html += `<button class="pagination-btn ${_currentPage === p ? 'active' : ''}" data-page="${p}">${p}</button>`;
  }

  if (endPage < _totalPages) {
    if (endPage < _totalPages - 1) {
      html += `<span style="padding: 0 4px; color: var(--muted);">...</span>`;
    }
    html += `<button class="pagination-btn ${_currentPage === _totalPages ? 'active' : ''}" data-page="${_totalPages}">${_totalPages}</button>`;
  }

  // Next button
  html += `<button class="pagination-btn" ${_currentPage === _totalPages ? 'disabled' : ''} data-page="${_currentPage + 1}">下一页</button>`;

  // Info
  html += `<span class="pagination-info">第 ${_currentPage} / ${_totalPages} 页 (共 ${_totalWordsCount} 词)</span>`;

  container.innerHTML = html;

  // Event Listeners
  container.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page, 10);
      if (page && page >= 1 && page <= _totalPages && page !== _currentPage) {
        _currentPage = page;
        fetchAndRenderDeckWords();
      }
    });
  });
}

// --- ERC set detail page ---

let _ercArticles = [];

async function loadErcSetDetail() {
  const params = new URLSearchParams(window.location.search);
  const setId = params.get('id');
  if (!setId) {
    showToast('缺少阅读集 ID', 'error');
    return;
  }

  try {
    // Fetch set info and articles
    const [setInfo, articles] = await Promise.all([
      api.get(`/apps/erc/sets`).then(sets => sets.find(s => s.id === setId)),
      api.get(`/apps/erc/sets/${setId}/articles`),
    ]);

    if (!setInfo) {
      showToast('阅读集不存在', 'error');
      return;
    }

    document.title = `Ark Admin · ${setInfo.name}`;
    document.getElementById('set-breadcrumb').textContent = setInfo.name;
    document.getElementById('set-name').textContent = setInfo.name;
    document.getElementById('set-article-count').textContent = `${setInfo.article_count} 篇文章`;
    document.getElementById('set-question-count').textContent = `${setInfo.attempt_count} 次做题`;

    _ercArticles = articles || [];
    renderErcArticles(_ercArticles);

    // Search
    const searchInput = document.getElementById('article-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        if (!q) {
          renderErcArticles(_ercArticles);
        } else {
          renderErcArticles(_ercArticles.filter(a =>
            a.article_id.toLowerCase().includes(q) ||
            a.title.toLowerCase().includes(q)
          ));
        }
      });
    }

    // Delete button
    initErcSetActions(setId, setInfo.name);
  } catch (e) {
    showToast('加载阅读集详情失败: ' + e.message, 'error');
  }
}

function initErcSetActions(setId, setName) {
  // Delete with confirmation
  const btnDelete = document.getElementById('btn-delete');
  const confirmOverlay = document.getElementById('confirm-delete');
  const confirmName = document.getElementById('confirm-set-name');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');

  if (btnDelete && confirmOverlay) {
    btnDelete.addEventListener('click', () => {
      confirmName.textContent = setName;
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
        await api.delete(`/apps/erc/sets/${setId}`);
        showToast(`已删除: ${setName}`, 'success');
        window.location.href = 'apps-erc.html';
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
        const resp = await fetch(`${API_BASE}/apps/erc/import`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${resp.status}`);
        }
        const result = await resp.json();
        showToast(`更新成功: ${result.set_name}（${result.article_count} 篇文章）`, 'success');
        window.location.reload();
      } catch (e) {
        showToast('更新失败: ' + e.message, 'error');
      }
    });
  }
}

function renderErcArticles(articles) {
  const tbody = document.getElementById('articles-tbody');
  if (!tbody) return;

  if (!articles.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无文章</td></tr>';
    return;
  }

  tbody.innerHTML = articles.map((a, i) => `
    <tr>
      <td style="color:var(--muted);font-family:var(--font-mono);">${i + 1}</td>
      <td style="font-family:var(--font-mono);font-size:12px;">${a.article_id}</td>
      <td style="font-family:var(--font-mono);">${a.year}</td>
      <td style="font-family:var(--font-mono);">${a.text_no}</td>
      <td style="font-weight:500;">${a.title || '—'}</td>
      <td style="font-family:var(--font-mono);">${a.question_count}</td>
    </tr>
  `).join('');
}
