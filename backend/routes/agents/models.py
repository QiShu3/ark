from __future__ import annotations

from collections.abc import Awaitable, Callable
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
    profile_id: str | None = Field(default=None, max_length=64)
    allowed_skills: list[str] | None = None


class ChatResponse(BaseModel):
    reply: str
    approval: AgentActionResponse | None = None


class AgentProfileOut(BaseModel):
    id: str
    user_id: int
    name: str
    description: str
    agent_type: AgentType
    app_id: str | None
    avatar_url: str | None
    persona_prompt: str
    allowed_skills: list[str]
    temperature: float
    max_tool_loops: int
    is_default: bool
    created_at: datetime
    updated_at: datetime


class AgentProfileCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=300)
    agent_type: AgentType = "dashboard_agent"
    app_id: str | None = Field(default=None, max_length=64)
    persona_prompt: str = Field(default="", max_length=4000)
    allowed_skills: list[str] = Field(default_factory=list)
    temperature: float = Field(default=0.2, ge=0.0, le=1.2)
    max_tool_loops: int | None = Field(default=None, ge=1, le=8)
    is_default: bool = False


class AgentProfileUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=300)
    agent_type: AgentType | None = None
    app_id: str | None = Field(default=None, max_length=64)
    persona_prompt: str | None = Field(default=None, max_length=4000)
    allowed_skills: list[str] | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=1.2)
    max_tool_loops: int | None = Field(default=None, ge=1, le=8)
    is_default: bool | None = None


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

ActionHandler = Callable[..., Awaitable[dict[str, Any] | AgentActionResponse]]


@dataclass(frozen=True)
class ActionDefinition:
    action_id: str
    policy_action_id: str
    handler: ActionHandler
    uses_approval: bool = False
    approval_action_id: str | None = None
