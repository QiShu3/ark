from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Request, UploadFile

from routes.agents.apps import list_agent_apps_registry
from routes.agents.executor import execute_action_with_context, pool_from_request
from routes.agents.models import (
    AgentActionRequest,
    AgentActionResponse,
    AgentAppOut,
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
    remove_profile_avatar,
    set_default_profile,
    update_profile,
    upload_profile_avatar,
)
from routes.agents.skills import list_agent_skills_registry
from routes.auth_routes import get_current_user

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.get("/apps", response_model=list[AgentAppOut])
async def list_agent_apps(user: Annotated[Any, Depends(get_current_user)]) -> list[AgentAppOut]:
    _ = user
    return [
        AgentAppOut(
            app_id=app.app_id,
            display_name=app.display_name,
            description=app.description,
            default_profile_name=app.default_profile_name,
            default_profile_description=app.default_profile_description,
            default_context_prompt=app.default_context_prompt,
            default_skills=list(app.default_skills),
            allowed_skill_apps=list(app.allowed_skill_apps),
        )
        for app in list_agent_apps_registry()
    ]


@router.get("/skills", response_model=list[AgentSkillOut])
async def list_agent_skills(user: Annotated[Any, Depends(get_current_user)]) -> list[AgentSkillOut]:
    _ = user
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


@router.post("/profiles/{profile_id}/avatar", response_model=AgentProfileOut)
async def upload_agent_profile_avatar(
    profile_id: str,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    avatar: UploadFile = File(...),
) -> AgentProfileOut:
    pool = pool_from_request(request)
    content = await avatar.read()
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await upload_profile_avatar(
                conn,
                user_id=int(user.id),
                profile_id=profile_id,
                content_type=avatar.content_type,
                content=content,
            )


@router.delete("/profiles/{profile_id}/avatar", response_model=AgentProfileOut)
async def delete_agent_profile_avatar(
    profile_id: str,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> AgentProfileOut:
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await remove_profile_avatar(conn, user_id=int(user.id), profile_id=profile_id)
