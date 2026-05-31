# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin panel for Ark — a standalone static HTML + vanilla JS backend served by FastAPI, with APIs for dashboard stats and user management CRUD.

**Architecture:** Static HTML pages in `backend/web/admin/` served via `StaticFiles(html=True)` at `/admin`. Backend API at `/api/admin/*` in a new `admin_routes.py` using the shared `auth_pool`. Frontend JS reads the auth token from the main app's localStorage (`ark-auth`) to authenticate API calls.

**Tech Stack:** Pure HTML + CSS + vanilla JS (zero dependencies), FastAPI + asyncpg (existing patterns), warm beige design system from prototype.

**Spec:** `docs/superpowers/specs/2026-05-31-admin-panel-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Move | `backend/web/admin/index.html` | Dashboard — user overview + check-in/focus stats |
| Move | `backend/web/admin/apps.html` | Sub-app grid (vocab, ERC cards) |
| Move | `backend/web/admin/apps-vocab.html` | Vocab management detail |
| Move | `backend/web/admin/apps-erc.html` | ERC management detail |
| Move | `backend/web/admin/users.html` | User management table |
| Move | `backend/web/admin/templates.html` | Template store |
| Move | `backend/web/admin/css/common.css` | Shared design system |
| Create | `backend/web/admin/js/api.js` | API client — fetch wrapper with auth token |
| Create | `backend/web/admin/js/app.js` | Global logic — auth check, sidebar, toast, modal |
| Create | `backend/web/admin/js/dashboard.js` | Dashboard page — stats loading + rendering |
| Create | `backend/web/admin/js/users.js` | Users page — table, search, filter, CRUD actions |
| Create | `backend/web/admin/js/apps.js` | Apps page — grid loading, sub-app detail rendering |
| Create | `backend/routes/admin_routes.py` | All `/api/admin/*` endpoints |
| Modify | `backend/main.py` | Mount static files + register admin router |

---

## Task 1: Move Prototype Files

**Files:**
- Create: `backend/web/admin/` (directory)
- Move: `backend/temp/Web-Prototype/*` → `backend/web/admin/`

- [ ] **Step 1: Create target directory and move files**

```bash
mkdir -p backend/web/admin
cp -r backend/temp/Web-Prototype/* backend/web/admin/
```

- [ ] **Step 2: Verify file structure**

```bash
find backend/web/admin -type f | sort
```

Expected:
```
backend/web/admin/apps-erc.html
backend/web/admin/apps-vocab.html
backend/web/admin/apps.html
backend/web/admin/css/common.css
backend/web/admin/index.html
backend/web/admin/templates.html
backend/web/admin/users.html
```

- [ ] **Step 3: Verify HTML renders correctly by opening in browser**

No code changes — just confirm the static files are intact.

- [ ] **Step 4: Commit**

```bash
git add backend/web/admin/
git commit -m "feat(admin): move design prototype to backend/web/admin"
```

---

## Task 2: Create API Client (`js/api.js`)

**Files:**
- Create: `backend/web/admin/js/api.js`

This module wraps `fetch()` with automatic Bearer token injection (reading from the main app's `ark-auth` localStorage key) and error handling.

- [ ] **Step 1: Create `api.js`**

```javascript
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
  patch: (path, data) => adminFetch(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => adminFetch(path, { method: 'DELETE' }),
};
```

- [ ] **Step 2: Commit**

```bash
git add backend/web/admin/js/api.js
git commit -m "feat(admin): add API client with auth token handling"
```

---

## Task 3: Create Global App Logic (`js/app.js`)

**Files:**
- Create: `backend/web/admin/js/app.js`

Handles: admin auth check on page load, sidebar active state, toast notifications, modal dialogs.

- [ ] **Step 1: Create `app.js`**

```javascript
// backend/web/admin/js/app.js
// Global logic for Ark Admin Panel

/**
 * Check if current user is admin. Redirect to home if not.
 * Call this at the top of every page's script.
 */
function requireAdmin() {
  const user = getCurrentUser();
  if (!user || !user.is_admin) {
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/web/admin/js/app.js
git commit -m "feat(admin): add global app logic — auth check, sidebar, toast, modal"
```

---

## Task 4: Create Backend Admin Routes (`admin_routes.py`) — Dashboard APIs

**Files:**
- Create: `backend/routes/admin_routes.py`

This task creates the route file with the admin guard dependency and the three dashboard stats endpoints.

- [ ] **Step 1: Create `admin_routes.py` with imports, pool helper, and admin guard**

```python
# backend/routes/admin_routes.py
"""Admin panel API routes — /api/admin/*"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from routes.auth_routes import _AuthUser, get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _pool(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
    return pool


async def _require_admin(
    user: Annotated[_AuthUser, Depends(get_current_user)],
) -> _AuthUser:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
```

- [ ] **Step 2: Add dashboard stats — overview endpoint**

Append to `admin_routes.py`:

```python
class StatsOverview(BaseModel):
    total_users: int
    today_new: int
    verification_rate: float
    active_7d: int


@router.get("/stats/overview", response_model=StatsOverview)
async def stats_overview(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> StatsOverview:
    pool = _pool(request)
    today = date.today()
    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM auth_users")
        today_new = await conn.fetchval(
            "SELECT COUNT(*) FROM auth_users WHERE created_at::date = $1", today
        )
        verified = await conn.fetchval(
            "SELECT COUNT(*) FROM auth_users WHERE email_verified_at IS NOT NULL"
        )
        active_7d = await conn.fetchval(
            "SELECT COUNT(*) FROM auth_users WHERE created_at >= $1",
            today - timedelta(days=7),
        )
    rate = (verified / total * 100) if total > 0 else 0.0
    return StatsOverview(
        total_users=total,
        today_new=today_new,
        verification_rate=round(rate, 1),
        active_7d=active_7d,
    )
```

- [ ] **Step 3: Add dashboard stats — checkin endpoint**

Append to `admin_routes.py`:

```python
class CheckinUser(BaseModel):
    username: str
    streak_days: int


class StatsCheckin(BaseModel):
    today_rate: float
    top5: list[CheckinUser]


@router.get("/stats/checkin", response_model=StatsCheckin)
async def stats_checkin(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> StatsCheckin:
    pool = _pool(request)
    today = date.today()
    async with pool.acquire() as conn:
        total_users = await conn.fetchval("SELECT COUNT(*) FROM auth_users")
        today_count = await conn.fetchval(
            "SELECT COUNT(*) FROM user_checkins WHERE checkin_date = $1", today
        )
        # Calculate consecutive streaks for top 5
        top5_rows = await conn.fetch(
            """
            WITH streaks AS (
                SELECT user_id, COUNT(*) AS streak_days
                FROM (
                    SELECT user_id, checkin_date,
                           checkin_date - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY checkin_date)::int AS grp
                    FROM user_checkins
                    WHERE checkin_date <= $1
                ) sub
                WHERE grp = $1 - (streak_days - 1) * INTERVAL '1 day'
                   OR grp = (SELECT MAX(grp) FROM (
                       SELECT checkin_date - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY checkin_date)::int AS grp
                       FROM user_checkins WHERE user_id = sub.user_id AND checkin_date <= $1
                   ) x)
                GROUP BY user_id
            )
            SELECT u.username, s.streak_days
            FROM streaks s
            JOIN auth_users u ON u.id = s.user_id
            ORDER BY s.streak_days DESC
            LIMIT 5
            """,
            today,
        )

    rate = (today_count / total_users * 100) if total_users > 0 else 0.0
    top5 = [CheckinUser(username=r["username"], streak_days=r["streak_days"]) for r in top5_rows]
    return StatsCheckin(today_rate=round(rate, 1), top5=top5)
```

- [ ] **Step 4: Add dashboard stats — focus endpoint**

Append to `admin_routes.py`:

```python
class FocusTrendPoint(BaseModel):
    label: str
    minutes: int


class StatsFocus(BaseModel):
    today_total_minutes: int
    today_avg_minutes: int
    trend: list[FocusTrendPoint]


@router.get("/stats/focus", response_model=StatsFocus)
async def stats_focus(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> StatsFocus:
    pool = _pool(request)
    today = date.today()
    week_days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    async with pool.acquire() as conn:
        # Today's focus stats from focus_logs
        row = await conn.fetchrow(
            """
            SELECT COALESCE(SUM(duration), 0) AS total_ms,
                   COUNT(DISTINCT user_id) AS user_count
            FROM focus_logs
            WHERE created_at::date = $1
            """,
            today,
        )
        total_ms = row["total_ms"]
        user_count = row["user_count"]
        total_minutes = total_ms // 60000
        avg_minutes = (total_minutes // user_count) if user_count > 0 else 0

        # Last 7 days trend
        trend_rows = await conn.fetch(
            """
            SELECT created_at::date AS day, SUM(duration) AS total_ms
            FROM focus_logs
            WHERE created_at::date >= $1 AND created_at::date <= $2
            GROUP BY created_at::date
            ORDER BY day
            """,
            today - timedelta(days=6),
            today,
        )

    trend_map = {r["day"]: r["total_ms"] // 60000 for r in trend_rows}
    trend = []
    for i in range(7):
        d = today - timedelta(days=6 - i)
        label = week_days[d.weekday()]
        trend.append(FocusTrendPoint(label=label, minutes=trend_map.get(d, 0)))

    return StatsFocus(
        today_total_minutes=total_minutes,
        today_avg_minutes=avg_minutes,
        trend=trend,
    )
```

- [ ] **Step 5: Run lint check**

```bash
cd backend && uv run ruff check routes/admin_routes.py
```

- [ ] **Step 6: Commit**

```bash
git add backend/routes/admin_routes.py
git commit -m "feat(admin): add dashboard stats APIs — overview, checkin, focus"
```

---

## Task 5: Add User Management APIs

**Files:**
- Modify: `backend/routes/admin_routes.py`

- [ ] **Step 1: Add user list endpoint with pagination, search, and filter**

Append to `admin_routes.py`:

```python
class UserListItem(BaseModel):
    id: int
    username: str
    email: str | None
    email_verified: bool
    is_admin: bool
    is_active: bool
    created_at: str


class UserListResponse(BaseModel):
    users: list[UserListItem]
    total: int
    page: int
    page_size: int


@router.get("/users", response_model=UserListResponse)
async def list_users_admin(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
    page: int = 1,
    page_size: int = 20,
    search: str = "",
    status: str = "all",  # all, admin, normal, disabled
    sort: str = "created_at",
    order: str = "desc",
) -> UserListResponse:
    pool = _pool(request)
    offset = (page - 1) * page_size

    # Build WHERE clause
    conditions: list[str] = []
    params: list[Any] = []
    idx = 1

    if search:
        conditions.append(f"(username ILIKE ${idx} OR email ILIKE ${idx})")
        params.append(f"%{search}%")
        idx += 1

    if status == "admin":
        conditions.append("is_admin = TRUE")
    elif status == "normal":
        conditions.append("is_admin = FALSE AND is_active = TRUE")
    elif status == "disabled":
        conditions.append("is_active = FALSE")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    # Validate sort column
    allowed_sorts = {"created_at", "username", "id"}
    if sort not in allowed_sorts:
        sort = "created_at"
    order_dir = "ASC" if order == "asc" else "DESC"

    async with pool.acquire() as conn:
        total = await conn.fetchval(f"SELECT COUNT(*) FROM auth_users {where}", *params)
        rows = await conn.fetch(
            f"""
            SELECT id, username, email, email_verified_at, is_admin, is_active, created_at
            FROM auth_users
            {where}
            ORDER BY {sort} {order_dir}
            LIMIT ${idx} OFFSET ${idx + 1}
            """,
            *params,
            page_size,
            offset,
        )

    users = [
        UserListItem(
            id=r["id"],
            username=r["username"],
            email=r["email"],
            email_verified=r["email_verified_at"] is not None,
            is_admin=r["is_admin"],
            is_active=r["is_active"],
            created_at=r["created_at"].isoformat() if r["created_at"] else "",
        )
        for r in rows
    ]

    return UserListResponse(users=users, total=total, page=page, page_size=page_size)
```

- [ ] **Step 2: Add user edit endpoint (toggle admin, toggle active)**

Append to `admin_routes.py`:

```python
class UserUpdateRequest(BaseModel):
    is_admin: bool | None = None
    is_active: bool | None = None


@router.patch("/users/{user_id}")
async def update_user(
    request: Request,
    user_id: int,
    payload: UserUpdateRequest,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> dict[str, str]:
    pool = _pool(request)
    updates: list[str] = []
    params: list[Any] = []
    idx = 1

    if payload.is_admin is not None:
        updates.append(f"is_admin = ${idx}")
        params.append(payload.is_admin)
        idx += 1

    if payload.is_active is not None:
        updates.append(f"is_active = ${idx}")
        params.append(payload.is_active)
        idx += 1

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(user_id)
    async with pool.acquire() as conn:
        result = await conn.execute(
            f"UPDATE auth_users SET {', '.join(updates)} WHERE id = ${idx}",
            *params,
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="User not found")

    return {"detail": "User updated"}
```

- [ ] **Step 3: Add reset password endpoint**

Append to `admin_routes.py`:

```python
import secrets
import hashlib


class ResetPasswordResponse(BaseModel):
    temp_password: str


@router.post("/users/{user_id}/reset-password", response_model=ResetPasswordResponse)
async def reset_user_password(
    request: Request,
    user_id: int,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> ResetPasswordResponse:
    pool = _pool(request)
    temp_password = secrets.token_urlsafe(12)
    salt = secrets.token_bytes(16)
    iterations = 210_000
    dk = hashlib.pbkdf2_hmac("sha256", temp_password.encode(), salt, iterations)
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE auth_users SET password_hash = $1, password_salt = $2 WHERE id = $3",
            dk,
            salt,
            user_id,
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="User not found")
        # Invalidate all existing tokens for this user
        await conn.execute(
            "DELETE FROM auth_access_tokens WHERE user_id = $1", user_id
        )
    return ResetPasswordResponse(temp_password=temp_password)
```

- [ ] **Step 4: Add delete user endpoint**

Append to `admin_routes.py`:

```python
@router.delete("/users/{user_id}")
async def delete_user(
    request: Request,
    user_id: int,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> dict[str, str]:
    if user_id == _admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    pool = _pool(request)
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM auth_users WHERE id = $1", user_id)
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="User not found")
    return {"detail": "User deleted"}
```

- [ ] **Step 5: Run lint check**

```bash
cd backend && uv run ruff check routes/admin_routes.py
```

- [ ] **Step 6: Commit**

```bash
git add backend/routes/admin_routes.py
git commit -m "feat(admin): add user management APIs — list, edit, reset password, delete"
```

---

## Task 6: Register Admin Routes in `main.py`

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add admin imports**

In `backend/main.py`, add the import near the existing router imports (around line 15):

```python
from routes.admin_routes import router as admin_router
```

- [ ] **Step 2: Mount admin static files**

After the existing `/uploads` mount (around line 43), add:

```python
admin_dir = Path(__file__).resolve().parent / "web" / "admin"
if admin_dir.is_dir():
    app.mount("/admin", StaticFiles(directory=str(admin_dir), html=True), name="admin")
```

- [ ] **Step 3: Register admin router**

After the existing router registrations (around line 58), add:

```python
app.include_router(admin_router)
```

- [ ] **Step 4: Start dev server and verify**

```bash
cd backend && uv run uvicorn main:app --reload --port 8000
```

Test:
- Visit `http://localhost:8000/admin/` — should render `index.html`
- Visit `http://localhost:8000/api/admin/stats/overview` without auth — should return 401
- Visit `http://localhost:8000/api/docs` — should show the new admin endpoints

- [ ] **Step 5: Commit**

```bash
git add backend/main.py
git commit -m "feat(admin): mount admin panel and register admin routes"
```

---

## Task 7: Wire Dashboard Page (`index.html` + `js/dashboard.js`)

**Files:**
- Create: `backend/web/admin/js/dashboard.js`
- Modify: `backend/web/admin/index.html`

- [ ] **Step 1: Create `dashboard.js`**

```javascript
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
```

- [ ] **Step 2: Add script tags and data attributes to `index.html`**

In `backend/web/admin/index.html`, add before the closing `</body>` tag:

```html
<script src="js/api.js"></script>
<script src="js/app.js"></script>
<script src="js/dashboard.js"></script>
```

Then add `data-*` attributes to the existing HTML elements so the JS can find them. In the stat cards section, no changes needed (we use `.stat-card` querySelector). For the checkin/focus section:

- On the "今日签到率" value element, add `data-checkin-rate`
- On the "今日总专注时长" value element, add `data-focus-total`
- On the "人均专注时长" value element, add `data-focus-avg`
- On the top-5 list container, add `data-checkin-top5`
- On the bar chart container, add `data-focus-chart`
- On the weekday labels container, add `data-focus-labels`

Also replace the hardcoded stat card values with placeholder text like `—` so they get replaced by JS.

- [ ] **Step 3: Test the dashboard**

Start the dev server, log in as admin, visit `http://localhost:8000/admin/`. Verify:
- Stat cards show real data from the database
- Checkin rate and top 5 list populate
- Focus stats and bar chart render

- [ ] **Step 4: Commit**

```bash
git add backend/web/admin/js/dashboard.js backend/web/admin/index.html
git commit -m "feat(admin): wire dashboard page to live API data"
```

---

## Task 8: Wire Users Page (`users.html` + `js/users.js`)

**Files:**
- Create: `backend/web/admin/js/users.js`
- Modify: `backend/web/admin/users.html`

- [ ] **Step 1: Create `users.js`**

```javascript
// backend/web/admin/js/users.js
// User management page logic

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

function renderUserTable(users) {
  const tbody = document.getElementById('user-table-body');
  if (!tbody) return;

  tbody.innerHTML = users.map(u => `
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
          <button class="btn btn-ghost" style="font-size:12px;padding:4px 8px;" onclick="toggleAdmin(${u.id}, ${u.is_admin})">${u.is_admin ? '取消管理员' : '设为管理员'}</button>
          <button class="btn btn-ghost" style="font-size:12px;padding:4px 8px;" onclick="toggleActive(${u.id}, ${u.is_active})">${u.is_active ? '禁用' : '启用'}</button>
          <button class="btn btn-ghost" style="font-size:12px;padding:4px 8px;" onclick="resetPassword(${u.id}, '${u.username}')">重置密码</button>
          <button class="btn btn-ghost" style="font-size:12px;padding:4px 8px;color:var(--danger);" onclick="deleteUser(${u.id}, '${u.username}')">删除</button>
        </div>
      </td>
    </tr>
  `).join('');
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
```

- [ ] **Step 2: Update `users.html` with script tags, form structure, and data attributes**

Add before `</body>`:

```html
<script src="js/api.js"></script>
<script src="js/app.js"></script>
<script src="js/users.js"></script>
```

Ensure the search form has `id="user-search-form"`, the input has `id="user-search-input"`, the select has `id="user-status-filter"`, the table body has `id="user-table-body"`, and the pagination container has `id="pagination"`.

- [ ] **Step 3: Test the users page**

- Verify user list loads with pagination
- Test search by username/email
- Test filter by status
- Test toggle admin, toggle active, reset password, delete (with confirmation modals)

- [ ] **Step 4: Commit**

```bash
git add backend/web/admin/js/users.js backend/web/admin/users.html
git commit -m "feat(admin): wire users page — table, search, filter, CRUD actions"
```

---

## Task 9: Wire Apps Pages (`apps.html`, `apps-vocab.html`, `apps-erc.html` + `js/apps.js`)

**Files:**
- Create: `backend/web/admin/js/apps.js`
- Modify: `backend/web/admin/apps.html`
- Modify: `backend/web/admin/apps-vocab.html`
- Modify: `backend/web/admin/apps-erc.html`

- [ ] **Step 1: Create `apps.js`**

```javascript
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
      <a href="${app.url}" class="app-card" style="text-decoration:none;color:inherit;">
        <div class="app-icon">${app.icon}</div>
        <div class="app-title">${app.name}</div>
        <div class="app-desc">${app.description}</div>
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
```

- [ ] **Step 2: Add script tags and data attributes to all three HTML files**

Each file gets before `</body>`:
```html
<script src="js/api.js"></script>
<script src="js/app.js"></script>
<script src="js/apps.js"></script>
```

Add `data-apps-grid` to the grid container in `apps.html`, `data-vocab-stat` to stat value elements and `data-vocab-decks` to the table body in `apps-vocab.html`, and `data-erc-stat` / `data-erc-sets` similarly in `apps-erc.html`.

- [ ] **Step 3: Add sub-app stats APIs to `admin_routes.py`**

Append to `backend/routes/admin_routes.py`:

```python
class SubApp(BaseModel):
    name: str
    icon: str
    description: str
    url: str
    stats: str


class SubAppsResponse(BaseModel):
    apps: list[SubApp]


@router.get("/apps", response_model=SubAppsResponse)
async def list_apps(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> SubAppsResponse:
    pool = _pool(request)
    async with pool.acquire() as conn:
        deck_count = await conn.fetchval("SELECT COUNT(*) FROM vocab_decks")
        word_count = await conn.fetchval("SELECT COUNT(*) FROM vocab_words")
        set_count = await conn.fetchval("SELECT COUNT(*) FROM erc_sets")
        article_count = await conn.fetchval("SELECT COUNT(*) FROM erc_articles")
    return SubAppsResponse(apps=[
        SubApp(name="词汇", icon="📚", description="词汇库管理", url="apps-vocab.html", stats=f"{deck_count} 词库 / {word_count:,} 词"),
        SubApp(name="ERC 阅读", icon="📖", description="阅读理解管理", url="apps-erc.html", stats=f"{set_count} 阅读集 / {article_count} 篇文章"),
    ])


class VocabStats(BaseModel):
    total_words_learned: int
    today_reviews: int
    avg_accuracy: float


@router.get("/apps/vocab/stats", response_model=VocabStats)
async def vocab_stats(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> VocabStats:
    pool = _pool(request)
    today = date.today()
    async with pool.acquire() as conn:
        learned = await conn.fetchval("SELECT COUNT(*) FROM vocab_user_word_progress")
        reviews = await conn.fetchval(
            "SELECT COUNT(*) FROM vocab_review_logs WHERE created_at::date = $1", today
        )
        correct = await conn.fetchval(
            "SELECT COUNT(*) FROM vocab_review_logs WHERE result = 'correct' AND created_at::date = $1", today
        )
    acc = (correct / reviews * 100) if reviews > 0 else 0.0
    return VocabStats(total_words_learned=learned, today_reviews=reviews, avg_accuracy=round(acc, 1))


class VocabDeckItem(BaseModel):
    name: str
    word_count: int
    learner_count: int


@router.get("/apps/vocab/decks", response_model=list[VocabDeckItem])
async def vocab_decks(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> list[VocabDeckItem]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT d.name, d.word_count,
                   (SELECT COUNT(DISTINCT user_id) FROM vocab_user_word_progress WHERE deck_id = d.id) AS learner_count
            FROM vocab_decks d
            ORDER BY d.name
            """
        )
    return [VocabDeckItem(name=r["name"], word_count=r["word_count"], learner_count=r["learner_count"]) for r in rows]


class ErcStats(BaseModel):
    total_questions: int
    today_questions: int
    avg_accuracy: float


@router.get("/apps/erc/stats", response_model=ErcStats)
async def erc_stats(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> ErcStats:
    pool = _pool(request)
    today = date.today()
    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM erc_questions")
        today_q = await conn.fetchval(
            "SELECT COUNT(*) FROM erc_review_logs WHERE created_at::date = $1", today
        )
        correct = await conn.fetchval(
            "SELECT COUNT(*) FROM erc_review_logs WHERE is_correct = TRUE AND created_at::date = $1", today
        )
    acc = (correct / today_q * 100) if today_q > 0 else 0.0
    return ErcStats(total_questions=total, today_questions=today_q, avg_accuracy=round(acc, 1))


class ErcSetItem(BaseModel):
    name: str
    article_count: int
    attempt_count: int


@router.get("/apps/erc/sets", response_model=list[ErcSetItem])
async def erc_sets(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> list[ErcSetItem]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.name, s.article_count,
                   (SELECT COUNT(*) FROM erc_user_article_attempts a
                    JOIN erc_articles art ON art.id = a.article_pk
                    WHERE art.set_id = s.id) AS attempt_count
            FROM erc_sets s
            ORDER BY s.name
            """
        )
    return [ErcSetItem(name=r["name"], article_count=r["article_count"], attempt_count=r["attempt_count"]) for r in rows]
```

- [ ] **Step 4: Run lint check**

```bash
cd backend && uv run ruff check routes/admin_routes.py
```

- [ ] **Step 5: Test apps pages**

- `apps.html` shows vocab and ERC cards with real stats
- `apps-vocab.html` shows stats and deck table
- `apps-erc.html` shows stats and sets table

- [ ] **Step 6: Commit**

```bash
git add backend/web/admin/js/apps.js backend/web/admin/apps.html backend/web/admin/apps-vocab.html backend/web/admin/apps-erc.html backend/routes/admin_routes.py
git commit -m "feat(admin): wire sub-app pages — grid, vocab detail, erc detail"
```

---

## Task 10: Wire Templates Page (`templates.html`)

**Files:**
- Modify: `backend/web/admin/templates.html`

Note: Template CRUD APIs are Phase 2 per the spec. This task adds the script tags and placeholder rendering so the page structure is complete. The API integration will be done when Phase 2 APIs are built.

- [ ] **Step 1: Add script tags to `templates.html`**

Add before `</body>`:

```html
<script src="js/api.js"></script>
<script src="js/app.js"></script>
```

The templates page will show static placeholder content until Phase 2 APIs are implemented.

- [ ] **Step 2: Commit**

```bash
git add backend/web/admin/templates.html
git commit -m "feat(admin): add script tags to templates page (Phase 2 APIs pending)"
```

---

## Task 11: Final Integration Test

- [ ] **Step 1: Start the backend server**

```bash
cd backend && uv run uvicorn main:app --reload --port 8000
```

- [ ] **Step 2: Test all pages as admin user**

1. Log in as an admin user via the main app
2. Visit `http://localhost:8000/admin/` — dashboard shows real stats
3. Click "子应用" — grid shows vocab and ERC cards with counts
4. Click "词汇" — shows vocab stats and deck table
5. Click back, then "ERC" — shows ERC stats and sets table
6. Click "用户管理" — shows user table with search/filter
7. Test CRUD: toggle admin, toggle active, reset password (shows temp password modal), delete
8. Click "模板商店" — page loads (static content for now)

- [ ] **Step 3: Test as non-admin user**

1. Log in as a non-admin user
2. Visit `http://localhost:8000/admin/` — should redirect to home
3. Call `GET /api/admin/stats/overview` with non-admin token — should return 403

- [ ] **Step 4: Run backend lint**

```bash
cd backend && uv run ruff check routes/admin_routes.py main.py
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(admin): complete phase 1 — dashboard, user CRUD, sub-app pages"
```
