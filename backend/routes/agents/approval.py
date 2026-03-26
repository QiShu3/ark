from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from routes.agents.models import AgentContext

APPROVAL_TTL = timedelta(minutes=10)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def payload_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


async def create_approval(
    conn: Any,
    *,
    ctx: AgentContext,
    action_id: str,
    resource_scope: str,
    payload: dict[str, Any],
) -> tuple[str, datetime]:
    approval_id = "appr_" + secrets.token_urlsafe(16)
    expires_at = datetime.now(UTC) + APPROVAL_TTL
    await conn.execute(
        """
        INSERT INTO agent_approvals(
            id, user_id, agent_type, primary_app_id, session_id, action_id,
            payload_json, payload_hash, resource_scope, status, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 'pending', $10)
        """,
        approval_id,
        ctx.user_id,
        ctx.primary_app_id,
        ctx.primary_app_id,
        ctx.session_id,
        action_id,
        canonical_json(payload),
        payload_hash(payload),
        resource_scope,
        expires_at,
    )
    return approval_id, expires_at


async def consume_approval(
    conn: Any,
    *,
    ctx: AgentContext,
    approval_id: str,
    action_id: str,
) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """
        SELECT id, payload_json, status, expires_at, action_id, agent_type, primary_app_id, session_id
        FROM agent_approvals
        WHERE id = $1 AND user_id = $2
        """,
        approval_id,
        ctx.user_id,
    )
    approval_primary_app_id = None
    if row is not None:
        if "primary_app_id" in row and row["primary_app_id"] is not None:
            approval_primary_app_id = str(row["primary_app_id"])
        elif row["agent_type"] is not None:
            approval_primary_app_id = str(row["agent_type"])
    if row is None or str(row["action_id"]) != action_id or approval_primary_app_id != ctx.primary_app_id:
        return None
    row_session_id = str(row["session_id"]) if row["session_id"] is not None else None
    if row_session_id != ctx.session_id or str(row["status"]) != "pending":
        return None
    expires_at = row["expires_at"]
    if expires_at is None or expires_at <= datetime.now(UTC):
        await conn.execute("UPDATE agent_approvals SET status = 'expired' WHERE id = $1", approval_id)
        return None
    await conn.execute("UPDATE agent_approvals SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1", approval_id)
    payload = row["payload_json"]
    if isinstance(payload, str):
        return json.loads(payload)
    return dict(payload)
