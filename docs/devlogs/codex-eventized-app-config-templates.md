# 开发日志：codex/eventized-app-config-templates

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-24 20:20 · b0d5fb8 · feat: scope app tasks to events and templates

- 用户提出的需求：
  - “好了，提交代码并合并到主分支”

- 本次完成的工作：
  - 将 Vocab/ERC 子应用托管任务配置按事件隔离：状态查询默认读取当前主事件，初始化时保存到对应事件，并支持无主事件/当前事件未配置的明确状态。
  - 后端为 `app_task_configs` 与应用托管任务增加事件维度唯一约束，同时保留全局配置兼容路径，避免不同事件复用同一个子应用任务配置。
  - 事件模板支持保存安排详情、子应用配置和工作流草稿；从模板创建事件时会恢复应用配置、工作流阶段绑定与安排客户端标识。
  - Vocab/ERC 页面增加当前主事件配置提示、未配置状态入口和同步说明，多周日历按当前主事件过滤任务与日程。
  - 更新站点标题与 PNG favicon/apple touch icon 资源。
  - 补充后端路由测试和前端事件创建测试，覆盖事件维度配置、无主事件状态和模板创建后的应用初始化。

- 验证情况：
  - `uv run pytest tests/test_todo_routes.py`，92 passed。
  - `pnpm test -- EventCountdownCard`，1 file / 19 tests passed。
  - `pnpm check`，TypeScript 检查通过；运行时提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致。
  - `uv run ruff check .`，All checks passed。
