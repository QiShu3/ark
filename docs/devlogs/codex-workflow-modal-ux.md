# 开发日志：codex/workflow-modal-ux

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-04-26 11:33 · cad91c7 · feat(frontend): improve workflow preset modal

- 用户提出的需求：
  - “让git 忽略这些文件吧，无需追踪”
  - “好，继续吧”
  - “你怎么把左右排列变成上下排列了？”

- 本次完成的工作：
  - 将工作流管理弹窗拆分为独立的 `WorkflowPresetModal` 组件，减轻 `PlaceholderCard` 的体积和职责
  - 将工作流预设表单逻辑提炼到独立 helper，包括默认草稿、从预设生成草稿、副本草稿、脏状态判断、阶段预览与阶段重排
  - 将弹窗文案调整为“工作流预设”，补充说明文案，明确这里管理的是可复用模板而不是运行控制
  - 为预设列表增加“复制”能力，并在当前编辑的预设上显示“编辑中”状态
  - 为表单增加实时预览摘要、阶段上移/下移能力，以及关闭或切换草稿前的未保存确认
  - 修复工作流预设弹窗左右分栏布局，恢复双栏展示
  - 为本地 `.codex/`、`backend/workspace/` 以及指定计划文档补充 `.gitignore` 规则
  - 补充前端回归测试，覆盖预设复制、阶段重排、摘要更新、未保存离开确认和新文案

- 验证情况：
  - `pnpm exec vitest run src/components/__tests__/PlaceholderCard.workflow.test.tsx`
  - `pnpm check`
