# Tasks
- [x] Task 1: 盘点 PlaceholderCard 专注区域与 task1 选取逻辑
  - [x] 确认专注悬停区域 DOM 结构与点击绑定位置
  - [x] 将“即将专注于”对应的任务从“仅 title”升级为可获取 task_id

- [x] Task 2: 实现专注状态切换与接口调用
  - [x] 未专注时点击：调用 `POST /todo/tasks/{task1.id}/focus/start`
  - [x] 专注中时点击：调用 `POST /todo/focus/stop`
  - [x] 处理 409/404 等错误：保持 UI 状态与后端一致（最小策略即可）

- [x] Task 3: 按状态更新悬停文案
  - [x] 未专注：开始专注 / 即将专注于
  - [x] 专注中：正在专注 / 正在专注于

- [x] Task 4: 前端验证与回归
  - [x] 运行 `pnpm -C frontend check` 与 `pnpm -C frontend lint`
  - [x] 手动验证：点击开始专注→文案变化→再次点击结束专注→文案恢复

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 2, Task 3
