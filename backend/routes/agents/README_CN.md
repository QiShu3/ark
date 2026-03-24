# Agents 模块说明

## 当前实现

本目录包含 Ark agent 后端入口和共享基础设施。

### 已实现的架构

- `models.py`
  - agent 动作、技能、聊天负载、策略规则和 agent 上下文的共享 Pydantic 模型和数据类。
- `skills.py`
  - 暴露给 LLM 的技能注册表。
  - 用于聊天工具调用流程的技能到动作映射。
- `policy.py`
  - 主体、能力和范围评估。
  - 当前支持的主体：
    - `dashboard_agent`
    - `app_agent:arxiv`
    - `app_agent:vocab`
- `executor.py`
  - 动作执行和审批票据处理。
  - 在 `agent_approvals` 表中创建和消费审批记录。
  - 执行当前领域动作：
    - `task.list`
    - `task.update`
    - `task.delete.prepare`
    - `task.delete.commit`
    - `arxiv.daily_tasks.prepare`
    - `arxiv.daily_tasks.commit`
- `routes.py`
  - `/api/agent/skills` 和 `/api/agent/actions/{action_name}` 的 HTTP 路由。
- `chat.py`
  - `/api/chat` 路由。
  - DeepSeek chat-completions 集成。
  - 将技能注册表转换为 LLM function-calling 工具。
  - 复用与直接动作 API 相同的执行器/策略路径。

## 已添加的产品功能

### 1. 统一的 agent 动作网关

为 agent 触发的操作添加了结构化的动作层：

- 直接结果动作
- 需要审批的动作
- 禁止响应

这为前端、agent 聊天和未来的 MCP 集成提供了统一的执行契约。

### 2. 敏感操作的审批流程

敏感动作不再直接执行。

当前支持的审批型动作：

- 任务删除
- arXiv 每日候选批量创建任务

审批流程：

1. prepare 动作创建审批票据
2. 前端接收结构化的审批负载
3. 前端携带 `approval_id` 确认
4. commit 动作重新验证票据并执行一次

### 3. 策略和范围控制

当前策略层支持：

- agent 身份检查
- 能力检查
- 范围检查
- 敏感动作确认规则

当前行为：

- `dashboard_agent` 可以操作全局任务
- `app_agent:arxiv` 可以准备 arXiv 每日任务动作
- 跨应用任务读取需要 `cross_app.read.summary`

### 4. Agent 聊天集成

添加了 `/api/chat` 路由，基于 DeepSeek，使用：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_BASE_URL`

聊天路由：

- 从 `skills.py` 构建工具定义
- 让模型调用函数
- 通过共享动作执行器路由所有执行
- 将需要审批的结果返回给前端

## 已添加的前端功能

这些后端变更已被前端使用：

- 新的 `#/agent` 页面作为 dashboard agent 控制台
- 左侧技能列表从 `/api/agent/skills` 加载
- 右侧聊天区域基于 `/api/chat`
- 敏感操作的审批卡片
- dashboard 中的任务删除已迁移到审批型动作流程
- arXiv 每日批量创建已迁移到相同的动作契约

## 已添加的测试

覆盖的行为包括：

- 技能列表
- 禁止动作检查
- 跨应用摘要权限行为
- 审批 prepare/commit 流程
- 过期审批拒绝
- 聊天纯文本回复路径
- 聊天审批展示路径

## 建议的后续步骤

### 1. 已完成动作注册表

执行器现在已经使用动作注册表，而不是显式的 `if action_name == ...` 分支。

当前结构：

- 每个动作都由一个 `ActionDefinition` 描述
- 每个定义包含：
  - `action_id`
  - `policy_action_id`
  - `handler`
  - 可选的审批元信息
- 执行器会在策略检查和执行前动态解析动作定义

这样能让新增动作更安全，也让执行流程更统一。

### 2. 更明确地分离技能与动作暴露

目前 `skills.py` 包含：

- 技能定义
- 技能到动作映射

建议拆分：

- `skills.py` 仅用于 LLM 面向的函数定义
- `skill_bindings.py` 用于技能到动作映射

这将使未来的 MCP 暴露更清晰。

### 3. 添加更细粒度的能力定义

当前能力模型对 v1 足够，但应演进为更明确的矩阵，例如：

- `tasks.read.global`
- `tasks.read.summary`
- `tasks.write.global`
- `task.delete`
- `cross_app.read.summary`
- `cross_app.read.details`
- `cross_app.write.linked_resource`

### 4. 将动作特定的业务逻辑移近各领域

当前执行器将任务和 arXiv 动作逻辑放在一起。

建议未来拆分：

- `actions/task_actions.py`
- `actions/arxiv_actions.py`
- `actions/approval_actions.py`

然后执行器可以变成纯编排层。

### 5. 添加持久化的工具执行追踪

为了调试和 UX 透明度，添加一个 agent 运行日志表，存储：

- 会话 id
- agent 类型
- 用户消息
- 选定的工具调用
- 工具结果
- 审批 id
- 最终助手回复

这将有助于在 UI 中解释 agent 行为。

### 6. 添加流式聊天支持

当前 `/api/chat` 仅返回最终响应。

建议后续：

- 添加 SSE 流式回复支持
- 分别流式传输助手文本和工具状态事件
- 将需要审批的事件作为结构化负载流式传输

### 7. 为外部 MCP 集成做准备

如果 Ark 以后引入 MCP 工具暴露，请保持此规则：

- MCP 工具应调用此 agent 动作层
- MCP 不得绕过策略或审批逻辑

当前的 `技能 -> 动作执行器 -> 策略 -> 领域逻辑` 路径应保持为唯一可信的后端路径。
