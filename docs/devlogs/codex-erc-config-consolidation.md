# 开发日志：codex/erc-config-consolidation

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-30 16:06 · 7d87c23 · feat: consolidate ERC event config

- 用户提出的需求：
  - “先做 ERC 需要把‘两个任务配置’收束为‘一份子应用配置派生多个任务’和配置变更同步规则吧”
  - “OK，开始实现吧。”

- 本次完成的工作：
  - 新增 ERC 统一事件配置接口，支持一份事件绑定 ERC 配置派生真题练习与错题复习两个模块任务。
  - 支持按事件读取 ERC 配置、独立启停模块、禁用后隐藏入口但保留历史任务/专注/完成记录，重新启用时复用原模块任务。
  - 配置同步时保留用户手动今日安排，并通过模块状态返回 `confirmation_needed` 提醒前端。
  - ERC 首页改为统一配置面板，主事件绑定提示、模块显隐、今日安排同步都走同一份配置。
  - 事件创建入口、事件工作台和事件激活同步统一改用 ERC 配置保存 helper，避免主入口与子应用首页配置分叉。
  - 补充 ERC 首页、事件入口、事件激活和后端路由测试，覆盖统一配置、非主事件读取和模块同步行为。

- 验证情况：
  - `uv run pytest tests/test_todo_routes.py -k "erc_config" -v`，6 passed。
  - `uv run pytest tests/test_todo_routes.py -v`，101 passed。
  - `uv run ruff check .`，All checks passed。
  - `pnpm check`，TypeScript 检查通过；运行时提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致。
  - `pnpm test -- ERC/__tests__/Home.test.tsx EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx eventAppSync.test.ts`，4 files / 36 tests passed。
  - `pnpm exec eslint src/pages/ERC/Home.tsx src/lib/erc/api.ts src/lib/erc/configSync.ts src/lib/events/eventAppSync.ts src/lib/events/__tests__/eventAppSync.test.ts src/components/EventCountdownCard.tsx src/components/events/EventWorkbenchModal.tsx src/pages/ERC/__tests__/Home.test.tsx src/components/__tests__/EventCountdownCard.test.tsx`，通过。
  - `git diff --check`，通过。
