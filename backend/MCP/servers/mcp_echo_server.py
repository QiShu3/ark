import json
import sys
from typing import Any


def _read_lines() -> Any:
    """连续读取 stdin 的每一行并解析为 JSON 对象。"""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except Exception:
            continue


def _send(obj: dict[str, Any]) -> None:
    """向 stdout 发送一行 JSON 文本。"""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    """实现 MCP stdio 回声服务器主循环（echo/add）。"""
    initialized = False
    for msg in _read_lines():
        if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
            continue

        msg_id = msg.get("id")
        method = msg.get("method")
        params = msg.get("params") if isinstance(msg.get("params"), dict) else {}

        if method == "initialize" and msg_id is not None:
            initialized = True
            _send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "protocolVersion": params.get("protocolVersion") or "2025-03-26",
                        "capabilities": {"tools": {"listChanged": False}},
                        "serverInfo": {"name": "ark-echo", "version": "0.1.0"},
                    },
                }
            )
            continue

        if method == "notifications/initialized":
            continue

        if not initialized:
            if msg_id is not None:
                _send(
                    {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "error": {"code": -32002, "message": "Not initialized"},
                    }
                )
            continue

        if method == "tools/list" and msg_id is not None:
            _send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "tools": [
                            {
                                "name": "echo",
                                "description": "Echo back the input text.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {"text": {"type": "string"}},
                                    "required": ["text"],
                                },
                            },
                            {
                                "name": "add",
                                "description": "Add two numbers.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "a": {"type": "number"},
                                        "b": {"type": "number"},
                                    },
                                    "required": ["a", "b"],
                                },
                            },
                        ]
                    },
                }
            )
            continue

        if method == "tools/call" and msg_id is not None:
            name = params.get("name")
            args = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
            if name == "echo":
                text = args.get("text")
                out = str(text) if text is not None else ""
                _send(
                    {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "result": {
                            "content": [{"type": "text", "text": out}],
                            "isError": False,
                        },
                    }
                )
                continue
            if name == "add":
                try:
                    a = float(args.get("a"))
                    b = float(args.get("b"))
                    out = str(a + b)
                    _send(
                        {
                            "jsonrpc": "2.0",
                            "id": msg_id,
                            "result": {
                                "content": [{"type": "text", "text": out}],
                                "isError": False,
                            },
                        }
                    )
                    continue
                except Exception:
                    _send(
                        {
                            "jsonrpc": "2.0",
                            "id": msg_id,
                            "result": {
                                "content": [{"type": "text", "text": "invalid numbers"}],
                                "isError": True,
                            },
                        }
                    )
                    continue

            _send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {"code": -32602, "message": f"Unknown tool: {name}"},
                }
            )
            continue

        if msg_id is not None:
            _send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"},
                }
            )


if __name__ == "__main__":
    main()
