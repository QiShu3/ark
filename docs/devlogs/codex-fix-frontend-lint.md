# 开发日志：codex/fix-frontend-lint

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-30 16:40 · 1dd42d0 · fix(frontend): clear lint debt

- 提交哈希：
  - `1dd42d0895e76062c256f4defe3f0087c28dd717`

- 用户提出的需求：
  - “全量 pnpm lint 仍然会失败，但失败项主要是仓库既有 lint 债。你看看这个问题”
  - “新建branch进行开发吧”
  - “好，继续吧”

- 本次完成的工作：
  - 清理前端 lint error：移除未使用的状态、派生值和辅助函数，修复 `no-unused-vars` 报错。
  - 调整 `react-hooks/set-state-in-effect` 触发点，将初始加载或 loading 展示改为异步回调与派生状态，避免 effect 中同步设置状态。
  - 将 `StudyCard` 的换词收起行为改为调用侧用 `key={item.id}` 重挂载，保留原交互语义并移除同步 effect 重置。
  - 移除 `TaskFocusWork` 中不必要的 `useMemo`，解决 React Hooks preserve-manual-memoization 报错。

- 验证情况：
  - `cd frontend && pnpm lint`：0 errors / 6 existing warnings。
  - `cd frontend && pnpm check`：TypeScript 检查通过。
  - 当前环境提示 Node v22.18.0 与项目期望 Node 20.x 不一致，但 lint 和类型检查均通过。
