from __future__ import annotations

import asyncio
import contextlib
import json
from typing import Any


class MCPProtocolError(RuntimeError):
    """MCP 协议层错误。"""


class MCPStdioClient:
    def __init__(
        self,
        *,
        name: str,
        command: list[str],
        cwd: str | None = None,
        env: dict[str, str] | None = None,
        protocol_version: str = "2025-03-26",
    ) -> None:
        """构造基于 stdio 的 MCP 客户端。
        name 为服务器名；command 为启动子进程的命令；cwd/env 为子进程工作目录与环境；
        protocol_version 为 Model Context Protocol 协议版本。
        """
        self._name = name
        self._command = command
        self._cwd = cwd
        self._env = env
        self._protocol_version = protocol_version

        self._proc: asyncio.subprocess.Process | None = None
        self._reader_task: asyncio.Task[None] | None = None

        self._next_id = 1
        self._pending: dict[int, asyncio.Future[dict[str, Any]]] = {}
        self._write_lock = asyncio.Lock()

    @property
    def name(self) -> str:
        """返回客户端绑定的服务器名称。"""
        return self._name

    async def start(self) -> None:
        """启动 MCP 子进程并完成 initialize/initialized 握手。"""
        if self._proc is not None:
            return

        if not self._command:
            raise MCPProtocolError("MCP command 为空")

        self._proc = await asyncio.create_subprocess_exec(
            *self._command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._cwd,
            env=self._env,
        )

        assert self._proc.stdin is not None
        assert self._proc.stdout is not None

        self._reader_task = asyncio.create_task(self._read_loop())
        await self._initialize()

    async def close(self) -> None:
        """关闭读取循环并优雅终止 MCP 子进程。"""
        if self._reader_task is not None:
            self._reader_task.cancel()
            with contextlib.suppress(BaseException):
                await self._reader_task
            self._reader_task = None

        proc = self._proc
        self._proc = None
        if proc is None:
            return

        if proc.stdin is not None:
            with contextlib.suppress(Exception):
                proc.stdin.close()

        with contextlib.suppress(Exception):
            await asyncio.wait_for(proc.wait(), timeout=2.0)
            return

        with contextlib.suppress(Exception):
            proc.terminate()
        with contextlib.suppress(Exception):
            await asyncio.wait_for(proc.wait(), timeout=2.0)
            return

        with contextlib.suppress(Exception):
            proc.kill()
        with contextlib.suppress(Exception):
            await proc.wait()

    async def request(
        self,
        method: str,
        params: dict[str, Any] | None = None,
        *,
        timeout: float = 20.0,
    ) -> dict[str, Any]:
        """发送带 id 的 JSON-RPC 请求并等待响应，超时抛出异常。"""
        if self._proc is None:
            raise MCPProtocolError("MCP client 未启动")
        if self._proc.stdin is None:
            raise MCPProtocolError("MCP stdin 不可用")

        req_id = self._next_id
        self._next_id += 1

        fut: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[req_id] = fut

        payload: dict[str, Any] = {"jsonrpc": "2.0", "id": req_id, "method": method}
        if params is not None:
            payload["params"] = params

        raw = json.dumps(payload, ensure_ascii=False)
        async with self._write_lock:
            self._proc.stdin.write((raw + "\n").encode("utf-8"))
            await self._proc.stdin.drain()

        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self._pending.pop(req_id, None)

    async def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        """发送不带 id 的 JSON-RPC 通知消息。"""
        if self._proc is None or self._proc.stdin is None:
            raise MCPProtocolError("MCP client 未启动")
        payload: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params
        raw = json.dumps(payload, ensure_ascii=False)
        async with self._write_lock:
            self._proc.stdin.write((raw + "\n").encode("utf-8"))
            await self._proc.stdin.drain()

    async def _initialize(self) -> None:
        """执行 initialize 请求并发送 initialized 通知。"""
        res = await self.request(
            "initialize",
            {
                "protocolVersion": self._protocol_version,
                "capabilities": {},
                "clientInfo": {"name": "ark-backend", "version": "0.1.0"},
            },
            timeout=20.0,
        )
        if "error" in res:
            raise MCPProtocolError(f"initialize 失败: {res['error']}")
        if "result" not in res:
            raise MCPProtocolError("initialize 响应缺少 result")
        await self.notify("notifications/initialized")

    async def _read_loop(self) -> None:
        """读取子进程 stdout，完成 JSON-RPC 响应分发。"""
        assert self._proc is not None
        assert self._proc.stdout is not None
        try:
            while True:
                line = await self._proc.stdout.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line.decode("utf-8"))
                except Exception:
                    continue

                if isinstance(msg, dict) and "id" in msg and msg.get("jsonrpc") == "2.0":
                    msg_id = msg.get("id")
                    if isinstance(msg_id, int) and msg_id in self._pending:
                        fut = self._pending[msg_id]
                        if not fut.done():
                            fut.set_result(msg)
        except BaseException:
            return
