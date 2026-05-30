import asyncio
import os
import random
import string
import sys
from pathlib import Path

import asyncpg
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import app


def _rand_username(prefix: str = "u") -> str:
    """生成随机用户名，避免与现有数据冲突。"""
    return prefix + "".join(random.choices(string.ascii_lowercase + string.digits, k=10))


def _database_url() -> str:
    import os

    return (
        os.getenv("DATABASE_URL", "").strip()
        or os.getenv("SUPABASE_DB_URL", "").strip()
        or os.getenv("POSTGRES_URL", "").strip()
    )


async def _mark_email_verified(username: str) -> None:
    conn = await asyncpg.connect(dsn=_database_url())
    try:
        await conn.execute("UPDATE auth_users SET email_verified_at = NOW() WHERE username = $1", username)
    finally:
        await conn.close()


def _run() -> int:
    """执行 Auth 冒烟测试：注册→登录→/auth/me→/auth/users→注销→token 失效。"""
    username = _rand_username()
    password = "P@ssw0rd!" + "".join(random.choices(string.ascii_letters, k=8))
    email = f"{username}@example.com"

    os.environ["AUTH_EMAIL_DELIVERY_MODE"] = "disabled"
    with TestClient(app) as c:
        r = c.post("/auth/register", json={"username": username, "email": email, "password": password})
        if r.status_code != 200:
            print("register failed:", r.status_code, r.text)
            return 1

        asyncio.run(_mark_email_verified(username))

        r = c.post("/auth/login", json={"username": username, "password": password})
        if r.status_code != 200:
            print("login failed:", r.status_code, r.text)
            return 1
        token = (r.json() or {}).get("access_token")
        if not token:
            print("missing token:", r.text)
            return 1

        headers = {"Authorization": f"Bearer {token}"}
        r = c.get("/auth/me", headers=headers)
        if r.status_code != 200:
            print("me failed:", r.status_code, r.text)
            return 1

        r = c.get("/auth/users", headers=headers)
        if r.status_code != 200:
            print("users failed:", r.status_code, r.text)
            return 1

        r = c.post("/auth/logout", headers=headers)
        if r.status_code != 200:
            print("logout failed:", r.status_code, r.text)
            return 1

        r = c.get("/auth/me", headers=headers)
        if r.status_code != 401:
            print("expected 401 after logout, got:", r.status_code, r.text)
            return 1

        print("ok")
        return 0


if __name__ == "__main__":
    raise SystemExit(_run())
