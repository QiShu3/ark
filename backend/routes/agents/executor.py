from __future__ import annotations

from typing import Any

import asyncpg
from fastapi import HTTPException, Request

from routes.agents.actions import get_action_definition
from routes.agents.approval import consume_approval
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
        raise RuntimeError("auth_pool 未初始化，无法创建审批表")
    async with pool.acquire() as conn:
        await init_agent_profiles(conn)
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_approvals (
              id TEXT PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              agent_type TEXT NULL,
              primary_app_id TEXT NULL,
              session_id TEXT NULL,
              action_id TEXT NOT NULL,
              payload_json JSONB NOT NULL,
              payload_hash TEXT NOT NULL,
              resource_scope TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              expires_at TIMESTAMPTZ NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              confirmed_at TIMESTAMPTZ NULL,
              CONSTRAINT chk_agent_approval_status CHECK (status IN ('pending', 'confirmed', 'expired'))
            );
            """
        )
        await conn.execute("ALTER TABLE agent_approvals ADD COLUMN IF NOT EXISTS primary_app_id TEXT NULL;")
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_agent_approvals_user_status ON agent_approvals(user_id, status, expires_at);"
        )


async def execute_action_with_context(
    pool: asyncpg.Pool, *, action_name: str, ctx: AgentContext, payload: dict[str, Any]
) -> AgentActionResponse:
    definition = get_action_definition(action_name)
    if definition is None:
        raise HTTPException(status_code=404, detail="未知动作")

    rule, scope_or_reason = evaluate_policy(definition.policy_action_id, ctx)
    if rule is None or scope_or_reason is None:
        return forbidden(action_name, scope_or_reason or "策略拒绝")

    approval_payload: dict[str, Any] | None = None
    async with pool.acquire() as conn:
        async with conn.transaction():
            if definition.uses_approval:
                approval_id = payload.get("approval_id")
                if not isinstance(approval_id, str) or not approval_id.strip():
                    raise HTTPException(status_code=422, detail="缺少 approval_id")
                approval_payload = await consume_approval(
                    conn,
                    ctx=ctx,
                    approval_id=approval_id.strip(),
                    action_id=definition.approval_action_id or definition.policy_action_id,
                )
                if approval_payload is None:
                    return forbidden(action_name, "审批票据无效、已过期或已使用")

            result = await definition.handler(
                conn,
                ctx=ctx,
                payload=payload,
                resource_scope=scope_or_reason,
                approval_payload=approval_payload,
            )

    if isinstance(result, AgentActionResponse):
        return result
    return AgentActionResponse(type="result", action_id=action_name, data=result)
