from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from .mcp_stdio import MCPProtocolError, MCPStdioClient
from .mcp_types import MCPServerConfig, MCPTool, MCPToolResult, MCPToolResultContent

try:
    import tomllib  # Python 3.11+
except Exception:  # pragma: no cover
    tomllib = None


class MCPRegistry:
    def __init__(
        self,
        servers: list[MCPServerConfig],
        *,
        protocol_version: str = "2025-03-26",
        allowlist: dict[str, set[str]] | None = None,
    ) -> None:
        """维护 MCP 子进程客户端集合，提供工具枚举与调用能力。"""
        self._servers = servers
        self._protocol_version = protocol_version
        self._clients: dict[str, MCPStdioClient] = {}
        self._tools_cache: dict[str, tuple[float, list[MCPTool]]] = {}
        self._allowlist = allowlist

    @classmethod
    def from_env(cls) -> MCPRegistry:
        """从环境变量 MCP_SERVERS/MCP_PROTOCOL_VERSION 构造注册表。"""
        raw = os.getenv("MCP_SERVERS", "").strip()
        protocol_version = os.getenv("MCP_PROTOCOL_VERSION", "2025-03-26").strip() or "2025-03-26"
        if not raw:
            return cls([], protocol_version=protocol_version)

        try:
            data = json.loads(raw)
        except Exception as e:
            raise MCPProtocolError("MCP_SERVERS 不是合法 JSON") from e

        if not isinstance(data, list):
            raise MCPProtocolError("MCP_SERVERS 必须是 JSON 数组")

        servers: list[MCPServerConfig] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            command = item.get("command")
            if not name or not isinstance(command, list) or not all(isinstance(x, str) for x in command):
                continue
            cwd = item.get("cwd")
            env = item.get("env")
            servers.append(
                MCPServerConfig(
                    name=name,
                    command=[*command],
                    cwd=str(cwd) if isinstance(cwd, str) and cwd.strip() else None,
                    env={k: str(v) for k, v in env.items()} if isinstance(env, dict) else None,
                )
            )
        return cls(servers, protocol_version=protocol_version)

    @classmethod
    def from_config_dir(cls, dir_path: str | Path) -> MCPRegistry:
        """从目录加载 mcp.toml；若不存在则回退到环境变量。"""
        file_path = Path(dir_path).resolve() / "mcp.toml"
        if not file_path.exists() or tomllib is None:
            return cls.from_env()
        return cls._from_config_file(file_path)

    @classmethod
    def _from_config_file(cls, file_path: str | Path) -> MCPRegistry:
        """内部方法：解析 TOML 配置构造注册表。"""
        path = Path(file_path).resolve()
        base_dir = path.parent.parent  # backend 目录
        with path.open("rb") as f:
            cfg = tomllib.load(f)

        protocol_version = str(cfg.get("protocol_version") or "2025-03-26").strip() or "2025-03-26"
        raw_allow = cfg.get("deepseek", {}).get("allow_tools")
        allowlist: dict[str, set[str]] | None = None
        if isinstance(raw_allow, dict) and raw_allow:
            allowlist = {str(k): {str(x) for x in v} for k, v in raw_allow.items() if isinstance(v, list)}

        servers: list[MCPServerConfig] = []
        for item in cfg.get("servers") or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            command = item.get("command")
            if not name or not isinstance(command, list) or not all(isinstance(x, str) for x in command):
                continue
            cwd = item.get("cwd")
            env = item.get("env")
            servers.append(
                MCPServerConfig(
                    name=name,
                    command=[*command],
                    cwd=(str(cwd).strip() if isinstance(cwd, str) and str(cwd).strip() else str(base_dir)),
                    env={k: str(v) for k, v in env.items()} if isinstance(env, dict) else None,
                )
            )
        return cls(servers, protocol_version=protocol_version, allowlist=allowlist)

    def tool_allowlist(self) -> dict[str, set[str]] | None:
        """返回工具白名单映射（server->tool names）。"""
        return self._allowlist

    async def start(self) -> None:
        """启动所有 MCP 服务器子进程。"""
        for s in self._servers:
            client = MCPStdioClient(
                name=s.name,
                command=s.command,
                cwd=s.cwd,
                env=s.env,
                protocol_version=self._protocol_version,
            )
            await client.start()
            self._clients[s.name] = client

    async def close(self) -> None:
        """关闭所有 MCP 客户端并清理缓存。"""
        for c in list(self._clients.values()):
            await c.close()
        self._clients.clear()
        self._tools_cache.clear()

    def server_names(self) -> list[str]:
        """返回已启动的 MCP 服务器名称列表。"""
        return sorted(self._clients.keys())

    async def list_tools(self, server: str, *, cache_ttl_seconds: float = 30.0) -> list[MCPTool]:
        """列出某服务器工具，带缓存。"""
        if server not in self._clients:
            raise MCPProtocolError(f"MCP server 未找到: {server}")

        now = time.time()
        cached = self._tools_cache.get(server)
        if cached is not None:
            ts, tools = cached
            if now - ts <= cache_ttl_seconds:
                return tools

        client = self._clients[server]
        res = await client.request("tools/list", {"cursor": None}, timeout=20.0)
        if "error" in res:
            raise MCPProtocolError(f"tools/list 失败: {res['error']}")
        tools: list[MCPTool] = []
        result = res.get("result") or {}
        for t in result.get("tools") or []:
            if not isinstance(t, dict):
                continue
            name = t.get("name")
            if not isinstance(name, str) or not name.strip():
                continue
            tools.append(
                MCPTool(
                    name=name,
                    description=t.get("description") if isinstance(t.get("description"), str) else None,
                    input_schema=t.get("inputSchema") if isinstance(t.get("inputSchema"), dict) else None,
                )
            )
        self._tools_cache[server] = (now, tools)
        return tools

    async def call_tool(self, server: str, tool_name: str, arguments: dict[str, Any] | None) -> MCPToolResult:
        """调用某服务器的指定工具。"""
        if server not in self._clients:
            raise MCPProtocolError(f"MCP server 未找到: {server}")
        client = self._clients[server]
        res = await client.request(
            "tools/call",
            {"name": tool_name, "arguments": arguments or {}},
            timeout=60.0,
        )
        if "error" in res:
            raise MCPProtocolError(f"tools/call 失败: {res['error']}")

        result = res.get("result") or {}
        is_error = bool(result.get("isError"))
        content_items: list[MCPToolResultContent] = []
        for c in result.get("content") or []:
            if not isinstance(c, dict):
                continue
            ctype = c.get("type")
            if ctype not in ("text", "image", "audio", "resource"):
                continue
            content_items.append(
                MCPToolResultContent(
                    type=ctype,
                    text=c.get("text") if isinstance(c.get("text"), str) else None,
                    data=c.get("data") if isinstance(c.get("data"), str) else None,
                    mimeType=c.get("mimeType") if isinstance(c.get("mimeType"), str) else None,
                    resource=c.get("resource") if isinstance(c.get("resource"), dict) else None,
                )
            )
        return MCPToolResult(content=content_items, is_error=is_error)
