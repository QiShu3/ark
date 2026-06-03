# 开发日志：feature/workflow-column-layout

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-03 08:50 · ca9e713 · feat(frontend): refactor workflow preset modal layout and styling with horizontal dnd

- 用户提出的需求：
  - “/browser 好，每次你觉得修改好后都要从浏览器上截图对比一下” (重构工作流预设管理与配置页面样式，横向拖拽阶段排序，修改微调时长 5min，支持 icon 自定义，左侧三点菜单)

- 本次完成的工作：
  - **后端数据库与 Pydantic 扩展**：为 `focus_workflow_presets` 表新增 `icon` 字段，并在 models/schemas/helpers 逻辑中全面接入，更新 API 接口实现自定义图标的读写与克隆逻辑。
  - **横向流程轨道重构**：将纵向卡片列表重构为横向流程节点轨道布局，支持通过 `@dnd-kit/core` 与 `@dnd-kit/sortable` 进行轻量横向阶段排序。
  - **编辑交互优化 (Fixed Footer)**：右侧配置面板右下角动作按钮（设为默认、重置、保存工作流）重构为固定底部 Footer（`shrink-0 bg-ark-surface-strong border-t`），解决表单超长时按钮被截断折叠的问题。
  - **细节微调与字符控制**：绑定任务类型、支持倒计时与正计时，点击 `+` / `-` 按钮以 5 分钟步长进行微调；工作流名称限制最大 20 字且展示实时字数统计。
  - **单元测试修复**：修复了 pre-existing timezone rollover Flake 报错，以及 vocab deck count mock 方法的入参签名不匹配问题，实现 `uv run pytest` 175 个后端测试 100% 通过。

- 验证情况：
  - `pnpm check` 与 `pnpm build` 验证通过，无任何 TypeScript 语法或打包错误。
  - 启动 FastAPI 与 Vite 调试服务，并使用 `browser` 子代理成功进行账号登录与视觉保真度截图对比（保存到 artifact 目录下）。

### 2026-06-02 19:37 · 385dc28 · feat(frontend): convert event basic info card to responsive inline-editable form

- 用户提出的需求：
  - “/grill-me 我希望基本信息栏是表单的形式，可以随时改，然后把编辑事件改成保存事件，你明白我的意思嘛？” (且保存事件不是指保存基本信息，而是整个板块)

- 本次完成的工作：
  - **行内表单大重构**：将主事件内容工作台弹窗（`EventWorkbenchModal.tsx`）的 “基本信息” 区域重构为响应式的行内表单，事件名称、事件开始日期、事件截止时间以表单输入框平铺展示，允许随时编辑。
  - **状态自适应同步**：在组件中新增了在 `currentEvent.id` 加载或变化时自动同步 `eventEditForm` 状态的 `useEffect` 侦听，确保了编辑内容的实时自适应性，且数据更新后即刻回写，彻底消除了异步输入竞态冲突。
  - **按钮大一统升级**：去除了冗余的 “编辑事件” 状态及相关 Edit Drawer 的显示逻辑，用通用的 `<Button variant="primary">保存事件</Button>` 替换了原有的 “编辑事件” 按钮，并保持 “删除事件” 和 “设为主事件” 等按钮位置完全对称不变。
  - **测试与命名冲突解决**：修复了在打开任务编辑器时，Testing Library 的 `getByLabelText('开始日期')` 查询与基本信息卡片中 “开始日期” 产生的重名冲突。将事件卡片中的 Label 命名升级为更精准、更具语境的 “事件开始日期” 和 “事件截止时间”，使得 224/224 个 Vitest 测试全绿回归，零报错。

- 验证情况：
  - `pnpm check` 验证通过，无任何 TypeScript 语法或类型错误。
  - `pnpm test -- --run` 全量单元测试成功通过，224/224 tests passed。

### 2026-06-02 19:26 · edda600 · feat(frontend): unify event basic info actions with premium Buttons

- 用户提出的需求：
  - “好” (针对事件基本信息卡片下的“编辑事件”与“删除事件”按钮也进行通用 `<Button>` 组件的重构升级)

- 本次完成的工作：
  - **重构事件动作按钮**：将主事件内容工作台弹窗（`EventWorkbenchModal.tsx`）中“设为主事件”、“编辑事件”以及“删除事件”的三个原生 `<button>` 元素重构替换为统一的 `<Button>` 实例。
  - **加载动效与状态绑定**：为“设为主事件”与“删除事件”按钮优雅绑定了 `loading={submitting}` 属性，将提交阻断转换为美观的 native loading spinner 旋转微交互。
  - **测试与类型安全校验**：全量运行 `pnpm check && pnpm test -- --run`，所有 224 个 Vitest 测试全绿通过，零报错零缺陷。

- 验证情况：
  - `pnpm check` 验证通过，无任何 TypeScript 语法或类型错误。
  - `pnpm test -- --run` 全量单元测试成功通过，224/224 tests passed。

### 2026-06-02 19:18 · 17b9aec · feat(frontend): unify button styles in main dashboard and arrangement management center

- 用户提出的需求：
  - “同意” (统一项目所有 button 样式，第一期聚焦“主看板与安排管理中心”并保留日历格子等布局容器原生，Focus-Work 页面使用专用变量覆盖，在 `<Button>` 中扩展 `xs` 尺寸)

- 本次完成的工作：
  - **扩展 `<Button>` 组件微型尺寸**：在 `Button.tsx` 中新增了 `xs`（微型）尺寸（`text-[10px]`，`px-2 py-0.5`，`rounded-md`），使列表项中的微型动作按钮既精美小巧，又完全支持统一的微交互与圆角系统。
  - **主看板页面标准按钮大一统**：在 `PlaceholderCard.tsx` 中全面重构了各层级的标准操作按钮，包括：
    - 列表卡片中的“完成任务”（xs次要胶囊型）、“确认日程”（xs次要黄色胶囊型）等动作。
    - 卡片浮层操作中的“结束工作流”（危险）、工作流切换、任务与日程快捷新建按钮（微型 SVG 图标）。
    - 各大模态框（选择工作流、专注统计、安排管理、创建安排、安排解析助手、草稿确认）的头部关闭 `X` 按钮全部替换为 ghost-sm 矢量微图标。
    - 底部或主操作栏的“创建”、“自定义安排”、“快捷生成安排”等动作按钮，且将 uploading/submitting 状态完美接入 `<Button>` 内部的 native loading spinner 旋转微动效。
  - **安排编辑模态框按钮一统**：在 `TaskEditModal.tsx` 与 `AppointmentEditModal.tsx` 中移除了全部原生的 `<button>` 元素，取而代之的是高度一致的 `<Button>` 实例（“取消”为 secondary、“删除”为 danger、“保存”为 primary），并将 saving 提交状态转换为动感十足的 native loading spinner。
  - **界面设置模态框按钮一统**：在 `SettingsModal.tsx` 中优雅替换了顶部关闭、底部“恢复默认”（secondary）、“取消”（secondary）和“保存并应用”（primary-loading）的三个核心操作按钮，且将“或上传本地图片”的 dashed 边框按钮采用 React `<Button>` 的 `leftIcon` 和 `loading` 属性优雅融合。
  - **测试与类型安全校验**：全量运行 `pnpm check && pnpm test -- --run`，所有 224 个 Vitest 测试全绿通过，零报错零缺陷。

- 验证情况：
  - `pnpm check` 验证通过，无任何 TypeScript 语法或类型错误。
  - `pnpm test -- --run` 全量单元测试成功通过，224/224 tests passed。

### 2026-06-02 19:05 · f81a14c · feat(frontend): create Button component and migrate EventWorkbenchModal to use it

- 用户提出的需求：
  - “可以，我想把这个项目所有的button都按照你设计的这个button样式来设计，我想统一button的样式，可以实现一个改全都改，你觉得可以吗？肯呢个会出现什么问题呢？我希望可以采用通用 React <Button> 组件”

- 本次完成的工作：
  - **封装全局通用 `<Button>` 组件**：在 `frontend/src/components/Button.tsx` 中创建了极富弹性、符合全局规范的通用 `<Button>` 组件。该组件高度集成了：
    - 5 种风格变体 (`primary` / `secondary` / `danger` / `ghost` / `cta`)。
    - 3 种规范尺寸 (`sm` / `md` / `lg`)。
    - 丰富的微交互细节（聚焦阴影、按压微缩放 `active:scale-95`、加载自适应 `loading` 动画骨架、左右矢量图标 `leftIcon` / `rightIcon` 接口等）。
  - **完成第一阶段渐进式重构**：将主事件内容工作台弹窗（`EventWorkbenchModal.tsx`）内的主要核心按钮全部替换为通用 `<Button>` 组件：
    - 导航栏的“事件总览”与“关闭”按钮（绑定微图标）。
    - 安排内容的“应用配置”操作按钮。
    - 工作流卡片列表中的“复制”（次要）与“删除”（危险）操作按钮。
  - **测试与类型安全校验**：全量 224 个单元测试全绿通过，新组件零类型与校验报错。

- 验证情况：
  - `pnpm check` 验证通过，无任何 TypeScript 语法或类型错误。
  - `pnpm test -- --run` 全量单元测试成功通过。

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
