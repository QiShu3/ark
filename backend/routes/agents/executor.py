from __future__ import annotations

from typing import Any

import asyncpg
from fastapi import HTTPException, Request

from routes.agents.actions import get_action_definition
from routes.agents.models import AgentActionResponse, AgentContext
from routes.agents.policy import evaluate_policy, forbidden
from routes.agents.profiles import init_agent_profiles


def pool_from_request(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return pool


async def init_agent(app: Any) -> None:
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法初始化 Agent")
    async with pool.acquire() as conn:
        await init_agent_profiles(conn)


async def execute_action_with_context(
    pool: asyncpg.Pool, *, action_name: str, ctx: AgentContext, payload: dict[str, Any]
) -> AgentActionResponse:
    definition = get_action_definition(action_name)
    if definition is None:
        raise HTTPException(status_code=404, detail="未知动作")

    rule, scope_or_reason = evaluate_policy(definition.policy_action_id, ctx)
    if rule is None or scope_or_reason is None:
        return forbidden(action_name, scope_or_reason or "策略拒绝")

    async with pool.acquire() as conn:
        async with conn.transaction():
            result = await definition.handler(
                conn,
                ctx=ctx,
                payload=payload,
                resource_scope=scope_or_reason,
                approval_payload=None,
            )

    if isinstance(result, AgentActionResponse):
        return result
    return AgentActionResponse(type="result", action_id=action_name, data=result)
