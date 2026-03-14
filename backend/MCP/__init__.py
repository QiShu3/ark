# 标记 MCP 为 Python 包，导出常用类型与客户端
from .mcp_registry import MCPRegistry
from .mcp_stdio import MCPProtocolError, MCPStdioClient
from .mcp_types import MCPServerConfig, MCPTool, MCPToolResult, MCPToolResultContent
