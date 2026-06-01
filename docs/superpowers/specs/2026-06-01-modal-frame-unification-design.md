# 统一业务弹窗主面板布局设计

## 1. 背景

- 当前前端业务弹窗的遮罩、层级、安全区和主面板定位分散在多个组件中自行实现。
- 已确认存在的主要分散点包括：
  - `PlaceholderCard`
  - `EventCountdownCard`
  - `SettingsModal`
  - `EventWorkbenchModal`
- 这些弹窗目前存在以下不一致：
  - 是否避开顶部导航栏不一致
  - 主面板是否在可用区域内居中不一致
  - `z-index`、`max-height`、`max-width` 约束不一致
  - backdrop 点击关闭和内容区阻止冒泡逻辑重复实现

## 2. 目标

- 所有业务弹窗统一使用同一套“主面板布局框架”。
- 默认行为为：
  - 避开顶部导航栏安全区
  - 在导航栏以下的主内容可用区域内垂直居中
  - 统一使用 backdrop 和圆角大面板视觉
- 后续如果要调整主面板位置、安全区、最大高度，只改一处即可影响所有接入弹窗。

## 3. 非目标

- 本次不统一 tooltip、popover、dropdown、右键菜单等轻量浮层。
- 本次不统一业务弹窗内部 header、footer、表单字段和具体交互。
- 本次不强行把所有弹窗改成同一尺寸，只统一外层布局和默认约束。

## 4. 核心方案

### 4.1 新增统一容器组件

- 新增组件：`frontend/src/components/AppModalFrame.tsx`
- 该组件只负责外层布局，不负责业务内容。
- 业务组件将自己的内容面板作为 children 传入。

### 4.2 默认布局行为

- 使用全屏 fixed backdrop 覆盖页面。
- backdrop 默认使用统一遮罩与淡入动画。
- 默认预留顶部导航栏安全区。
- 主面板在“导航栏以下的可用区域”中垂直、水平居中。
- 主面板默认添加最大高度约束，避免被安全区和视口挤出屏幕。

### 4.3 导航栏安全区

- 当前导航栏真实布局为 `top-3 + h-24`。
- 第一版统一抽象为常量安全区，而不是继续在各处手写 `pt-[120px]`、`max-h-[calc(100vh-144px)]`。
- 建议在 `AppModalFrame` 内部集中维护：
  - `NAV_SAFE_TOP = 120`
  - `NAV_SAFE_BOTTOM = 24`
- 后续如需变量化，再迁移到全局 CSS 变量。

## 5. 组件接口

### 5.1 基础接口

- `open: boolean`
- `onClose?: () => void`
- `children: ReactNode`

### 5.2 行为接口

- `closeOnBackdrop?: boolean`
  - 默认 `true`
- `avoidNav?: boolean`
  - 默认 `true`
- `zIndexClassName?: string`
  - 默认 `z-[60]` 或项目统一 modal 层级

### 5.3 尺寸与样式接口

- `panelClassName?: string`
  - 业务弹窗自定义宽高、边框、背景、圆角
- `backdropClassName?: string`
  - 少量特殊弹窗覆盖 backdrop 样式
- `contentClassName?: string`
  - 控制主面板区域的对齐和内边距

### 5.4 语义接口

- `role?: 'dialog' | 'alertdialog'`
  - 默认 `dialog`
- `ariaLabel?: string`
  - 供无标题弹窗使用

## 6. 内部实现规则

### 6.1 外层结构

- `AppModalFrame` 统一输出三层：
  - backdrop 容器
  - 安全区布局容器
  - 面板容器

### 6.2 事件规则

- backdrop 点击时：
  - 如果 `closeOnBackdrop` 为 `true`，调用 `onClose`
  - 否则忽略
- 面板容器统一 `stopPropagation`
- 这样各业务弹窗不再重复写一遍 backdrop 点击逻辑

### 6.3 尺寸规则

- `AppModalFrame` 不直接规定固定宽高。
- 它只提供：
  - `max-height` 安全边界
  - 默认居中布局
  - 默认宽度上限保护
- 具体尺寸仍由各业务弹窗通过 `panelClassName` 决定。

## 7. 迁移策略

### 7.1 第一批迁移范围

- `PlaceholderCard`
  - 安排管理
  - 专注统计
  - 创建任务
  - 草稿弹窗
  - 任务助手弹窗
- `EventCountdownCard`
  - 事件总览弹窗
- `SettingsModal`
  - 设置弹窗
- `EventWorkbenchModal`
  - 应用配置等业务型弹窗

### 7.2 迁移顺序

- 先迁移当前已经暴露出布局问题的大型弹窗：
  - `PlaceholderCard` 的安排管理
  - `SettingsModal`
- 再迁移其它大中型业务弹窗。
- 每迁移一个弹窗，都删除其重复 backdrop / 对齐 / 安全区逻辑。

## 8. 兼容策略

- 允许个别弹窗临时覆盖默认行为：
  - 不避开导航栏
  - 不允许点击遮罩关闭
  - 使用更高层级
- 但覆盖只能通过 `AppModalFrame` 的显式参数完成，禁止回退为各自手写布局。

## 9. 验证策略

- 手动验证：
  - 弹窗在导航栏下方可见，不遮挡导航栏
  - 主面板在可用区域内居中
  - 不同尺寸弹窗都能正确受 `max-height` 约束
  - backdrop 点击关闭行为符合预期
- 代码验证：
  - `pnpm check`
- 如附近已有测试模式，可补充最小渲染测试，重点验证 `AppModalFrame` 是否正确渲染 `role`、`aria-label` 和 children。

## 10. 推荐落地结果

- 项目内所有业务弹窗统一通过 `AppModalFrame` 渲染外层结构。
- 后续若要调整主面板安全区、居中策略、层级和遮罩，只修改 `AppModalFrame` 一处。
- `PlaceholderCard` 等业务组件体积会减小，职责更集中在内容本身，而不是 modal 外层布局。 
