// backend/web/admin/js/users.js
// User management page logic
/* global api, formatDate, getCurrentUser, initPage, renderPagination, showConfirm, showResult, showToast */

let currentPage = 1;
let currentSearch = '';
let currentStatus = 'all';
const PAGE_SIZE = 20;

document.addEventListener('DOMContentLoaded', () => {
  if (!initPage()) return;

  // Search form
  const searchForm = document.getElementById('user-search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      currentSearch = document.getElementById('user-search-input').value.trim();
      currentStatus = document.getElementById('user-status-filter').value;
      currentPage = 1;
      loadUsers();
    });
  }

  loadUsers();
});

async function loadUsers() {
  try {
    const params = new URLSearchParams({
      page: currentPage,
      page_size: PAGE_SIZE,
      search: currentSearch,
      status: currentStatus,
    });
    const data = await api.get(`/users?${params}`);
    renderUserTable(data.users);
    renderPagination(
      document.getElementById('pagination'),
      data.page,
      Math.ceil(data.total / data.page_size),
      (p) => { currentPage = p; loadUsers(); }
    );
  } catch (e) {
    showToast('加载用户列表失败', 'error');
  }
}

/**
 * Render an action button for permission-related operations.
 */
function renderPermissionButton(label, onClick, disabled) {
  const disabledAttrs = disabled
    ? 'disabled title="不能管理自己的权限" style="font-size:12px;padding:4px 8px;opacity:0.45;cursor:not-allowed;"'
    : 'style="font-size:12px;padding:4px 8px;"';
  const clickHandler = disabled ? '' : ` onclick="${onClick}"`;
  return `<button class="btn btn-ghost"${clickHandler} ${disabledAttrs}>${label}</button>`;
}

/**
 * Render the user table rows.
 */
function renderUserTable(users) {
  const tbody = document.getElementById('user-table-body');
  if (!tbody) return;
  const currentUserGetter = globalThis['getCurrentUser'];
  const currentUser = typeof currentUserGetter === 'function' ? currentUserGetter() : null;
  const currentUserId = Number(currentUser?.id);

  tbody.innerHTML = users.map((u) => {
    const isSelf = currentUserId === Number(u.id);
    return `
      <tr>
        <td>${u.id}</td>
        <td>
          <div style="font-weight:500;">${u.username}</div>
          <div style="font-size:12px;color:var(--muted);">${u.email || '-'}</div>
        </td>
        <td><span class="pill" style="background:${u.email_verified ? 'color-mix(in oklch, var(--success) 14%, transparent)' : 'var(--accent-soft)'};color:${u.email_verified ? 'var(--success)' : 'var(--muted)'};">${u.email_verified ? '已验证' : '未验证'}</span></td>
        <td>${u.is_admin ? '<span class="pill">管理员</span>' : '-'}</td>
        <td><span class="pill" style="background:${u.is_active ? 'color-mix(in oklch, var(--success) 14%, transparent)' : 'color-mix(in oklch, var(--danger) 14%, transparent)'};color:${u.is_active ? 'var(--success)' : 'var(--danger)'};">${u.is_active ? '启用' : '禁用'}</span></td>
        <td style="font-family:var(--font-mono);font-size:13px;">${formatDate(u.created_at)}</td>
        <td>
          <div style="display:flex;gap:4px;">
            ${renderPermissionButton(u.is_admin ? '取消管理员' : '设为管理员', `toggleAdmin(${u.id}, ${u.is_admin})`, isSelf)}
            ${renderPermissionButton(u.is_active ? '禁用' : '启用', `toggleActive(${u.id}, ${u.is_active})`, isSelf)}
            <button class="btn btn-ghost" style="font-size:12px;padding:4px 8px;" onclick="resetPassword(${u.id}, '${u.username}')">重置密码</button>
            <button class="btn btn-ghost" style="font-size:12px;padding:4px 8px;color:var(--danger);" onclick="deleteUser(${u.id}, '${u.username}')">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleAdmin(userId, isAdmin) {
  const action = isAdmin ? '取消管理员权限' : '设为管理员';
  const confirmed = await showConfirm('确认操作', `确定要${action}吗？`);
  if (!confirmed) return;

  try {
    await api.patch(`/users/${userId}`, { is_admin: !isAdmin });
    showToast('操作成功', 'success');
    loadUsers();
  } catch (e) {
    showToast('操作失败: ' + e.message, 'error');
  }
}

async function toggleActive(userId, isActive) {
  const action = isActive ? '禁用' : '启用';
  const confirmed = await showConfirm('确认操作', `确定要${action}该用户吗？`);
  if (!confirmed) return;

  try {
    await api.patch(`/users/${userId}`, { is_active: !isActive });
    showToast('操作成功', 'success');
    loadUsers();
  } catch (e) {
    showToast('操作失败: ' + e.message, 'error');
  }
}

async function resetPassword(userId, username) {
  const confirmed = await showConfirm('重置密码', `确定要重置用户 "${username}" 的密码吗？该用户的所有登录会话将失效。`);
  if (!confirmed) return;

  try {
    const data = await api.post(`/users/${userId}/reset-password`);
    showResult('密码已重置', `
      <p>用户 <strong>${username}</strong> 的临时密码为：</p>
      <div style="background:var(--surface-warm);padding:12px;border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:16px;word-break:break-all;margin:12px 0;">${data.temp_password}</div>
      <p style="font-size:12px;color:var(--muted);">请将此密码发送给用户，用户登录后应立即修改密码。</p>
    `);
  } catch (e) {
    showToast('重置失败: ' + e.message, 'error');
  }
}

async function deleteUser(userId, username) {
  const confirmed = await showConfirm('删除用户', `确定要删除用户 "${username}" 吗？此操作不可撤销。`);
  if (!confirmed) return;

  try {
    await api.delete(`/users/${userId}`);
    showToast('用户已删除', 'success');
    loadUsers();
  } catch (e) {
    showToast('删除失败: ' + e.message, 'error');
  }
}
