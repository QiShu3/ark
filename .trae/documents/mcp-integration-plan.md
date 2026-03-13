# MCP 接入方案（FastAPI + DeepSeek）

目标：让当前 AI 助手（前端 ChatBox + 后端 FastAPI + DeepSeek）支持 MCP（Model Context Protocol），从而可按需接入“工具服务器”（文件系统、数据库、搜索、代码执行等），并让模型通过工具调用完成任务。

## 现状与约束

- 现有后端仅提供 `/api/chat`，把消息转发到 DeepSeek（OpenAI 兼容 Chat Completions）。
- 前端通过 Vite proxy 访问 `/api/*`。
- 需要引入 MCP 后，不应把任何密钥暴露到前端；所有 MCP 执行在后端完成。

## 总体架构（推荐）

**核心思路：后端实现一个“工具编排层（Tool Orchestrator）”。**

1. 后端维护 MCP Server 列表（可配置/可动态加载）。
2. 后端启动/连接 MCP Servers（优先 stdio 子进程；可扩展 SSE/HTTP）。
3. 后端从 MCP 拉取工具清单，将 MCP 工具映射为 DeepSeek 的 `tools/function` JSON Schema。
4. `/api/chat` 调用 DeepSeek 时携带 `tools`，让模型返回 `tool_calls`。
5. 后端拦截 `tool_calls`，执行对应 MCP 工具，拿到结果后继续喂回模型，直到模型输出最终回复。
6. 返回最终回复给前端；前端仅渲染对话与（可选）工具执行状态。

## 方案对比

### 方案 A（推荐）：后端集成 MCP（stdio 优先）
- **优点**：安全边界清晰；工具运行在服务端；易做鉴权/审计/限流；前端无感。
- **缺点**：需要维护 MCP 连接与进程生命周期。

### 方案 B：前端直连 MCP
- **不推荐**：浏览器限制多（stdio 不可用）、密钥/权限风险高、沙箱与鉴权难做。

结论：采用方案 A。

## 详细实施步骤

### Step 1：后端目录与依赖补齐
- 增加 MCP Client 依赖（Python MCP SDK，如仓库/官方包名需在实施时确认）。
- 引入结构化配置（如 `settings.py` 读取环境变量）：MCP server 列表、允许的工具、超时、并发限制等。
- 增加日志与请求追踪（仅记录必要信息，不记录密钥与敏感内容）。

**交付物**
- `backend/pyproject.toml` 增加 MCP 相关依赖
- `backend/app/settings.py`（或等价模块）

### Step 2：实现 MCP 管理器（Server Registry）
实现一个 MCP 管理器模块，职责：
- 从配置加载 server 定义：`name`、`transport`（stdio/sse）、`command/args/env`、`timeout`、`allow_tools`。
- 应用启动时建立连接/拉起进程；应用关闭时优雅退出。
- 提供方法：
  - `list_tools(server_name?) -> tools`
  - `call_tool(server, tool_name, arguments) -> result`

**交付物**
- `backend/app/mcp/registry.py`
- `backend/app/mcp/types.py`

### Step 3：工具 Schema 映射（MCP -> DeepSeek/OpenAI tools）
将 MCP 的工具描述映射成 OpenAI tool schema（DeepSeek 兼容）：
- `name`：`{server}.{tool}` 或保持 tool 名并在路由层做命名空间。
- `description`：MCP 工具描述。
- `parameters`：MCP 提供的 JSON Schema（必要时做兼容修正）。

同时支持：
- 工具白名单/黑名单（按 server/工具粒度）。
- 参数 schema 校验（避免模型传入畸形参数导致执行风险）。

**交付物**
- `backend/app/tools/schema.py`

### Step 4：实现“工具调用循环”（Tool-Calling Loop）
扩展现有 `/api/chat` 逻辑：
- 输入：`message + history`（可扩展带 `toolMode`、`enabledServers`）。
- 取可用工具集合 `tools = build_tools_from_mcp()`
- 调用 DeepSeek：
  - 若返回普通文本 => 直接返回
  - 若返回 `tool_calls` => 逐个执行：
    - 解析 tool 名与参数
    - 调用 MCP
    - 将 tool 结果以 `tool` role 追加到 messages
    - 继续调用模型
- 设置最大循环次数（防止无限调用），并对每个 tool call 设置超时。
- 失败策略：
  - 工具不可用/参数错误：返回结构化错误给模型/用户
  - 工具执行异常：降级为文本解释 + 建议重试

**交付物**
- `backend/app/llm/deepseek_client.py`（封装 chat 请求）
- `backend/app/chat/router.py`（FastAPI 路由拆分）
- 现有 `backend/main.py` 调整为按模块挂载路由

### Step 5：前端展示增强（可选）
默认不改 UI 也能用；但建议加两点增强：
- 显示“工具执行中/执行失败”的提示（不泄露敏感输出时可展示摘要）。
- （可选）允许用户开启/关闭某些 MCP servers（开关面板）。

**交付物**
- `frontend/src/components/ChatBox.tsx` 增强 UI（可选）

### Step 6：安全、权限与治理（必须）
最低要求：
- **工具白名单**：只允许明确配置的工具对模型可见。
- **资源限制**：超时、最大并发、最大返回大小。
- **鉴权**：若要对外提供服务，给 `/api/chat` 增加鉴权（token/session）。
- **审计**：记录 tool 调用的元信息（server/tool/耗时/状态），不记录密钥与敏感数据。
- **隔离**：stdio MCP server 以受限权限运行（最小权限原则），避免访问宿主机敏感目录。

### Step 7：验证与回归
后端：
- 单测：schema 映射、tool call 解析、循环终止条件、错误分支。
- 集成测试：mock MCP server + mock DeepSeek 响应（覆盖 tool_calls）。
前端：
- 基础手测：正常对话、触发工具调用、工具失败时 UI 提示。

## 配置示例（落地时给）

- `MCP_SERVERS`：JSON 或多项 env 配置（如 `MCP_SERVER_1_COMMAND` 等）
- `MCP_ALLOW_TOOLS`：白名单
- `CHAT_MAX_TOOL_LOOPS` / `TOOL_TIMEOUT_SECONDS`

## 里程碑交付（按顺序）

1. 后端完成 MCP registry + tools schema 映射 + tool-calling loop，提供 `/api/chat` 透明支持工具调用。
2. 提供 1-2 个示例 MCP server 接入（例如：本地文件只读、HTTP fetch）。
3. 补齐安全治理（白名单、超时、审计）。
4.（可选）前端工具状态展示与 server 开关。

