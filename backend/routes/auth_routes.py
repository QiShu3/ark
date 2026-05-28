import asyncio
import base64
import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import asyncpg
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
_ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
_MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5MB
_MAX_UPLOADS_PER_CATEGORY = 3
_UPLOAD_CATEGORIES = {"background", "character"}

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


class ProfileUpdateRequest(BaseModel):
    avatar_url: str | None = None
    custom_background_url: str | None = None
    custom_character_url: str | None = None
    background_blur: int | None = None
    background_opacity: float | None = None
    show_character: bool | None = None
    character_scale: float | None = None


class UserPublic(BaseModel):
    id: int
    username: str
    email: str | None = None
    is_active: bool
    is_admin: bool
    created_at: datetime
    avatar_url: str | None = None
    custom_background_url: str | None = None
    custom_character_url: str | None = None
    background_blur: int = 0
    background_opacity: float = 0.6
    show_character: bool = True
    character_scale: float = 1.0


@dataclass(frozen=True)
class _AuthUser:
    id: int
    username: str
    email: str | None
    is_active: bool
    is_admin: bool
    created_at: datetime
    avatar_url: str | None = None
    custom_background_url: str | None = None
    custom_character_url: str | None = None
    background_blur: int = 0
    background_opacity: float = 0.6
    show_character: bool = True
    character_scale: float = 1.0


def _utc_now() -> datetime:
    """返回当前 UTC 时间（timezone-aware）。"""
    return datetime.now(UTC)


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
        # 迁移：为 auth_users 添加个性化配置列
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS custom_background_url TEXT DEFAULT NULL;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS custom_character_url TEXT DEFAULT NULL;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS background_blur INTEGER DEFAULT 0;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS background_opacity REAL DEFAULT 0.6;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS show_character BOOLEAN DEFAULT TRUE;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS character_scale REAL DEFAULT 1.0;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS email TEXT DEFAULT NULL;")
        # 迁移：用户上传记录表（用于追踪文件归属和限额管理）
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_uploads (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              category TEXT NOT NULL,
              url TEXT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_user_uploads_user_category ON user_uploads(user_id, category);")


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


def _user_public_from_row(row: asyncpg.Record) -> UserPublic:
    """从数据库行构造 UserPublic 实例。"""
    return UserPublic(
        id=int(row["id"]),
        username=str(row["username"]),
        email=row.get("email"),
        is_active=bool(row["is_active"]),
        is_admin=bool(row["is_admin"]),
        created_at=row["created_at"],
        avatar_url=row["avatar_url"],
        custom_background_url=row["custom_background_url"],
        custom_character_url=row["custom_character_url"],
        background_blur=int(row["background_blur"] or 0),
        background_opacity=float(row["background_opacity"] if row["background_opacity"] is not None else 0.6),
        show_character=bool(row["show_character"] if row["show_character"] is not None else True),
        character_scale=float(row["character_scale"] if row["character_scale"] is not None else 1.0),
    )


def _user_public_from_auth_user(user: _AuthUser) -> UserPublic:
    """从 _AuthUser 实例构造 UserPublic。"""
    return UserPublic(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
        avatar_url=user.avatar_url,
        custom_background_url=user.custom_background_url,
        custom_character_url=user.custom_character_url,
        background_blur=user.background_blur,
        background_opacity=user.background_opacity,
        show_character=user.show_character,
        character_scale=user.character_scale,
    )


async def _get_user_by_username(pool: asyncpg.Pool, username: str) -> asyncpg.Record | None:
    """按用户名查找用户记录。"""
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            """
            SELECT id, username, email, password_hash, password_salt, is_active, is_admin, created_at,
                   avatar_url, custom_background_url, custom_character_url,
                   background_blur, background_opacity, show_character, character_scale
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
            SELECT u.id, u.username, u.email, u.is_active, u.is_admin, u.created_at,
                   u.avatar_url, u.custom_background_url, u.custom_character_url,
                   u.background_blur, u.background_opacity, u.show_character, u.character_scale
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
        email=row.get("email"),
        is_active=bool(row["is_active"]),
        is_admin=bool(row["is_admin"]),
        created_at=row["created_at"],
        avatar_url=row["avatar_url"],
        custom_background_url=row["custom_background_url"],
        custom_character_url=row["custom_character_url"],
        background_blur=int(row["background_blur"] or 0),
        background_opacity=float(row["background_opacity"] if row["background_opacity"] is not None else 0.6),
        show_character=bool(row["show_character"] if row["show_character"] is not None else True),
        character_scale=float(row["character_scale"] if row["character_scale"] is not None else 1.0),
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
            RETURNING id, username, email, is_active, is_admin, created_at,
                      avatar_url, custom_background_url, custom_character_url,
                      background_blur, background_opacity, show_character, character_scale
            """,
            payload.username,
            password_hash,
            password_salt,
        )
    return _user_public_from_row(row)


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
    return _user_public_from_auth_user(user)


@router.get("/users", response_model=list[UserPublic])
async def list_users(
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
) -> list[UserPublic]:
    """列出用户：管理员返回全部；非管理员仅返回自己。"""
    if not user.is_admin:
        return [_user_public_from_auth_user(user)]

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, username, email, is_active, is_admin, created_at,
                   avatar_url, custom_background_url, custom_character_url,
                   background_blur, background_opacity, show_character, character_scale
            FROM auth_users
            ORDER BY id DESC
            LIMIT 100
            """
        )
    return [_user_public_from_row(r) for r in rows]


@router.post("/upload")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    category: str | None = Query(None, description="上传类别: background 或 character，不传则不限制"),
    user: _AuthUser = Depends(get_current_user),
) -> dict[str, str]:
    """上传图片文件，返回可访问的 URL。category 为 background/character 时限额 3 张，超出自动删除最旧的。"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少文件名")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in _ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的图片格式，允许: {', '.join(sorted(_ALLOWED_IMAGE_EXTENSIONS))}")

    if category is not None and category not in _UPLOAD_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"无效的 category，允许: {', '.join(sorted(_UPLOAD_CATEGORIES))}")

    content = await file.read()
    if len(content) > _MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过 5MB 限制")

    file_hash = hashlib.sha256(content).hexdigest()
    filename = f"{file_hash}.{ext}"
    url = f"/uploads/{filename}"
    dest = _UPLOADS_DIR / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(dest.write_bytes, content)

    # 有 category 时进行限额管理
    if category is not None:
        pool = _pool_from_request(request)
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, url FROM user_uploads WHERE user_id = $1 AND category = $2 ORDER BY created_at ASC",
                user.id, category,
            )
            # 超过限额时删除最旧的记录和对应文件
            while len(rows) >= _MAX_UPLOADS_PER_CATEGORY:
                oldest = rows.pop(0)
                old_path = _UPLOADS_DIR / Path(str(oldest["url"])).name
                if old_path.exists():
                    await asyncio.to_thread(old_path.unlink)
                await conn.execute("DELETE FROM user_uploads WHERE id = $1", oldest["id"])
            await conn.execute(
                "INSERT INTO user_uploads(user_id, category, url) VALUES($1, $2, $3)",
                user.id, category, url,
            )

    return {"url": url}


@router.get("/uploads")
async def get_user_uploads(
    request: Request,
    user: _AuthUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """获取当前用户的上传记录列表。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT url, category, created_at FROM user_uploads WHERE user_id = $1 ORDER BY created_at DESC",
            user.id,
        )
    return [{"url": r["url"], "category": r["category"], "created_at": r["created_at"].isoformat()} for r in rows]


class UploadDeleteRequest(BaseModel):
    url: str


@router.delete("/uploads")
async def delete_user_upload(
    request: Request,
    payload: UploadDeleteRequest,
    user: _AuthUser = Depends(get_current_user),
) -> dict[str, str]:
    """删除当前用户的一条上传记录及其文件。"""
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "DELETE FROM user_uploads WHERE user_id = $1 AND url = $2 RETURNING url",
            user.id, payload.url,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="上传记录不存在")
    # 删除磁盘文件（如果无其他记录引用同一文件则删除）
    file_path = _UPLOADS_DIR / Path(payload.url).name
    if file_path.exists():
        async with pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM user_uploads WHERE url = $1", payload.url,
            )
        if count == 0:
            await asyncio.to_thread(file_path.unlink)
    return {"detail": "已删除"}


@router.patch("/profile", response_model=UserPublic)
async def update_profile(
    request: Request,
    payload: ProfileUpdateRequest,
    user: _AuthUser = Depends(get_current_user),
) -> UserPublic:
    """更新当前用户的个性化配置。"""
    field_map: dict[str, Any] = {
        "avatar_url": payload.avatar_url,
        "custom_background_url": payload.custom_background_url,
        "custom_character_url": payload.custom_character_url,
        "background_blur": payload.background_blur,
        "background_opacity": payload.background_opacity,
        "show_character": payload.show_character,
        "character_scale": payload.character_scale,
    }
    updates = {k: v for k, v in field_map.items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="未提供任何更新字段")

    set_clauses = []
    params: list[Any] = []
    for i, (col, val) in enumerate(updates.items(), start=1):
        set_clauses.append(f"{col} = ${i}")
        params.append(val)
    params.append(user.id)
    user_id_placeholder = f"${len(params)}"

    sql = (
        f"UPDATE auth_users SET {', '.join(set_clauses)} "
        f"WHERE id = {user_id_placeholder} "
        f"RETURNING id, username, email, is_active, is_admin, created_at, "
        f"avatar_url, custom_background_url, custom_character_url, "
        f"background_blur, background_opacity, show_character, character_scale"
    )

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *params)
    if row is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return _user_public_from_row(row)
