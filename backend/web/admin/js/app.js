// backend/web/admin/js/app.js
// Global logic for Ark Admin Panel

/**
 * Check if current user is admin. Redirect to home if not.
 * Call this at the top of every page's script.
 */
function requireAdmin() {
  const user = getCurrentUser();
  if (!user) {
    // Not logged in — redirect to main app login
    window.location.href = '/#/';
    return false;
  }
  if (!user.is_admin) {
    // Logged in but not admin — redirect to main app home
    window.location.href = '/#/';
    return false;
  }
  return true;
}

/**
 * Set the active nav item in the sidebar based on current page filename.
 */
function initSidebar() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach((item) => {
    const href = item.getAttribute('href');
    if (href === currentPage) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

/**
 * Show a toast notification at the bottom-right of the screen.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration - ms
 */
function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:10000;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }

  const colors = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--accent)' };
  const toast = document.createElement('div');
  toast.style.cssText = `background:${colors[type] || colors.info};color:white;padding:12px 20px;border-radius:var(--radius-sm);font-size:14px;font-family:var(--font-body);box-shadow:0 4px 12px rgba(0,0,0,0.15);opacity:0;transform:translateY(10px);transition:all 0.3s ease;`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Show a confirmation modal.
 * Returns a Promise that resolves to true (confirm) or false (cancel).
 */
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;display:grid;place-items:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:32px;max-width:400px;width:90%;';
    dialog.innerHTML = `
      <h3 style="margin:0 0 12px;font-size:20px;">${title}</h3>
      <p style="margin:0 0 24px;color:var(--fg-2);font-size:14px;">${message}</p>
      <div style="display:flex;gap:12px;justify-content:flex-end;">
        <button class="btn btn-secondary" data-action="cancel">取消</button>
        <button class="btn btn-primary" data-action="confirm" style="background:var(--danger);">确认</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    dialog.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'confirm') {
        overlay.remove();
        resolve(true);
      } else if (action === 'cancel') {
        overlay.remove();
        resolve(false);
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
  });
}

/**
 * Show a result modal (e.g., after reset password shows the temp password).
 */
function showResult(title, content) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;display:grid;place-items:center;';

  const dialog = document.createElement('div');
  dialog.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:32px;max-width:400px;width:90%;';
  dialog.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:20px;">${title}</h3>
    <div style="margin:0 0 24px;color:var(--fg-2);font-size:14px;">${content}</div>
    <div style="display:flex;justify-content:flex-end;">
      <button class="btn btn-primary" data-action="close">关闭</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  dialog.addEventListener('click', (e) => {
    if (e.target.dataset.action === 'close') overlay.remove();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

/**
 * Format a date string for display.
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * Create a pagination control and insert into container.
 * @param {HTMLElement} container
 * @param {number} currentPage - 1-based
 * @param {number} totalPages
 * @param {function(number)} onPageChange
 */
function renderPagination(container, currentPage, totalPages, onPageChange) {
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const makeBtn = (label, page, disabled = false) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.style.cssText = 'padding:6px 12px;font-size:13px;';
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled) {
      btn.addEventListener('click', () => onPageChange(page));
    }
    return btn;
  };

  container.appendChild(makeBtn('上一页', currentPage - 1, currentPage <= 1));

  const info = document.createElement('span');
  info.style.cssText = 'font-size:13px;color:var(--muted);padding:0 12px;';
  info.textContent = `${currentPage} / ${totalPages}`;
  container.appendChild(info);

  container.appendChild(makeBtn('下一页', currentPage + 1, currentPage >= totalPages));
}

/**
 * Init common elements on every page. Call from each page's DOMContentLoaded.
 */
function initPage() {
  if (!requireAdmin()) return false;
  initSidebar();
  return true;
}
