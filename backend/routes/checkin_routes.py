import os
from datetime import UTC, datetime
from typing import Annotated, Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from routes.auth_routes import _AuthUser, get_current_user

router = APIRouter(prefix="/api/checkin", tags=["checkin"])

def _database_url() -> str:
    """从环境变量读取 Postgres 连接串。"""
    url = (
        os.getenv("DATABASE_URL", "").strip()
        or os.getenv("SUPABASE_DB_URL", "").strip()
        or os.getenv("POSTGRES_URL", "").strip()
    )
    if not url:
        raise RuntimeError("DATABASE_URL 未配置（可用 SUPABASE_DB_URL / POSTGRES_URL）")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    parsed = urlparse(url)
    if parsed.hostname and parsed.hostname.endswith(".supabase.co"):
        q = dict(parse_qsl(parsed.query, keep_blank_values=True))
        if "sslmode" not in q:
            q["sslmode"] = "require"
            url = urlunparse(parsed._replace(query=urlencode(q)))
    return url

async def init_checkin(app: Any) -> None:
    """初始化 Checkin 所需的连接池与数据表。"""
    pool = await asyncpg.create_pool(dsn=_database_url(), min_size=1, max_size=5, command_timeout=30)
    app.state.checkin_pool = pool
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_checkins (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL,
              checkin_date DATE NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(user_id, checkin_date)
            );
            """
        )

async def close_checkin(app: Any) -> None:
    """关闭 Checkin 连接池。"""
    pool = getattr(getattr(app, "state", None), "checkin_pool", None)
    if pool is not None:
        await pool.close()
        app.state.checkin_pool = None

def _pool_from_request(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "checkin_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="Checkin 未初始化")
    return pool

class CheckinResponse(BaseModel):
    ok: bool
    message: str

class CheckinStatusResponse(BaseModel):
    is_checked_in_today: bool
    current_streak: int
    total_days: int

@router.post("", response_model=CheckinResponse)
async def perform_checkin(
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
) -> CheckinResponse:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        try:
            await conn.execute(
                """
                INSERT INTO user_checkins (user_id, checkin_date)
                VALUES ($1, CURRENT_DATE)
                """,
                user.id,
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(status_code=409, detail="今日已打卡")
            
    return CheckinResponse(ok=True, message="打卡成功")

@router.get("/status", response_model=CheckinStatusResponse)
async def get_checkin_status(
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
) -> CheckinStatusResponse:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        # Check today's status
        row = await conn.fetchrow(
            """
            SELECT 1 FROM user_checkins 
            WHERE user_id = $1 AND checkin_date = CURRENT_DATE
            """,
            user.id,
        )
        is_checked_in_today = row is not None

        # Total days
        total_row = await conn.fetchrow(
            """
            SELECT COUNT(*) AS total FROM user_checkins WHERE user_id = $1
            """,
            user.id,
        )
        total_days = dict(total_row).get("total", 0) if total_row else 0

        # Streak calculation
        streak_row = await conn.fetchrow(
            """
            WITH checkin_dates AS (
                SELECT checkin_date,
                       checkin_date - (DENSE_RANK() OVER (ORDER BY checkin_date))::int AS grp
                FROM user_checkins
                WHERE user_id = $1
            ),
            streaks AS (
                SELECT grp, COUNT(*) as streak_len, MAX(checkin_date) as latest_date
                FROM checkin_dates
                GROUP BY grp
            )
            SELECT streak_len FROM streaks 
            WHERE latest_date >= CURRENT_DATE - INTERVAL '1 day' 
            ORDER BY latest_date DESC LIMIT 1
            """,
            user.id,
        )
        current_streak = dict(streak_row).get("streak_len", 0) if streak_row else 0

    return CheckinStatusResponse(
        is_checked_in_today=is_checked_in_today,
        current_streak=current_streak,
        total_days=total_days,
    )
