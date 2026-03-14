import json
import sys
from datetime import datetime
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


def _now_payload(tz_name: str | None) -> tuple[dict[str, Any] | None, str | None]:
    """生成当前时间的载荷，可选 IANA 时区名。返回 (payload, error)。"""
    try:
        if tz_name:
            from zoneinfo import ZoneInfo

            tz = ZoneInfo(tz_name)
            dt = datetime.now(tz)
        else:
            dt = datetime.now().astimezone()
    except Exception:
        return None, "invalid timezone"

    return (
        {
            "iso": dt.isoformat(),
            "unix_ms": int(dt.timestamp() * 1000),
            "tz": dt.tzname() or "",
        },
        None,
    )


def main() -> None:
    """实现 MCP stdio 时间服务器主循环。"""
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
                        "serverInfo": {"name": "ark-time", "version": "0.1.0"},
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
                                "name": "get_current_time",
                                "description": "Get current time. Optional IANA timezone name (e.g. Asia/Shanghai).",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {"timezone": {"type": "string"}},
                                },
                            }
                        ]
                    },
                }
            )
            continue

        if method == "tools/call" and msg_id is not None:
            name = params.get("name")
            args = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
            if name == "get_current_time":
                tz_name = args.get("timezone")
                tz_name = tz_name if isinstance(tz_name, str) and tz_name.strip() else None
                payload, err = _now_payload(tz_name)
                if err:
                    _send(
                        {
                            "jsonrpc": "2.0",
                            "id": msg_id,
                            "result": {
                                "content": [{"type": "text", "text": err}],
                                "isError": True,
                            },
                        }
                    )
                    continue
                _send(
                    {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": json.dumps(payload, ensure_ascii=False),
                                },
                            ],
                            "isError": False,
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
