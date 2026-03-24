from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

AgentType = Literal["dashboard_agent", "app_agent:arxiv", "app_agent:vocab"]
ActionEffect = Literal["read", "write", "destructive"]
ResponseType = Literal["result", "approval_required", "forbidden"]
MessageRole = Literal["system", "user", "assistant", "tool"]


class AgentActionRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


class AgentSkillOut(BaseModel):
    name: str
    description: str
    parameters: dict[str, Any]
    intent_scope: str
    side_effect: ActionEffect


class AgentActionResponse(BaseModel):
    type: ResponseType
    action_id: str
    data: dict[str, Any] | None = None
    approval_id: str | None = None
    title: str | None = None
    message: str | None = None
    impact: dict[str, Any] | None = None
    commit_action: str | None = None
    expires_at: datetime | None = None
    reason: str | None = None


class ChatMessage(BaseModel):
    role: MessageRole
    content: str = ""


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: list[ChatMessage] = Field(default_factory=list)
    scope: str | None = Field(default=None, max_length=64)


class ChatResponse(BaseModel):
    reply: str
    approval: AgentActionResponse | None = None


@dataclass(frozen=True)
class AgentContext:
    user_id: int
    agent_type: AgentType
    app_id: str | None
    session_id: str | None
    capabilities: frozenset[str]


@dataclass(frozen=True)
class PolicyRule:
    action_id: str
    allowed_subjects: tuple[AgentType, ...]
    allowed_scopes: tuple[str, ...]
    required_capabilities: tuple[str, ...] = ()
    requires_confirmation: bool = False
    effect: ActionEffect = "read"
