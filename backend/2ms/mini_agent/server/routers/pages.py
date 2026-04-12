"""Page-scoped APIs that resolve shared profiles into user sessions."""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request

from mini_agent.server.auth import CurrentUser, get_current_user
from mini_agent.server.repository import (
    create_session,
    get_latest_session_for_profile,
    get_pool,
    get_profile_by_key,
    update_session,
)
from mini_agent.server.runtime import build_profile_runtime_config, build_session_workspace_path
from mini_agent.server.schemas import SessionResponse

router = APIRouter(prefix="/pages", tags=["Pages"])


async def _pool_dep(request: Request) -> asyncpg.Pool:
    return await get_pool(request)


def _default_session_name(session_id: str) -> str:
    return f"会话 {session_id[:8]}"


@router.post("/{profile_key}/session", response_model=SessionResponse)
async def route_get_or_create_page_session(
    profile_key: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    profile = await get_profile_by_key(pool, profile_key)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    existing = await get_latest_session_for_profile(pool, current_user.id, profile.id)
    if existing is not None:
        return existing

    try:
        runtime_config = build_profile_runtime_config(profile)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    created = await create_session(
        pool,
        user_id=current_user.id,
        profile_id=profile.id,
        name=None,
        workspace_path=None,
        status="idle",
    )
    workspace_path = str(
        build_session_workspace_path(
            config=runtime_config,
            session_id=created.id,
            explicit_workspace_path=None,
        )
    )
    return await update_session(
        pool,
        current_user.id,
        created.id,
        name=_default_session_name(created.id),
        workspace_path=workspace_path,
        status="idle",
    ) or created
