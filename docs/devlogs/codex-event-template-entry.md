# 开发日志：codex/event-template-entry

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-20 16:59 · f20cf05 · feat: align event templates with workbench

- 用户提出的需求：
  - “这里也要添加 套用模板 button，同时button旁边添加一个齿轮icon的button，点击后进入模板工作台”
  - “计划模板不包含事件名称、开始日期和到期时间吗？”
  - “但也要保留具体日期硬编码的功能”
  - “我不想要 计划项目 这个功能”
  - “我希望模板内容和事件工作台的内容一致，你明白我的意思嘛？”

- 本次完成的工作：
  - 在事件模板模型中新增默认事件名称、默认开始日期、默认到期时间、默认主事件字段，并贯通创建、列表、更新、复制、另存和回写接口
  - 在事件创建区加入“事件模板”选择、“套用模板”按钮和齿轮入口，选择模板时会回填空的事件字段，套用后创建事件并进入事件工作台
  - 将模板管理弹窗调整为“模板工作台”，允许创建和编辑与事件工作台一致的事件信息和工作台内容
  - 将前端文案从“计划模板 / 计划草稿 / 计划项”统一为“事件模板 / 工作台内容”，保留事件工作台运行态的已创建安排和成就摘要
  - 补充实现计划文档和前后端回归测试，覆盖模板默认事件字段、另存模板、事件编辑区套用模板和工作台文案

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py -q`，89 passed
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，3 files / 13 tests passed
  - `cd frontend && pnpm check`
  - `git diff --check`
  - 浏览器验收：在 `http://localhost:5173/` 验证事件编辑区出现“事件模板 / 套用模板 / 进入模板工作台”，模板工作台暴露默认事件字段；选择带默认日期的事件模板后回填事件名称、开始日期和到期时间，套用后创建事件并打开“事件工作台”
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但前端测试和 TypeScript 检查通过
