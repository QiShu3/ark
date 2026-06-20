"""Admin panel API routes — /api/admin/*"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import re
import secrets
import zipfile
from datetime import date, timedelta
from pathlib import Path
from pathlib import Path as _Path
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field

from lib.content_selector import derive_content_selector
from lib.sub_app_registry import FocusWorkDeclaration, SubAppDeclaration, get_all, register
from routes.auth_routes import _AuthUser, get_current_user
from routes.choice.repository import list_set_rows as list_erc_set_rows
from routes.vocab.repository import list_vocab_decks

# --- Import logger setup ---
_LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)
_import_logger = logging.getLogger("admin.import")
_import_logger.setLevel(logging.DEBUG)
if not _import_logger.handlers:
    _fh = logging.FileHandler(_LOG_DIR / "admin_import.log", encoding="utf-8")
    _fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
    _import_logger.addHandler(_fh)

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
    id: str
    name: str
    icon: str
    description: str
    url: str
    stats: str


class SubAppsResponse(BaseModel):
    apps: list[SubApp]


ICON_EMOJI: dict[str, str] = {
    "book-open": "📚",
    "scroll-text": "📖",
}


async def _query_app_stats(conn: Any, app_id: str, bank_type: str) -> str:
    """Query live stats for a registered sub-app based on its content bank type."""
    if app_id == "vocab":
        deck_count = await conn.fetchval("SELECT COUNT(*) FROM vocab_decks")
        word_count = await conn.fetchval("SELECT COUNT(*) FROM vocab_words")
        return f"{deck_count} 词库 / {word_count:,} 词"
    if app_id == "erc":
        set_count = await conn.fetchval("SELECT COUNT(*) FROM choice_sets")
        article_count = await conn.fetchval("SELECT COUNT(*) FROM choice_articles")
        return f"{set_count} 阅读集 / {article_count} 篇文章"
    # generic fallback for new sub-apps
    return "—"


@router.get("/apps", response_model=SubAppsResponse)
async def list_apps(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> SubAppsResponse:
    declarations = get_all()
    pool = _pool(request)
    apps: list[SubApp] = []
    async with pool.acquire() as conn:
        for decl in declarations:
            bank_type = decl.focus_works[0].content_bank_type if decl.focus_works else ""
            stats = await _query_app_stats(conn, decl.id, bank_type)
            apps.append(SubApp(
                id=decl.id,
                name=decl.name,
                icon=ICON_EMOJI.get(decl.icon, "📦"),
                description=decl.description,
                url=f"apps-{decl.id}.html" if decl.id not in ("vocab", "erc") else f"apps-{decl.id}.html",
                stats=stats,
            ))
    return SubAppsResponse(apps=apps)


# ---- Register new sub-app ----

class NewFocusWork(BaseModel):
    type: str
    label: str
    template: str = "choice_question"
    content_bank_type: str = "article_set"
    content_fields: list[dict] = []

class NewSubAppRequest(BaseModel):
    id: str
    name: str
    description: str
    icon: str = "book-open"
    route: str
    focus_works: list[NewFocusWork] = []


@router.post("/apps")
async def create_app(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
    file: UploadFile = File(...),
    id: str = Form(...),
    name: str = Form(...),
    description: str = Form(...),
    icon: str = Form("book-open"),
    route: str = Form(...),
    template: str = Form("choice_question"),
    content_bank_type: str = Form("article_set"),
    fw_type: str = Form(...),
    fw_label: str = Form(...),
    admin_only: bool = Form(False),
):
    """Register a new sub-app, generate backend skeleton, and import question bank."""
    if not id.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="应用 ID 只能包含字母、数字、连字符和下划线")

    # parse question bank file
    file_bytes = await file.read()
    try:
        questions = json.loads(file_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="题库文件不是有效的 JSON")
    if not isinstance(questions, list):
        raise HTTPException(status_code=400, detail="题库文件应为一个 JSON 数组")

    question_count = len(questions)

    fw = FocusWorkDeclaration(
        type=fw_type,
        label=fw_label,
        template=template,
        content_bank_type=content_bank_type,
        content_selector=derive_content_selector(template, fw_type),
        content_fields=[],
    )
    decl = SubAppDeclaration(
        id=id, name=name, description=description,
        icon=icon, route=f"/{id}", admin_only=admin_only, focus_works=[fw],
    )
    register(decl)
    _generate_app_skeleton(decl)

    # import questions into DB
    pool = _pool(request)
    async with pool.acquire() as conn:
        await _import_question_bank(conn, app_id=id, questions=questions)

    return {"status": "ok", "id": id, "question_count": question_count}


async def _import_question_bank(conn: Any, *, app_id: str, questions: list[dict]) -> None:
    """Import questions from a parsed JSON array into the app's question table."""
    py_id = app_id.replace("-", "_")
    table = f"{py_id}_questions"
    set_table = f"{py_id}_sets"

    # ensure tables exist
    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {set_table} (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            key TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            is_published BOOLEAN NOT NULL DEFAULT true,
            item_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {table} (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            set_id UUID REFERENCES {set_table}(id) ON DELETE CASCADE,
            question_id TEXT UNIQUE NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            stem TEXT NOT NULL,
            options_json JSONB NOT NULL DEFAULT '[]',
            answer TEXT NOT NULL DEFAULT '',
            explanation TEXT DEFAULT '',
            meta_json JSONB NOT NULL DEFAULT '{{}}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)

    # create a default set
    set_key = f"{app_id}-default"
    set_id_row = await conn.fetchrow(
        f"SELECT id FROM {set_table} WHERE key = $1", set_key,
    )
    if set_id_row is None:
        set_id_row = await conn.fetchrow(
            f"INSERT INTO {set_table} (key, name) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET updated_at = NOW() RETURNING id",
            set_key, f"{app_id} 默认题库",
        )
    set_id = set_id_row["id"]

    # import questions
    for i, q in enumerate(questions):
        stem = q.get("stem", "")
        options = q.get("options", [])
        answer = q.get("answer", "")
        explanation = q.get("explanation", "")
        qid = q.get("id", f"{app_id}-{i}")
        # store year/subject/number as meta
        meta = {k: v for k, v in q.items() if k not in ("id", "stem", "options", "answer", "explanation")}

        await conn.execute(
            f"INSERT INTO {table} (set_id, question_id, sort_order, stem, options_json, answer, explanation, meta_json) "
            "VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb) "
            "ON CONFLICT (question_id) DO UPDATE SET stem=EXCLUDED.stem, options_json=EXCLUDED.options_json, answer=EXCLUDED.answer, explanation=EXCLUDED.explanation",
            set_id, qid, i,
            stem,
            json.dumps(options, ensure_ascii=False),
            answer,
            explanation,
            json.dumps(meta, ensure_ascii=False),
        )

    # ---- user progress tables ----
    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {py_id}_user_question_cards (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
            question_pk UUID NOT NULL REFERENCES {table}(id) ON DELETE CASCADE,
            due_at TIMESTAMPTZ,
            fsrs_card_json JSONB NOT NULL DEFAULT '{{}}',
            wrong_count INTEGER NOT NULL DEFAULT 0,
            right_count INTEGER NOT NULL DEFAULT 0,
            lapse_count INTEGER NOT NULL DEFAULT 0,
            last_review_at TIMESTAMPTZ,
            last_answer_correct BOOLEAN,
            last_chosen_option TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, question_pk)
        );
    """)
    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {py_id}_review_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
            question_pk UUID NOT NULL REFERENCES {table}(id) ON DELETE CASCADE,
            chosen_option TEXT NOT NULL,
            is_correct BOOLEAN NOT NULL,
            time_spent_ms INTEGER,
            rating TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {py_id}_mistake_bucket (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
            question_pk UUID NOT NULL REFERENCES {table}(id) ON DELETE CASCADE,
            article_pk UUID,
            wrong_count INTEGER NOT NULL DEFAULT 1,
            last_wrong_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            is_active BOOLEAN NOT NULL DEFAULT true,
            UNIQUE(user_id, question_pk)
        );
    """)

    # update count
    await conn.execute(f"UPDATE {set_table} SET item_count = (SELECT COUNT(*) FROM {table}) WHERE id = $1", set_id)
    print(f"[sub_app_registry] Imported {len(questions)} questions into '{app_id}' with user progress tables")


def _generate_app_skeleton(decl: SubAppDeclaration) -> None:
    """Generate backend domain skeleton for a new sub-app."""
    app_id = decl.id
    app_name = decl.name
    py_id = app_id.replace("-", "_")  # sanitize for Python identifiers + directory names
    selector_name = decl.focus_works[0].content_selector
    app_dir = os.path.join(os.path.dirname(__file__), "..", "routes", py_id)
    os.makedirs(app_dir, exist_ok=True)

    qt = f"{py_id}_questions"
    cards = f"{py_id}_user_question_cards"
    logs = f"{py_id}_review_logs"
    mistakes = f"{py_id}_mistake_bucket"

    # __init__.py
    with open(os.path.join(app_dir, "__init__.py"), "w") as f:
        f.write(f'''"""Sub-app: {app_name}"""
from .routes import router


async def init_{py_id}(pool):
    from .repository import init_tables
    await init_tables(pool)
''')

    # repository.py
    with open(os.path.join(app_dir, "repository.py"), "w") as f:
        f.write(f'''"""DB tables and queries for {app_name}."""
import json
from typing import Any
from datetime import datetime, timedelta, timezone

import asyncpg

UTC = timezone.utc


async def init_tables(pool: asyncpg.Pool) -> None:
    """Create tables if not exist (questions + progress tables created by admin import)."""
    # tables created by admin import — this is a no-op placeholder
    pass


# ---- Sets ----

async def list_set_rows(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    return await conn.fetch(
        f"SELECT id, key, name, item_count, is_published FROM {app_id}_sets WHERE is_published = TRUE ORDER BY name"
    )


# ---- Overview ----

async def get_overview_counts(conn: asyncpg.Connection, *, user_id: int, set_id: str | None = None) -> dict[str, Any]:
    row = await conn.fetchrow(
        f"""
        SELECT
          (SELECT COUNT(*)::int FROM {logs} WHERE user_id = $1) AS practiced_count,
          (SELECT COUNT(*)::int FROM {logs} WHERE user_id = $1 AND is_correct = TRUE) AS correct_count,
          (SELECT COUNT(*)::int FROM {cards} WHERE user_id = $1 AND due_at IS NOT NULL AND due_at <= NOW()) AS due_count,
          (SELECT COUNT(*)::int FROM {mistakes} WHERE user_id = $1 AND is_active = TRUE) AS mistake_count
        """,
        user_id,
    )
    return dict(row) if row else {{"practiced_count": 0, "correct_count": 0, "due_count": 0, "mistake_count": 0}}


# ---- Review ----

async def list_due_card_rows(conn: asyncpg.Connection, *, user_id: int, limit: int, set_id: str | None = None) -> list[asyncpg.Record]:
    return await conn.fetch(
        f"""
        SELECT c.question_pk::text, c.due_at, c.fsrs_card_json, c.wrong_count, c.right_count, c.lapse_count,
               q.question_id, q.stem, q.options_json, q.answer, q.explanation, q.meta_json,
               COALESCE(m.is_active, FALSE) AS is_mistake
        FROM {cards} c
        JOIN {qt} q ON q.id = c.question_pk
        LEFT JOIN {mistakes} m ON m.user_id = c.user_id AND m.question_pk = c.question_pk
        WHERE c.user_id = $1 AND c.due_at IS NOT NULL AND c.due_at <= NOW()
        ORDER BY COALESCE(m.is_active, FALSE) DESC, c.lapse_count DESC, c.due_at ASC
        LIMIT $2
        """,
        user_id, limit,
    )


async def get_next_due_at(conn: asyncpg.Connection, *, user_id: int) -> Any:
    row = await conn.fetchrow(
        f"SELECT MIN(due_at) AS next_due_at FROM {cards} WHERE user_id = $1 AND due_at > NOW()",
        user_id,
    )
    return row["next_due_at"] if row else None


# ---- Submit ----

async def upsert_question_card(conn: asyncpg.Connection, *, user_id: int, question_pk: str, is_correct: bool, chosen_option: str, fsrs_json: dict, next_due: datetime) -> None:
    await conn.execute(
        f"""INSERT INTO {cards} (user_id, question_pk, due_at, fsrs_card_json, wrong_count, right_count, lapse_count, last_review_at, last_answer_correct, last_chosen_option)
            VALUES ($1, $2::uuid, $3, $4::jsonb, $5, $6, $7, NOW(), $8, $9)
            ON CONFLICT (user_id, question_pk) DO UPDATE SET
              due_at=EXCLUDED.due_at, fsrs_card_json=EXCLUDED.fsrs_card_json,
              wrong_count={cards}.wrong_count + EXCLUDED.wrong_count,
              right_count={cards}.right_count + EXCLUDED.right_count,
              lapse_count={cards}.lapse_count + EXCLUDED.lapse_count,
              last_review_at=NOW(), last_answer_correct=EXCLUDED.last_answer_correct,
              last_chosen_option=EXCLUDED.last_chosen_option""",
        user_id, question_pk, next_due, json.dumps(fsrs_json, default=str),
        1 if not is_correct else 0, 1 if is_correct else 0, 1 if not is_correct else 0,
        is_correct, chosen_option,
    )


async def insert_review_log(conn: asyncpg.Connection, *, user_id: int, question_pk: str, chosen_option: str, is_correct: bool, rating: str | None = None) -> None:
    await conn.execute(
        f"INSERT INTO {logs} (user_id, question_pk, chosen_option, is_correct, rating) VALUES ($1, $2::uuid, $3, $4, $5)",
        user_id, question_pk, chosen_option, is_correct, rating,
    )


async def upsert_mistake(conn: asyncpg.Connection, *, user_id: int, question_pk: str, is_correct: bool) -> None:
    if is_correct:
        await conn.execute(
            f"UPDATE {mistakes} SET is_active = FALSE WHERE user_id = $1 AND question_pk = $2::uuid",
            user_id, question_pk,
        )
    else:
        await conn.execute(
            f"""INSERT INTO {mistakes} (user_id, question_pk, wrong_count, last_wrong_at, is_active)
                VALUES ($1, $2::uuid, 1, NOW(), TRUE)
                ON CONFLICT (user_id, question_pk) DO UPDATE SET wrong_count = {mistakes}.wrong_count + 1, last_wrong_at = NOW(), is_active = TRUE""",
            user_id, question_pk,
        )


# ---- Mistakes ----

async def list_mistake_rows(conn: asyncpg.Connection, *, user_id: int, set_id: str | None = None) -> list[asyncpg.Record]:
    return await conn.fetch(
        f"""
        SELECT q.question_id, q.stem, q.answer AS correct_option, c.last_chosen_option,
               m.wrong_count, m.last_wrong_at, COALESCE(c.due_at <= NOW(), FALSE) AS is_due
        FROM {mistakes} m
        JOIN {qt} q ON q.id = m.question_pk
        LEFT JOIN {cards} c ON c.user_id = m.user_id AND c.question_pk = m.question_pk
        WHERE m.user_id = $1 AND m.is_active = TRUE
        ORDER BY m.last_wrong_at DESC
        """,
        user_id,
    )
''')

    # schemas.py
    with open(os.path.join(app_dir, "schemas.py"), "w") as f:
        f.write(f'''"""Pydantic models for {app_name}."""
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class SetItem(BaseModel):
    id: str
    key: str
    name: str
    item_count: int
    is_published: bool


class OverviewOut(BaseModel):
    practiced_count: int
    correct_count: int
    accuracy: float
    due_count: int
    mistake_count: int


class QuestionItem(BaseModel):
    question_id: str
    stem: str
    options: list[dict]
    meta: dict | None = None


class ReviewNextOut(BaseModel):
    has_item: bool = False
    next_due_at: datetime | None = None
    question: QuestionItem | None = None


class ReviewSubmitIn(BaseModel):
    question_id: str
    chosen_option: str
    rating: str | None = None


class ReviewSubmitOut(BaseModel):
    is_correct: bool
    next_due_at: datetime | None = None


class MistakeItem(BaseModel):
    question_id: str
    stem: str
    correct_option: str
    last_chosen_option: str | None
    wrong_count: int
    last_wrong_at: datetime | None
    is_due: bool
''')

    # service.py
    with open(os.path.join(app_dir, "service.py"), "w") as f:
        f.write(f'''"""Business logic for {app_name}."""
import json
from typing import Any
from datetime import datetime, timezone
import asyncpg

from fsrs import Card, Rating, Scheduler

UTC = timezone.utc
_scheduler = Scheduler()


def _fsrs_rating(label: str | None) -> Rating:
    if label == "again": return Rating.Again
    if label == "hard": return Rating.Hard
    if label == "good": return Rating.Good
    if label == "easy": return Rating.Easy
    return Rating.Good


async def list_sets(pool: asyncpg.Pool) -> list[dict]:
    from .repository import list_set_rows
    async with pool.acquire() as conn:
        return [dict(r) for r in await list_set_rows(conn)]


async def get_overview(pool: asyncpg.Pool, *, user_id: int, set_id: str | None = None) -> dict:
    from .repository import get_overview_counts
    async with pool.acquire() as conn:
        counts = await get_overview_counts(conn, user_id=user_id, set_id=set_id)
    practiced = int(counts.get("practiced_count") or 0)
    correct = int(counts.get("correct_count") or 0)
    return {{
        "practiced_count": practiced,
        "correct_count": correct,
        "accuracy": correct / practiced if practiced else 0.0,
        "due_count": int(counts.get("due_count") or 0),
        "mistake_count": int(counts.get("mistake_count") or 0),
    }}


async def get_next_review(pool: asyncpg.Pool, *, user_id: int, set_id: str | None = None) -> dict:
    from .repository import get_next_due_at
    from lib.content_selector import get_selector
    selector = get_selector("{selector_name}", "{py_id}")
    async with pool.acquire() as conn:
        row = await selector.select_next(conn, user_id=user_id, set_id=set_id,
            config={{"daily_target": 50, "cooldown_hours": 24}})
    if row is None:
        async with pool.acquire() as conn:
            next_due = await get_next_due_at(conn, user_id=user_id)
        return {{"has_item": False, "next_due_at": next_due}}
    options = json.loads(row.get("options_json") or "[]")
    meta = json.loads(row.get("meta_json") or "{{}}")
    return {{
        "has_item": True,
        "next_due_at": row["due_at"],
        "question": {{
            "question_id": row["question_id"],
            "stem": row["stem"],
            "options": options,
            "meta": meta,
        }},
    }}


async def submit_review(pool: asyncpg.Pool, *, user_id: int, question_id: str, chosen_option: str, rating: str | None = None) -> dict:
    from .repository import upsert_question_card, insert_review_log, upsert_mistake
    async with pool.acquire() as conn:
        q = await conn.fetchrow(
            f"SELECT id, answer FROM {app_id}_questions WHERE question_id = $1", question_id,
        )
        if not q:
            raise ValueError(f"Question not found: {{question_id}}")

        question_pk = str(q["id"])
        correct_answer = q["answer"]
        is_correct = (chosen_option == correct_answer)

        # FSRS scheduling
        old_card = await conn.fetchrow(
            f"SELECT fsrs_card_json FROM {app_id}_user_question_cards WHERE user_id = $1 AND question_pk = $2::uuid",
            user_id, question_pk,
        )
        old_fsrs = json.loads(old_card["fsrs_card_json"]) if old_card else {{}}
        card = Card.from_dict(old_fsrs) if old_fsrs else Card()
        fsrs_rating = _fsrs_rating(rating if is_correct else "again")
        new_card, _ = _scheduler.review_card(card, fsrs_rating)
        next_due = new_card.due

        await upsert_question_card(
            conn, user_id=user_id, question_pk=question_pk,
            is_correct=is_correct, chosen_option=chosen_option,
            fsrs_json=new_card.to_dict(), next_due=next_due,
        )
        await insert_review_log(conn, user_id=user_id, question_pk=question_pk, chosen_option=chosen_option, is_correct=is_correct, rating=rating)
        await upsert_mistake(conn, user_id=user_id, question_pk=question_pk, is_correct=is_correct)

    return {{"is_correct": is_correct, "next_due_at": next_due}}


async def list_mistakes(pool: asyncpg.Pool, *, user_id: int, set_id: str | None = None) -> list[dict]:
    from .repository import list_mistake_rows
    async with pool.acquire() as conn:
        return [dict(r) for r in await list_mistake_rows(conn, user_id=user_id, set_id=set_id)]
''')

    # routes.py
    with open(os.path.join(app_dir, "routes.py"), "w") as f:
        f.write(f'''"""API endpoints for {app_name}."""
from typing import Any
from typing import Annotated
from fastapi import APIRouter, Depends, Query, Request
from ..auth_routes import get_current_user
from . import schemas, service

router = APIRouter(prefix="/api/{app_id}", tags=["{app_id}"])


def _pool(request: Request) -> Any:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Database not initialized")
    return pool


@router.get("/sets", response_model=list[schemas.SetItem])
async def route_list_sets(request: Request, user: Annotated[Any, Depends(get_current_user)]):
    return [schemas.SetItem(**item) for item in await service.list_sets(_pool(request))]


@router.get("/overview", response_model=schemas.OverviewOut)
async def route_get_overview(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
):
    return schemas.OverviewOut(**await service.get_overview(_pool(request), user_id=int(user.id), set_id=set_id))


@router.get("/review/next", response_model=schemas.ReviewNextOut)
async def route_get_next_review(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
):
    return schemas.ReviewNextOut(**await service.get_next_review(_pool(request), user_id=int(user.id), set_id=set_id))


@router.post("/review/submit", response_model=schemas.ReviewSubmitOut)
async def route_submit_review(
    payload: schemas.ReviewSubmitIn,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
):
    return schemas.ReviewSubmitOut(**await service.submit_review(
        _pool(request), user_id=int(user.id),
        question_id=payload.question_id, chosen_option=payload.chosen_option, rating=payload.rating,
    ))


@router.get("/mistakes", response_model=list[schemas.MistakeItem])
async def route_list_mistakes(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
):
    return [schemas.MistakeItem(**item) for item in await service.list_mistakes(_pool(request), user_id=int(user.id), set_id=set_id)]
''')

    print(f"[sub_app_registry] Generated full domain skeleton for '{app_id}' at {{app_dir}}")


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
    id: str
    name: str
    word_count: int
    learner_count: int
    is_published: bool


@router.get("/apps/vocab/decks", response_model=list[VocabDeckItem])
async def vocab_decks(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> list[VocabDeckItem]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT d.id::text AS id, d.name, d.word_count, d.is_published,
                   (SELECT COUNT(DISTINCT user_id) FROM vocab_user_word_progress WHERE deck_id = d.id) AS learner_count
            FROM vocab_decks d
            ORDER BY d.name
            """
        )
    return [VocabDeckItem(id=r["id"], name=r["name"], word_count=r["word_count"], learner_count=r["learner_count"], is_published=r["is_published"]) for r in rows]


class VocabDeckPublishOut(BaseModel):
    is_published: bool


@router.patch("/apps/vocab/decks/{deck_id}/publish", response_model=VocabDeckPublishOut)
async def toggle_deck_publish(
    deck_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> VocabDeckPublishOut:
    from routes.vocab.repository import toggle_deck_published

    pool = _pool(request)
    async with pool.acquire() as conn:
        try:
            new_status = await toggle_deck_published(conn, deck_id=deck_id)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
    return VocabDeckPublishOut(is_published=new_status)


class VocabDeckDeleteOut(BaseModel):
    name: str


@router.delete("/apps/vocab/decks/{deck_id}", response_model=VocabDeckDeleteOut)
async def delete_vocab_deck(
    deck_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> VocabDeckDeleteOut:
    from routes.vocab.repository import delete_deck

    pool = _pool(request)
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                name = await delete_deck(conn, deck_id=deck_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    _import_logger.info("删除词书: deck_id=%s, name=%s", deck_id, name)
    return VocabDeckDeleteOut(name=name)


class VocabDeckUpdateOut(BaseModel):
    deck_id: str
    name: str
    word_count: int


@router.put("/apps/vocab/decks/{deck_id}", response_model=VocabDeckUpdateOut)
async def update_vocab_deck(
    deck_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> VocabDeckUpdateOut:
    from routes.vocab.importer import detect_format, parse_word_entry
    from routes.vocab.repository import replace_deck_words, sync_vocab_deck_word_counts

    # Verify deck exists
    pool = _pool(request)
    async with pool.acquire() as conn:
        deck = await conn.fetchrow(
            "SELECT id::text, key, name FROM vocab_decks WHERE id = $1::uuid", deck_id
        )
    if deck is None:
        raise HTTPException(status_code=404, detail="词书不存在")

    # Read multipart form
    form = await request.form()
    upload = form.get("file")
    if upload is None:
        raise HTTPException(status_code=400, detail="请上传 JSON 文件")

    filename = getattr(upload, "filename", "unknown.json")
    content = await upload.read()

    _import_logger.info("开始更新词书: deck_id=%s, name=%s, filename=%s, size=%d bytes", deck_id, deck["name"], filename, len(content))

    # Parse JSON
    import json

    try:
        raw = json.loads(content)
    except json.JSONDecodeError as e:
        _import_logger.error("更新失败 JSON 解析: deck_id=%s, error=%s", deck_id, e)
        raise HTTPException(status_code=400, detail=f"JSON 格式错误: {e}")

    if not isinstance(raw, list):
        raise HTTPException(status_code=400, detail="JSON 必须是单词数组")
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="词书内容不能为空")

    fmt = detect_format(raw)
    _import_logger.info("更新检测到格式: %s, deck_id=%s", fmt, deck_id)

    # Parse and deduplicate
    words = []
    seen_words: set[str] = set()
    skipped_dupes = 0
    for i, item in enumerate(raw, 1):
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail=f"第 {i} 条必须是对象")
        try:
            word_seed = parse_word_entry(item, sort_order=i, fmt=fmt)
        except (KeyError, TypeError, ValueError) as e:
            _import_logger.error("更新第 %d 条解析失败: deck_id=%s, error=%s", i, deck_id, e)
            raise HTTPException(status_code=400, detail=f"第 {i} 条解析失败: {e}")
        if not word_seed.word:
            raise HTTPException(status_code=400, detail=f"第 {i} 条缺少 word 字段")
        word_key = word_seed.word.strip().lower()
        if word_key in seen_words:
            skipped_dupes += 1
            continue
        seen_words.add(word_key)
        words.append(word_seed)

    if skipped_dupes:
        _import_logger.info("更新跳过重复单词: %d 个", skipped_dupes)

    # Replace words
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                await replace_deck_words(conn, deck_id=deck_id, words=words)
                await sync_vocab_deck_word_counts(conn)
    except Exception as e:
        _import_logger.exception("更新数据库失败: deck_id=%s, error=%s", deck_id, e)
        raise HTTPException(status_code=500, detail=f"更新失败: {e}")

    _import_logger.info("更新成功: deck_id=%s, name=%s, words=%d", deck_id, deck["name"], len(words))
    return VocabDeckUpdateOut(deck_id=deck_id, name=deck["name"], word_count=len(words))


class VocabWordTranslationItem(BaseModel):
    pos: str | None = None
    translation: str


class VocabWordSentenceItem(BaseModel):
    sentence: str
    translation: str


class VocabWordItem(BaseModel):
    id: str
    word: str
    us_pronunciation: str | None = None
    uk_pronunciation: str | None = None
    translations: list[VocabWordTranslationItem] = []
    sentences: list[VocabWordSentenceItem] = []


class VocabDeckDetailOut(BaseModel):
    id: str
    name: str
    description: str
    word_count: int
    is_published: bool
    page: int
    limit: int
    total_pages: int
    total_words: int
    words: list[VocabWordItem] = []


@router.get("/apps/vocab/decks/{deck_id}", response_model=VocabDeckDetailOut)
async def vocab_deck_detail(
    deck_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=30, ge=1, le=200),
    search: str | None = Query(default=None),
) -> VocabDeckDetailOut:
    from routes.vocab.repository import (
        count_admin_deck_words,
        list_admin_deck_words_paginated,
        list_sentences_for_word_ids,
        list_translations_for_word_ids,
    )

    pool = _pool(request)
    async with pool.acquire() as conn:
        deck = await conn.fetchrow(
            "SELECT id::text, name, description, word_count, is_published FROM vocab_decks WHERE id = $1::uuid",
            deck_id,
        )
        if deck is None:
            raise HTTPException(status_code=404, detail="词书不存在")

        total_words = await count_admin_deck_words(conn, deck_id=deck_id, search=search)

        offset = (page - 1) * limit
        word_records = await list_admin_deck_words_paginated(
            conn, deck_id=deck_id, search=search, limit=limit, offset=offset
        )

        word_ids = [r["id"] for r in word_records]

        translations = await list_translations_for_word_ids(conn, word_ids=word_ids)
        sentences = await list_sentences_for_word_ids(conn, word_ids=word_ids)

    # Group translations and sentences by word_id
    translations_by_word: dict[str, list[VocabWordTranslationItem]] = {}
    for t in translations:
        wid = t["word_id"]
        if wid not in translations_by_word:
            translations_by_word[wid] = []
        translations_by_word[wid].append(
            VocabWordTranslationItem(pos=t["pos"], translation=t["translation"])
        )

    sentences_by_word: dict[str, list[VocabWordSentenceItem]] = {}
    for s in sentences:
        wid = s["word_id"]
        if wid not in sentences_by_word:
            sentences_by_word[wid] = []
        sentences_by_word[wid].append(
            VocabWordSentenceItem(sentence=s["sentence"], translation=s["translation"])
        )

    words_list: list[VocabWordItem] = []
    for r in word_records:
        wid = r["id"]
        words_list.append(
            VocabWordItem(
                id=wid,
                word=r["word"],
                us_pronunciation=r["us_pronunciation"],
                uk_pronunciation=r["uk_pronunciation"],
                translations=translations_by_word.get(wid, []),
                sentences=sentences_by_word.get(wid, []),
            )
        )

    import math
    total_pages = math.ceil(total_words / limit) if total_words > 0 else 1

    return VocabDeckDetailOut(
        id=deck["id"],
        name=deck["name"],
        description=deck["description"],
        word_count=deck["word_count"],
        is_published=deck["is_published"],
        page=page,
        limit=limit,
        total_pages=total_pages,
        total_words=total_words,
        words=words_list,
    )


class VocabDeckImportOut(BaseModel):
    deck_id: str
    name: str
    word_count: int


@router.post("/apps/vocab/decks/import", response_model=VocabDeckImportOut)
async def import_vocab_deck(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> VocabDeckImportOut:
    from routes.vocab.importer import (
        DeckSeed,
        WordSeed,
        _deck_meta_from_filename,
        detect_format,
        parse_word_entry,
    )
    from routes.vocab.repository import import_deck, sync_vocab_deck_word_counts

    # Read multipart form
    form = await request.form()
    upload = form.get("file")
    if upload is None:
        raise HTTPException(status_code=400, detail="请上传 JSON 文件")

    filename = getattr(upload, "filename", "unknown.json")
    content = await upload.read()

    _import_logger.info("开始导入: filename=%s, size=%d bytes", filename, len(content))

    # Parse JSON
    import json

    try:
        raw = json.loads(content)
    except json.JSONDecodeError as e:
        _import_logger.error("JSON 解析失败: filename=%s, error=%s", filename, e)
        raise HTTPException(status_code=400, detail=f"JSON 格式错误: {e}")

    if not isinstance(raw, list):
        _import_logger.error("JSON 顶层不是数组: filename=%s, type=%s", filename, type(raw).__name__)
        raise HTTPException(status_code=400, detail="JSON 必须是单词数组")
    if len(raw) == 0:
        _import_logger.error("JSON 数组为空: filename=%s", filename)
        raise HTTPException(status_code=400, detail="词书内容不能为空")

    # Auto-detect format (sentence vs full)
    fmt = detect_format(raw)
    _import_logger.info("检测到格式: %s, filename=%s", fmt, filename)

    # Validate and build seeds (deduplicate by word)
    words: list[WordSeed] = []
    seen_words: set[str] = set()
    skipped_dupes = 0
    for i, item in enumerate(raw, 1):
        if not isinstance(item, dict):
            _import_logger.error("第 %d 条不是对象: filename=%s, type=%s", i, filename, type(item).__name__)
            raise HTTPException(status_code=400, detail=f"第 {i} 条必须是对象")

        try:
            word_seed = parse_word_entry(item, sort_order=i, fmt=fmt)
        except (KeyError, TypeError, ValueError) as e:
            _import_logger.error("第 %d 条解析失败: filename=%s, error=%s", i, filename, e)
            raise HTTPException(status_code=400, detail=f"第 {i} 条解析失败: {e}")

        if not word_seed.word:
            _import_logger.error("第 %d 条缺少 word: filename=%s", i, filename)
            raise HTTPException(status_code=400, detail=f"第 {i} 条缺少 word 字段")

        # Skip duplicate words (keep first occurrence)
        word_key = word_seed.word.strip().lower()
        if word_key in seen_words:
            skipped_dupes += 1
            continue
        seen_words.add(word_key)

        words.append(word_seed)

    if skipped_dupes:
        _import_logger.info("跳过重复单词: %d 个", skipped_dupes)

    # Derive deck meta from filename
    key, name = _deck_meta_from_filename(Path(filename))
    description = f"{name} 词书"

    deck_seed = DeckSeed(
        key=key,
        name=name,
        description=description,
        source_version="json-sentence",
        words=words,
    )

    # Import
    pool = _pool(request)
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                deck_id = await import_deck(conn, deck_seed)
                await sync_vocab_deck_word_counts(conn)
    except Exception as e:
        _import_logger.exception("数据库导入失败: filename=%s, key=%s, name=%s, error=%s", filename, key, name, e)
        raise HTTPException(status_code=500, detail=f"导入失败: {e}")

    _import_logger.info("导入成功: filename=%s, key=%s, name=%s, deck_id=%s, words=%d", filename, key, name, deck_id, len(words))
    return VocabDeckImportOut(deck_id=deck_id, name=name, word_count=len(words))


class VocabImportLogOut(BaseModel):
    lines: list[str]


@router.get("/apps/vocab/logs", response_model=VocabImportLogOut)
async def vocab_import_logs(
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> VocabImportLogOut:
    log_path = _LOG_DIR / "admin_import.log"
    if not log_path.exists():
        return VocabImportLogOut(lines=[])
    text = log_path.read_text(encoding="utf-8")
    # Return lines in reverse order (newest first), max 500
    lines = text.strip().splitlines()
    return VocabImportLogOut(lines=lines[-500:][::-1])


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
        total = await conn.fetchval("SELECT COUNT(*) FROM choice_questions")
        today_q = await conn.fetchval("SELECT COUNT(*) FROM choice_review_logs WHERE created_at::date = $1", today)
        correct = await conn.fetchval(
            "SELECT COUNT(*) FROM choice_review_logs WHERE is_correct = TRUE AND created_at::date = $1", today
        )
    acc = (correct / today_q * 100) if today_q > 0 else 0.0
    return ErcStats(total_questions=total, today_questions=today_q, avg_accuracy=round(acc, 1))


class ErcSetItem(BaseModel):
    id: str
    name: str
    article_count: int
    attempt_count: int
    is_published: bool


@router.get("/apps/erc/sets", response_model=list[ErcSetItem])
async def erc_sets(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> list[ErcSetItem]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.id::text AS id, s.name, s.article_count, s.is_published,
                   (SELECT COUNT(*) FROM choice_user_article_attempts a
                    JOIN choice_articles art ON art.id = a.article_pk
                    WHERE art.set_id = s.id) AS attempt_count
            FROM choice_sets s
            ORDER BY s.name
            """
        )
    return [
        ErcSetItem(id=r["id"], name=r["name"], article_count=r["article_count"], attempt_count=r["attempt_count"], is_published=r["is_published"]) for r in rows
    ]


class ErcSetPublishOut(BaseModel):
    is_published: bool


@router.patch("/apps/erc/sets/{set_id}/publish", response_model=ErcSetPublishOut)
async def toggle_erc_set_publish(
    set_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> ErcSetPublishOut:
    from routes.choice.repository import toggle_set_published

    pool = _pool(request)
    async with pool.acquire() as conn:
        try:
            new_status = await toggle_set_published(conn, set_id=set_id)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
    return ErcSetPublishOut(is_published=new_status)


class ErcSetDeleteOut(BaseModel):
    name: str


@router.delete("/apps/erc/sets/{set_id}", response_model=ErcSetDeleteOut)
async def delete_erc_set(
    set_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> ErcSetDeleteOut:
    from routes.choice.repository import delete_set

    pool = _pool(request)
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                name = await delete_set(conn, set_id=set_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    _import_logger.info("删除阅读集: set_id=%s, name=%s", set_id, name)
    return ErcSetDeleteOut(name=name)


class ErcArticleListItem(BaseModel):
    id: str
    article_id: str
    year: int
    text_no: int
    title: str
    question_count: int
    sort_order: int


@router.get("/apps/erc/sets/{set_id}/articles", response_model=list[ErcArticleListItem])
async def erc_set_articles(
    set_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> list[ErcArticleListItem]:
    from routes.choice.repository import list_admin_articles

    pool = _pool(request)
    async with pool.acquire() as conn:
        rows = await list_admin_articles(conn, set_id=set_id)
    return [
        ErcArticleListItem(
            id=r["id"], article_id=r["article_id"], year=r["year"],
            text_no=r["text_no"], title=r["title"], question_count=r["question_count"],
            sort_order=r["sort_order"]
        ) for r in rows
    ]


class ErcArticleDetailOut(BaseModel):
    article_id: str
    exam: str
    year: int
    text_no: int
    title: str
    paragraphs: list[dict]
    questions: list[dict]


@router.get("/apps/erc/articles/{article_id}", response_model=ErcArticleDetailOut)
async def erc_article_detail(
    article_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> ErcArticleDetailOut:
    from routes.choice.repository import get_article_row, list_paragraph_rows, list_question_rows

    pool = _pool(request)
    async with pool.acquire() as conn:
        article = await get_article_row(conn, article_id=article_id)
        if article is None:
            raise HTTPException(status_code=404, detail="文章不存在")

        paragraphs = await list_paragraph_rows(conn, article_pk=article["article_pk"])
        questions = await list_question_rows(conn, article_pk=article["article_pk"])

    return ErcArticleDetailOut(
        article_id=article["article_id"],
        exam=article["exam"],
        year=article["year"],
        text_no=article["text_no"],
        title=article["title"],
        paragraphs=[{"paragraph_no": p["paragraph_no"], "text": p["text"]} for p in paragraphs],
        questions=[{
            "question_id": q["question_id"], "question_no": q["question_no"],
            "stem": q["stem"], "options": q["options_json"], "answer": q["answer"]
        } for q in questions],
    )


class ErcArticleDeleteOut(BaseModel):
    article_id: str


@router.delete("/apps/erc/articles/{article_pk}", response_model=ErcArticleDeleteOut)
async def delete_erc_article(
    article_pk: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> ErcArticleDeleteOut:
    from routes.choice.repository import delete_article, refresh_set_counts

    pool = _pool(request)
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                article_id = await delete_article(conn, article_pk=article_pk)
                # Refresh parent set counts
                set_id = await conn.fetchval(
                    "SELECT set_id::text FROM choice_articles WHERE id = $1::uuid", article_pk
                )
                if set_id:
                    await refresh_set_counts(conn, set_id=set_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    _import_logger.info("删除文章: article_pk=%s, article_id=%s", article_pk, article_id)
    return ErcArticleDeleteOut(article_id=article_id)


class ErcImportOut(BaseModel):
    set_key: str
    set_name: str
    article_count: int
    question_count: int


@router.post("/apps/erc/import", response_model=ErcImportOut)
async def import_erc_articles(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> ErcImportOut:
    import json as _json

    # Read multipart form
    form = await request.form()
    upload = form.get("file")
    if upload is None:
        raise HTTPException(status_code=400, detail="请上传 JSON 文件")

    filename = getattr(upload, "filename", "unknown.json")
    content = await upload.read()

    _import_logger.info("开始导入 ERC: filename=%s, size=%d bytes", filename, len(content))

    # Parse JSON
    try:
        raw = _json.loads(content)
    except _json.JSONDecodeError as e:
        _import_logger.error("ERC JSON 解析失败: filename=%s, error=%s", filename, e)
        raise HTTPException(status_code=400, detail=f"JSON 格式错误: {e}")

    # Support single article object or array of articles
    if isinstance(raw, dict):
        articles_raw = [raw]
    elif isinstance(raw, list):
        articles_raw = raw
    else:
        raise HTTPException(status_code=400, detail="JSON 必须是文章对象或文章数组")

    if len(articles_raw) == 0:
        raise HTTPException(status_code=400, detail="文章内容不能为空")

    # Import ERC format directly into choice_sets
    set_key = Path(filename).stem
    set_name = set_key
    pool = _pool(request)
    total_questions = 0

    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                set_id = await conn.fetchval(
                    """INSERT INTO choice_sets (key, name, description, exam, source_version)
                       VALUES ($1, $2, $3, $4, 'json-import') RETURNING id::text""",
                    set_key, set_name, f"{set_name} 阅读集",
                    str(articles_raw[0].get("exam") or "") if articles_raw else "",
                )

                for i, article in enumerate(articles_raw, 1):
                    if not isinstance(article, dict):
                        raise HTTPException(status_code=400, detail=f"第 {i} 条必须是对象")

                    exam = str(article.get("exam") or "").strip()
                    year = int(article.get("year") or 0)
                    text_no = int(article.get("text_no") or i)
                    title = str(article.get("title") or f"Text {text_no}")

                    # Insert article
                    article_pk = await conn.fetchval(
                        """INSERT INTO choice_articles (set_id, article_id, exam, year, text_no, title, sort_order)
                           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7) RETURNING id::text""",
                        set_id, f"{set_key}_text{i}", exam, year, text_no, title, i,
                    )

                    # Insert paragraphs
                    content_list = article.get("content") or []
                    for pi, item in enumerate(content_list, 1):
                        if isinstance(item, dict) and item.get("text"):
                            await conn.execute(
                                "INSERT INTO choice_paragraphs (article_pk, paragraph_no, text) VALUES ($1::uuid, $2, $3)",
                                article_pk, pi, str(item["text"]),
                            )

                    # Insert questions
                    questions_list = article.get("questions") or []
                    for qi, q in enumerate(questions_list, 1):
                        if not isinstance(q, dict):
                            continue
                        stem = str(q.get("stem") or "").strip()
                        options = q.get("options") or {}
                        answer = str(q.get("answer") or "").strip().upper()
                        explanation = str(q.get("explanation") or "").strip()
                        if not stem or not answer:
                            continue
                        await conn.execute(
                            """INSERT INTO choice_questions
                               (article_pk, question_id, question_no, stem, options_json, answer, explanation)
                               VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7)""",
                            article_pk, f"{set_key}_text{i}_q{qi}", qi, stem,
                            _json.dumps(options, ensure_ascii=False), answer, explanation,
                        )
                        total_questions += 1

                # Refresh counts
                await conn.execute(
                    """UPDATE choice_sets SET
                       article_count = (SELECT COUNT(*) FROM choice_articles WHERE set_id = $1::uuid),
                       question_count = (SELECT COUNT(*) FROM choice_questions q JOIN choice_articles a ON a.id = q.article_pk WHERE a.set_id = $1::uuid)
                       WHERE id = $1::uuid""",
                    set_id,
                )

    except HTTPException:
        raise
    except Exception as e:
        _import_logger.exception("ERC 数据库导入失败: filename=%s, error=%s", filename, e)
        raise HTTPException(status_code=500, detail=f"导入失败: {e}")

    article_count = len(articles_raw)
    _import_logger.info("ERC 导入成功: filename=%s, set=%s, articles=%d, questions=%d",
                        filename, set_name, article_count, total_questions)
    return ErcImportOut(set_key=set_key, set_name=set_name, article_count=article_count, question_count=total_questions)


# ---------------------------------------------------------------------------
# Content bank management
# ---------------------------------------------------------------------------


class ContentBankStats(BaseModel):
    total_banks: int
    total_items: int
    total_questions: int
    by_type: dict[str, int]


class ContentBankListItem(BaseModel):
    id: str
    name: str
    fw_type: str
    item_type: str
    description: str
    item_count: int
    is_published: bool
    created_at: str


class ContentBankDetailOut(BaseModel):
    id: str
    name: str
    fw_type: str
    item_type: str
    description: str
    is_published: bool
    page: int
    limit: int
    total_pages: int
    total_items: int
    items: list[dict]


class ContentBankImportOut(BaseModel):
    id: str
    name: str
    item_count: int
    question_count: int


class ContentBankAppendOut(BaseModel):
    id: str
    name: str
    added_count: int
    question_count: int


class ContentBankPublishOut(BaseModel):
    is_published: bool


@router.get("/content-banks/stats", response_model=ContentBankStats)
async def content_bank_stats(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> ContentBankStats:
    pool = _pool(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT
                (SELECT COUNT(*) FROM content_banks) AS total_banks,
                (SELECT COUNT(*) FROM content_items) AS total_items,
                (SELECT COUNT(*) FROM content_questions) AS total_questions
        """)
        type_rows = await conn.fetch(
            "SELECT item_type, COUNT(*)::int AS cnt FROM content_banks GROUP BY item_type"
        )
    by_type = {r["item_type"]: r["cnt"] for r in type_rows}
    return ContentBankStats(
        total_banks=row["total_banks"],
        total_items=row["total_items"],
        total_questions=row["total_questions"],
        by_type=by_type,
    )


@router.get("/content-banks", response_model=list[ContentBankListItem])
async def list_content_banks(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
    type: str | None = Query(default=None),
    search: str | None = Query(default=None),
    fw_type: str | None = Query(default=None),
) -> list[ContentBankListItem]:
    pool = _pool(request)
    conditions: list[str] = []
    params: list[Any] = []
    idx = 1

    if type:
        conditions.append(f"b.item_type = ${idx}")
        params.append(type)
        idx += 1
    if fw_type:
        conditions.append(f"b.fw_type = ${idx}")
        params.append(fw_type)
        idx += 1
    if search:
        conditions.append(f"b.name ILIKE ${idx}")
        params.append(f"%{search}%")
        idx += 1

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT b.id::text, b.name, b.fw_type, b.item_type, b.description,
                   b.is_published, b.created_at,
                   (SELECT COUNT(*) FROM content_items WHERE bank_id = b.id)::int AS item_count
            FROM content_banks b
            {where}
            ORDER BY b.item_type, b.name
            """,
            *params,
        )

    return [
        ContentBankListItem(
            id=r["id"],
            name=r["name"],
            fw_type=r["fw_type"],
            item_type=r["item_type"],
            description=r["description"],
            item_count=r["item_count"],
            is_published=r["is_published"],
            created_at=r["created_at"].isoformat() if r["created_at"] else "",
        )
        for r in rows
    ]


@router.get("/content-banks/{bank_id}", response_model=ContentBankDetailOut)
async def content_bank_detail(
    bank_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=30, ge=1, le=200),
    search: str | None = Query(default=None),
) -> ContentBankDetailOut:
    import math

    pool = _pool(request)
    async with pool.acquire() as conn:
        bank = await conn.fetchrow(
            "SELECT id::text, name, fw_type, item_type, description, is_published "
            "FROM content_banks WHERE id = $1::uuid",
            bank_id,
        )
        if bank is None:
            raise HTTPException(status_code=404, detail="题库不存在")

        item_type = bank["item_type"]

        count_params: list[Any] = [bank_id]
        count_where = ""
        if search:
            if item_type == "word":
                count_where = " AND (body->>'word' ILIKE $2 OR body->>'translation' ILIKE $2)"
            else:
                count_where = " AND (title ILIKE $2)"
            count_params.append(f"%{search}%")

        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM content_items WHERE bank_id = $1::uuid{count_where}",
            *count_params,
        )

        total_pages = math.ceil(total / limit) if total > 0 else 1
        offset = (page - 1) * limit

        query_params: list[Any] = [bank_id, limit, offset]
        search_filter = ""
        if search:
            if item_type == "word":
                search_filter = " AND (i.body->>'word' ILIKE $4 OR i.body->>'translation' ILIKE $4)"
            else:
                search_filter = " AND (i.title ILIKE $4)"
            query_params.append(f"%{search}%")

        item_rows = await conn.fetch(
            f"""
            SELECT i.id::text, i.sort_order, i.title, i.body, i.created_at
            FROM content_items i
            WHERE i.bank_id = $1::uuid{search_filter}
            ORDER BY i.sort_order, i.created_at
            LIMIT $2 OFFSET $3
            """,
            *query_params,
        )

        items: list[dict] = []
        if item_type == "word":
            for ir in item_rows:
                body = ir["body"] if isinstance(ir["body"], dict) else json.loads(str(ir["body"]))
                items.append({
                    "id": ir["id"],
                    "sort_order": ir["sort_order"],
                    "word": body.get("word", ""),
                    "pronunciation": body.get("pronunciation", ""),
                    "translation": body.get("translation", ""),
                    "pos": body.get("pos", ""),
                    "example": body.get("example", ""),
                    "example_translation": body.get("example_translation", ""),
                })
        else:
            item_ids = [ir["id"] for ir in item_rows]
            q_by_item: dict[str, list[dict]] = {}
            if item_ids:
                q_rows = await conn.fetch(
                    """
                    SELECT item_id::text, id::text, sort_order, question_text, options, correct_answer
                    FROM content_questions
                    WHERE item_id = ANY($1::uuid[])
                    ORDER BY sort_order
                    """,
                    item_ids,
                )
                for qr in q_rows:
                    opts = qr["options"]
                    if isinstance(opts, str):
                        opts = json.loads(opts)
                    q_by_item.setdefault(qr["item_id"], []).append({
                        "id": qr["id"],
                        "sort_order": qr["sort_order"],
                        "question_text": qr["question_text"],
                        "options": opts,
                        "correct_answer": qr["correct_answer"],
                    })

            for ir in item_rows:
                body = ir["body"] if isinstance(ir["body"], dict) else json.loads(str(ir["body"]))
                items.append({
                    "id": ir["id"],
                    "sort_order": ir["sort_order"],
                    "title": ir["title"] or "",
                    "passage": body.get("passage", ""),
                    "tags": body.get("tags", []),
                    "questions": q_by_item.get(ir["id"], []),
                })

    return ContentBankDetailOut(
        id=bank["id"],
        name=bank["name"],
        fw_type=bank["fw_type"],
        item_type=bank["item_type"],
        description=bank["description"],
        is_published=bank["is_published"],
        page=page,
        limit=limit,
        total_pages=total_pages,
        total_items=total,
        items=items,
    )




_IMAGE_MD_PATTERN = re.compile(r'!\[.*?\]\(images/([^)]+)\)')

_UPLOADS_DIR = _Path(__file__).resolve().parent.parent / "uploads"


def _process_content_bank_file(file_bytes: bytes, filename: str, bank_id: str) -> list[dict]:
    """Parse uploaded file (JSON or ZIP), handle image extraction for ZIP.
    When bank_id is '__validate__', skip image copying (pre-import validation pass)."""
    if filename.lower().endswith(".zip"):
        return _extract_zip(file_bytes, bank_id, skip_images=(bank_id == "__validate__"))
    try:
        raw = json.loads(file_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="题库文件不是有效的 JSON")
    return raw


def _extract_zip(zip_bytes: bytes, bank_id: str, *, skip_images: bool = False) -> list[dict]:
    """Extract a ZIP file: find JSON, copy images, rewrite paths."""
    json_data = None
    image_files: dict[str, bytes] = {}

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for name in zf.namelist():
            if name.endswith("/") or name.startswith("__MACOSX"):
                continue
            basename = name.rsplit("/", 1)[-1] if "/" in name else name
            if basename.startswith("."):
                continue
            content = zf.read(name)
            if name.lower().endswith(".json"):
                if json_data is None:
                    json_data = content
            elif basename.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp")):
                image_files[basename] = content

    if json_data is None:
        raise HTTPException(status_code=400, detail="ZIP 文件中没有找到 JSON 文件")

    # Copy images (skip during pre-import validation)
    if image_files and not skip_images:
        img_dir = _UPLOADS_DIR / "content-images" / bank_id
        img_dir.mkdir(parents=True, exist_ok=True)
        for img_name, img_bytes in image_files.items():
            (img_dir / img_name).write_bytes(img_bytes)

    try:
        raw = json.loads(json_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="ZIP 中的 JSON 文件格式错误")

    if not isinstance(raw, list) or len(raw) == 0:
        raise HTTPException(status_code=400, detail="题库文件应为一个非空 JSON 数组")

    # Rewrite image paths
    if image_files:
        _rewrite_image_urls(raw, bank_id)

    return raw


def _validate_entries(raw: list[dict], item_type: str) -> list[str]:
    """Validate all entries against the expected format. Returns a list of error messages (empty = valid)."""
    errors: list[str] = []
    for i, entry in enumerate(raw):
        idx = i + 1
        if not isinstance(entry, dict):
            errors.append(f"第 {idx} 条: 不是对象")
            continue

        if item_type == "word":
            word = (entry.get("word") or "").strip()
            if not word:
                errors.append(f"第 {idx} 条: 缺少 word 字段")
        else:
            questions = entry.get("questions")
            if not isinstance(questions, list) or len(questions) == 0:
                errors.append(f"第 {idx} 条: questions 应为非空数组")
                continue
            for qi, q in enumerate(questions):
                if not isinstance(q, dict):
                    errors.append(f"第 {idx} 条 第 {qi + 1} 题: 不是对象")
                    continue
                qtext = (q.get("question_text") or "").strip()
                if not qtext:
                    errors.append(f"第 {idx} 条 第 {qi + 1} 题: 缺少 question_text")
                answer = (q.get("correct_answer") or "").strip()
                if not answer:
                    errors.append(f"第 {idx} 条 第 {qi + 1} 题: 缺少 correct_answer")
                opts = q.get("options", {})
                if not isinstance(opts, dict) or len(opts) == 0:
                    errors.append(f"第 {idx} 条 第 {qi + 1} 题: options 应为非空对象")
                elif answer and answer not in opts:
                    errors.append(f"第 {idx} 条 第 {qi + 1} 题: correct_answer '{answer}' 不在 options 中")
    return errors


def _rewrite_image_urls(entries: list[dict], bank_id: str) -> None:
    """Rewrite inline markdown image paths from images/xxx.jpg to /uploads/content-images/{bank_id}/xxx.jpg."""
    prefix = f"/uploads/content-images/{bank_id}/"

    def _replace(text: str) -> str:
        if not text or not isinstance(text, str):
            return text
        return _IMAGE_MD_PATTERN.sub(rf"![]({prefix}\1)", text)

    for entry in entries:
        if "passage" in entry:
            entry["passage"] = _replace(entry.get("passage", ""))
        for q in entry.get("questions", []):
            q["question_text"] = _replace(q.get("question_text", ""))
            opts = q.get("options", {})
            if isinstance(opts, dict):
                for k in list(opts):
                    opts[k] = _replace(opts.get(k, ""))

@router.post("/content-banks", response_model=ContentBankImportOut)
async def create_content_bank(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
    file: UploadFile = File(...),
    name: str = Form(...),
    item_type: str = Form(...),
    fw_type: str = Form(""),
    description: str = Form(""),
) -> ContentBankImportOut:
    if item_type not in ("word", "choice"):
        raise HTTPException(status_code=400, detail="item_type 必须是 word 或 choice")

    file_bytes = await file.read()
    filename = getattr(file, "filename", "unknown.json")

    # Pre-validate: parse file and check all entries before touching DB
    try:
        raw = _process_content_bank_file(file_bytes, filename, bank_id="__validate__")
    except HTTPException:
        raise
    except Exception as e:
        _import_logger.exception("文件解析失败: bank_name=%s, file=%s", name, filename)
        raise HTTPException(status_code=400, detail=f"文件解析失败: {e}")

    errors = _validate_entries(raw, item_type)
    if errors:
        max_show = 20
        detail = f"验证失败，共 {len(errors)} 个错误:\n" + "\n".join(errors[:max_show])
        if len(errors) > max_show:
            detail += f"\n... 等 {len(errors)} 个错误"
        _import_logger.error("导入验证失败: bank_name=%s, file=%s, errors=%d",
                             name, filename, len(errors))
        for e in errors[:max_show]:
            _import_logger.error("  %s", e)
        raise HTTPException(status_code=400, detail=detail)

    pool = _pool(request)
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Create bank first to get its ID
                bank_row = await conn.fetchrow(
                    """INSERT INTO content_banks (fw_type, name, description, item_type, is_published)
                       VALUES ($1, $2, $3, $4, false) RETURNING id::text""",
                    fw_type, name, description, item_type,
                )
                bank_id = bank_row["id"]

                # Re-parse with real bank_id for ZIP image copying
                if filename.lower().endswith(".zip"):
                    raw = _process_content_bank_file(file_bytes, filename, bank_id)

                item_count = 0
                question_count = 0
                for i, entry in enumerate(raw):
                    if not isinstance(entry, dict):
                        raise HTTPException(status_code=400, detail=f"第 {i + 1} 条必须是对象")

                    if item_type == "word":
                        body = {
                            "word": entry.get("word", ""),
                            "pronunciation": entry.get("pronunciation", ""),
                            "translation": entry.get("translation", ""),
                            "pos": entry.get("pos", ""),
                            "example": entry.get("example", ""),
                            "example_translation": entry.get("example_translation", ""),
                        }
                        title = body["word"]
                        await conn.execute(
                            """INSERT INTO content_items (bank_id, sort_order, title, body)
                               VALUES ($1::uuid, $2, $3, $4::jsonb)""",
                            bank_id, i, title, json.dumps(body, ensure_ascii=False),
                        )
                        item_count += 1
                    else:
                        body = {
                            "passage": entry.get("passage", ""),
                            "tags": entry.get("tags", []),
                            "examination": entry.get("examination", ""),
                        }
                        title = entry.get("title") or ""
                        item_row = await conn.fetchrow(
                            """INSERT INTO content_items (bank_id, sort_order, title, body)
                               VALUES ($1::uuid, $2, $3, $4::jsonb) RETURNING id::text""",
                            bank_id, i, title, json.dumps(body, ensure_ascii=False),
                        )
                        item_id = item_row["id"]
                        item_count += 1

                        questions = entry.get("questions", [])
                        if not isinstance(questions, list):
                            questions = []
                        for qi, q in enumerate(questions):
                            await conn.execute(
                                """INSERT INTO content_questions
                                   (item_id, sort_order, paragraph_no, question_text, options, correct_answer, analysis, image_url)
                                   VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8)""",
                                item_id, qi,
                                q.get("paragraph_no"),
                                q.get("question_text", ""),
                                json.dumps(q.get("options", {}), ensure_ascii=False),
                                q.get("correct_answer", ""),
                                q.get("analysis", ""),
                                q.get("image_url", ""),
                            )
                            question_count += 1
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入失败: {e}")

    _import_logger.info("创建题库: bank_id=%s, name=%s, item_type=%s, items=%d, questions=%d",
                        bank_id, name, item_type, item_count, question_count)
    return ContentBankImportOut(id=bank_id, name=name, item_count=item_count, question_count=question_count)


@router.post("/content-banks/{bank_id}/items", response_model=ContentBankAppendOut)
async def append_content_bank_items(
    bank_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
    file: UploadFile = File(...),
) -> ContentBankAppendOut:
    file_bytes = await file.read()
    filename = getattr(file, "filename", "unknown.json")

    pool = _pool(request)
    async with pool.acquire() as conn:
        bank = await conn.fetchrow(
            "SELECT id::text, name, item_type FROM content_banks WHERE id = $1::uuid", bank_id,
        )
        if bank is None:
            raise HTTPException(status_code=404, detail="题库不存在")

    item_type = bank["item_type"]

    # Pre-validate
    try:
        raw = _process_content_bank_file(file_bytes, filename, bank_id="__validate__")
    except HTTPException:
        raise
    except Exception as e:
        _import_logger.exception("追加导入文件解析失败: bank_id=%s, file=%s", bank_id, filename)
        raise HTTPException(status_code=400, detail=f"文件解析失败: {e}")

    errors = _validate_entries(raw, item_type)
    if errors:
        max_show = 20
        detail = f"验证失败，共 {len(errors)} 个错误:\n" + "\n".join(errors[:max_show])
        if len(errors) > max_show:
            detail += f"\n... 等 {len(errors)} 个错误"
        _import_logger.error("追加导入验证失败: bank_id=%s, file=%s, errors=%d",
                             bank_id, filename, len(errors))
        for e in errors[:max_show]:
            _import_logger.error("  %s", e)
        raise HTTPException(status_code=400, detail=detail)

    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Re-parse with real bank_id for ZIP image copying
                if filename.lower().endswith(".zip"):
                    raw = _process_content_bank_file(file_bytes, filename, bank_id)

                max_sort = await conn.fetchval(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM content_items WHERE bank_id = $1::uuid",
                    bank_id,
                )
                start_order = max_sort + 1

                added_count = 0
                question_count = 0
                for i, entry in enumerate(raw):
                    if not isinstance(entry, dict):
                        raise HTTPException(status_code=400, detail=f"第 {i + 1} 条必须是对象")

                    if item_type == "word":
                        body = {
                            "word": entry.get("word", ""),
                            "pronunciation": entry.get("pronunciation", ""),
                            "translation": entry.get("translation", ""),
                            "pos": entry.get("pos", ""),
                            "example": entry.get("example", ""),
                            "example_translation": entry.get("example_translation", ""),
                        }
                        title = body["word"]
                        await conn.execute(
                            """INSERT INTO content_items (bank_id, sort_order, title, body)
                               VALUES ($1::uuid, $2, $3, $4::jsonb)""",
                            bank_id, start_order + i, title, json.dumps(body, ensure_ascii=False),
                        )
                        added_count += 1
                    else:
                        body = {
                            "passage": entry.get("passage", ""),
                            "tags": entry.get("tags", []),
                            "examination": entry.get("examination", ""),
                        }
                        title = entry.get("title") or ""
                        item_row = await conn.fetchrow(
                            """INSERT INTO content_items (bank_id, sort_order, title, body)
                               VALUES ($1::uuid, $2, $3, $4::jsonb) RETURNING id::text""",
                            bank_id, start_order + i, title, json.dumps(body, ensure_ascii=False),
                        )
                        item_id = item_row["id"]
                        added_count += 1

                        questions = entry.get("questions", [])
                        if not isinstance(questions, list):
                            questions = []
                        for qi, q in enumerate(questions):
                            await conn.execute(
                                """INSERT INTO content_questions
                                   (item_id, sort_order, paragraph_no, question_text, options, correct_answer, analysis, image_url)
                                   VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8)""",
                                item_id, qi,
                                q.get("paragraph_no"),
                                q.get("question_text", ""),
                                json.dumps(q.get("options", {}), ensure_ascii=False),
                                q.get("correct_answer", ""),
                                q.get("analysis", ""),
                                q.get("image_url", ""),
                            )
                            question_count += 1
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"追加导入失败: {e}")

    _import_logger.info("追加导入: bank_id=%s, name=%s, added=%d, questions=%d",
                        bank_id, bank["name"], added_count, question_count)
    return ContentBankAppendOut(id=bank_id, name=bank["name"], added_count=added_count, question_count=question_count)


class ContentBankUpdateIn(BaseModel):
    fw_type: str | None = None
    name: str | None = None


@router.patch("/content-banks/{bank_id}")
async def update_content_bank(
    bank_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
    payload: ContentBankUpdateIn = ContentBankUpdateIn(),
) -> dict[str, str]:
    pool = _pool(request)
    updates: list[str] = []
    params: list[Any] = []
    idx = 1
    if payload.fw_type is not None:
        updates.append(f"fw_type = ${idx}")
        params.append(payload.fw_type)
        idx += 1
    if payload.name is not None:
        updates.append(f"name = ${idx}")
        params.append(payload.name)
        idx += 1
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates.append("updated_at = NOW()")
    params.append(bank_id)
    async with pool.acquire() as conn:
        result = await conn.execute(
            f"UPDATE content_banks SET {', '.join(updates)} WHERE id = ${idx}::uuid",
            *params,
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="题库不存在")
    return {"detail": "已更新"}


@router.delete("/content-banks/{bank_id}")
async def delete_content_bank(
    bank_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> dict[str, str]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        bank = await conn.fetchrow(
            "SELECT name FROM content_banks WHERE id = $1::uuid", bank_id,
        )
        if bank is None:
            raise HTTPException(status_code=404, detail="题库不存在")
        await conn.execute("DELETE FROM content_banks WHERE id = $1::uuid", bank_id)
    _import_logger.info("删除题库: bank_id=%s, name=%s", bank_id, bank["name"])
    return {"detail": f"已删除: {bank['name']}"}


@router.patch("/content-banks/{bank_id}/publish", response_model=ContentBankPublishOut)
async def toggle_content_bank_publish(
    bank_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> ContentBankPublishOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """UPDATE content_banks SET is_published = NOT is_published, updated_at = NOW()
               WHERE id = $1::uuid RETURNING is_published""",
            bank_id,
        )
        if row is None:
            raise HTTPException(status_code=404, detail="题库不存在")
    return ContentBankPublishOut(is_published=row["is_published"])


@router.delete("/content-banks/{bank_id}/items/{item_id}")
async def delete_content_bank_item(
    bank_id: str,
    item_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> dict[str, str]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM content_items WHERE id = $1::uuid AND bank_id = $2::uuid",
            item_id, bank_id,
        )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="内容项不存在")
    return {"detail": "已删除"}


# ---------------------------------------------------------------------------
# Event template store management
# ---------------------------------------------------------------------------


class TemplateStoreListItem(BaseModel):
    id: str
    slug: str
    category: str
    name: str
    description: str | None
    is_published: bool
    item_count: int
    sort_order: int
    created_at: str
    updated_at: str


class TemplateStoreListResponse(BaseModel):
    templates: list[TemplateStoreListItem]


@router.get("/templates", response_model=TemplateStoreListResponse)
async def list_templates_admin(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> TemplateStoreListResponse:
    pool = _pool(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT t.id::text, t.slug, t.category, t.name, t.description, t.is_published,
                   t.sort_order, t.created_at, t.updated_at,
                   (SELECT COUNT(*) FROM event_template_store_items WHERE template_id = t.id)::int AS item_count
            FROM event_template_store_templates t
            ORDER BY t.sort_order ASC, t.name ASC
            """
        )
    return TemplateStoreListResponse(
        templates=[
            TemplateStoreListItem(
                id=r["id"],
                slug=r["slug"],
                category=r["category"],
                name=r["name"],
                description=r["description"],
                is_published=r["is_published"],
                item_count=r["item_count"],
                sort_order=r["sort_order"],
                created_at=r["created_at"].isoformat() if r["created_at"] else "",
                updated_at=r["updated_at"].isoformat() if r["updated_at"] else "",
            )
            for r in rows
        ]
    )


class TemplateStoreItemIn(BaseModel):
    kind: str
    title: str = Field(min_length=1, max_length=255)
    content: str | None = None
    offset_days: int = Field(ge=0)
    sort_order: int = Field(default=0, ge=0)
    details: dict[str, Any] = Field(default_factory=dict)


class TemplateStoreCreateRequest(BaseModel):
    slug: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    schedule_mode: str = Field(pattern=r"^(from_start|before_due)$")
    default_event_name: str | None = None
    default_start_date: date | None = None
    default_due_at: str | None = None
    default_is_primary: bool | None = None
    items: list[TemplateStoreItemIn] = Field(default_factory=list)
    app_configs: list[dict[str, Any]] = Field(default_factory=list)
    workflows: list[dict[str, Any]] = Field(default_factory=list)
    sort_order: int = 0


class TemplateStoreUpdateRequest(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    schedule_mode: str | None = Field(default=None, pattern=r"^(from_start|before_due)$")
    default_event_name: str | None = None
    default_start_date: date | None = None
    default_due_at: str | None = None
    default_is_primary: bool | None = None
    items: list[TemplateStoreItemIn] | None = None
    app_configs: list[dict[str, Any]] | None = None
    workflows: list[dict[str, Any]] | None = None
    sort_order: int | None = None


class TemplateStoreDetailOut(BaseModel):
    id: str
    slug: str
    category: str
    name: str
    description: str | None
    schedule_mode: str
    default_event_name: str | None
    default_start_date: str | None
    default_due_at: str | None
    default_is_primary: bool | None
    items: list[dict[str, Any]]
    app_configs: list[dict[str, Any]]
    workflows: list[dict[str, Any]]
    is_published: bool
    sort_order: int
    created_at: str
    updated_at: str


class TemplateStorePublishOut(BaseModel):
    is_published: bool


async def _template_store_detail(conn: Any, template_id: str) -> TemplateStoreDetailOut:
    row = await conn.fetchrow(
        """
        SELECT id::text, slug, category, name, description, schedule_mode,
               default_event_name, default_start_date, default_due_at, default_is_primary,
               app_configs, workflows, is_published, sort_order, created_at, updated_at
        FROM event_template_store_templates
        WHERE id = $1::uuid
        """,
        template_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="模板不存在")

    items = await conn.fetch(
        """
        SELECT id::text, template_id::text, kind, title, content, offset_days, sort_order, details, created_at, updated_at
        FROM event_template_store_items
        WHERE template_id = $1::uuid
        ORDER BY sort_order ASC, created_at ASC
        """,
        template_id,
    )

    def _item(r: Any) -> dict[str, Any]:
        details = r["details"]
        if isinstance(details, str):
            import json
            details = json.loads(details)
        return {
            "id": r["id"],
            "template_id": r["template_id"],
            "kind": r["kind"],
            "title": r["title"],
            "content": r["content"],
            "offset_days": int(r["offset_days"]),
            "sort_order": int(r["sort_order"]),
            "details": details or {},
        }

    app_configs = row["app_configs"]
    if isinstance(app_configs, str):
        import json
        app_configs = json.loads(app_configs)
    workflows = row["workflows"]
    if isinstance(workflows, str):
        import json
        workflows = json.loads(workflows)

    return TemplateStoreDetailOut(
        id=row["id"],
        slug=row["slug"],
        category=row["category"],
        name=row["name"],
        description=row["description"],
        schedule_mode=row["schedule_mode"],
        default_event_name=row["default_event_name"],
        default_start_date=str(row["default_start_date"]) if row["default_start_date"] else None,
        default_due_at=row["default_due_at"].isoformat() if row["default_due_at"] else None,
        default_is_primary=row["default_is_primary"],
        items=[_item(r) for r in items],
        app_configs=app_configs or [],
        workflows=workflows or [],
        is_published=row["is_published"],
        sort_order=int(row["sort_order"]),
        created_at=row["created_at"].isoformat() if row["created_at"] else "",
        updated_at=row["updated_at"].isoformat() if row["updated_at"] else "",
    )


@router.get("/templates/{template_id}", response_model=TemplateStoreDetailOut)
async def get_template_admin(
    template_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> TemplateStoreDetailOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        return await _template_store_detail(conn, template_id)


@router.post("/templates", response_model=TemplateStoreDetailOut)
async def create_template_admin(
    request: Request,
    payload: TemplateStoreCreateRequest,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> TemplateStoreDetailOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Check slug uniqueness
            existing = await conn.fetchval(
                "SELECT id FROM event_template_store_templates WHERE slug = $1", payload.slug
            )
            if existing is not None:
                raise HTTPException(status_code=400, detail=f"slug '{payload.slug}' 已存在")

            default_due_at = None
            if payload.default_due_at:
                from datetime import datetime as dt
                default_due_at = dt.fromisoformat(payload.default_due_at)

            row = await conn.fetchrow(
                """
                INSERT INTO event_template_store_templates(
                    slug, category, name, description, schedule_mode,
                    default_event_name, default_start_date, default_due_at, default_is_primary,
                    app_configs, workflows, sort_order, is_published
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB, $11::JSONB, $12, FALSE)
                RETURNING id::text
                """,
                payload.slug,
                payload.category,
                payload.name,
                payload.description,
                payload.schedule_mode,
                payload.default_event_name,
                payload.default_start_date,
                default_due_at,
                payload.default_is_primary,
                json.dumps(payload.app_configs, ensure_ascii=False),
                json.dumps(payload.workflows, ensure_ascii=False),
                payload.sort_order,
            )
            template_id = row["id"]

            for item in payload.items:
                await conn.execute(
                    """
                    INSERT INTO event_template_store_items(template_id, kind, title, content, offset_days, sort_order, details)
                    VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::JSONB)
                    """,
                    template_id,
                    item.kind,
                    item.title,
                    item.content,
                    item.offset_days,
                    item.sort_order,
                    json.dumps(item.details, ensure_ascii=False),
                )

        return await _template_store_detail(conn, template_id)


@router.put("/templates/{template_id}", response_model=TemplateStoreDetailOut)
async def update_template_admin(
    template_id: str,
    request: Request,
    payload: TemplateStoreUpdateRequest,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> TemplateStoreDetailOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Verify exists
            exists = await conn.fetchval(
                "SELECT id FROM event_template_store_templates WHERE id = $1::uuid", template_id
            )
            if exists is None:
                raise HTTPException(status_code=404, detail="模板不存在")

            # Check slug uniqueness if changing
            if payload.slug is not None:
                dup = await conn.fetchval(
                    "SELECT id FROM event_template_store_templates WHERE slug = $1 AND id != $2::uuid",
                    payload.slug,
                    template_id,
                )
                if dup is not None:
                    raise HTTPException(status_code=400, detail=f"slug '{payload.slug}' 已存在")

            # Build dynamic UPDATE
            updates: list[str] = []
            params: list[Any] = []
            idx = 1

            field_map = {
                "slug": payload.slug,
                "category": payload.category,
                "name": payload.name,
                "description": payload.description,
                "schedule_mode": payload.schedule_mode,
                "default_event_name": payload.default_event_name,
                "default_start_date": payload.default_start_date,
                "default_is_primary": payload.default_is_primary,
                "sort_order": payload.sort_order,
            }
            for col, val in field_map.items():
                if val is not None:
                    updates.append(f"{col} = ${idx}")
                    params.append(val)
                    idx += 1

            if payload.default_due_at is not None:
                from datetime import datetime as dt
                updates.append(f"default_due_at = ${idx}")
                params.append(dt.fromisoformat(payload.default_due_at))
                idx += 1

            if payload.app_configs is not None:
                updates.append(f"app_configs = ${idx}::JSONB")
                params.append(json.dumps(payload.app_configs, ensure_ascii=False))
                idx += 1

            if payload.workflows is not None:
                updates.append(f"workflows = ${idx}::JSONB")
                params.append(json.dumps(payload.workflows, ensure_ascii=False))
                idx += 1

            if updates:
                updates.append("updated_at = NOW()")
                params.append(template_id)
                await conn.execute(
                    f"UPDATE event_template_store_templates SET {', '.join(updates)} WHERE id = ${idx}::uuid",
                    *params,
                )

            # Replace items if provided
            if payload.items is not None:
                await conn.execute(
                    "DELETE FROM event_template_store_items WHERE template_id = $1::uuid", template_id
                )
                for item in payload.items:
                    await conn.execute(
                        """
                        INSERT INTO event_template_store_items(template_id, kind, title, content, offset_days, sort_order, details)
                        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::JSONB)
                        """,
                        template_id,
                        item.kind,
                        item.title,
                        item.content,
                        item.offset_days,
                        item.sort_order,
                        json.dumps(item.details, ensure_ascii=False),
                    )

        return await _template_store_detail(conn, template_id)


@router.delete("/templates/{template_id}")
async def delete_template_admin(
    template_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> dict[str, str]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM event_template_store_templates WHERE id = $1::uuid", template_id
        )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="模板不存在")
    return {"detail": "模板已删除"}


@router.patch("/templates/{template_id}/publish", response_model=TemplateStorePublishOut)
async def toggle_template_publish(
    template_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> TemplateStorePublishOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE event_template_store_templates
            SET is_published = NOT is_published, updated_at = NOW()
            WHERE id = $1::uuid
            RETURNING is_published
            """,
            template_id,
        )
        if row is None:
            raise HTTPException(status_code=404, detail="模板不存在")
    return TemplateStorePublishOut(is_published=row["is_published"])


# ---- Test Focus Work Configs ----

class ContentBankItem(BaseModel):
    id: str
    name: str
    count: int


@router.get("/content-banks-for-type", response_model=list[ContentBankItem])
async def list_content_banks_for_type(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
    focus_work_type: str = Query(...),
) -> list[ContentBankItem]:
    """根据专注工作类型返回可用的题库列表。"""
    pool = _pool(request)
    async with pool.acquire() as conn:
        if focus_work_type == "vocab_today":
            rows = await list_vocab_decks(conn)
            if rows:
                return [ContentBankItem(id=r["id"], name=r["name"], count=r["word_count"]) for r in rows]
            item_type = "word"
        elif focus_work_type in ("review", "practice"):
            rows = await list_erc_set_rows(conn)
            if rows:
                count_key = "question_count" if focus_work_type == "review" else "article_count"
                return [ContentBankItem(id=r["id"], name=r["name"], count=r[count_key]) for r in rows]
            item_type = "choice"
        else:
            raise HTTPException(status_code=400, detail=f"不支持的专注工作类型: {focus_work_type}")
        rows = await conn.fetch(
            """
            SELECT b.id::text AS id, b.name,
                   (SELECT COUNT(*) FROM content_items WHERE bank_id = b.id)::int AS count
            FROM content_banks b
            WHERE b.item_type = $1
            ORDER BY b.name
            """,
            item_type,
        )
    return [ContentBankItem(id=r["id"], name=r["name"], count=r["count"]) for r in rows]


class TestFocusConfigOut(BaseModel):
    id: str
    name: str
    focus_work_type: str
    bank_id: str | None
    target_count: int
    scope: dict[str, Any] | None = None
    completion: dict[str, Any] | None = None
    created_at: str
    updated_at: str


@router.get("/test-focus-configs", response_model=list[TestFocusConfigOut])
async def list_test_focus_configs(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> list[TestFocusConfigOut]:
    """获取当前管理员的测试专注配置列表。"""
    pool = _pool(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text AS id, name, focus_work_type, bank_id, target_count,
                   scope_json, completion_json, created_at, updated_at
            FROM test_focus_configs
            WHERE user_id = $1
            ORDER BY created_at DESC
            """,
            int(_admin.id),
        )
    return [
        TestFocusConfigOut(
            id=r["id"],
            name=r["name"],
            focus_work_type=r["focus_work_type"],
            bank_id=r["bank_id"],
            target_count=r["target_count"],
            scope=json.loads(r["scope_json"]) if r["scope_json"] else None,
            completion=json.loads(r["completion_json"]) if r["completion_json"] else None,
            created_at=r["created_at"].isoformat() if r["created_at"] else "",
            updated_at=r["updated_at"].isoformat() if r["updated_at"] else "",
        )
        for r in rows
    ]


@router.post("/test-focus-configs", response_model=TestFocusConfigOut)
async def create_test_focus_config(
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
    name: str = Form(...),
    focus_work_type: str = Form(...),
    bank_id: str = Form(""),
    target_count: int = Form(10),
    scope_json: str = Form(""),
    completion_json: str = Form(""),
) -> TestFocusConfigOut:
    """创建测试专注配置。"""
    if focus_work_type not in ("vocab_today", "review", "practice"):
        raise HTTPException(status_code=400, detail=f"不支持的专注工作类型: {focus_work_type}")
    if target_count < 1 or target_count > 500:
        raise HTTPException(status_code=400, detail="目标数量必须在 1-500 之间")

    scope_parsed = None
    if scope_json:
        try:
            scope_parsed = json.loads(scope_json)
        except json.JSONDecodeError:
            pass
    completion_parsed = None
    if completion_json:
        try:
            completion_parsed = json.loads(completion_json)
        except json.JSONDecodeError:
            pass

    pool = _pool(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO test_focus_configs (user_id, name, focus_work_type, bank_id, target_count, scope_json, completion_json)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
            RETURNING id::text AS id, name, focus_work_type, bank_id, target_count,
                      scope_json, completion_json, created_at, updated_at
            """,
            int(_admin.id),
            name,
            focus_work_type,
            bank_id or None,
            target_count,
            json.dumps(scope_parsed) if scope_parsed else None,
            json.dumps(completion_parsed) if completion_parsed else None,
        )
    return TestFocusConfigOut(
        id=row["id"],
        name=row["name"],
        focus_work_type=row["focus_work_type"],
        bank_id=row["bank_id"],
        target_count=row["target_count"],
        scope=scope_parsed,
        completion=completion_parsed,
        created_at=row["created_at"].isoformat() if row["created_at"] else "",
        updated_at=row["updated_at"].isoformat() if row["updated_at"] else "",
    )


@router.delete("/test-focus-configs/{config_id}")
async def delete_test_focus_config(
    config_id: str,
    request: Request,
    _admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> dict[str, str]:
    """删除测试专注配置。"""
    pool = _pool(request)
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            DELETE FROM test_focus_configs
            WHERE id = $1::uuid AND user_id = $2
            """,
            config_id,
            int(_admin.id),
        )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="配置不存在")
    return {"detail": "配置已删除"}
