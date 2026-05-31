"""Admin panel API routes — /api/admin/*"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated

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
        today_count = await conn.fetchval(
            "SELECT COUNT(*) FROM user_checkins WHERE checkin_date = $1", today
        )
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
