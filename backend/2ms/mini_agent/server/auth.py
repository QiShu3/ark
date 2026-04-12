from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Annotated

import asyncpg
from fastapi import Depends, HTTPException, Request, WebSocket, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from mini_agent.server.repository import get_pool

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: int
    username: str
    is_active: bool
    is_admin: bool
    created_at: datetime


async def _user_from_token(pool: asyncpg.Pool, token: str) -> CurrentUser | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT u.id, u.username, u.is_active, u.is_admin, u.created_at
            FROM auth_access_tokens t
            JOIN auth_users u ON u.id = t.user_id
            WHERE t.token = $1 AND t.expires_at > NOW()
            """,
            token,
        )
    if row is None or not bool(row["is_active"]):
        return None
    return CurrentUser(
        id=int(row["id"]),
        username=str(row["username"]),
        is_active=bool(row["is_active"]),
        is_admin=bool(row["is_admin"]),
        created_at=row["created_at"],
    )


async def get_current_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> CurrentUser:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")
    pool = await get_pool(request)
    user = await _user_from_token(pool, creds.credentials)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已失效")
    return user


async def get_current_user_ws(websocket: WebSocket) -> CurrentUser:
    token = websocket.query_params.get("token")
    if not token:
        authorization = websocket.headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")
    pool = getattr(getattr(websocket.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="Database is not initialized")
    user = await _user_from_token(pool, token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已失效")
    return user
