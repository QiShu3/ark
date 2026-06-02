# 开发日志：feature/workflow-column-layout

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-02 18:54 · 36f41fb · feat(frontend): unify event workbench modal navbar buttons with premium bordered icons

- 用户提出的需求：
  - “导航栏的右方两个button 事件总览和安排，看上去没有button的感觉，你有什么想法吗？我希望可以统一 button”

- 本次完成的工作：
  - **导航栏按钮统一美化**：重构了主事件内容工作台弹窗（`EventWorkbenchModal`）导航栏右侧的“事件总览”与“关闭”按钮。移除了之前扁平、不具备“可点击暗示”的纯文字圆角背景，升级为统一精致的高级微立体玻璃质感边框按钮（Bordered Glass Buttons）。
  - **融入微图标与交互动效**：
    - 在两个按钮中注入了轻量级矢量微图标（`ArrowLeft` 和 `X`），直观清晰地传达行为指令。
    - 样式采用 `rounded-lg border border-ark-border bg-ark-surface-subtle hover:bg-ark-surface shadow-sm active:scale-95 transition-all`，实现完美的悬停高亮、微投影提升以及按压收缩的极致互动手感。
  - **构建与测试验证**：确保全量 224 个 Vitest 测试全绿运行通过，零语法或类型问题。

- 验证情况：
  - `pnpm check` 验证通过，无任何 TypeScript 语法或类型错误。
  - `pnpm test -- --run` 全量单元测试成功通过。

### 2026-06-02 18:50 · cff323e · fix(frontend): remove static preview progress bar from workflows

- 用户提出的需求：
  - “去掉工作流下方的蓝橙色进度条”

- 本次完成的工作：
  - **移除静态预览进度条**：根据用户反馈，从主事件内容工作台（`EventWorkbenchModal`）的工作流列表项中移除了静态的蓝橙色分段胶囊进度条，保持原汁原味的横向 `WorkflowPhaseChips` 展示，保持界面极简干净。
  - **单元测试同步回滚**：将 `EventWorkbenchModal.test.tsx` 中新增的关于“专注: 25分钟”及“休息: 5分钟”静态进度条 `title` 断言进行了清理，确保单元测试与业务逻辑一致，且测试依然全部通过。

- 验证情况：
  - `pnpm check` 验证通过，无任何 TypeScript 语法或类型错误。
  - `pnpm test -- --run` 全量单元测试成功通过。

### 2026-06-02 18:48 · ea3d5b4 · feat(frontend): place workflows row under arrangement columns and add visual progress bar

- 用户提出的需求：
  - “不对，不是三栏，而是另起一行，工作流的宽度占任务日常的宽度，其他不变
工作流也要显示工作流进度条哦”

- 本次完成的工作：
  - **位置重构与宽度占满**：工作流不作为第三列，而是另起一行。我们调整了网格布局，使工作流容器以全宽（`md:col-span-2`）放置在“任务”和“日程”两列的下方，完美占据两者的总宽度，保持页面其他布局不变。
  - **横向精美工作流进度条**：为所有工作流卡片添加了视觉呈现度极佳的横向分段胶囊进度条（`renderWorkflowPreviewBar`）。该进度条使用系统级别的动效和渐变色（蓝色表示专注，橙色表示休息），根据各个阶段的相对时长动态渲染其宽度比例，使得每个工作流的阶段分布和比例一目了然，科技感和精致度拉满。
  - **单元测试补充与断言**：更新了 `EventWorkbenchModal.test.tsx` 中的工作流测试，在其中增加了对于“专注: 25分钟”及“休息: 5分钟”静态进度条片段 `title` 属性的断言校验，确保进度条的准确度，且全量 224 个 Vitest 测试全绿通过。

- 验证情况：
  - `pnpm check` 验证通过，无任何 TypeScript 语法或类型错误。
  - `pnpm test -- --run` 全量单元测试成功通过。

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
