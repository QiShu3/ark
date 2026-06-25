from __future__ import annotations

from typing import Any

import asyncpg

from .routes import router


async def init_input(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 input 表")
    await _init_tables(pool)


async def _init_tables(pool: asyncpg.Pool) -> None:
    from .db import init_input as _init_db
    async with pool.acquire() as conn:
        await _init_db(conn)


__all__ = ["init_input", "router"]
