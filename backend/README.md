# Ark Backend

FastAPI 后端，用于把前端聊天请求转发到 DeepSeek（OpenAI 兼容）接口。

## 启动

```bash
uv sync
uv run uvicorn main:app --reload --port 8000
```

## Auth（用户注册/登录）

需要在环境变量中提供：
- `DATABASE_URL`：PostgreSQL 连接串
- `AUTH_TOKEN_TTL_SECONDS`（可选）：访问令牌有效期，默认 86400
- `AUTH_PASSWORD_ITERATIONS`（可选）：PBKDF2 迭代次数，默认 210000

接口：
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`（Bearer token）
- `GET /auth/users`（管理员返回全部；非管理员仅返回自己）
- `POST /auth/logout`（Bearer token，可选）

自检（需要可用的 PostgreSQL）：

```bash
uv run python scripts/auth_selftest.py
```

## ArXiv（论文检索与状态）

接口：
- `POST /arxiv/search`
- `PUT /arxiv/papers/state`
- `GET /arxiv/papers`
- `GET /arxiv/health`

自检（需要可用的 PostgreSQL）：

```bash
uv run python scripts/arxiv_selftest.py
```

## 一键启动（含 MCP）

默认读取 `mcp_servers.json` + `mcp_allow_tools.json`，并启动后端：

```bash
chmod +x dev.sh
./dev.sh
```

如果 8000 端口被占用，希望脚本自动清理：

```bash
AUTO_KILL_PORT=1 ./dev.sh
```

## MCP（工具接入）

通过环境变量配置 MCP servers（stdio 子进程）。后端会在启动时连接这些 server，并把它们的 `tools/list` 映射为模型可用的 tools，然后在 `/api/chat` 内自动执行 tool_calls。

示例（使用仓库自带的 echo MCP server）：

```bash
export MCP_SERVERS='[{"name":"echo","command":["./.venv/bin/python","-u","mcp_echo_server.py"]}]'
uv run uvicorn main:app --reload --port 8000
```

工具白名单（可选；启用后默认拒绝未列出的工具/服务器）：

```bash
export MCP_ALLOW_TOOLS='{"echo":["echo","add"]}'
```

## PostgreSQL MCP（数据库管理）

仓库内置了一个 Postgres MCP server（stdio），默认只读，提供：
- `list_schemas` / `list_tables` / `describe_table` / `run_query`

启动示例：

```bash
export MCP_SERVERS='[
  {"name":"db","command":["./.venv/bin/python","-u","mcp_postgres_server.py"]}
]'
export MCP_ALLOW_TOOLS='{"db":["list_schemas","list_tables","describe_table","run_query"]}'
uv run uvicorn main:app --reload --port 8000
```

只读限制：
- 默认仅允许 `SELECT/WITH/SHOW/EXPLAIN`
- 如需允许写入语句（不推荐），显式设置：

```bash
export MCP_DB_ALLOW_WRITE=true
```
