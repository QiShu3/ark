from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from mini_agent.server.auth import CurrentUser, get_current_user
from mini_agent.server.repository import get_pool

router = APIRouter(prefix="/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    id: int
    username: str
    is_active: bool
    is_admin: bool
    created_at: datetime


class LogoutResponse(BaseModel):
    ok: bool = True


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _token_ttl_seconds() -> int:
    raw = os.getenv("AUTH_TOKEN_TTL_SECONDS", "86400").strip() or "86400"
    try:
        ttl = int(raw)
    except Exception:
        ttl = 86400
    return max(60, min(ttl, 60 * 60 * 24 * 30))


def _password_iterations() -> int:
    raw = os.getenv("AUTH_PASSWORD_ITERATIONS", "210000").strip() or "210000"
    try:
        iterations = int(raw)
    except Exception:
        iterations = 210000
    return max(100_000, min(iterations, 1_000_000))


def _verify_password(password: str, *, password_hash_b64: str, salt_b64: str) -> bool:
    try:
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(password_hash_b64.encode("ascii"))
    except Exception:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _password_iterations())
    return hmac.compare_digest(digest, expected)


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, payload: LoginRequest) -> TokenResponse:
    pool = await get_pool(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, password_hash, password_salt, is_active
            FROM auth_users
            WHERE username = $1
            """,
            payload.username,
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
        if not bool(row["is_active"]):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被禁用")
        ok = _verify_password(
            payload.password,
            password_hash_b64=str(row["password_hash"]),
            salt_b64=str(row["password_salt"]),
        )
        if not ok:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")

        token = secrets.token_urlsafe(32)
        ttl = _token_ttl_seconds()
        expires_at = _utc_now() + timedelta(seconds=ttl)
        await conn.execute("DELETE FROM auth_access_tokens WHERE expires_at <= NOW();")
        await conn.execute(
            """
            INSERT INTO auth_access_tokens(token, user_id, expires_at)
            VALUES ($1, $2, $3)
            """,
            token,
            int(row["id"]),
            expires_at,
        )
    return TokenResponse(access_token=token, expires_in=ttl)


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    authorization: Annotated[str | None, Header()] = None,
) -> LogoutResponse:
    del current_user
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if token:
        pool = await get_pool(request)
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM auth_access_tokens WHERE token = $1", token)
    return LogoutResponse(ok=True)


@router.get("/me", response_model=UserResponse)
async def me(current_user: Annotated[CurrentUser, Depends(get_current_user)]) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        is_active=current_user.is_active,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
    )
