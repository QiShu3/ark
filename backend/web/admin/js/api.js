// backend/web/admin/js/api.js
// API client for Ark Admin Panel

const API_BASE = '/api/admin';

/**
 * Read the auth token from the main app's localStorage.
 * The main app stores { state: { token: "...", user: {...} } } under key "ark-auth".
 */
function getAuthToken() {
  try {
    const raw = localStorage.getItem('ark-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
}

/**
 * Read the current user object from localStorage.
 */
function getCurrentUser() {
  try {
    const raw = localStorage.getItem('ark-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.user || null;
  } catch {
    return null;
  }
}

/**
 * Make an authenticated API request.
 * Returns parsed JSON on success. Throws on network/HTTP errors.
 */
async function adminFetch(path, options = {}) {
  const token = getAuthToken();
  if (!token) {
    window.location.href = '/#/login';
    throw new Error('No auth token');
  }

  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (resp.status === 401) {
    localStorage.removeItem('ark-auth');
    window.location.href = '/#/login';
    throw new Error('Unauthorized');
  }

  if (resp.status === 403) {
    window.location.href = '/#/';
    throw new Error('Forbidden');
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${resp.status}`);
  }

  return resp.json();
}

// Convenience methods
const api = {
  get: (path) => adminFetch(path),
  post: (path, data) => adminFetch(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data) => adminFetch(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (path, data) => adminFetch(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => adminFetch(path, { method: 'DELETE' }),
};
