"""Pydantic schemas for API request/response validation."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ProfileBase(BaseModel):
    key: str = Field(..., min_length=1, max_length=120)
    name: str = Field(..., min_length=1, max_length=50)
    config_json: Optional[dict[str, Any]] = None
    system_prompt: Optional[str] = None
    system_prompt_path: Optional[str] = None
    mcp_config_json: Optional[dict[str, Any]] = None
    mcp_server_ids: list[str] = Field(default_factory=list)
    is_default: bool = False


class ProfileCreate(ProfileBase):
    pass


class ProfileUpdate(BaseModel):
    key: Optional[str] = Field(None, min_length=1, max_length=120)
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    config_json: Optional[dict[str, Any]] = None
    system_prompt: Optional[str] = None
    system_prompt_path: Optional[str] = None
    mcp_config_json: Optional[dict[str, Any]] = None
    is_default: Optional[bool] = None


class ProfileResponse(ProfileBase):
    id: str
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SkillResponse(BaseModel):
    name: str
    description: str
    source: str
    path: str


class MCPServerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=255)
    config_json: dict[str, Any]


class MCPServerCreate(MCPServerBase):
    pass


class MCPServerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=255)
    config_json: Optional[dict[str, Any]] = None


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
    content: Optional[str] = None


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
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    workspace_path: Optional[str] = None


class SessionCreate(SessionBase):
    pass


class SessionUpdate(BaseModel):
    profile_id: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=120)


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
    completed_at: Optional[datetime] = None

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
    run_id: Optional[str] = None
    event_type: Optional[str] = None
    sequence_no: int = 0
    name: Optional[str] = None
    tool_call_id: Optional[str] = None
    metadata_json: Optional[dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True
