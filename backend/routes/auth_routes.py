import base64
import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field


router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserPublic(BaseModel):
    id: int
    username: str
    is_active: bool
    is_admin: bool
    created_at: datetime


@dataclass(frozen=True)
class _AuthUser:
    id: int
    username: str
    is_active: bool
    is_admin: bool
    created_at: datetime


def _utc_now() -> datetime:
    """返回当前 UTC 时间（timezone-aware）。"""
    return datetime.now(timezone.utc)


def _token_ttl_seconds() -> int:
    """读取并返回访问令牌 TTL 秒数（默认 86400）。"""
    raw = os.getenv("AUTH_TOKEN_TTL_SECONDS", "86400").strip() or "86400"
    try:
        ttl = int(raw)
    except Exception:
        ttl = 86400
    return max(60, min(ttl, 60 * 60 * 24 * 30))


def _password_iterations() -> int:
    """读取并返回密码哈希迭代次数（默认 210000）。"""
    raw = os.getenv("AUTH_PASSWORD_ITERATIONS", "210000").strip() or "210000"
    try:
        iters = int(raw)
    except Exception:
        iters = 210000
    return max(100_000, min(iters, 1_000_000))


def _hash_password(password: str) -> tuple[str, str]:
    """将明文密码进行 PBKDF2-HMAC 哈希并返回 (hash_b64, salt_b64)。"""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _password_iterations())
    return base64.b64encode(dk).decode("ascii"), base64.b64encode(salt).decode("ascii")


def _verify_password(password: str, *, password_hash_b64: str, salt_b64: str) -> bool:
    """校验明文密码与已存储的 (hash_b64, salt_b64) 是否匹配。"""
    try:
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(password_hash_b64.encode("ascii"))
    except Exception:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _password_iterations())
    return hmac.compare_digest(dk, expected)


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


async def init_auth(app: Any) -> None:
    """初始化 Auth 所需的连接池与数据表。"""
    pool = await asyncpg.create_pool(dsn=_database_url(), min_size=1, max_size=5, command_timeout=30)
    app.state.auth_pool = pool
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_users (
              id BIGSERIAL PRIMARY KEY,
              username TEXT UNIQUE NOT NULL,
              password_hash TEXT NOT NULL,
              password_salt TEXT NOT NULL,
              is_active BOOLEAN NOT NULL DEFAULT TRUE,
              is_admin BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_access_tokens (
              token TEXT PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              expires_at TIMESTAMPTZ NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_access_tokens(user_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires_at ON auth_access_tokens(expires_at);")


async def close_auth(app: Any) -> None:
    """关闭 Auth 连接池。"""
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is not None:
        await pool.close()
        app.state.auth_pool = None


def _pool_from_request(request: Request) -> asyncpg.Pool:
    """从 FastAPI request 中获取 Auth 连接池。"""
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="Auth 未初始化")
    return pool


async def _get_user_by_username(pool: asyncpg.Pool, username: str) -> asyncpg.Record | None:
    """按用户名查找用户记录。"""
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            """
            SELECT id, username, password_hash, password_salt, is_active, is_admin, created_at
            FROM auth_users
            WHERE username = $1
            """,
            username,
        )


async def _issue_token(pool: asyncpg.Pool, user_id: int) -> tuple[str, int]:
    """为指定用户签发访问令牌并返回 (token, expires_in_seconds)。"""
    token = secrets.token_urlsafe(32)
    ttl = _token_ttl_seconds()
    expires_at = _utc_now() + timedelta(seconds=ttl)
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM auth_access_tokens WHERE expires_at <= NOW();")
        await conn.execute(
            """
            INSERT INTO auth_access_tokens(token, user_id, expires_at)
            VALUES ($1, $2, $3)
            """,
            token,
            user_id,
            expires_at,
        )
    return token, ttl


async def _user_from_token(pool: asyncpg.Pool, token: str) -> _AuthUser | None:
    """根据访问令牌查询当前用户；无效或过期则返回 None。"""
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
    if row is None:
        return None
    if not bool(row["is_active"]):
        return None
    return _AuthUser(
        id=int(row["id"]),
        username=str(row["username"]),
        is_active=bool(row["is_active"]),
        is_admin=bool(row["is_admin"]),
        created_at=row["created_at"],
    )


async def get_current_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> _AuthUser:
    """FastAPI 依赖：从 Bearer token 解析当前用户。"""
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")
    pool = _pool_from_request(request)
    user = await _user_from_token(pool, creds.credentials)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已失效")
    return user


@router.post("/register", response_model=UserPublic)
async def register(request: Request, payload: RegisterRequest) -> UserPublic:
    """注册新用户。"""
    pool = _pool_from_request(request)
    existing = await _get_user_by_username(pool, payload.username)
    if existing is not None:
        raise HTTPException(status_code=409, detail="用户名已存在")

    password_hash, password_salt = _hash_password(payload.password)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO auth_users(username, password_hash, password_salt)
            VALUES ($1, $2, $3)
            RETURNING id, username, is_active, is_admin, created_at
            """,
            payload.username,
            password_hash,
            password_salt,
        )
    return UserPublic(
        id=int(row["id"]),
        username=str(row["username"]),
        is_active=bool(row["is_active"]),
        is_admin=bool(row["is_admin"]),
        created_at=row["created_at"],
    )


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, payload: LoginRequest) -> TokenResponse:
    """用户登录并获取访问令牌。"""
    pool = _pool_from_request(request)
    row = await _get_user_by_username(pool, payload.username)
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

    token, ttl = await _issue_token(pool, int(row["id"]))
    return TokenResponse(access_token=token, expires_in=ttl)


@router.post("/logout")
async def logout(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> dict[str, bool]:
    """注销当前 token。"""
    if creds is None or not creds.credentials:
        return {"ok": True}
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM auth_access_tokens WHERE token = $1;", creds.credentials)
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
async def me(user: Annotated[_AuthUser, Depends(get_current_user)]) -> UserPublic:
    """获取当前登录用户信息。"""
    return UserPublic(
        id=user.id,
        username=user.username,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
    )


@router.get("/users", response_model=list[UserPublic])
async def list_users(
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
) -> list[UserPublic]:
    """列出用户：管理员返回全部；非管理员仅返回自己。"""
    if not user.is_admin:
        return [
            UserPublic(
                id=user.id,
                username=user.username,
                is_active=user.is_active,
                is_admin=user.is_admin,
                created_at=user.created_at,
            )
        ]

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, username, is_active, is_admin, created_at
            FROM auth_users
            ORDER BY id DESC
            LIMIT 100
            """
        )
    return [
        UserPublic(
            id=int(r["id"]),
            username=str(r["username"]),
            is_active=bool(r["is_active"]),
            is_admin=bool(r["is_admin"]),
            created_at=r["created_at"],
        )
        for r in rows
    ]
