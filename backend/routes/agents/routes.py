from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from routes.agents.executor import execute_action_with_context, pool_from_request
from routes.agents.models import AgentActionRequest, AgentActionResponse, AgentSkillOut
from routes.agents.policy import resolve_agent_context
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
