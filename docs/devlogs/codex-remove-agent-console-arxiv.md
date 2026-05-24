# 开发日志：codex/remove-agent-console-arxiv

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-24 01:27 · 45ecb1a · fix(frontend): remove homepage shortcut entry

- 用户提出的需求：
  - “首页右侧那个区块”
  - “好，提交代码吧”

- 本次完成的工作：
  - **删除首页右侧快捷入口块**：从 `PlaceholderCard` 中移除右侧面板最后一格的“快捷入口”文案和 `PhoneSimulator` 覆盖入口，避免首页再出现这条独立的快捷分流。
  - **收回专用接线**：去掉 `PlaceholderCard` 里的 `anchorRef` / `showPhoneSimulator` 相关状态和分支，同时把 `RightPanel` 第 4 张卡片从 3 段收敛为 2 段，保留应用中心入口和其余占位结构。

- 验证情况：
  - 前一轮已通过 `cd frontend && pnpm build` 和 `cd frontend && pnpm test -- --run src/components/__tests__/PlaceholderCard.arrangements.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx`；本次仅做右侧入口收口与注释整理，未新增额外验证。

### 2026-05-23 21:08 · d146d24 · refactor: remove MainAgent runtime

- 用户提出的需求：
  - “删除掉 MainAgent ，但是莫宁对话不动，因为之后我想接入其他ai。”
  - “PLEASE IMPLEMENT THIS PLAN: # 去掉 `MainAgent`，保留「莫宁」壳，清空 Mini Agent 运行时”

- 本次完成的工作：
  - **莫宁壳静态化**：将 `DialogueInteraction` 改成纯展示组件，保留原有布局、默认文案、快捷项和按钮位置，但发送、建议项和朗读入口全部禁用，不再依赖会话、TTS 或自动开场。
  - **移除 MainAgent 接缝**：删除 `useAgentChat.ts`、`useTts.ts`、`workflowNotifications.ts` 及其测试，清掉 `PlaceholderCard` 里的工作流提醒事件分发和相关测试。
  - **清空 vendored Mini Agent**：删除 `backend/mini_agent_integration.py`、`backend/tests/test_mini_agent_integration.py`、整个 `backend/2ms/`，并从 `backend/main.py` 去掉 Mini Agent 生命周期和路由注册。
  - **依赖收口**：从 `backend/pyproject.toml` 移除 Mini Agent 专用依赖，并通过 `uv lock` 同步更新 `backend/uv.lock`；`/api/chat` 与 Ark 其他后端功能保留。

- 验证情况：
  - `cd frontend && pnpm build`，通过。
  - `cd frontend && pnpm test`，47 个测试文件 / 190 个测试全部通过。
  - `cd backend && uv run ruff check .`，通过。
  - `cd backend && uv run pytest`，166 个测试全部通过。

### 2026-05-23 18:11 · c36a172 · refactor: remove agent console and arxiv apps

- 用户提出的需求：
  - “我想完全删除 /agent-console 和 /arxiv这两个子应用”
  - “PLEASE IMPLEMENT THIS PLAN: # 删除 `/agent-console` 和 `/arxiv`”
  - “这个 paper 的表可以删除”

- 本次完成的工作：
  - **删除两个独立子应用入口**：从前端路由中移除 `/agent-console` 和 `/arxiv`，删除对应页面与页面测试，将兜底路由改为保留 Ark 应用壳的极简 404 页面。
  - **收敛应用中心**：`/apps` 只保留“背单词”和“阅读训练”两个启动器，删除旧的 Agent Console、ArXiv、占位卡和“添加应用”入口。
  - **清理后端 ArXiv 模块**：从 FastAPI 生命周期和路由注册中移除 ArXiv，删除 `backend/routes/arxiv/`、arXiv pytest 覆盖和自检脚本，并移除 `arxiv` Python 依赖及锁文件条目。
  - **补充一次性数据清理脚本**：新增 `backend/scripts/cleanup_arxiv_tables.py`，用于备份后删除 `papers`、`paper_tag_defs`、`arxiv_daily_configs`、`arxiv_daily_candidates`、`arxiv_daily_task_links`。
  - **中性命名收尾**：将共享页面会话测试和 `useAgentChat` 默认 profile 从旧的 `agent-console` 语义迁到 `MainAgent`，保留首页“莫宁”流程。

- 验证情况：
  - `cd frontend && pnpm build`，生产构建成功通过。
  - `cd frontend && pnpm test`，前端 49 个测试文件共 203 个测试全部成功通过。
  - `cd backend && uv run pytest`，后端 188 个 pytest 测试全部成功通过。
  - `cd backend && uv run ruff check main.py tests/test_mini_agent_integration.py scripts/cleanup_arxiv_tables.py`，静态检查通过。
