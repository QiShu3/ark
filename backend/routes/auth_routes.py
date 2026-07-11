import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import asyncpg
import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from lib.captcha_service import (
    generate_captcha,
    record_login_failure,
    reset_login_failures,
    verify_captcha,
)
from lib.captcha_service import (
    needs_captcha as _needs_captcha,
)

_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
_ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
_MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5MB
_MAX_UPLOADS_PER_CATEGORY = 3
_UPLOAD_CATEGORIES = {"background", "character"}

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=256)
    captcha_id: str | None = None
    captcha_code: str | None = None


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    captcha_id: str | None = None
    captcha_code: str | None = None


class VerifyEmailRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    code: str = Field(min_length=6, max_length=6)


class ResendVerificationRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16, max_length=256)
    password: str = Field(min_length=8, max_length=256)


class OkResponse(BaseModel):
    ok: bool = True


class CaptchaResponse(BaseModel):
    captcha_id: str
    image_base64: str
    needs_captcha: bool = False


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
    email_verified_at: datetime | None = None
    is_active: bool
    is_admin: bool
    is_guest: bool = False
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
    email_verified_at: datetime | None
    is_active: bool
    is_admin: bool
    is_guest: bool = False
    created_at: datetime = None  # type: ignore[assignment]
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


def _email_token_ttl_seconds() -> int:
    raw = os.getenv("AUTH_EMAIL_TOKEN_TTL_SECONDS", "1800").strip() or "1800"
    try:
        ttl = int(raw)
    except Exception:
        ttl = 1800
    return max(300, min(ttl, 60 * 60 * 24))


def _normalize_email(email: str) -> str:
    value = email.strip().lower()
    if len(value) < 5 or len(value) > 254 or "@" not in value:
        raise HTTPException(status_code=422, detail="邮箱格式无效")
    local, domain = value.rsplit("@", 1)
    if not local or not domain or "." not in domain or any(ch.isspace() for ch in value):
        raise HTTPException(status_code=422, detail="邮箱格式无效")
    return value


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


def _hash_email_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_email_secret(purpose: str) -> str:
    if purpose == "email_verify":
        return f"{secrets.randbelow(1_000_000):06d}"
    return secrets.token_urlsafe(32)


def _email_delivery_mode() -> str:
    raw = os.getenv("AUTH_EMAIL_DELIVERY_MODE", "").strip().lower()
    if raw in {"log", "tencent", "disabled"}:
        return raw
    if os.getenv("TENCENTCLOUD_SECRET_ID", "").strip() and os.getenv("TENCENTCLOUD_SECRET_KEY", "").strip():
        return "tencent"
    return "log"


def _tencent_secret_id() -> str:
    value = os.getenv("TENCENTCLOUD_SECRET_ID", "").strip()
    if value:
        return value
    raise HTTPException(status_code=503, detail="TENCENTCLOUD_SECRET_ID 未配置")


def _tencent_secret_key() -> str:
    value = os.getenv("TENCENTCLOUD_SECRET_KEY", "").strip()
    if value:
        return value
    raise HTTPException(status_code=503, detail="TENCENTCLOUD_SECRET_KEY 未配置")


def _tencent_ses_region() -> str:
    return os.getenv("TENCENT_SES_REGION", "ap-guangzhou").strip() or "ap-guangzhou"


def _tencent_ses_from_email() -> str:
    value = os.getenv("TENCENT_SES_FROM_EMAIL", "ark@strangetalking.xin").strip()
    if value:
        return value
    raise HTTPException(status_code=503, detail="TENCENT_SES_FROM_EMAIL 未配置")


def _tencent_ses_verify_template_id() -> str:
    return os.getenv("TENCENT_SES_VERIFY_TEMPLATE_ID", "48702").strip() or "48702"


def _tencent_ses_reset_template_id() -> str:
    return os.getenv("TENCENT_SES_RESET_TEMPLATE_ID", "48701").strip() or "48701"


def _hmac_sha256(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _build_tencent_auth_headers(*, action: str, payload: str, timestamp: int) -> dict[str, str]:
    host = "ses.tencentcloudapi.com"
    service = "ses"
    algorithm = "TC3-HMAC-SHA256"
    date = datetime.fromtimestamp(timestamp, UTC).strftime("%Y-%m-%d")
    canonical_headers = f"content-type:application/json; charset=utf-8\nhost:{host}\nx-tc-action:{action.lower()}\n"
    signed_headers = "content-type;host;x-tc-action"
    canonical_request = "\n".join(["POST", "/", "", canonical_headers, signed_headers, _sha256_hex(payload)])
    credential_scope = f"{date}/{service}/tc3_request"
    string_to_sign = "\n".join([algorithm, str(timestamp), credential_scope, _sha256_hex(canonical_request)])
    secret_date = _hmac_sha256(("TC3" + _tencent_secret_key()).encode("utf-8"), date)
    secret_service = _hmac_sha256(secret_date, service)
    secret_signing = _hmac_sha256(secret_service, "tc3_request")
    signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    authorization = (
        f"{algorithm} Credential={_tencent_secret_id()}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    return {
        "Authorization": authorization,
        "Content-Type": "application/json; charset=utf-8",
        "Host": host,
        "X-TC-Action": action,
        "X-TC-Region": _tencent_ses_region(),
        "X-TC-Timestamp": str(timestamp),
        "X-TC-Version": "2020-10-02",
    }


def _send_tencent_template_email(
    *,
    to_email: str,
    subject: str,
    template_id: str,
    template_data: dict[str, str],
) -> None:
    payload = json.dumps(
        {
            "FromEmailAddress": _tencent_ses_from_email(),
            "Destination": [to_email],
            "Subject": subject,
            "Template": {
                "TemplateID": int(template_id) if template_id.isdigit() else template_id,
                "TemplateData": json.dumps(template_data, ensure_ascii=False, separators=(",", ":")),
            },
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    timestamp = int(datetime.now(UTC).timestamp())
    try:
        response = httpx.post(
            "https://ses.tencentcloudapi.com",
            content=payload.encode("utf-8"),
            headers=_build_tencent_auth_headers(action="SendEmail", payload=payload, timestamp=timestamp),
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="邮件发送失败") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="邮件发送失败")
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="邮件服务返回无效响应") from exc
    err = data.get("Response", {}).get("Error") if isinstance(data, dict) else None
    if err:
        message = err.get("Message") if isinstance(err, dict) else None
        raise HTTPException(status_code=502, detail=f"邮件发送失败：{message or '腾讯云返回错误'}")


def _send_auth_email(*, to_email: str, purpose: str, token: str) -> None:
    if purpose == "email_verify":
        subject = "你的 Ark 邮箱验证码"
        template_id = _tencent_ses_verify_template_id()
        template_data = {"verify_code": token}
    elif purpose == "password_reset":
        subject = "重置你的 Ark 密码"
        template_id = _tencent_ses_reset_template_id()
        template_data = {"reset_token": token}
    else:
        raise HTTPException(status_code=500, detail="未知邮件类型")

    mode = _email_delivery_mode()
    if mode == "disabled":
        return
    if mode == "log":
        print(f"[auth-email] to={to_email} purpose={purpose} template={template_id} data={template_data}")
        return
    _send_tencent_template_email(
        to_email=to_email,
        subject=subject,
        template_id=template_id,
        template_data=template_data,
    )


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
              email TEXT,
              email_verified_at TIMESTAMPTZ,
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
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS email TEXT;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_email_tokens (
              token_hash TEXT PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              purpose TEXT NOT NULL,
              recipient_email TEXT NOT NULL,
              expires_at TIMESTAMPTZ NOT NULL,
              consumed_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_auth_email_tokens_purpose CHECK (purpose IN ('email_verify', 'password_reset'))
            );
            """
        )
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_email_lower ON auth_users (LOWER(email)) WHERE email IS NOT NULL;"
        )
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_email_tokens_user_id ON auth_email_tokens(user_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_email_tokens_expires_at ON auth_email_tokens(expires_at);")
        # 迁移：为 auth_users 添加个性化配置列
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS custom_background_url TEXT DEFAULT NULL;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS custom_character_url TEXT DEFAULT NULL;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS background_blur INTEGER DEFAULT 0;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS background_opacity REAL DEFAULT 0.6;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS show_character BOOLEAN DEFAULT TRUE;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS character_scale REAL DEFAULT 1.0;")
        await conn.execute("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT FALSE;")
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
        email_verified_at=row.get("email_verified_at"),
        is_active=bool(row["is_active"]),
        is_admin=bool(row["is_admin"]),
        is_guest=bool(row["is_guest"]) if "is_guest" in row.keys() else False,
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
        email_verified_at=user.email_verified_at,
        is_active=user.is_active,
        is_admin=user.is_admin,
        is_guest=user.is_guest,
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
            SELECT id, username, email, email_verified_at, password_hash, password_salt, is_active, is_admin,
                   is_guest, created_at,
                   avatar_url, custom_background_url, custom_character_url,
                   background_blur, background_opacity, show_character, character_scale
            FROM auth_users
            WHERE username = $1
            """,
            username,
        )


async def _get_user_by_email(pool: asyncpg.Pool, email: str) -> asyncpg.Record | None:
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            """
            SELECT id, username, email, email_verified_at, password_hash, password_salt, is_active, is_admin,
                   is_guest, created_at,
                   avatar_url, custom_background_url, custom_character_url,
                   background_blur, background_opacity, show_character, character_scale
            FROM auth_users
            WHERE LOWER(email) = LOWER($1)
            """,
            email,
        )


async def _issue_email_token(pool: asyncpg.Pool, *, user_id: int, recipient_email: str, purpose: str) -> str:
    token = _new_email_secret(purpose)
    token_hash = _hash_email_token(token)
    expires_at = _utc_now() + timedelta(seconds=_email_token_ttl_seconds())
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM auth_email_tokens WHERE expires_at <= NOW();")
        recent_count = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM auth_email_tokens
            WHERE user_id = $1 AND purpose = $2 AND created_at > NOW() - INTERVAL '1 minute'
            """,
            user_id,
            purpose,
        )
        if int(recent_count or 0) > 0:
            raise HTTPException(status_code=429, detail="邮件发送太频繁，请稍后再试")
        await conn.execute(
            """
            INSERT INTO auth_email_tokens(token_hash, user_id, purpose, recipient_email, expires_at)
            VALUES ($1, $2, $3, $4, $5)
            """,
            token_hash,
            user_id,
            purpose,
            recipient_email,
            expires_at,
        )
    return token


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
            SELECT u.id, u.username, u.email, u.email_verified_at, u.is_active, u.is_admin, u.is_guest,
                   u.created_at,
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
        email_verified_at=row.get("email_verified_at"),
        is_active=bool(row["is_active"]),
        is_admin=bool(row["is_admin"]),
        is_guest=bool(row["is_guest"]) if "is_guest" in row.keys() else False,
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


@router.get("/captcha", response_model=CaptchaResponse)
async def get_captcha(request: Request) -> CaptchaResponse:
    """获取图形验证码。

    返回 captcha_id 和 base64 编码的图片。登录/注册时需同时提交 captcha_id 和用户输入的验证码。
    """
    import asyncio

    captcha_id, image_bytes = await asyncio.to_thread(generate_captcha)
    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    return CaptchaResponse(captcha_id=captcha_id, image_base64=image_b64)


@router.get("/captcha/required")
async def captcha_required(request: Request) -> dict[str, bool]:
    """查询当前 IP 是否需要输入验证码（登录失败达到阈值后返回 true）。"""
    ip = _client_ip(request)
    return {"required": _needs_captcha(ip)}


def _client_ip(request: Request) -> str:
    """获取客户端 IP（优先取 X-Forwarded-For 第一个）。"""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/register", response_model=UserPublic)
async def register(request: Request, payload: RegisterRequest) -> UserPublic:
    """注册新用户。"""
    # 注册必须校验验证码
    if not payload.captcha_id or not payload.captcha_code:
        raise HTTPException(status_code=400, detail="请输入验证码")
    if not verify_captcha(payload.captcha_id, payload.captcha_code):
        raise HTTPException(status_code=400, detail="验证码错误或已过期")

    pool = _pool_from_request(request)
    email = _normalize_email(payload.email)
    existing = await _get_user_by_username(pool, payload.username)
    if existing is not None:
        raise HTTPException(status_code=409, detail="用户名已存在")
    existing_email = await _get_user_by_email(pool, email)
    if existing_email is not None:
        raise HTTPException(status_code=409, detail="邮箱已被使用")

    password_hash, password_salt = _hash_password(payload.password)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO auth_users(username, email, password_hash, password_salt)
            VALUES ($1, $2, $3, $4)
            RETURNING id, username, email, email_verified_at, is_active, is_admin, created_at,
                      avatar_url, custom_background_url, custom_character_url,
                      background_blur, background_opacity, show_character, character_scale
            """,
            payload.username,
            email,
            password_hash,
            password_salt,
        )
    token = await _issue_email_token(pool, user_id=int(row["id"]), recipient_email=email, purpose="email_verify")
    _send_auth_email(to_email=email, purpose="email_verify", token=token)
    return _user_public_from_row(row)


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, payload: LoginRequest) -> TokenResponse:
    """用户登录并获取访问令牌。"""
    ip = _client_ip(request)

    # 失败达到阈值后必须输入验证码
    if _needs_captcha(ip):
        if not payload.captcha_id or not payload.captcha_code:
            raise HTTPException(status_code=400, detail="请输入验证码")
        if not verify_captcha(payload.captcha_id, payload.captcha_code):
            raise HTTPException(status_code=400, detail="验证码错误或已过期")

    pool = _pool_from_request(request)
    row = await _get_user_by_username(pool, payload.username)
    if row is None:
        record_login_failure(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if not bool(row["is_active"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被禁用")
    if row["email"] is not None and row["email_verified_at"] is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="邮箱未验证，请先查收邮箱验证码")

    ok = _verify_password(
        payload.password,
        password_hash_b64=str(row["password_hash"]),
        salt_b64=str(row["password_salt"]),
    )
    if not ok:
        record_login_failure(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")

    reset_login_failures(ip)
    token, ttl = await _issue_token(pool, int(row["id"]))
    return TokenResponse(access_token=token, expires_in=ttl)


@router.post("/guest", response_model=TokenResponse)
async def guest_login(request: Request) -> TokenResponse:
    """游客登录：自动创建临时游客用户并签发访问令牌。"""
    pool = _pool_from_request(request)

    # 生成唯一的游客用户名
    for _ in range(10):
        suffix = secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8]
        username = f"guest_{suffix}"
        async with pool.acquire() as conn:
            existing = await conn.fetchval("SELECT id FROM auth_users WHERE username = $1", username)
        if existing is None:
            break
    else:
        raise HTTPException(status_code=500, detail="无法生成唯一用户名，请稍后重试")

    # 创建游客用户（无密码、无邮箱）
    dummy_hash, dummy_salt = _hash_password(secrets.token_urlsafe(32))
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO auth_users (username, password_hash, password_salt, is_guest)
            VALUES ($1, $2, $3, TRUE)
            RETURNING id
            """,
            username,
            dummy_hash,
            dummy_salt,
        )

    token, ttl = await _issue_token(pool, int(row["id"]))
    return TokenResponse(access_token=token, expires_in=ttl)


class GuestEventSetupRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=50)
    major: str = Field(min_length=1, max_length=50)


class GuestEventSetupResponse(BaseModel):
    event_id: str
    event_name: str


@router.post("/guest/setup-event", response_model=GuestEventSetupResponse)
async def guest_setup_event(
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
    payload: GuestEventSetupRequest,
) -> GuestEventSetupResponse:
    """游客引导：创建主事件。目前仅支持 event_type='kaoyan' + major='22408'。"""
    if not user.is_guest:
        raise HTTPException(status_code=403, detail="仅游客可使用此接口")
    if payload.event_type != "kaoyan":
        raise HTTPException(status_code=400, detail="暂仅支持考研")
    if payload.major != "22408":
        raise HTTPException(status_code=400, detail="暂仅支持22408")

    from datetime import date as _date

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        # 清除已有主事件
        await conn.execute(
            "UPDATE events SET is_primary = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_primary = TRUE",
            int(user.id),
        )
        row = await conn.fetchrow(
            """
            INSERT INTO events (user_id, name, start_date, due_at, is_primary)
            VALUES ($1, $2, $3, $4, TRUE)
            RETURNING id::text
            """,
            int(user.id),
            "22408考研",
            _date.today(),
            datetime(2026, 12, 20, 0, 0, 0),
        )
    return GuestEventSetupResponse(event_id=str(row["id"]), event_name="22408考研")


@router.post("/verify-email", response_model=OkResponse)
async def verify_email(request: Request, payload: VerifyEmailRequest) -> OkResponse:
    pool = _pool_from_request(request)
    code = payload.code.strip()
    if not code.isdigit():
        raise HTTPException(status_code=422, detail="验证码格式无效")
    email = _normalize_email(payload.email)
    token_hash = _hash_email_token(code)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT token_hash, user_id, recipient_email
            FROM auth_email_tokens
            WHERE token_hash = $1
              AND LOWER(recipient_email) = LOWER($2)
              AND purpose = 'email_verify'
              AND consumed_at IS NULL
              AND expires_at > NOW()
            """,
            token_hash,
            email,
        )
        if row is None:
            raise HTTPException(status_code=400, detail="验证码无效或已过期")
        await conn.execute(
            """
            UPDATE auth_users
            SET email_verified_at = COALESCE(email_verified_at, NOW())
            WHERE id = $1 AND LOWER(email) = LOWER($2)
            """,
            int(row["user_id"]),
            str(row["recipient_email"]),
        )
        await conn.execute(
            "UPDATE auth_email_tokens SET consumed_at = NOW() WHERE token_hash = $1",
            token_hash,
        )
    return OkResponse()


@router.post("/verification/resend", response_model=OkResponse)
async def resend_verification(request: Request, payload: ResendVerificationRequest) -> OkResponse:
    pool = _pool_from_request(request)
    row = await _get_user_by_username(pool, payload.username)
    if row is None or row["email"] is None or row["email_verified_at"] is not None or not bool(row["is_active"]):
        return OkResponse()
    token = await _issue_email_token(pool, user_id=int(row["id"]), recipient_email=str(row["email"]), purpose="email_verify")
    _send_auth_email(to_email=str(row["email"]), purpose="email_verify", token=token)
    return OkResponse()


@router.post("/password/forgot", response_model=OkResponse)
async def forgot_password(request: Request, payload: ForgotPasswordRequest) -> OkResponse:
    pool = _pool_from_request(request)
    email = _normalize_email(payload.email)
    row = await _get_user_by_email(pool, email)
    if row is None or row["email_verified_at"] is None or not bool(row["is_active"]):
        return OkResponse()
    try:
        token = await _issue_email_token(pool, user_id=int(row["id"]), recipient_email=email, purpose="password_reset")
    except HTTPException as exc:
        if exc.status_code == 429:
            return OkResponse()
        raise
    _send_auth_email(to_email=email, purpose="password_reset", token=token)
    return OkResponse()


@router.post("/password/reset", response_model=OkResponse)
async def reset_password(request: Request, payload: ResetPasswordRequest) -> OkResponse:
    pool = _pool_from_request(request)
    token_hash = _hash_email_token(payload.token)
    password_hash, password_salt = _hash_password(payload.password)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT token_hash, user_id
            FROM auth_email_tokens
            WHERE token_hash = $1
              AND purpose = 'password_reset'
              AND consumed_at IS NULL
              AND expires_at > NOW()
            """,
            token_hash,
        )
        if row is None:
            raise HTTPException(status_code=400, detail="重置链接无效或已过期")
        user_id = int(row["user_id"])
        await conn.execute(
            """
            UPDATE auth_users
            SET password_hash = $1, password_salt = $2
            WHERE id = $3
            """,
            password_hash,
            password_salt,
            user_id,
        )
        await conn.execute("UPDATE auth_email_tokens SET consumed_at = NOW() WHERE token_hash = $1", token_hash)
    return OkResponse()


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
            SELECT id, username, email, email_verified_at, is_active, is_admin, created_at,
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
        f"RETURNING id, username, email, email_verified_at, is_active, is_admin, created_at, "
        f"avatar_url, custom_background_url, custom_character_url, "
        f"background_blur, background_opacity, show_character, character_scale"
    )

    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *params)
    if row is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return _user_public_from_row(row)
