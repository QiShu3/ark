"""Pydantic schemas for API request/response validation."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ProfileBase(BaseModel):
    key: str = Field(..., min_length=1, max_length=120)
    name: str = Field(..., min_length=1, max_length=50)
    config_json: dict[str, Any] | None = None
    system_prompt: str | None = None
    system_prompt_path: str | None = None
    mcp_config_json: dict[str, Any] | None = None
    mcp_server_ids: list[str] = Field(default_factory=list)
    is_default: bool = False


class ProfileCreate(ProfileBase):
    pass


class ProfileUpdate(BaseModel):
    key: str | None = Field(None, min_length=1, max_length=120)
    name: str | None = Field(None, min_length=1, max_length=50)
    config_json: dict[str, Any] | None = None
    system_prompt: str | None = None
    system_prompt_path: str | None = None
    mcp_config_json: dict[str, Any] | None = None
    mcp_server_ids: list[str] | None = None
    is_default: bool | None = None


class ProfileResponse(ProfileBase):
    id: str
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ResolvedPromptResponse(BaseModel):
    prompt: str
    source_label: str
    source_kind: Literal["run_snapshot", "profile_resolved", "profile_raw"]


class SkillResponse(BaseModel):
    name: str
    description: str
    source: str
    path: str


class MCPServerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = Field(None, max_length=255)
    config_json: dict[str, Any]


class MCPServerCreate(MCPServerBase):
    pass


class MCPServerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    description: str | None = Field(None, max_length=255)
    config_json: dict[str, Any] | None = None


class MCPServerImportRequest(BaseModel):
    config_json: dict[str, Any]


class MCPServerResponse(MCPServerBase):
    id: str
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProfileFileBase(BaseModel):
    file_type: str
    filename: str
    content: str | None = None


class ProfileFileCreate(ProfileFileBase):
    pass


class ProfileFileUpdate(BaseModel):
    content: str


class ProfileFileResponse(ProfileFileBase):
    id: str
    profile_id: str
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SessionBase(BaseModel):
    profile_id: str
    name: str | None = Field(None, min_length=1, max_length=120)
    workspace_path: str | None = None


class SessionCreate(SessionBase):
    pass


class SessionUpdate(BaseModel):
    profile_id: str | None = None
    name: str | None = Field(None, min_length=1, max_length=120)


class SessionResponse(SessionBase):
    id: str
    user_id: int
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SessionRunResponse(BaseModel):
    id: str
    session_id: str
    profile_id: str
    workspace_path: str
    status: str
    snapshot_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    class Config:
        from_attributes = True


class MessageBase(BaseModel):
    role: str
    content: str


class MessageCreate(MessageBase):
    pass


class MessageResponse(MessageBase):
    id: str
    session_id: str
    run_id: str | None = None
    event_type: str | None = None
    sequence_no: int = 0
    name: str | None = None
    tool_call_id: str | None = None
    metadata_json: dict[str, Any] | None = None
    created_at: datetime

    class Config:
        from_attributes = True
