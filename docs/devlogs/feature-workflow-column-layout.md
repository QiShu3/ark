# 开发日志：feature/workflow-column-layout

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-02 18:42 · 34834c6 · feat(frontend): restructure workflows into symmetric 3-column layout under arrangements

- 用户提出的需求：
  - “/git-flow 我想把工作流放在安排内容下，样式和任务日程一样”

- 本次完成的工作：
  - **工作流版面重构**：将主事件内容工作台弹窗（`EventWorkbenchModal`）中原本独立的“工作流”全宽部分移除，转移到“安排内容”部分中。
  - **三栏对称布局**：将“安排内容”的网格容器从两列（`md:grid-cols-2`）升级为三列对称网格（`md:grid-cols-3`），将“工作流”列作为传统卡片列对称渲染在“日程”列右侧。
  - **精致微交互动效**：工作流列表中的卡片采用 `group` 属性配合 `group-hover`。默认展示工作流名称与专注数（例如 `1个专注`），当鼠标悬停时，专注数淡出并转为淡入“复制”和“删除”操作按钮，不仅视觉纯净高级，且保持与任务、日程完全一致的列结构。
  - **添加新增引导**：列底部增加与任务/日程对称的虚线“新建工作流”按钮。
  - **单元测试扩充与验证**：在 `EventWorkbenchModal.test.tsx` 中编写了 `copies and deletes event workflows from the workflow column` 单元测试，全面验证了工作流列表的渲染、副本复制流程、删除操作的确认对话框及其删除接口交互，并成功通过了全量单元测试。

- 验证情况：
  - `pnpm check` 验证通过，无任何 TypeScript 语法或类型错误。
  - `pnpm test -- src/components/__tests__/EventWorkbenchModal.test.tsx --run` 测试通过，包含新增用例在内的 7 个测试全绿。
  - `pnpm test -- --run` 全量单元测试成功通过。
