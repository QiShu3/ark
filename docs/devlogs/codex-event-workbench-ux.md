# 开发日志：codex/event-workbench-ux

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-20 09:53 · e4c01ec · feat(frontend): improve event workbench entry

- 用户提出的需求：
  - “为什么我的事件没有这些功能？”
  - “给我一个优化方案”
  - “好，另起分支进行开发吧”

- 本次完成的工作：
  - 将事件空状态创建表单默认设为“主事件”，创建成功后直接进入对应事件工作台
  - 在事件列表中新增“打开工作台”入口，让非主事件也能直接进入工作台，不必先设为主事件
  - 在事件工作台总览区补充“设为主事件 / 编辑事件 / 删除事件”管理操作
  - 事件工作台接入当前事件的成就摘要，展示当前进展、最近解锁和下一步成就
  - 补充前端回归测试，覆盖空状态创建主事件并打开工作台、列表打开非主事件工作台、工作台事件管理和事件成就摘要

- 验证情况：
  - `cd frontend && pnpm test -- EventCountdownCard EventWorkbenchModal EventTemplateManagerModal`，3 files / 11 tests passed
  - `cd frontend && pnpm check`
  - `cd backend && uv run pytest tests/test_todo_routes.py -k "event_plan or event or achievement_summary" -q`，21 passed，68 deselected
  - 浏览器验收：使用本地临时用户验证空状态创建事件后默认成为主事件，并自动打开“事件工作台”；工作台展示事件总览、事件操作入口和事件成就摘要
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过
