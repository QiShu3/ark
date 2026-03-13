# AI 助手 `div` 模版化接入计划

## Summary
- 目标：把当前 AI 助手容器抽成统一“样式模版”，并在页面中直接引入该模版。
- 关键约束：两个 AI 助手只复用样式，不复用功能；提示词、快捷指令、任务创建参数继续分离。
- 范围：前端组件重构为主，不改后端能力边界与权限。

## Current State Analysis
- 通用 AI 助手入口：`<ChatBox />` 在 [LeftPanel.tsx](file:///Users/qishu/Project/ark/frontend/src/components/LeftPanel.tsx#L23-L25)（默认 `scope=general`）。
- 每日 AI 助手入口：`<ChatBox scope="daily" ... />` 在 [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L770-L782)。
- 样式当前混在 `ChatBox` 根节点里：见 [ChatBox.tsx](file:///Users/qishu/Project/ark/frontend/src/components/ChatBox.tsx#L164-L167)。
- 功能差异已存在且应保留：
  - daily 初始提示词来自 [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L207-L213)。
  - daily 快捷指令来自 [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L775-L779)。
  - 后端根据 `scope` 限制工具权限（daily 无删除）：见 [assistant_runner.py](file:///Users/qishu/Project/ark/backend/MCP/assistant_runner.py#L436-L451) 与 [assistant_runner.py](file:///Users/qishu/Project/ark/backend/MCP/assistant_runner.py#L548-L553)。

## Proposed Changes

### 1) 新建“仅样式”AI 容器模版组件
- 文件：`/Users/qishu/Project/ark/frontend/src/components/AIAssistantShell.tsx`（新增）
- What：
  - 提供统一外层 `div` 样式模版（圆角、边框、毛玻璃、阴影、高度等）。
  - 仅负责视觉容器与布局，不包含任何聊天逻辑、提示词、scope 或任务参数。
- Why：
  - 满足“把 div 作为 AI 助手模版”的诉求，并彻底解耦样式与功能。
- How：
  - 组件仅接收 `className/children`（必要时 `title` 作为纯展示）。
  - 样式来源对齐当前 daily 使用的视觉风格。

### 2) 让 ChatBox 专注功能，不再内置页面级外壳样式
- 文件：`/Users/qishu/Project/ark/frontend/src/components/ChatBox.tsx`
- What：
  - 移除 ChatBox 中“默认 absolute 外壳”的页面耦合样式。
  - 保留聊天区核心结构：消息区、输入区、确认弹层、滚动能力。
- Why：
  - 让“样式模版”与“功能组件”职责单一，避免再次出现嵌套样式冲突。
- How：
  - 根容器改为最小必要布局类（例如 `flex flex-col min-h-0`）。
  - 滚动相关类（`min-h-0 overflow-y-auto`）保留。

### 3) 在两个页面都“直接引入模版 + 引入 ChatBox”
- 文件：
  - `/Users/qishu/Project/ark/frontend/src/components/LeftPanel.tsx`
  - `/Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx`
- What：
  - 通用助手：在 LeftPanel 使用 `AIAssistantShell + ChatBox(scope=general)`。
  - 每日助手：在 Arxiv 使用 `AIAssistantShell + ChatBox(scope=daily)`，并保持当前 daily 初始提示词与快捷指令。
- Why：
  - 两处都走同一套“样式模版”，但功能配置继续独立，满足“样式相同、功能不同”。
- How：
  - 保留现有 daily 的 `initialAssistantMessage` 与 `quickReplies` 传参。
  - 通用助手继续使用默认 general 行为与通用提示流。

### 4) 确保任务创建参数与权限不被样式重构影响
- 文件：前端调用链 + 后端现有实现（不改后端）
- What：
  - daily 仍走 `/api/arxiv/daily/tasks/prepare|commit` 的 `arxiv_ids` 参数链路。
  - general 仍走既有 ToDo 工具链。
- Why：
  - 用户明确要求“功能不一样（提示词、创建任务参数不一样）”。
- How：
  - 本次仅做前端容器重构；后端 `scope` 逻辑与路由保持不变。

## Assumptions & Decisions
- “直接在 div 引入该 AI 助手”解释为：页面先放统一样式 `div` 模版，再在其中挂载 `ChatBox`。
- “两个 AI 助手”对应：
  - 通用助手（`general`，LeftPanel）
  - 每日助手（`daily`，Arxiv）
- 不新增跨助手共享的提示词/参数配置，避免功能被意外同化。

## Verification Steps
- 代码检查：
  - `frontend` 执行 `npm run lint`。
- 功能验收：
  - 通用页和每日页均显示相同视觉风格的 AI 容器。
  - 通用助手仍显示通用快捷回复与默认行为。
  - 每日助手仍显示 daily 快捷回复与自动总结首条消息。
  - daily 任务创建仍走确认流程且参数仍为 `arxiv_ids`。
  - daily 删除任务权限仍受限（由后端 `scope=daily` 保证）。
