// backend/web/admin/js/dashboard.js
// Dashboard page logic

document.addEventListener('DOMContentLoaded', async () => {
  if (!initPage()) return;

  await Promise.all([
    loadOverview(),
    loadCheckinStats(),
    loadFocusStats(),
  ]);
});

async function loadOverview() {
  try {
    const data = await api.get('/stats/overview');
    const cards = document.querySelectorAll('.stat-card');
    if (cards.length >= 4) {
      cards[0].querySelector('.val').textContent = data.total_users.toLocaleString();
      cards[1].querySelector('.val').textContent = data.today_new.toLocaleString();
      cards[2].querySelector('.val').textContent = data.verification_rate + '%';
      cards[3].querySelector('.val').textContent = data.active_7d.toLocaleString();
    }
  } catch (e) {
    showToast('加载用户概览失败', 'error');
  }
}

async function loadCheckinStats() {
  try {
    const data = await api.get('/stats/checkin');
    // Update checkin rate
    const rateEl = document.querySelector('[data-checkin-rate]');
    if (rateEl) rateEl.textContent = data.today_rate + '%';

    // Update top 5 list
    const listEl = document.querySelector('[data-checkin-top5]');
    if (listEl) {
      listEl.innerHTML = data.top5.map((u, i) => `
        <div class="list-item">
          <div class="row">
            <div style="width:24px;height:24px;border-radius:50%;background:var(--surface-warm);display:grid;place-items:center;font-size:12px;font-weight:600;">${i + 1}</div>
            <span style="font-size:14px;">${u.username}</span>
          </div>
          <span class="pill">${u.streak_days} 天</span>
        </div>
      `).join('');
    }
  } catch (e) {
    showToast('加载签到数据失败', 'error');
  }
}

async function loadFocusStats() {
  try {
    const data = await api.get('/stats/focus');
    // Update focus metrics
    const totalEl = document.querySelector('[data-focus-total]');
    const avgEl = document.querySelector('[data-focus-avg]');
    if (totalEl) totalEl.textContent = data.today_total_minutes.toLocaleString() + 'min';
    if (avgEl) avgEl.textContent = data.today_avg_minutes + 'min';

    // Update bar chart
    const chartEl = document.querySelector('[data-focus-chart]');
    if (chartEl) {
      const maxVal = Math.max(...data.trend.map(d => d.minutes), 1);
      chartEl.innerHTML = data.trend.map(d => {
        const pct = Math.round((d.minutes / maxVal) * 100);
        const isLast = d === data.trend[data.trend.length - 1];
        return `<div style="flex:1;background:${isLast ? 'var(--accent)' : 'var(--accent-soft)'};height:${Math.max(pct, 3)}%;border-radius:4px 4px 0 0;"></div>`;
      }).join('');
    }

    const labelsEl = document.querySelector('[data-focus-labels]');
    if (labelsEl) {
      labelsEl.innerHTML = data.trend.map(d => `<span>${d.label}</span>`).join('');
    }
  } catch (e) {
    showToast('加载专注数据失败', 'error');
  }
}
