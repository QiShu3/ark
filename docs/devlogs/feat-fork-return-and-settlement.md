# 开发日志：feat/fork-return-and-settlement

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-30 · e11cd13 · feat: 工作流结算弹窗重构 — 过程树形展示 + 汇总统计

- 用户提出的需求：
  - 工作流结算弹窗设计成树形过程展示，包含主阶段 → fork 子阶段 → 回到父阶段
  - 弹窗包含：头部摘要、树形过程区、汇总统计区、居中结束按钮（去掉查看记录）

- 本次完成的工作：
  - 后端 `schemas.py`：新增 `WorkflowSettlementNodeOut`（递归树节点类型），扩展 `WorkflowSettlementOut` 增加 `nodes`、`fork_count`、`retry_count`、`best_accuracy`、`first_try_passed_count`
  - 后端 `helpers.py`：重写 `_build_workflow_settlement`，查询所有已完成轮次，按 `source_run_id` 构建树形结构，自动注入合成 "回到《xxx》" 节点，计算汇总统计
  - 前端 `focusWorkTypes.ts`：新增 `WorkflowSettlementNode` 类型，扩展 `WorkflowSettlement`
  - 前端 `WorkflowSettlementModal.tsx`：完全重写弹窗 UI，实现头部、递归 `ProcessTree`（├─▶/└─▶ 层级连接器）、汇总统计、居中按钮

- 验证情况：
  - `cd backend && uv run ruff check routes/todo/helpers.py routes/todo/schemas.py`，零错误
  - `cd frontend && pnpm check`，零错误
  - `cd frontend && pnpm lint`，无新增问题
