"""Ark 后端 MCP 助手运行器

职责：
- 将 DeepSeek 聊天接口与 MCP 工具结合，统一“工具注入、调用、结果回传”流程
- 从配置（环境变量或 mcp.toml 解析出的 allowlist）生成 server 工具的 function 规范
- 注入“内置工具”（无需 stdio 子进程、直接访问后端资源），目前包含：todo__list_today
- 对外暴露两个主接口：
  1) get_tools_overview(registry): 聚合 mcp_servers 与 deepseek_tools，供 /api/tools 使用
  2) chat_with_tools(messages, request, registry): 承担完整聊天与工具调用循环，供 /api/chat 使用

设计要点：
- 低耦合：main.py 只调用上述接口；工具映射与执行策略全部收敛在 MCP 包内
- 安全控制：allowlist 控制在 DeepSeek 可见的工具集合；环境变量 MCP_ALLOW_TOOLS 优先，回退配置文件
- 内置工具：无需子进程；直接使用当前 HTTP 请求上下文（Bearer token）与数据库连接池执行
"""

import json
import os
import re
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import Request

from routes.auth_routes import _user_from_token as _auth_user_from_token

from .mcp_registry import MCPRegistry
from .mcp_stdio import MCPProtocolError


def _deepseek_chat_completions_url(base_url: str) -> str:
    """生成 DeepSeek Chat Completions 端点 URL（兼容 base/v1 路径差异）。"""
    base = (base_url or "").strip().rstrip("/")
    if not base:
        base = "https://api.deepseek.com"
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


async def _call_deepseek_chat(messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None) -> dict[str, Any]:
    """调用 DeepSeek chat completions，按需携带 tools 参数，返回 assistant message。"""
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY 未配置")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip() or "deepseek-chat"
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip()
    url = _deepseek_chat_completions_url(base_url)
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        "stream": False,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
    data = resp.json()
    msg = data["choices"][0]["message"]
    return msg


def _safe_tool_name(server: str, tool: str) -> str:
    """将 server 与 tool 名进行清洗后拼接，形成 DeepSeek function 名。"""
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", server.strip()) or "server"
    t = re.sub(r"[^a-zA-Z0-9_-]+", "_", tool.strip()) or "tool"
    return f"{s}__{t}"


def _load_tool_allowlist(registry: MCPRegistry) -> dict[str, set[str]] | None:
    """读取工具白名单：
    - 优先使用环境变量 MCP_ALLOW_TOOLS（JSON 字典：server -> [tool,...]）
    - 若未设置，则回退到 registry.tool_allowlist()（来源 mcp.toml）
    - 返回 None 表示“不启用白名单”（即不暴露任何工具）
    """
    raw = os.getenv("MCP_ALLOW_TOOLS", "").strip()
    if not raw:
        return registry.tool_allowlist()
    try:
        data = json.loads(raw)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    out: dict[str, set[str]] = {}
    for k, v in data.items():
        if not isinstance(k, str) or not isinstance(v, list):
            continue
        out[k] = {str(x) for x in v if isinstance(x, (str, int, float))}
    return out


async def _build_server_tools_payload(
    registry: MCPRegistry,
) -> tuple[list[dict[str, Any]], dict[str, tuple[str, str]]]:
    """根据 MCPRegistry 收集各 server 的工具，并结合 allowlist 生成 DeepSeek function 规格。
    返回：
    - tools_payload：DeepSeek tools 参数中的 function 数组
    - mapping：function 名 -> (server, tool) 的映射，供执行时查找
    过滤规则说明（启用 allowlist 时）：
    - allowed = allow[server]：若存在且 tool 不在其中，跳过该 tool
    - 若 allow 中不存在该 server（allowed is None），完全跳过该 server 的所有工具（等价“未被允许的 server”）
    """
    allow = _load_tool_allowlist(registry)
    tools_payload: list[dict[str, Any]] = []
    mapping: dict[str, tuple[str, str]] = {}
    for server in registry.server_names():
        tools = await registry.list_tools(server)
        for t in tools:
            if allow is not None:
                allowed = allow.get(server)
                if allowed is not None and t.name not in allowed:
                    continue
                if allowed is None:
                    continue
            fname = _safe_tool_name(server, t.name)
            mapping[fname] = (server, t.name)
            tools_payload.append(
                {
                    "type": "function",
                    "function": {
                        "name": fname,
                        "description": (t.description or "").strip(),
                        "parameters": t.input_schema or {"type": "object", "properties": {}},
                    },
                }
            )
    return tools_payload, mapping


def _tool_result_to_text(result: Any, *, max_chars: int) -> str:
    """将 MCP Result 结构转为简洁 text，限制最大长度，便于模型消费。"""
    parts: list[str] = []
    for item in getattr(result, "content", []) or []:
        if getattr(item, "type", None) == "text" and getattr(item, "text", None):
            parts.append(str(item.text))
        elif getattr(item, "type", None) == "resource" and getattr(item, "resource", None):
            parts.append(json.dumps(item.resource, ensure_ascii=False))
        elif getattr(item, "type", None) in ("image", "audio"):
            parts.append(f"[{item.type}]")
    text = "\n".join([p for p in parts if p]).strip()
    if len(text) > max_chars:
        return text[: max_chars - 20] + "\n...[truncated]"
    return text or "[empty]"


def _bearer_token_from_request(request: Request) -> str | None:
    """从请求头解析 Bearer token（Authorization: Bearer xxx）。"""
    auth = request.headers.get("Authorization") or ""
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
        return parts[1].strip()
    return None


async def _builtin_todo_list_today(request: Request) -> str:
    """内置工具：查询当前登录用户的“今日任务”。
    说明：
    - 直接读取当前请求的 Bearer token，解析用户
    - 访问后端数据库连接池，按“今日边界”筛选 start_date 或 due_date 落在“今天”的任务
    - 返回 JSON 文本，供模型基于工具结果进行总结输出
    """
    token = _bearer_token_from_request(request)
    if not token:
        return "未登录，无法查询今日任务"
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        return "系统未初始化数据库连接"
    user = await _auth_user_from_token(pool, token)
    if user is None:
        return "登录已失效或无效"
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            WITH bounds AS (
              SELECT date_trunc('day', NOW()) AS day_start,
                     date_trunc('day', NOW()) + interval '1 day' AS day_end
            )
            SELECT id, title, status, priority, start_date, due_date
            FROM tasks t
            CROSS JOIN bounds b
            WHERE t.user_id = $1
              AND t.is_deleted = FALSE
              AND (
                (t.start_date IS NOT NULL AND t.start_date >= b.day_start AND t.start_date < b.day_end)
                OR
                (t.due_date IS NOT NULL AND t.due_date >= b.day_start AND t.due_date < b.day_end)
              )
            ORDER BY priority DESC, updated_at DESC
            LIMIT 100
            """,
            int(user.id),
        )
    data = [
        {
            "id": str(r["id"]),
            "title": str(r["title"]),
            "status": str(r["status"]),
            "priority": int(r["priority"]),
            "start_date": r["start_date"].isoformat() if r["start_date"] else None,
            "due_date": r["due_date"].isoformat() if r["due_date"] else None,
        }
        for r in rows
    ]
    return json.dumps({"today_tasks": data}, ensure_ascii=False)


def _event_row_to_payload(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": str(row["name"]),
        "due_at": row["due_at"].isoformat() if row["due_at"] else None,
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "is_primary": bool(row["is_primary"]),
    }


async def _builtin_event_primary(request: Request) -> str:
    token = _bearer_token_from_request(request)
    if not token:
        return "未登录，无法查询主事件"
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        return "系统未初始化数据库连接"
    user = await _auth_user_from_token(pool, token)
    if user is None:
        return "登录已失效或无效"
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, name, due_at, created_at, is_primary
            FROM events
            WHERE user_id = $1 AND is_primary = TRUE
            LIMIT 1
            """,
            int(user.id),
        )
    return json.dumps({"primary_event": _event_row_to_payload(row) if row else None}, ensure_ascii=False)


async def _builtin_events_list(request: Request) -> str:
    token = _bearer_token_from_request(request)
    if not token:
        return "未登录，无法查询事件列表"
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        return "系统未初始化数据库连接"
    user = await _auth_user_from_token(pool, token)
    if user is None:
        return "登录已失效或无效"
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, due_at, created_at, is_primary
            FROM events
            WHERE user_id = $1
            ORDER BY due_at ASC, created_at DESC
            LIMIT 100
            """,
            int(user.id),
        )
    return json.dumps({"events": [_event_row_to_payload(row) for row in rows]}, ensure_ascii=False)


async def _builtin_focus_current(request: Request) -> str:
    token = _bearer_token_from_request(request)
    if not token:
        return "未登录，无法查询当前专注"
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        return "系统未初始化数据库连接"
    user = await _auth_user_from_token(pool, token)
    if user is None:
        return "登录已失效或无效"
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, task_id, duration, start_time, end_at, created_at
            FROM focus_logs
            WHERE user_id = $1 AND end_at IS NULL
            """,
            int(user.id),
        )
        if row is None:
            return json.dumps({"is_focusing": False}, ensure_ascii=False)
        from datetime import datetime

        dur = int((datetime.now(UTC) - row["start_time"]).total_seconds())
        if dur < 0:
            dur = 0
        task_row = await conn.fetchrow(
            """
            SELECT id, title, status
            FROM tasks
            WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE
            """,
            row["task_id"],
            int(user.id),
        )
    payload = {
        "is_focusing": True,
        "task": (
            {
                "id": str(task_row["id"]),
                "title": str(task_row["title"]),
                "status": str(task_row["status"]),
            }
            if task_row
            else {"id": str(row["task_id"])}
        ),
        "focus": {
            "start_time": row["start_time"].isoformat(),
            "duration_seconds": dur,
        },
    }
    return json.dumps(payload, ensure_ascii=False)


async def _builtin_focus_today(request: Request) -> str:
    token = _bearer_token_from_request(request)
    if not token:
        return "未登录，无法查询今日专注"
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        return "系统未初始化数据库连接"
    user = await _auth_user_from_token(pool, token)
    if user is None:
        return "登录已失效或无效"
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            WITH bounds AS (
              SELECT date_trunc('day', NOW()) AS day_start,
                     date_trunc('day', NOW()) + interval '1 day' AS day_end
            )
            SELECT
              COALESCE(
                SUM(
                  GREATEST(
                    0,
                    EXTRACT(
                      epoch FROM (
                        LEAST(COALESCE(fl.end_at, NOW()), b.day_end)
                        - GREATEST(fl.start_time, b.day_start)
                      )
                    )
                  )
                ),
                0
              )::BIGINT AS seconds
            FROM focus_logs fl
            CROSS JOIN bounds b
            WHERE fl.user_id = $1
              AND fl.start_time < b.day_end
              AND COALESCE(fl.end_at, NOW()) > b.day_start
            """,
            int(user.id),
        )
    seconds = int((row or {}).get("seconds") or 0)
    if seconds < 0:
        seconds = 0
    return json.dumps({"seconds": seconds, "minutes": seconds // 60}, ensure_ascii=False)


async def _builtin_focus_start(request: Request, args: dict[str, Any]) -> str:
    """敏感操作：开始专注
    说明：
    - 不直接执行数据库写入，返回前端确认所需的标准化 payload
    - 前端弹窗确认后，直接调用 REST: POST /todo/tasks/{task_id}/focus/start
    - 参数：args 需要包含 task_id（UUID 字符串）
    """
    token = _bearer_token_from_request(request)
    if not token:
        return "未登录，无法发起开始专注"
    task_id = str(args.get("task_id") or "").strip()
    if not task_id:
        return "缺少任务标识 task_id"
    return json.dumps(
        {
            "action": "confirm",
            "operation": "focus_start",
            "title": "开始专注",
            "message": "即将开始对该任务进行专注，是否确认？",
            "request": {
                "method": "POST",
                "url": f"/todo/tasks/{task_id}/focus/start",
                "headers": {"Authorization": "Bearer <token>"},
                "body": None,
            },
            "context": {"task_id": task_id},
        },
        ensure_ascii=False,
    )


async def _builtin_focus_stop(request: Request) -> str:
    """敏感操作：结束专注
    说明：
    - 不直接执行数据库写入，返回前端确认所需的标准化 payload
    - 前端弹窗确认后，直接调用 REST: POST /todo/focus/stop
    """
    token = _bearer_token_from_request(request)
    if not token:
        return "未登录，无法发起结束专注"
    return json.dumps(
        {
            "action": "confirm",
            "operation": "focus_stop",
            "title": "结束专注",
            "message": "将结束当前进行中的专注并累计时长，是否确认？",
            "request": {
                "method": "POST",
                "url": "/todo/focus/stop",
                "headers": {"Authorization": "Bearer <token>"},
                "body": None,
            },
        },
        ensure_ascii=False,
    )


async def _builtin_arxiv_daily_candidates(request: Request) -> str:
    token = _bearer_token_from_request(request)
    if not token:
        return "未登录，无法查询每日论文候选集"
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        return "系统未初始化数据库连接"
    user = await _auth_user_from_token(pool, token)
    if user is None:
        return "登录已失效或无效"
    today = datetime.now(UTC).date()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT arxiv_id, title, summary
            FROM arxiv_daily_candidates
            WHERE user_id = $1 AND candidate_date = $2
            ORDER BY created_at DESC
            LIMIT 50
            """,
            int(user.id),
            today,
        )
    papers = [
        {
            "arxiv_id": str(r["arxiv_id"]),
            "title": str(r["title"]),
            "summary": str(r["summary"]),
        }
        for r in rows
    ]
    return json.dumps({"daily_candidates": papers}, ensure_ascii=False)


async def _builtin_arxiv_daily_prepare_add_tasks(request: Request, args: dict[str, Any]) -> str:
    token = _bearer_token_from_request(request)
    if not token:
        return "未登录，无法发起每日任务创建"
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        return "系统未初始化数据库连接"
    user = await _auth_user_from_token(pool, token)
    if user is None:
        return "登录已失效或无效"
    today = datetime.now(UTC).date()
    ids_arg = args.get("arxiv_ids")
    requested = [str(x).strip() for x in ids_arg] if isinstance(ids_arg, list) else []
    async with pool.acquire() as conn:
        if requested:
            rows = await conn.fetch(
                """
                SELECT arxiv_id, title, summary
                FROM arxiv_daily_candidates
                WHERE user_id = $1 AND candidate_date = $2 AND arxiv_id = ANY($3::text[])
                ORDER BY created_at DESC
                LIMIT 50
                """,
                int(user.id),
                today,
                requested,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT arxiv_id, title, summary
                FROM arxiv_daily_candidates
                WHERE user_id = $1 AND candidate_date = $2
                ORDER BY created_at DESC
                LIMIT 10
                """,
                int(user.id),
                today,
            )
    selected_ids = [str(r["arxiv_id"]) for r in rows]
    if not selected_ids:
        return "今日暂无可添加到任务的论文候选"
    return json.dumps(
        {
            "action": "confirm",
            "operation": "daily_batch_create_tasks",
            "title": f"将今日 {len(selected_ids)} 篇论文加入任务",
            "message": "将为每篇论文创建一条任务，包含标题与摘要要点，确认后执行。",
            "request": {
                "method": "POST",
                "url": "/api/arxiv/daily/tasks/commit",
                "body": {"arxiv_ids": selected_ids},
            },
        },
        ensure_ascii=False,
    )


def _is_daily_allowed_tool_name(tool_name: str) -> bool:
    name = tool_name.lower()
    if "delete" in name or "remove" in name or "drop" in name:
        return False
    if name in {"arxiv__daily_candidates", "arxiv__daily_prepare_add_tasks"}:
        return True
    if name.startswith("todo__"):
        return (
            "list" in name or "get" in name or "query" in name or "add" in name or "create" in name or "insert" in name
        )
    return False


def _build_builtin_tools_payload(
    registry: MCPRegistry, *, scope: str = "general"
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """构建内置工具（无需 stdio 服务器）的 DeepSeek function 规范与执行映射。
    allowlist 控制项：
    - 当 allowlist 不为空，且 'todo' 组中包含 'list_today' 时才暴露该内置工具
    """
    allow = _load_tool_allowlist(registry)
    include_todo = True
    if allow is not None:
        allowed = allow.get("todo")
        include_todo = bool(allowed and ("list_today" in allowed))
    payload: list[dict[str, Any]] = []
    executors: dict[str, Any] = {}
    if include_todo:
        allowed_set = set(allow.get("todo")) if allow is not None and allow.get("todo") else set()

        def add_tool(name: str, desc: str, exec_key: str):
            payload.append(
                {
                    "type": "function",
                    "function": {
                        "name": name,
                        "description": desc,
                        "parameters": {"type": "object", "properties": {}},
                    },
                }
            )
            executors[name] = exec_key

        if not allowed_set:
            return payload, executors
        if "list_today" in allowed_set:
            add_tool(
                "todo__list_today",
                "查询当前用户的今日任务（需登录）",
                "builtin_todo_list_today",
            )
        if scope != "daily" and "event_primary" in allowed_set:
            add_tool(
                "todo__event_primary",
                "查询当前用户的主事件（需登录）",
                "builtin_event_primary",
            )
        if scope != "daily" and "events_list" in allowed_set:
            add_tool(
                "todo__events_list",
                "查询当前用户的全部事件列表（需登录）",
                "builtin_events_list",
            )
        if "focus_current" in allowed_set:
            add_tool(
                "todo__focus_current",
                "查询当前是否专注，以及所专注的任务与时长",
                "builtin_focus_current",
            )
        if "focus_today" in allowed_set:
            add_tool("todo__focus_today", "查询今日专注总时长", "builtin_focus_today")
        if "focus_start" in allowed_set:
            payload.append(
                {
                    "type": "function",
                    "function": {
                        "name": "todo__focus_start",
                        "description": "发起开始专注的确认请求（需要 task_id）",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "task_id": {
                                    "type": "string",
                                    "description": "目标任务 UUID",
                                }
                            },
                            "required": ["task_id"],
                        },
                    },
                }
            )
            executors["todo__focus_start"] = "builtin_focus_start"
        if "focus_stop" in allowed_set:
            add_tool("todo__focus_stop", "发起结束专注的确认请求", "builtin_focus_stop")
    if scope == "daily":
        payload.append(
            {
                "type": "function",
                "function": {
                    "name": "arxiv__daily_candidates",
                    "description": "查询今日 arxiv 每日候选论文列表（标题与摘要）",
                    "parameters": {"type": "object", "properties": {}},
                },
            }
        )
        executors["arxiv__daily_candidates"] = "builtin_arxiv_daily_candidates"
        payload.append(
            {
                "type": "function",
                "function": {
                    "name": "arxiv__daily_prepare_add_tasks",
                    "description": "发起把今日论文批量加入任务的确认弹窗",
                    "parameters": {
                        "type": "object",
                        "properties": {"arxiv_ids": {"type": "array", "items": {"type": "string"}}},
                    },
                },
            }
        )
        executors["arxiv__daily_prepare_add_tasks"] = "builtin_arxiv_daily_prepare_add_tasks"
    return payload, executors


async def chat_with_tools(
    messages: list[dict[str, Any]],
    request: Request,
    registry: MCPRegistry,
    *,
    scope: str = "general",
) -> tuple[str, list[dict[str, Any]]]:
    """聊天主流程：
    1) 根据 registry 生成 MCP server 工具 + 内置工具的 function 列表
    2) 调用 DeepSeek，当返回 tool_calls 时，逐一执行并把结果作为 role=tool 消息反馈给模型
    3) 如果模型返回自然语言内容则结束循环；否则继续下一轮（限制最大轮数）
    """
    max_loops = int(os.getenv("CHAT_MAX_TOOL_LOOPS", "4").strip() or "4")
    max_tool_output_chars = int(os.getenv("TOOL_MAX_OUTPUT_CHARS", "4000").strip() or "4000")
    tools_payload: list[dict[str, Any]] = []
    name_mapping: dict[str, tuple[str, str]] = {}
    actions: list[dict[str, Any]] = []
    if registry.server_names():
        tools_payload, name_mapping = await _build_server_tools_payload(registry)
    builtin_payload, builtin_execs = _build_builtin_tools_payload(registry, scope=scope)
    if builtin_payload:
        tools_payload.extend(builtin_payload)
    if scope == "daily":
        allowed_names = {
            _["function"]["name"] for _ in tools_payload if _is_daily_allowed_tool_name(_["function"]["name"])
        }
        tools_payload = [tool for tool in tools_payload if tool["function"]["name"] in allowed_names]
        name_mapping = {k: v for k, v in name_mapping.items() if k in allowed_names}
        builtin_execs = {k: v for k, v in builtin_execs.items() if k in allowed_names}
    for _ in range(max_loops + 1):
        assistant_msg = await _call_deepseek_chat(messages, tools_payload if tools_payload else None)
        tool_calls = assistant_msg.get("tool_calls")
        if isinstance(tool_calls, list) and tool_calls:
            messages.append(assistant_msg)
            for tc in tool_calls:
                if not isinstance(tc, dict):
                    continue
                tc_id = tc.get("id")
                fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
                fn_name = fn.get("name")
                fn_args = fn.get("arguments")
                if not isinstance(fn_name, str) or not isinstance(tc_id, str):
                    continue
                if scope == "daily" and not _is_daily_allowed_tool_name(fn_name):
                    tool_text = "权限受限：每日秘书仅允许查看任务与新增任务，不允许删除任务"
                    messages.append({"role": "tool", "tool_call_id": tc_id, "content": tool_text})
                    continue
                args_obj: dict[str, Any] = {}
                if isinstance(fn_args, dict):
                    args_obj = fn_args
                elif isinstance(fn_args, str) and fn_args.strip():
                    try:
                        parsed = json.loads(fn_args)
                        if isinstance(parsed, dict):
                            args_obj = parsed
                    except Exception:
                        args_obj = {}
                server_tool = name_mapping.get(fn_name)
                if server_tool is None:
                    if fn_name in builtin_execs:
                        try:
                            if fn_name == "todo__list_today":
                                tool_text = await _builtin_todo_list_today(request)
                            elif fn_name == "todo__event_primary":
                                tool_text = await _builtin_event_primary(request)
                            elif fn_name == "todo__events_list":
                                tool_text = await _builtin_events_list(request)
                            elif fn_name == "todo__focus_current":
                                tool_text = await _builtin_focus_current(request)
                            elif fn_name == "todo__focus_today":
                                tool_text = await _builtin_focus_today(request)
                            elif fn_name == "todo__focus_start":
                                tool_text = await _builtin_focus_start(request, args_obj)
                            elif fn_name == "todo__focus_stop":
                                tool_text = await _builtin_focus_stop(request)
                            elif fn_name == "arxiv__daily_candidates":
                                tool_text = await _builtin_arxiv_daily_candidates(request)
                            elif fn_name == "arxiv__daily_prepare_add_tasks":
                                tool_text = await _builtin_arxiv_daily_prepare_add_tasks(request, args_obj)
                            else:
                                tool_text = "工具未注册或被禁用"
                        except Exception as e:
                            tool_text = f"内置工具调用失败: {e}"
                    else:
                        tool_text = "工具未注册或被禁用"
                else:
                    server, tool = server_tool
                    try:
                        result = await registry.call_tool(server, tool, args_obj)
                        tool_text = _tool_result_to_text(result, max_chars=max_tool_output_chars)
                    except MCPProtocolError as e:
                        tool_text = f"MCP 调用失败: {e}"
                # 若为确认动作，收集以便前端弹窗
                try:
                    parsed = json.loads(tool_text)
                    if isinstance(parsed, dict) and parsed.get("action") == "confirm":
                        actions.append(parsed)
                except Exception:
                    pass
                messages.append({"role": "tool", "tool_call_id": tc_id, "content": tool_text})
            continue
        content = assistant_msg.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip(), actions
        return "", actions
    return "", actions


async def get_tools_overview(registry: MCPRegistry) -> dict[str, Any]:
    """聚合所有 server 工具与内置工具的 function 列表，返回给 /api/tools。
    返回字段：
    - mcp_servers：每个 server 的原始工具列表（用于展示）
    - deepseek_tools：提供给模型的 function 工具（含 server 工具与内置工具）
    - allowlist/config_allowlist：当前生效的环境白名单与配置白名单，便于调试
    """
    servers: list[dict[str, Any]] = []
    for name in registry.server_names():
        try:
            tools = await registry.list_tools(name)
            servers.append(
                {
                    "name": name,
                    "tools": [
                        {
                            "name": t.name,
                            "description": t.description,
                            "inputSchema": t.input_schema,
                        }
                        for t in tools
                    ],
                }
            )
        except Exception as e:
            servers.append({"name": name, "error": str(e)})
    tools_payload, _ = await _build_server_tools_payload(registry)
    builtin_payload, _ = _build_builtin_tools_payload(registry)
    if builtin_payload:
        tools_payload.extend(builtin_payload)
    return {
        "mcp_servers": servers,
        "deepseek_tools": tools_payload,
        "allowlist": os.getenv("MCP_ALLOW_TOOLS", "").strip() or None,
        "config_allowlist": registry.tool_allowlist() or None,
    }
