from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from routes.agents.executor import execute_action_with_context, pool_from_request
from routes.agents.models import (
    AgentActionRequest,
    AgentActionResponse,
    AgentProfileCreateRequest,
    AgentProfileOut,
    AgentProfileUpdateRequest,
    AgentSkillOut,
)
from routes.agents.policy import resolve_agent_context
from routes.agents.profiles import (
    create_profile,
    delete_profile,
    list_profiles,
    set_default_profile,
    update_profile,
)
from routes.agents.skills import list_agent_skills_registry
from routes.auth_routes import get_current_user

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.get("/skills", response_model=list[AgentSkillOut])
async def list_agent_skills(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[AgentSkillOut]:
    _ = resolve_agent_context(request, int(user.id))
    return list_agent_skills_registry()


@router.post("/actions/{action_name}", response_model=AgentActionResponse)
async def execute_agent_action(
    action_name: str,
    request: Request,
    body: AgentActionRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AgentActionResponse:
    ctx = resolve_agent_context(request, int(user.id))
    pool = pool_from_request(request)
    return await execute_action_with_context(pool, action_name=action_name, ctx=ctx, payload=body.payload)


@router.get("/profiles", response_model=list[AgentProfileOut])
async def list_agent_profiles(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[AgentProfileOut]:
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        return await list_profiles(conn, user_id=int(user.id))


@router.post("/profiles", response_model=AgentProfileOut)
async def create_agent_profile(
    request: Request,
    body: AgentProfileCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AgentProfileOut:
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await create_profile(conn, user_id=int(user.id), payload=body)


@router.patch("/profiles/{profile_id}", response_model=AgentProfileOut)
async def update_agent_profile(
    profile_id: str,
    request: Request,
    body: AgentProfileUpdateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AgentProfileOut:
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await update_profile(conn, user_id=int(user.id), profile_id=profile_id, payload=body)


@router.delete("/profiles/{profile_id}")
async def delete_agent_profile(
    profile_id: str,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, bool]:
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await delete_profile(conn, user_id=int(user.id), profile_id=profile_id)


@router.post("/profiles/{profile_id}/default", response_model=AgentProfileOut)
async def set_agent_profile_default(
    profile_id: str,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> AgentProfileOut:
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await set_default_profile(conn, user_id=int(user.id), profile_id=profile_id)
