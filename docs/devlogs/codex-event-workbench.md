# 开发日志：codex/event-workbench

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-18 19:14 · f282f1b · feat: refine event workbench drafts

- 用户提出的需求：
  - “好，继续”

- 本次完成的工作：
  - 新增计划草稿另存为全局模板、回写源模板的后端接口，并按草稿实际时间反推模板相对天数
  - 在事件工作台前端接入草稿项编辑、删除、另存模板和回写源模板操作
  - 在模板管理弹窗中补充已有模板编辑能力，支持修改名称、说明、时间模式和模板项
  - 扩展事件工作台与模板管理单测，覆盖草稿编辑/删除、模板另存/回写和已有模板编辑

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py -k "saved_as_template or update_source_template" -q`
  - `cd backend && uv run pytest tests/test_todo_routes.py -k "event_plan or plan_draft" -q`
  - `cd backend && uv run ruff check .`
  - `cd backend && uv run pytest`，194 passed，26 warnings
  - `cd frontend && pnpm test -- EventWorkbenchModal EventTemplateManagerModal`
  - `cd frontend && pnpm check`
  - `cd frontend && pnpm test`，46 files / 178 tests passed
  - 浏览器冒烟：`cd frontend && pnpm dev` 启动在 `http://localhost:5174/`，使用本地临时用户验证主事件打开工作台、创建/套用模板、展示任务草稿、打开草稿编辑表单
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-18 10:09 · 2d9affb · feat(frontend): manage event plan templates

- 用户提出的需求：
  - “开，进行开发吧，记得另起分支开发，不要在main分支上进行开发”

- 本次完成的工作：
  - 在事件工作台中接入模板列表、模板选择和“套用模板”操作
  - 套用模板后刷新工作台数据，并在计划草稿区展示任务草稿和日程草稿
  - 新增轻量模板管理弹窗，支持创建、复制和删除全局事件计划模板
  - 补充工作台组件测试，覆盖模板套用后计划草稿展示

- 验证情况：
  - `cd frontend && pnpm test -- EventWorkbenchModal EventCountdownCard`
  - `cd frontend && pnpm check`
  - 最终全量验证：`cd backend && uv run pytest`，192 passed，26 warnings
  - 最终全量验证：`cd backend && uv run ruff check .`
  - 最终全量验证：`cd frontend && pnpm test`，45 files / 176 tests passed
  - 最终全量验证：`cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-18 09:53 · d451454 · feat(frontend): add event workbench shell

- 用户提出的需求：
  - “开，进行开发吧，记得另起分支开发，不要在main分支上进行开发”

- 本次完成的工作：
  - 新增前端事件类型和工作台 API 封装
  - 新增全屏沉浸式 `EventWorkbenchModal`，展示事件总览、计划草稿、已创建任务/日程和成就摘要占位
  - 将主事件倒计时卡片点击行为改为打开事件工作台；无主事件时继续打开创建事件入口
  - 更新前端测试，覆盖主事件打开工作台、无主事件创建事件并提交 `start_date`

- 验证情况：
  - `cd frontend && pnpm test -- EventCountdownCard`
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-18 09:50 · e0f5d39 · feat: generate event plan drafts

- 用户提出的需求：
  - “开，进行开发吧，记得另起分支开发，不要在main分支上进行开发”

- 本次完成的工作：
  - 新增事件计划草稿后端模型，保证单个事件最多保留一份当前计划草稿
  - 新增事件工作台接口，返回事件、当前计划草稿、已创建任务和已创建日程
  - 新增套用模板接口，按事件开始日期顺推或截止时间倒推生成任务草稿/日程草稿，并在再次套用时覆盖旧草稿
  - 新增草稿项编辑、删除和“生成正式安排”接口，将草稿批量创建为绑定当前事件的任务和日程
  - 补充后端测试，覆盖模板套用时间计算、草稿覆盖、正式任务/日程生成和 `event_id` 绑定

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_apply_event_plan_template_creates_single_draft tests/test_todo_routes.py::test_generate_event_plan_draft_creates_bound_arrangements -q`
  - `cd backend && uv run pytest tests/test_todo_routes.py -k "plan_draft or event_plan_template or event" -q`
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`

### 2026-05-18 09:44 · df9e170 · feat: add event plan templates

- 用户提出的需求：
  - “开，进行开发吧，记得另起分支开发，不要在main分支上进行开发”

- 本次完成的工作：
  - 新增事件计划模板库后端模型，支持 `from_start` / `before_due` 两种时间模式
  - 新增模板项模型，区分 `task` 和 `appointment`，保存标题、备注、相对天数和排序
  - 增加模板 CRUD、复制和删除 API，模板归属当前用户且操作使用事务保护
  - 扩展后端 fake 测试连接，补充模板创建、列表、复制、删除的路由测试

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_event_plan_template_crud_and_copy -q`
  - `cd backend && uv run pytest tests/test_todo_routes.py -k event_plan_template -q`
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`

### 2026-05-18 09:40 · d98075f · feat: require event start dates

- 用户提出的需求：
  - “开，进行开发吧，记得另起分支开发，不要在main分支上进行开发”

- 本次完成的工作：
  - 在事件后端模型中新增必填 `start_date`，事件创建、更新、列表、主事件和成就查询均返回开始日期
  - 为旧事件迁移增加 `start_date = due_at::date` 兜底，再将字段设为非空
  - 在事件创建/编辑弹窗中增加开始日期输入，并随创建/更新请求提交
  - 补充后端和前端测试，覆盖创建事件必须提供开始日期以及 payload 写入

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_create_event_requires_start_date tests/test_todo_routes.py::test_create_event_persists_start_date -q`
  - `cd backend && uv run pytest tests/test_todo_routes.py -k event -q`
  - `cd frontend && pnpm test -- EventCountdownCard`
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过
