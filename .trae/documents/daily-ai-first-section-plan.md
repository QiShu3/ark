# 每日页面 AI 助手集成到第一部分的实施计划

## Summary
- 目标：将“每日 AI 秘书”从下方独立卡片整合到第一部分（当前“今日 AI 总结”卡片），并在用户进入每日页面时自动给出论文总结。
- 已确认方案：采用“替换为聊天框”方式，即第一部分直接展示聊天框，进入页面后自动出现总结消息。
- 不改变范围：不新增后端接口，不修改权限策略（仍为 daily scope 的查看/添加任务，删除受限）。

## Current State Analysis
- 页面入口与默认页签：
  - [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L138-L140) 当前默认 `viewMode` 已是 `daily`。
  - [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L493-L534) 顶部页签已将“每日”放在第一位。
- 每日摘要现状：
  - [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L361-L372) 通过 `generateDailySummary` 调用 `/api/arxiv/daily/summary` 并写入 `dailySummary`。
  - [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L428-L433) 进入 `daily` 视图时会自动触发摘要生成。
  - [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L763-L768) 第一部分目前仅显示纯文本摘要。
- 每日 AI 助手现状：
  - [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L825-L840) “每日 AI 秘书”聊天框位于页面下方独立卡片。
  - [ChatBox.tsx](file:///Users/qishu/Project/ark/frontend/src/components/ChatBox.tsx#L63-L69) 支持 `initialAssistantMessage` 注入首条助手消息（仅在消息为空时生效）。

## Proposed Changes

### 1) 调整每日页面第一部分为“AI 秘书聊天区”（替换纯文本摘要）
- 文件：`/Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx`
- What：
  - 将 [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L763-L768) 的“今日 AI 总结”文本卡片替换为“每日 AI 秘书”聊天卡片。
  - 在第一部分内渲染 `ChatBox`，保留 `scope="daily"`、`quickReplies`、`apiPath="/api/chat"`。
- Why：
  - 满足“把下面的 AI 助手集成在第一部分”的交互目标，避免用户在页面下方再次寻找入口。
- How：
  - 复用原下方聊天卡片配置，迁移到第一部分位置。
  - 统一第一部分标题文案为“每日 AI 秘书”。

### 2) 进入页面自动展示“当日总结”到 AI 助手首条消息
- 文件：`/Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx`
- What：
  - 基于已有 `dailySummary`（自动生成），构造动态 `initialAssistantMessage` 传入 `ChatBox`，内容形如：
    - 有摘要：`我是每日秘书，已为你生成今日总结：\n\n{dailySummary}`
    - 无摘要：保底欢迎语（当前已有文案）。
- Why：
  - 满足“用户一进去该页面该 AI 助手自动总结论文给用户”的目标，并让结果直接体现在聊天区。
- How：
  - 保留 [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L428-L433) 的自动生成逻辑。
  - 新增一个基于 `dailySummary` 的 memo/字符串变量，作为 `ChatBox.initialAssistantMessage`。
  - 避免重复触发：依赖 `ChatBox` 已有“仅首次注入”机制。

### 3) 删除每日页下方重复聊天卡片，避免双入口
- 文件：`/Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx`
- What：
  - 删除 [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx#L825-L840) 的下方“每日 AI 秘书”重复卡片。
- Why：
  - 避免同一功能在页面中重复出现导致信息冗余与状态分散。
- How：
  - 保留第一部分聊天区后，移除下方对应 JSX 区块。

### 4) 验证与回归
- 文件：前端工程
- What：
  - 执行 `npm run lint`，确保 TS/ESLint 通过。
  - 手动检查 daily 视图：首次进入能看到 AI 首条总结消息、快速回复可用、确认弹窗流程不受影响。
- Why：
  - 保证布局与交互调整不破坏既有 daily 功能。

## Assumptions & Decisions
- 决策（已确认）：采用“替换为聊天框”方案，而非“摘要+聊天同卡”或“仅移动聊天框”。
- 假设：
  - “第一部分”指每日页面中当前“今日 AI 总结”所在区域。
  - 自动总结以现有 `/api/arxiv/daily/summary` 结果为准，不新增接口与后台调度逻辑。
  - 若摘要暂时为空，仍展示默认欢迎语，后续用户可手动触发“生成今日总结”或使用快捷回复。

## Verification Steps
- 静态检查：
  - 在 `frontend` 目录执行 `npm run lint`。
- 功能验收：
  - 进入 Arxiv 页面默认落在“每日”页签。
  - 第一部分显示“每日 AI 秘书”聊天框，不再是纯文本摘要卡片。
  - 首次进入时聊天框自动出现总结型首条消息（有摘要时包含摘要内容）。
  - 下方不再出现第二个重复“每日 AI 秘书”卡片。
  - 快捷回复与任务确认弹窗流程可正常使用。
