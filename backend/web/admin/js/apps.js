// backend/web/admin/js/apps.js
// Sub-app pages logic

document.addEventListener('DOMContentLoaded', () => {
  if (!initPage()) return;

  const page = window.location.pathname.split('/').pop();
  if (page === 'apps.html') loadAppsGrid();
  else if (page === 'apps-vocab.html') loadVocabDetail();
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
    const tbody = document.querySelector('[data-vocab-decks]');
    if (tbody) {
      tbody.innerHTML = decks.map(d => `
        <tr>
          <td style="font-weight:500;">${d.name}</td>
          <td style="font-family:var(--font-mono);">${d.word_count.toLocaleString()}</td>
          <td style="font-family:var(--font-mono);">${d.learner_count.toLocaleString()}</td>
        </tr>
      `).join('');
    }
  } catch (e) {
    showToast('加载词汇数据失败', 'error');
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
