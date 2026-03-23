from datetime import UTC, datetime
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request

from routes.auth_routes import _AuthUser, get_current_user

router = APIRouter(prefix="/api/checkin", tags=["checkin"])


def _pool_from_request(request: Request) -> asyncpg.Pool:
    """从 FastAPI request 中获取数据库连接池。"""
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
    return pool


async def init_checkin(app: Any) -> None:
    """初始化 Check-in 所需的数据表。"""
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_checkins (
                user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
                checkin_date DATE NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(user_id, checkin_date)
            );
            """
        )


@router.post("")
async def create_checkin(
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
):
    """记录今日打卡。如果已打卡则忽略（幂等）。"""
    pool = _pool_from_request(request)
    today = datetime.now(UTC).date()
    
    async with pool.acquire() as conn:
        try:
            await conn.execute(
                """
                INSERT INTO user_checkins (user_id, checkin_date)
                VALUES ($1, $2)
                ON CONFLICT (user_id, checkin_date) DO NOTHING
                """,
                user.id,
                today,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
    return {"ok": True}


@router.get("/status")
async def get_checkin_status(
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
):
    """获取打卡状态。"""
    pool = _pool_from_request(request)
    today = datetime.now(UTC).date()
    
    async with pool.acquire() as conn:
        # 1. 检查今日是否已打卡
        row = await conn.fetchrow(
            """
            SELECT 1 FROM user_checkins
            WHERE user_id = $1 AND checkin_date = $2
            """,
            user.id,
            today,
        )
        is_checked_in_today = row is not None
        
        # 2. 获取累计打卡天数
        row = await conn.fetchrow(
            """
            SELECT COUNT(*) as total FROM user_checkins
            WHERE user_id = $1
            """,
            user.id,
        )
        total_days = row["total"] if row else 0
        
        # 3. 获取所有打卡日期并计算连续打卡（streak）
        rows = await conn.fetch(
            """
            SELECT checkin_date FROM user_checkins
            WHERE user_id = $1
            ORDER BY checkin_date DESC
            """,
            user.id,
        )
        
        checked_dates = [r["checkin_date"].isoformat() for r in rows]
        
        current_streak = 0
        if rows:
            first_date = rows[0]["checkin_date"]
            # 如果最近一次打卡是今天或昨天，则说明 streak 没断
            yesterday = datetime.fromordinal(today.toordinal() - 1).date()
            if first_date == today or first_date == yesterday:
                expected_date = first_date
                for r in rows:
                    if r["checkin_date"] == expected_date:
                        current_streak += 1
                        expected_date = datetime.fromordinal(expected_date.toordinal() - 1).date()
                    else:
                        break

    return {
        "is_checked_in_today": is_checked_in_today,
        "current_streak": current_streak,
        "total_days": total_days,
        "checked_dates": checked_dates,
    }
