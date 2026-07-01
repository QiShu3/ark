# Ark Backend

FastAPI 后端，提供用户注册/登录、邮箱验证码验证、重置密码、任务与个性化配置接口。

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
- `AUTH_EMAIL_TOKEN_TTL_SECONDS`（可选）：邮箱验证码/重置密码链接有效期，默认 1800
- `AUTH_EMAIL_DELIVERY_MODE`（可选）：`log` / `tencent` / `disabled`，未配置腾讯云密钥时默认 `log`
- `TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY`：腾讯云 CAM 密钥
- `TENCENT_SES_REGION`：邮件推送地域，默认 `ap-guangzhou`
- `TENCENT_SES_FROM_EMAIL`：发信地址，例如 `ark@strangetalking.xin`
- `TENCENT_SES_VERIFY_TEMPLATE_ID`：邮箱验证模板 ID
- `TENCENT_SES_RESET_TEMPLATE_ID`：重置密码模板 ID

邮箱验证模板变量使用 `{{verify_code}}`，重置密码模板变量使用 `{{reset_token}}`。

接口：
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/verify-email`
- `POST /auth/verification/resend`
- `POST /auth/password/forgot`
- `POST /auth/password/reset`
- `GET /auth/me`（Bearer token）
- `GET /auth/users`（管理员返回全部；非管理员仅返回自己）
- `POST /auth/logout`（Bearer token，可选）

自检（需要可用的 PostgreSQL）：

```bash
uv run python scripts/auth_selftest.py
```

## Chat（兼容 `/api/chat`）

提供一个独立的最小兼容聊天接口，供前端的“快捷生成任务”复用。

需要在环境变量中提供：
- `CHAT_API_KEY`：OpenAI 兼容接口的 API Key
- `CHAT_BASE_URL`：OpenAI 兼容接口 Base URL，例如 `https://api.openai.com/v1`
- `CHAT_MODEL`：调用的模型名
- `CHAT_TIMEOUT_SECONDS`（可选）：请求超时秒数，默认 45

接口：
- `POST /api/chat`

请求体最小格式：

```json
{
  "message": "请将以下任务描述解析成 JSON",
  "history": [],
  "scope": "general"
}
```

响应格式：

```json
{
  "reply": "..."
}
```

## ArXiv（已移除）

旧的 ArXiv 应用和相关表已从后端入口中移除。
如需清理历史数据库里的残留表，请先备份，再执行：

```bash
uv run python scripts/cleanup_arxiv_tables.py --apply
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

通过环境变量配置 MCP servers（stdio 子进程）。后端会在启动时连接这些 server，并为 Ark 的工具流程提供可用工具。

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
