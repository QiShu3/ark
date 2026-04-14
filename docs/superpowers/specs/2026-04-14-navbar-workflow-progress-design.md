# 导航栏中间工作流进度条（紧凑版）设计规格 (Spec)

## 1. 目标

- 在顶部导航栏中间区域新增“工作流进度条（紧凑版）”，仅在工作流运行中显示。
- 点击该进度条区域时，打开现有的工作流管理弹窗（触发 `ark:open-workflow-modal`）。

## 2. 范围

- 仅新增导航栏中间的展示与交互，不改动工作流业务逻辑。
- 视觉上为“紧凑版”，不复用卡片区的全尺寸 `WorkflowProgressBar` 样式，但复用同一套进度计算逻辑。

## 3. 组件与数据流

### 3.1 新增组件：WorkflowNavProgress

- 新文件：`frontend/src/components/WorkflowNavProgress.tsx`
- 输入：`workflow: WorkflowSnapshot`
- 渲染规则：
  - 当 `workflow.state === 'normal'` 或 `phases` 缺失/为空 或 `totalSeconds <= 0` 时返回 `null`。
  - 显示内容（从左到右）：
    - 当前阶段图标：专注 `🧠` / 休息 `☕`
    - 剩余时间 `MM:SS`（优先使用 `workflow.remaining_seconds`，并在本地每秒递减渲染）
    - 一条细进度条（2px~4px 高度），颜色跟随当前阶段（专注蓝色、休息橙色）
    - 轻量阶段提示 `当前阶段序号/总阶段数`（例如 `2/4`）
- 交互：
  - 点击整个区域：`window.dispatchEvent(new Event('ark:open-workflow-modal'))`
- 可访问性：
  - `role="progressbar"` + `aria-valuenow/aria-valuemin/aria-valuemax` 与现有 `WorkflowProgressBar` 语义一致。

### 3.2 Navigation 中的数据获取与刷新

- 修改文件：[Navigation.tsx](file:///Users/qishu/Project/ark/frontend/src/components/Navigation.tsx)
- 在 “Ark Project” 与右侧 `ml-auto` 容器之间插入居中容器（例如 `flex-1 flex justify-center`），挂载 `WorkflowNavProgress`。
- 数据来源：
  - 复用现有接口：`GET /todo/focus/workflow/current`
  - 仅提取 `WorkflowSnapshot` 需要的字段（`state/current_phase_index/phases/pending_confirmation/remaining_seconds`）。
- 刷新策略：
  - `Navigation` 挂载时拉取一次。
  - 监听全局事件 `ark:reload-focus`，触发时拉取一次（跨页面同步）。
  - 可选轮询：每 60 秒拉取一次（兜底同步，避免遗漏事件）。

## 4. 视觉约束（导航栏内）

- 最大宽度建议：`max-w-[520px]`，避免挤压左右导航内容。
- 小屏策略：当导航栏空间不足时可隐藏（例如 `hidden md:flex`），避免与导航按钮/头像抢空间。

## 5. 风险与兼容

- 风险：`/todo/focus/workflow/current` 返回结构包含额外字段，需要在前端做字段兜底与类型收敛。
- 兼容：当用户未登录或接口 401 时，进度条不展示（与现有导航栏鉴权逻辑一致）。

