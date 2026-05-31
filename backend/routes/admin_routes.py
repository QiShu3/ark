"""Admin panel API routes — /api/admin/*"""

from __future__ import annotations

import hashlib
import secrets
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


# ---------------------------------------------------------------------------
# Dashboard stats — overview
# ---------------------------------------------------------------------------


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
        today_new = await conn.fetchval("SELECT COUNT(*) FROM auth_users WHERE created_at::date = $1", today)
        verified = await conn.fetchval("SELECT COUNT(*) FROM auth_users WHERE email_verified_at IS NOT NULL")
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


# ---------------------------------------------------------------------------
# Dashboard stats — checkin
# ---------------------------------------------------------------------------


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
        today_count = await conn.fetchval("SELECT COUNT(*) FROM user_checkins WHERE checkin_date = $1", today)
        # Simple streak calculation: count consecutive days ending today for each user
        top5_rows = await conn.fetch(
            """
            WITH consecutive AS (
                SELECT user_id, COUNT(*) AS streak_days
                FROM (
                    SELECT user_id, checkin_date,
                           checkin_date - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY checkin_date))::int AS grp
                    FROM user_checkins
                ) sub
                WHERE grp = (SELECT MAX(grp) FROM (
                    SELECT checkin_date - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY checkin_date))::int AS grp
                    FROM user_checkins WHERE user_id = sub.user_id
                ) x)
                GROUP BY user_id
            )
            SELECT u.username, c.streak_days
            FROM consecutive c
            JOIN auth_users u ON u.id = c.user_id
            ORDER BY c.streak_days DESC
            LIMIT 5
            """
        )

    rate = (today_count / total_users * 100) if total_users > 0 else 0.0
    top5 = [CheckinUser(username=r["username"], streak_days=r["streak_days"]) for r in top5_rows]
    return StatsCheckin(today_rate=round(rate, 1), top5=top5)


# ---------------------------------------------------------------------------
# Dashboard stats — focus
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------


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
    """更新用户管理员和启用状态，并拒绝修改自己的权限状态。"""
    if user_id == _admin.id and (payload.is_admin is not None or payload.is_active is not None):
        raise HTTPException(status_code=400, detail="Cannot modify your own admin or active status")

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
        await conn.execute("DELETE FROM auth_access_tokens WHERE user_id = $1", user_id)
    return ResetPasswordResponse(temp_password=temp_password)


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


# ---------------------------------------------------------------------------
# Sub-applications
# ---------------------------------------------------------------------------


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
    return SubAppsResponse(
        apps=[
            SubApp(
                name="词汇",
                icon="📚",
                description="词汇库管理",
                url="apps-vocab.html",
                stats=f"{deck_count} 词库 / {word_count:,} 词",
            ),
            SubApp(
                name="ERC 阅读",
                icon="📖",
                description="阅读理解管理",
                url="apps-erc.html",
                stats=f"{set_count} 阅读集 / {article_count} 篇文章",
            ),
        ]
    )


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
        reviews = await conn.fetchval("SELECT COUNT(*) FROM vocab_review_logs WHERE created_at::date = $1", today)
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
        today_q = await conn.fetchval("SELECT COUNT(*) FROM erc_review_logs WHERE created_at::date = $1", today)
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
    return [
        ErcSetItem(name=r["name"], article_count=r["article_count"], attempt_count=r["attempt_count"]) for r in rows
    ]
