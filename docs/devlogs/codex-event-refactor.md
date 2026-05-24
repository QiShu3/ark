# 开发日志：codex/event-refactor

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-21 22:05 · 6690598 · fix(frontend): sync arrangement edit fields

- 用户提出的需求：
  - “你看看这里，同步一下”
  - “怎么任务日程的编辑内容这么少？同步一下”

- 本次完成的工作：
  - 将已创建事件 `安排内容` 内的任务编辑表单同步到完整任务字段：任务类型、优先级、备注、目标时长、开始日期、截止日期、关联事件、完成周期、单周期次数、仅工作日和标签
  - 将日程编辑表单同步到完整日程字段：状态、备注、开始时间、结束时间、关联事件、重复规则、完成周期、单周期次数和仅工作日
  - 扩展安排页的任务 / 日程创建与更新 payload，让这些字段通过现有 `/todo/tasks`、`/todo/appointments` 接口保存
  - 加载事件列表，支持在安排页内调整任务 / 日程关联事件，并保持当前事件默认选中
  - 补充回归测试，覆盖完整字段渲染和 PATCH payload 同步

- 验证情况：
  - `cd frontend && pnpm test -- EventWorkbenchModal.test.tsx`，1 file / 4 tests passed
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx TaskEditModal.test.tsx AppointmentEditModal.test.tsx`，5 files / 24 tests passed
  - `cd frontend && pnpm check`
  - `git diff --check`
  - Browser 验收：在 `http://localhost:5173/` 的 `安排` 页面点击 `验收任务-23707` 和 `验收日程-33728`，确认任务和日程编辑态均展示同步后的完整字段
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 21:49 · 497083f · fix(frontend): show arrangement times

- 用户提出的需求：
  - “这里单条任务或者日程的右侧应该显示截止时间”
  - “继续”

- 本次完成的工作：
  - 在已创建事件的 `安排内容` 中，将单条任务 / 日程改为左侧标题、右侧时间的布局
  - 任务右侧显示 `due_date` 格式化后的截止时间，日程右侧显示 `ends_at` 格式化后的时间
  - 对没有截止时间的任务显示 `未设时间`
  - 补充回归测试，覆盖任务和日程条目内的时间展示

- 验证情况：
  - `cd frontend && pnpm test -- EventWorkbenchModal.test.tsx`，1 file / 4 tests passed
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，3 files / 22 tests passed
  - `cd frontend && pnpm check`
  - `git diff --check`
  - Browser 验收：在 `http://localhost:5173/` 的 `安排` 页面确认 `验收任务-23707` 右侧显示 `2026/06/05 09:15`，`验收日程-33728` 右侧显示 `2026/06/06 10:30`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 17:59 · 3f9eef3 · refactor(frontend): manage event arrangements directly

- 用户提出的需求：
  - “我想去掉 草稿 这个概念”
  - “选择事件模板 这个功能也去掉”
  - “只在这个页面去掉，因为和创建事件处重复了”
  - “确认”

- 本次完成的工作：
  - 将已创建事件的 `安排` 页面从草稿/模板生成流程改为直接管理真实任务和真实日程
  - 移除该页面内的 `选择事件模板`、`套用模板`、`模板工作台`、`另存为事件模板`、`回写源模板`、`生成正式安排` 和 `已创建安排`
  - 保留添加事件处的事件模板能力，不影响创建事件流程
  - 新增事件安排 mutation helper，复用现有 `/todo/tasks` 与 `/todo/appointments` 接口创建、编辑、删除事件关联安排
  - 补充回归测试，覆盖旧模板入口缺席、真实任务/日程创建、编辑和删除
  - 新增本次直接管理方案的实施计划文档

- 验证情况：
  - `cd frontend && pnpm test -- EventWorkbenchModal.test.tsx`，1 file / 4 tests passed
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，3 files / 22 tests passed
  - `cd frontend && pnpm check`
  - `git diff --check`
  - Browser 验收：在 `http://localhost:5173/` 的既有事件 `安排` 页面确认旧模板/草稿/生成入口均不存在，`安排内容` 展示任务和日程两列，并成功新增可见的 `验收任务-23707` 与 `验收日程-33728`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 17:01 · b593865 · refactor(frontend): reshape event arrangements

- 用户提出的需求：
  - “业务逻辑：1. 事件工作台 改名为 安排”
  - “原本显示任务或者日程的部分被称为，安排内容，安排内容左右划分，比例为为1:1，任务在左，日程在右。只显示任务或者日程的名字，任务或者日程纵向排列，最后一个为 添加任务/日程。”
  - “点击 添加任务/日程 后进入编辑状态，保存后编辑状态后任务或者日程进入对应区域，点击任务或者日程后可以再次进入编辑状态。”
  - “去掉这个div，有点多余了”
  - “这个放在添加事件的底部”

- 本次完成的工作：
  - 将可见的 `事件工作台` 概念改为 `安排`，将 `工作台内容` 改为 `安排内容`
  - 在添加事件面板和已创建事件弹窗中，将安排内容改为任务 / 日程左右 1:1 两列
  - 列表态仅显示任务或日程名称，每列末尾提供 `添加任务` / `添加日程`
  - 支持点击添加入口进入编辑态，保存后回到对应列；点击已有任务或日程名称可再次编辑
  - 去掉添加事件表单外层多余背景框，并将 `取消 / 保存为模板 / 创建事件` 固定到添加事件弹窗底部
  - 同步模板管理和后端错误提示里的 `安排内容` 文案
  - 新增本次安排交互的设计和实施计划文档

- 验证情况：
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，3 files / 22 tests passed
  - `cd frontend && pnpm check`
  - `cd backend && uv run pytest tests/test_todo_routes.py -q`，90 passed
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`
  - `git diff --check`
  - 按用户要求跳过最终浏览器验收，由用户自行验收
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 16:00 · 034edbe · fix(frontend): restore add-flow template apply

- 用户提出的需求：
  - “为什么套用模板功能没有了？同时设为主事件默认为否”
  - “之前的事件模板就可以，只是去掉齿轮，你怎么整个事件模板都去掉了？”

- 本次完成的工作：
  - 在“添加事件”面板内恢复 `事件模板` 下拉选择和 `套用模板` 按钮
  - 保持齿轮和 `模板工作台` 管理入口移除，不再从添加事件面板进入模板管理
  - 套用模板后，将模板默认事件信息和工作台内容填入当前添加事件草稿
  - 将新建事件的 `设为主事件` 默认值改为未勾选
  - 补充回归测试，覆盖模板套用、齿轮缺席和主事件默认未勾选

- 验证情况：
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx`，1 file / 15 tests passed
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，3 files / 19 tests passed
  - `cd frontend && pnpm check`
  - `git diff --check`
  - Chrome 验收：在 `http://localhost:5173/` 点击主事件进入 `事件总览`，点击 `添加事件` 后确认出现 `事件模板` 下拉和 `套用模板` 按钮，没有齿轮；`设为主事件` 默认未勾选
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 15:52 · 8e20c4c · feat(frontend): save add flow as event template

- 用户提出的需求：
  - “在 取消 和 创建事件中间插入保存为模板按钮，如果已经有同名的模板，则跳出弹窗，提示用户是否需要更新到对应的模板中，否则保存为新的模板”

- 本次完成的工作：
  - 在“添加事件”面板底部的 `取消` 和 `创建事件` 中间加入 `保存为模板` 按钮
  - 将当前事件名称、开始日期、到期时间、主事件状态和工作台内容转换为事件模板
  - 保存前检查同名模板；存在同名模板时弹出确认层，支持 `更新模板` 或 `保存为新模板`
  - 保存成功后在添加面板内展示 `已保存为模板` 或 `已更新模板` 状态
  - 补充回归测试，覆盖新建模板和同名模板更新确认流程

- 验证情况：
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx`，1 file / 13 tests passed
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，3 files / 17 tests passed
  - `cd frontend && pnpm check`
  - `git diff --check`
  - Chrome 验收：在 `http://localhost:5173/` 点击主事件进入 `事件总览`，点击 `添加事件` 后确认底部按钮顺序为 `取消`、`保存为模板`、`创建事件`，且模板选择器和齿轮入口没有重新出现
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 15:45 · b278f18 · refactor(frontend): remove add-flow template controls

- 用户提出的需求：
  - “取消齿轮以及对应的模板功能”
  - “@chrome 用这个来看”

- 本次完成的工作：
  - 移除“添加事件”编辑面板里的 `事件模板` 选择器、模板加载逻辑和齿轮入口
  - 创建事件时不再从添加面板套用事件模板，而是仅创建手动填写的事件信息和工作台内容
  - 保留“添加事件”面板内的 `事件工作台` 与 `添加工作台内容`，支持无模板情况下继续编辑工作台内容
  - 更新 `EventCountdownCard` 回归测试，覆盖添加面板不再展示模板控件，且不再调用套用模板接口

- 验证情况：
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx`，1 file / 11 tests passed
  - `cd frontend && pnpm check`
  - `git diff --check`
  - Chrome 验收：在 `http://localhost:5173/` 点击主事件后进入 `事件总览`；点击 `添加事件` 后，确认面板中没有 `事件模板`、`选择事件模板` 和 `模板工作台`，仍展示 `事件工作台` 与 `添加工作台内容`；点击 `添加工作台内容` 后出现内容类型、内容标题、相对天数和内容备注编辑项
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 15:29 · c16cc53 · refactor(event): keep add flow in overview

- 用户提出的需求：
  - “取消创建完成后进 事件工作台 里那一套， 直接在这块进行编辑”
  - “前四步没有问题，第5步为什么还要停在这块呢？请注意：这是疑问”
  - “可以，这样的逻辑更加侵袭”
  - “有个问题，如果没有选择事件模板的话，事件工作台就没有 ‘添加工作台内容’选项。”

- 本次完成的工作：
  - 创建事件完成后不再自动打开另一套 `事件工作台` 弹窗，而是刷新后回到 `事件总览`
  - 将“添加事件”面板里的工作台内容编辑能力补齐为可新增、编辑、删除草稿内容
  - 未选择事件模板时，`事件工作台` 仍显示 `添加工作台内容`，支持从空白工作台开始创建内容
  - 新增草稿项创建 API：`POST /todo/events/{event_id}/plan-draft/items`
  - 补充前后端回归测试，覆盖空白工作台新增内容、创建后回总览和草稿项创建接口

- 验证情况：
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx`，1 file / 14 tests passed
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，3 files / 18 tests passed
  - `cd frontend && pnpm check`
  - `cd backend && uv run pytest tests/test_todo_routes.py -q`，90 passed
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`
  - `git diff --check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 11:50 · 31560ac · refactor(frontend): keep workbench visible in add flow

- 用户提出的需求：
  - “还是没有工作台啊！”

- 本次完成的工作：
  - 将“添加事件”编辑态里的 `事件工作台` 改为常驻区域，不再依赖模板是否已选中才渲染
  - 选择模板后，工作台区域继续承接模板带来的工作台内容；没有内容时显示统一空状态
  - 新增回归测试，覆盖未选模板时也能看到工作台壳子，以及空模板时的空状态展示

- 验证情况：
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx`，1 file / 12 tests passed
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，3 files / 16 tests passed
  - `cd frontend && pnpm check`
  - `git diff --check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 11:42 · 54bbc98 · refactor(frontend): show workbench shell in add flow

- 用户提出的需求：
  - “这里怎么没有出现事件工作台？”

- 本次完成的工作：
  - 在“添加事件”编辑态里补出 `事件工作台` 区块，避免选择模板后整块工作台内容消失
  - 当模板没有工作台条目时，仍展示空状态壳子 `暂无工作台内容`
  - 保持事件信息与工作台内容同屏出现，和当前添加事件流程对齐
  - 补充回归测试，覆盖无工作台条目模板下仍展示工作台壳子

- 验证情况：
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx`，1 file / 11 tests passed
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，3 files / 15 tests passed
  - `cd frontend && pnpm check`
  - `git diff --check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 11:31 · de546cb · refactor(frontend): separate event overview from add flow

- 用户提出的需求：
  - “我知道了，点击主事件后不应该直接出现编辑事件或者事件工作台，应该出现事件总览，事件总览为纵向排列，最后一个是添加事件，点击事件则出现该事件的工作台，点击添加事件后才出现编辑事件。”

- 本次完成的工作：
  - 将主事件圆形入口改为只打开 `事件总览`，不再直达事件工作台或编辑面板
  - 将总览内容收敛为纵向事件列表，最后保留一个独立的“添加事件”入口
  - 点击事件行直接打开该事件的 `事件工作台`
  - 点击“添加事件”后才展开创建编辑面板，并把事件模板、模板工作台入口和工作台内容保留在编辑态内
  - 更新 `EventCountdownCard` 回归测试，覆盖总览优先、事件行打开工作台和添加事件后才出现编辑内容

- 验证情况：
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx`，1 file / 10 tests passed
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，3 files / 14 tests passed
  - `cd frontend && pnpm check`
  - `git diff --check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 10:57 · a20b3b5 · refactor(frontend): align event create editor with workbench

- 用户提出的需求：
  - “这里有点混乱，事件名称、开始日期、到期日期、设为主事件应该在编辑事件中出现。去掉这些功能，然后转移到 点击 添加事件 后触发的编辑面板”
  - “为什么点击 添加事件后 的可编辑内容这么少？可编辑内容应该和模板工作台的编辑内容保持一致”

- 本次完成的工作：
  - 将事件编辑弹窗顶部收敛为“事件模板 / 套用模板 / 模板工作台 / 添加事件”入口，移除直接暴露的事件名称、开始日期、到期时间和主事件字段
  - 点击“添加事件”后展开事件创建编辑面板，保留事件名称、开始日期、到期时间和设为主事件的编辑能力
  - 选中事件模板后，在添加事件面板内同步展示模板的工作台内容，支持编辑内容标题、备注和相对天数，并展示时间预览
  - 创建并套用模板时，将添加面板中的工作台内容编辑同步到新事件工作台，再打开事件工作台
  - 补充 `EventCountdownCard` 回归测试，覆盖字段迁移到添加面板，以及模板工作台内容在添加面板中展示

- 验证情况：
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx`，1 file / 11 tests passed
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，3 files / 15 tests passed
  - `cd frontend && pnpm check`
  - `git diff --check`
  - 浏览器验收：在 `http://localhost:5173/` 使用临时用户创建带默认事件字段和两条工作台内容的事件模板；选择模板后点击“添加事件”，确认面板展示事件信息和“工作台内容”；将第一条内容标题改为“精修错题”后创建事件，事件工作台打开并展示修改后的工作台内容
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-21 10:08 · 122bbd4 · refactor(backend): extract event store operations

- 用户提出的需求：
  - “好，接下来另起分支来进行对 事件 功能的重构，每做好一个功能都要提交”

- 本次完成的工作：
  - 新增 `backend/routes/todo/event_store.py`，集中承载事件创建、列表、主事件读取、更新、删除和主事件互斥处理
  - 将 `backend/routes/todo/routes.py` 中事件 CRUD 路由的 SQL 操作迁移到 store 层，保留原有 `/todo/events` API 行为
  - 新增 `test_todo_event_store.py`，覆盖创建主事件时清理旧主事件、更新事件截止时间时传播到继承事件时间的任务和日程

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_event_store.py -q`，2 passed
  - `cd backend && uv run pytest tests/test_todo_routes.py -k "event or achievement_summary" -q`，21 passed，68 deselected
  - `cd backend && uv run pytest tests/test_todo_routes.py tests/test_todo_event_store.py -q`，91 passed
  - `cd backend && uv run ruff check routes/todo/event_store.py routes/todo/routes.py tests/test_todo_event_store.py`
  - `git diff --check -- backend/routes/todo/event_store.py backend/routes/todo/routes.py backend/tests/test_todo_event_store.py`

### 2026-05-21 10:02 · 3094ab0 · refactor(frontend): centralize event api calls

- 用户提出的需求：
  - “好，接下来另起分支来进行对 事件 功能的重构，每做好一个功能都要提交”

- 本次完成的工作：
  - 在 `frontend/src/lib/events/api.ts` 中新增事件列表、主事件读取、创建、更新、删除的类型化 API 包装
  - 将 `EventCountdownCard` 和 `EventWorkbenchModal` 中直接拼接 `/todo/events` 的事件 CRUD 调用迁移到共享 API 层
  - 新增 `api.test.ts` 覆盖事件 CRUD API 包装的请求路径、方法和 JSON body

- 验证情况：
  - `cd frontend && pnpm test -- api.test.ts`，1 file / 3 tests passed
  - `cd frontend && pnpm test -- api.test.ts dateTime.test.ts EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，5 files / 21 tests passed
  - `cd frontend && pnpm check`
  - `cd frontend && pnpm exec eslint src/lib/events/api.ts src/lib/events/api.test.ts src/lib/events/dateTime.ts src/lib/events/dateTime.test.ts src/components/EventCountdownCard.tsx src/components/events/EventWorkbenchModal.tsx src/components/events/EventTemplateManagerModal.tsx`
  - `git diff --check -- frontend/src/lib/events/api.ts frontend/src/lib/events/api.test.ts frontend/src/components/EventCountdownCard.tsx frontend/src/components/events/EventWorkbenchModal.tsx`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试、TypeScript 检查和目标 ESLint 检查通过

### 2026-05-21 09:59 · eb01e8f · refactor(frontend): extract event date time utilities

- 用户提出的需求：
  - “好，接下来另起分支来进行对 事件 功能的重构，每做好一个功能都要提交”

- 本次完成的工作：
  - 新增 `frontend/src/lib/events/dateTime.ts`，集中维护事件时间显示、`datetime-local` 转换和倒计时状态判断
  - 将 `EventCountdownCard`、`EventWorkbenchModal`、`EventTemplateManagerModal` 中重复的时间工具函数替换为共享实现
  - 新增 `dateTime.test.ts` 覆盖时间转换、异常输入、事件时间显示、倒计时显示和倒计时状态判断

- 验证情况：
  - `cd frontend && pnpm test -- dateTime.test.ts`，1 file / 5 tests passed
  - `cd frontend && pnpm test -- dateTime.test.ts EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx EventTemplateManagerModal.test.tsx`，4 files / 18 tests passed
  - `cd frontend && pnpm check`
  - `cd frontend && pnpm exec eslint src/lib/events/dateTime.ts src/lib/events/dateTime.test.ts src/components/EventCountdownCard.tsx src/components/events/EventWorkbenchModal.tsx src/components/events/EventTemplateManagerModal.tsx`
  - `git diff --check -- frontend/src/lib/events/dateTime.ts frontend/src/lib/events/dateTime.test.ts frontend/src/components/EventCountdownCard.tsx frontend/src/components/events/EventWorkbenchModal.tsx frontend/src/components/events/EventTemplateManagerModal.tsx`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试、TypeScript 检查和目标 ESLint 检查通过
