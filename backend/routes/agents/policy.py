from __future__ import annotations

from fastapi import Request

from routes.agents.apps import get_app_definition
from routes.agents.models import AgentContext, PolicyRule

POLICIES: dict[str, PolicyRule] = {
    "arxiv.daily_candidates": PolicyRule(
        action_id="arxiv.daily_candidates",
        allowed_apps=("dashboard", "arxiv"),
        allowed_scopes=("app:arxiv",),
        effect="read",
    ),
    "arxiv.search": PolicyRule(
        action_id="arxiv.search",
        allowed_apps=("dashboard", "arxiv"),
        allowed_scopes=("app:arxiv",),
        effect="read",
    ),
    "arxiv.paper_details": PolicyRule(
        action_id="arxiv.paper_details",
        allowed_apps=("dashboard", "arxiv"),
        allowed_scopes=("app:arxiv",),
        effect="read",
    ),
    "task.list": PolicyRule(
        action_id="task.list",
        allowed_apps=("dashboard", "todo", "arxiv", "vocab"),
        allowed_scopes=("global_tasks", "cross_app_summary"),
        effect="read",
    ),
    "task.update": PolicyRule(
        action_id="task.update",
        allowed_apps=("dashboard", "todo"),
        allowed_scopes=("global_tasks",),
        required_capabilities=("tasks.write.global",),
        effect="write",
    ),
    "task.delete": PolicyRule(
        action_id="task.delete",
        allowed_apps=("dashboard", "todo"),
        allowed_scopes=("global_tasks",),
        required_capabilities=("task.delete",),
        requires_confirmation=True,
        effect="destructive",
    ),
    "arxiv.daily_tasks": PolicyRule(
        action_id="arxiv.daily_tasks",
        allowed_apps=("dashboard", "arxiv"),
        allowed_scopes=("app:arxiv",),
        required_capabilities=("arxiv.daily_tasks.write",),
        requires_confirmation=True,
        effect="write",
    ),
}


def _capabilities_from_header(raw: str | None) -> frozenset[str]:
    if raw is None:
        return frozenset()
    return frozenset(x.strip() for x in raw.split(",") if x and x.strip())


def resolve_agent_context(request: Request, user_id: int) -> AgentContext:
    raw_primary_app_id = (request.headers.get("X-Ark-Primary-App-Id") or "").strip()
    if not raw_primary_app_id:
        legacy_agent_type = (request.headers.get("X-Ark-Agent-Type") or "").strip()
        raw_primary_app_id = {
            "dashboard_agent": "dashboard",
            "app_agent:arxiv": "arxiv",
            "app_agent:vocab": "vocab",
        }.get(legacy_agent_type, "dashboard")
    primary_app_id = get_app_definition(raw_primary_app_id).app_id
    session_id = (request.headers.get("X-Ark-Session-Id") or "").strip() or None
    requested = _capabilities_from_header(request.headers.get("X-Ark-Capabilities"))
    capabilities = get_app_definition(primary_app_id).default_capabilities.union(requested)
    return AgentContext(
        user_id=user_id,
        primary_app_id=primary_app_id,
        session_id=session_id,
        capabilities=capabilities,
    )


def _scope_for_action(ctx: AgentContext, rule: PolicyRule) -> str | None:
    if rule.action_id in {"arxiv.daily_candidates", "arxiv.search", "arxiv.paper_details", "arxiv.daily_tasks"}:
        if ctx.primary_app_id in {"dashboard", "arxiv"}:
            return "app:arxiv"
        return None
    if rule.action_id == "task.list":
        if ctx.primary_app_id in {"dashboard", "todo"}:
            return "global_tasks"
        if "cross_app.read.summary" in ctx.capabilities:
            return "cross_app_summary"
        return None
    if ctx.primary_app_id in {"dashboard", "todo"}:
        return "global_tasks"
    return None


def evaluate_policy(action_id: str, ctx: AgentContext) -> tuple[PolicyRule | None, str | None]:
    rule = POLICIES.get(action_id)
    if rule is None:
        return None, "未知动作"
    if ctx.primary_app_id not in rule.allowed_apps:
        return None, "当前 agent 不允许执行该动作"
    for capability in rule.required_capabilities:
        if capability not in ctx.capabilities:
            return None, f"缺少能力：{capability}"
    scope = _scope_for_action(ctx, rule)
    if scope is None or scope not in rule.allowed_scopes:
        return None, "当前作用域不允许执行该动作"
    return rule, scope


def forbidden(action_id: str, reason: str):
    from routes.agents.models import AgentActionResponse

    return AgentActionResponse(type="forbidden", action_id=action_id, reason=reason)
