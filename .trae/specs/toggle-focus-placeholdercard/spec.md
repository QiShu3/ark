# PlaceholderCard 专注切换 Spec

## Why
当前“开始专注”区域仅展示提示文案，点击后不会真正进入/退出专注状态，导致专注功能无法形成闭环。

## What Changes
- 在右侧占位卡片（PlaceholderCard）中，为“开始专注/即将专注于”悬停区域绑定点击行为：首次点击开始专注，再次点击结束专注。
- 悬停文案随专注状态变化：开始专注→正在专注；即将专注于→正在专注于。
- 调用后端 ToDo 专注接口：开始专注使用任务 task1（与提示文案一致），结束专注结束当前用户的进行中专注。

## Impact
- Affected specs: 前端专注交互、ToDo 专注状态展示（前端侧）
- Affected code: `frontend/src/components/PlaceholderCard.tsx`、`frontend/src/lib/api.ts`（仅复用现有请求封装，不改协议）

## ADDED Requirements

### Requirement: 点击进入专注
系统 SHALL 在用户点击 PlaceholderCard 的专注悬停区域时，为“即将专注于：{task1.title}”所代表的 task1 开始专注。

#### Scenario: 开始专注成功
- **WHEN** 用户悬停显示“开始专注/即将专注于：{task1.title}”并点击该区域
- **AND** task1 可被解析为某个具体任务（包含 task_id 与 title）
- **THEN** 前端调用 `POST /todo/tasks/{task1.id}/focus/start`
- **AND** 组件进入“正在专注”状态
- **AND** 悬停文案变为“正在专注 / 正在专注于：{task1.title}”

#### Scenario: 无可专注任务
- **WHEN** 用户点击该区域
- **AND** 当前无法选出 task1（例如：暂无今日任务/加载失败）
- **THEN** 前端不发起开始专注请求
- **AND** UI 保持默认状态

### Requirement: 再次点击结束专注
系统 SHALL 在用户处于专注状态时，再次点击同一专注区域以结束专注并恢复默认状态。

#### Scenario: 结束专注成功
- **WHEN** 用户处于“正在专注”状态并点击该区域
- **THEN** 前端调用 `POST /todo/focus/stop`
- **AND** 组件恢复默认状态
- **AND** 悬停文案恢复为“开始专注 / 即将专注于：{task1.title}”

## MODIFIED Requirements

### Requirement: 悬停文案与状态一致
PlaceholderCard 的专注悬停层 SHALL 根据当前专注状态渲染文案：
- 未专注：显示“开始专注”与“即将专注于：{task1.title}”
- 专注中：显示“正在专注”与“正在专注于：{focusTask.title}”

## REMOVED Requirements
无

