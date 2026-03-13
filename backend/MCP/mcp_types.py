from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


JsonValue = Any


@dataclass(frozen=True)
class MCPServerConfig:
    name: str
    command: list[str]
    cwd: str | None = None
    env: dict[str, str] | None = None


@dataclass(frozen=True)
class MCPTool:
    name: str
    description: str | None
    input_schema: dict[str, Any] | None


@dataclass(frozen=True)
class MCPToolResultContent:
    type: Literal["text", "image", "audio", "resource"]
    text: str | None = None
    data: str | None = None
    mimeType: str | None = None
    resource: dict[str, Any] | None = None


@dataclass(frozen=True)
class MCPToolResult:
    content: list[MCPToolResultContent]
    is_error: bool
