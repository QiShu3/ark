# 开发日志：codex/focus-work-capsule

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-17 21:48 · 7164535 · fix(frontend): expose arrangement summary actions

- 用户提出的需求：
  - “结束本轮专注 和 放弃本阶段这两个button交换一下位置”
  - “这个日程怎么没有确认按钮？”
  - “任务怎么没有完成任务 button ？”
  - “为什么应用任务显示又是进入任务呢？应该也改成完成任务。”

- 本次完成的工作：
  - 调整专注弹窗头部按钮顺序，让“放弃本阶段”位于“结束本轮专注”之前，同时保持原有点击行为和样式语义
  - 在安排总览的待确认日程卡片上增加可见“确认”按钮，并复用现有日程完成接口
  - 在安排总览的今日任务卡片上增加可见“完成任务”按钮，普通任务和应用任务都走现有任务完成接口
  - 补充前端回归测试，覆盖按钮顺序、待确认日程确认、今日任务与应用任务完成动作

- 验证情况：
  - `cd frontend && pnpm test -- PlaceholderCard.arrangements.test.tsx FocusWorkProvider.test.tsx --run`
  - `cd frontend && pnpm check`
  - 浏览器验收：安排总览中 `每日任务1`、`每日任务2`、`今日单词`、`ERC 复习` 均显示“完成任务”；`三天日程` 显示“确认”
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-17 21:02 · a003dac · fix(frontend): freeze paused workflow timer

- 用户提出的需求：
  - “这些内容也提交吧”

- 本次完成的工作：
  - 提交右侧工作流面板暂停态计时冻结逻辑：工作流 `is_paused` 时显示冻结的剩余/已用时间，不再继续本地推算倒计时
  - 补充 `PlaceholderCard` 工作流测试，覆盖任务专注暂停时右侧面板计时保持不变
  - 提交 `task_focus` 与 app-managed focus tasks 两份实现计划文档

- 验证情况：
  - `cd frontend && pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx`
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-16 21:58 · f2014e2 · fix: stabilize app focus startup

- 用户提出的需求：
  - “好，继续修复测试，直到完善”
  - 浏览器验收中发现 Vocab 初始化提示“词书不存在”，以及 ERC 点击“开始复习”后打开了背单词专注内容。

- 本次完成的工作：
  - Vocab 应用任务初始化支持 Vocab 页面使用的分组词书标识（如 `cet6luan`），并继续校验真实词书存在
  - 从任务入口启动专注时，默认工作流第一段 focus 会重新绑定到当前任务，并清理 preset 中遗留的 `focus_work_type`，避免 ERC/Vocab 内容串线
  - 调整 ToDo 初始化迁移顺序，先移除依赖外键再重建 `app_task_configs` 复合唯一约束，修复后端热重载启动失败
  - 补充 Vocab 分组词书初始化和 preset 遗留绑定清理的回归测试

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py tests/test_focus_workflow_app_work.py tests/test_vocab_routes.py tests/test_erc_routes.py -q`
  - `cd backend && uv run ruff check .`
  - `cd frontend && pnpm test -- --run src/pages/Vocab/__tests__/Home.test.tsx src/components/__tests__/FocusWorkProvider.test.tsx src/components/Vocab/VocabTodayFocusWork.test.tsx src/components/ERC/ERCReviewFocusWork.test.tsx`
  - `cd frontend && pnpm check`
  - 浏览器验收：Vocab 点击“初始化今日单词”后变为“开始今日单词”；ERC 点击“开始复习”后打开 `ERC 阅读理解` 专注内容，顶部胶囊显示 `ERC 复习`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-16 21:34 · c9943e2 · fix: require app focus completion for managed tasks

- 用户提出的需求：
  - “好，继续工作，完成这个文档剩下的工作，在完成之前不要停下来”
  - 对齐 `docs/superpowers/specs/2026-05-15-app-managed-focus-tasks-design.md` 中“应用任务完成必须由子应用确认”的关键决策。

- 本次完成的工作：
  - 普通 `/todo/tasks/{task_id}/complete` 拒绝直接完成 `managed_by_app` 任务，避免绕过 Vocab/ERC 业务确认
  - 补充回归测试，确保 app-managed task 只能通过子应用专注工作完成并写入完成记录

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py tests/test_focus_workflow_app_work.py tests/test_vocab_routes.py tests/test_erc_routes.py -q`
  - `cd backend && uv run ruff check routes/todo routes/vocab routes/erc tests/test_todo_routes.py tests/test_focus_workflow_app_work.py tests/test_vocab_routes.py tests/test_erc_routes.py`
  - `cd frontend && pnpm test -- src/components/__tests__/FocusWorkProvider.test.tsx src/components/__tests__/TaskFocusWork.test.tsx src/components/__tests__/WorkflowNavProgress.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/Vocab/VocabTodayFocusWork.test.tsx src/components/ERC/ERCReviewFocusWork.test.tsx src/pages/Vocab/__tests__/Home.test.tsx src/pages/ERC/__tests__/Home.test.tsx`
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-16 21:32 · b61d382 · feat: finish app focus task semantics

- 用户提出的需求：
  - “好，继续工作，完成这个文档剩下的工作，在完成之前不要停下来”
  - 对齐 `docs/superpowers/specs/2026-05-15-app-managed-focus-tasks-design.md` 中主完成按钮、暂停禁用、回写、统计和应用托管任务编辑边界。

- 本次完成的工作：
  - `FocusWorkModalShell` 增加“结束本轮专注”公共动作，和“完成事项并结束专注”业务动作分离
  - `focus-work-result` 只有在 `progress_snapshot.completedTask === true` 时才为 app-managed task 写入 `completion_records`
  - Vocab/ERC 暂停态禁止业务提交；Vocab 在暂停态不会因空队列自动完成今日任务
  - 恢复专注时同步顺延打开中的 `focus_logs` 与 `focus_app_work_logs` 起点，避免暂停时间计入统计
  - 应用托管任务允许更新计划类外层字段（优先级、目标时长、事件、标签、日期等），继续拒绝标题、周期、来源等业务语义字段
  - 补充后端结果回写、暂停时长排除、应用任务编辑边界测试，以及 Vocab/ERC 专注内容暂停态测试

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py tests/test_focus_workflow_app_work.py tests/test_vocab_routes.py tests/test_erc_routes.py -q`
  - `cd backend && uv run ruff check routes/todo routes/vocab routes/erc tests/test_todo_routes.py tests/test_focus_workflow_app_work.py tests/test_vocab_routes.py tests/test_erc_routes.py`
  - `cd frontend && pnpm test -- src/components/__tests__/FocusWorkProvider.test.tsx src/components/__tests__/TaskFocusWork.test.tsx src/components/__tests__/WorkflowNavProgress.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/Vocab/VocabTodayFocusWork.test.tsx src/components/ERC/ERCReviewFocusWork.test.tsx src/pages/Vocab/__tests__/Home.test.tsx src/pages/ERC/__tests__/Home.test.tsx`
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-16 21:19 · b359e90 · feat: unify focus work pause controls

- 用户提出的需求：
  - “所有专注工作都应该支持暂停和继续。”
  - “弹窗壳应该承载公共控制能力。暂停专注、继续专注、放弃本阶段这些动作不应该散落在具体内容组件里，而应该属于专注工作弹窗壳的公共能力。”
  - “继续”

- 本次完成的工作：
  - 后端 `/todo/focus/workflow/pause` 与 `/todo/focus/workflow/resume` 不再限制 `active_focus_work_type=task_focus`，Vocab/ERC 等应用专注也可进入统一暂停状态
  - `FocusWorkModalShell` 接管“暂停专注 / 继续专注 / 放弃本阶段”公共控制，并根据 `is_paused` 展示暂停态
  - `FocusWorkProvider` 对所有 focus-work adapter 统一接入 pause/resume，不再只把暂停能力传给 `task_focus`
  - `TaskFocusWork` 移除内容组件内的暂停/放弃公共按钮，只保留“完成任务并结束专注”这一任务业务动作
  - 顶部 `WorkflowNavProgress` 胶囊改为对所有专注类型的 `is_paused` 显示“已暂停”并冻结跳动提示
  - 补充后端 pause/resume app focus 测试、前端 shell 暂停/继续测试、顶部胶囊 app 暂停态测试

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py tests/test_focus_workflow_app_work.py -q`
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py tests/test_focus_workflow_app_work.py`
  - `cd frontend && pnpm test -- src/components/__tests__/WorkflowNavProgress.test.tsx src/components/__tests__/FocusWorkProvider.test.tsx src/components/__tests__/TaskFocusWork.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx`
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-16 16:42 · 419a7f5 · feat(frontend): separate app tasks in today view

- 用户提出的需求：
  - “我想的是回到子应用中，在子应用增加一个 初始化 button，用户必须在子应用中初始化后才可以使用，初始化的作用是填入子应用所需的信息，再根据这些信息自动生成任务。”
  - “可以，继续吧”
  - “继续”

- 本次完成的工作：
  - 在安排管理的今日总览中，将用户手动创建任务与 `source_type=app` / `managed_by_app` 的应用托管任务分成“今日任务”和“应用任务”
  - 在右侧任务仓库中同样单独展示应用任务，避免 Vocab/ERC 初始化生成的任务混入普通用户任务列表
  - 补充 PlaceholderCard 测试，覆盖用户任务与应用托管任务同日展示时的分组行为

- 验证情况：
  - `cd frontend && pnpm test -- src/components/__tests__/PlaceholderCard.workflow.test.tsx`
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-16 16:36 · 31c469e · feat(frontend): complete app managed focus tasks

- 用户提出的需求：
  - “我想的是回到子应用中，在子应用增加一个 初始化 button，用户必须在子应用中初始化后才可以使用，初始化的作用是填入子应用所需的信息，再根据这些信息自动生成任务。”
  - “可以，继续吧”
  - “继续”

- 本次完成的工作：
  - FocusWorkProvider 对 app-managed task 使用统一 `focus-work-result` 完成入口，不再直接调用普通任务完成接口
  - Vocab 今日单词完成时触发“完成今日单词”，由统一专注结果闭环完成背后的 app-managed task
  - ERC 单题提交不再结束整个专注阶段；无到期复习时提供“完成今日 ERC 复习”显式按钮
  - 补充 FocusWorkProvider 测试，覆盖 app-managed Vocab adapter 渲染和完成结果提交

- 验证情况：
  - `cd frontend && pnpm test -- src/components/__tests__/FocusWorkProvider.test.tsx`
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-16 16:34 · c97c8b0 · feat(frontend): initialize erc app task

- 用户提出的需求：
  - “我想的是回到子应用中，在子应用增加一个 初始化 button，用户必须在子应用中初始化后才可以使用，初始化的作用是填入子应用所需的信息，再根据这些信息自动生成任务。”
  - “可以，继续吧”
  - “继续”

- 本次完成的工作：
  - ERC 首页加载 `/todo/app-tasks/erc/status`，未初始化时显示“初始化 ERC 复习”
  - 初始化 ERC 复习时提交复习范围、每日题量、默认专注时长和加入今日计划配置
  - 已初始化后通过 `/todo/tasks/{task_id}/focus/start` 进入专注工作，不再走旧的纯子应用临时专注事件
  - 补充 ERC 首页初始化、开始专注和主入口样式保持的前端测试

- 验证情况：
  - `cd frontend && pnpm test -- src/pages/ERC/__tests__/Home.test.tsx`
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-16 16:32 · f0716e2 · feat(frontend): initialize vocab app task

- 用户提出的需求：
  - “我想的是回到子应用中，在子应用增加一个 初始化 button，用户必须在子应用中初始化后才可以使用，初始化的作用是填入子应用所需的信息，再根据这些信息自动生成任务。”
  - “可以，继续吧”
  - “继续”

- 本次完成的工作：
  - Vocab 首页加载 `/todo/app-tasks/vocab/status`，未初始化时显示“初始化今日单词”
  - 初始化今日单词时提交当前词书、每日目标、默认专注时长和加入今日计划配置
  - 已初始化后通过 `/todo/tasks/{task_id}/focus/start` 进入专注工作，不再走旧的纯子应用临时专注事件
  - 补充 Vocab 首页初始化、开始专注与旧总览交互的前端测试

- 验证情况：
  - `cd frontend && pnpm test -- src/pages/Vocab/__tests__/Home.test.tsx`
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-16 16:30 · 8004f13 · feat(frontend): add app task API types

- 用户提出的需求：
  - “我想的是回到子应用中，在子应用增加一个 初始化 button，用户必须在子应用中初始化后才可以使用，初始化的作用是填入子应用所需的信息，再根据这些信息自动生成任务。”
  - “可以，继续吧”
  - “继续”

- 本次完成的工作：
  - 前端任务类型新增 app-managed metadata、app task runtime state 与 `AppTaskStatus`
  - 工作流快照与 focus-work 快照补齐 active task adapter metadata 字段
  - Vocab/ERC API 客户端新增 app task status 与 init 请求函数
  - Vocab/ERC 类型新增初始化 payload，供后续页面初始化入口使用

- 验证情况：
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但 TypeScript 检查通过

### 2026-05-16 16:26 · e25afeb · feat(backend): route app tasks through focus workflow

- 用户提出的需求：
  - “我想的是回到子应用中，在子应用增加一个 初始化 button，用户必须在子应用中初始化后才可以使用，初始化的作用是填入子应用所需的信息，再根据这些信息自动生成任务。”
  - “可以，继续吧”
  - “继续”

- 本次完成的工作：
  - 工作流绑定任务时会根据 task metadata 将 app-managed task 映射为 `vocab_today` 或 `erc_review` adapter，普通任务仍使用 `task_focus`
  - 当前工作流快照返回 `active_task_source_type`、`active_task_app_id`、`active_task_app_task_type`、`active_task_app_config_id`
  - 通过 `/todo/focus/workflow/focus-work-result` 完成 app-managed 专注时，会为背后的应用托管任务写入当期完成记录
  - 保持专注时长统计走 `focus_logs`，`focus_app_work_logs` 仅保留兼容记录
  - 补充 app task adapter 映射、工作流快照 metadata、app 专注完成写入任务完成记录的后端测试

- 验证情况：
  - `cd backend && uv run pytest tests/test_focus_workflow_app_work.py tests/test_todo_routes.py -q`
  - `cd backend && uv run ruff check routes/todo tests/test_focus_workflow_app_work.py tests/test_todo_routes.py`

### 2026-05-16 16:17 · 39f08b4 · fix(backend): lock down app task initialization

- 用户提出的需求：
  - “我想的是回到子应用中，在子应用增加一个 初始化 button，用户必须在子应用中初始化后才可以使用，初始化的作用是填入子应用所需的信息，再根据这些信息自动生成任务。”
  - “可以，继续吧”
  - “继续”

- 本次完成的工作：
  - 将应用托管任务创建改为 `INSERT ... ON CONFLICT ... DO UPDATE`，避免并发初始化时在失败事务中继续查询
  - 普通 `PATCH /todo/tasks/{task_id}` 现在拒绝修改 app-managed task，防止用户任务接口破坏子应用任务语义
  - app task status 查询现在校验 `created_task_id` 对应任务必须匹配当前 config、app、app task type 和 app-managed 标记
  - 补充 unbound created task、重复初始化、普通 PATCH 拒绝 app-managed task 的回归测试

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_vocab_app_task_status_starts_uninitialized tests/test_todo_routes.py::test_vocab_app_task_status_includes_config_before_task_exists tests/test_todo_routes.py::test_vocab_app_task_status_rejects_unbound_created_task tests/test_todo_routes.py::test_vocab_app_task_init_creates_recurring_managed_task tests/test_todo_routes.py::test_vocab_app_task_init_rejects_invalid_deck_id tests/test_todo_routes.py::test_vocab_app_task_init_returns_same_task_on_repeated_init tests/test_todo_routes.py::test_update_app_managed_task_rejects_plain_task_patch tests/test_todo_routes.py::test_erc_app_task_init_creates_recurring_managed_task tests/test_todo_routes.py::test_erc_app_task_init_rejects_missing_event -q`
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`
  - `cd backend && uv run pytest tests/test_todo_routes.py -q`

### 2026-05-16 16:10 · 73ad8ec · fix(backend): harden app task initialization

- 用户提出的需求：
  - “我想的是回到子应用中，在子应用增加一个 初始化 button，用户必须在子应用中初始化后才可以使用，初始化的作用是填入子应用所需的信息，再根据这些信息自动生成任务。”
  - “可以，继续吧”
  - “继续”

- 本次完成的工作：
  - 将 Vocab/ERC app task 初始化流程包进数据库事务，避免配置和托管任务只写入一半
  - Vocab 初始化先解析并校验 `deck_id`，非法 UUID 或不存在词书统一返回 422 `词书不存在`
  - Vocab/ERC 初始化在写入前校验关联事件，事件不存在时返回 404 `关联事件不存在`
  - 将 active app task config 写入改为 `ON CONFLICT` upsert，并为每个用户/子应用任务类型增加 active app-managed task 唯一索引
  - 初始化托管任务时处理并发唯一冲突，重复初始化会更新并复用同一个应用托管任务
  - 补充重复初始化、非法词书、缺失事件的后端回归测试，并同步测试 fake connection 的 upsert 行为

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_vocab_app_task_status_starts_uninitialized tests/test_todo_routes.py::test_vocab_app_task_status_includes_config_before_task_exists tests/test_todo_routes.py::test_vocab_app_task_init_creates_recurring_managed_task tests/test_todo_routes.py::test_vocab_app_task_init_rejects_invalid_deck_id tests/test_todo_routes.py::test_vocab_app_task_init_returns_same_task_on_repeated_init tests/test_todo_routes.py::test_erc_app_task_init_creates_recurring_managed_task tests/test_todo_routes.py::test_erc_app_task_init_rejects_missing_event -q`
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`
  - `cd backend && uv run pytest tests/test_todo_routes.py -q`

### 2026-05-16 10:28 · b409b6d · fix(backend): align app task status initialization

- 用户提出的需求：
  - “Spec compliance review found Task 2 issues. Please fix only Task 2 scope; do not implement focus workflow adapter changes.”
  - “`_app_task_status` drops config details when an active config exists but `created_task_id` is NULL.”
  - “Align helper flow with plan wording: `_create_or_update_managed_app_task` should be the helper that ensures config is created/updated before the task.”
  - “Extend `test_erc_app_task_init_creates_recurring_managed_task` to assert recurring daily completion settings.”

- 本次完成的工作：
  - 调整 app task status：active config 存在但尚未创建任务时，仍返回 `uninitialized`，并携带 `config_id` 与 `config`
  - 将 config 创建/更新流程下沉到 `_create_or_update_managed_app_task`，路由初始化时只调用该 helper 后再查询状态
  - 新增配置存在但任务未创建的 Vocab status 回归测试
  - 扩展 ERC 初始化测试，断言每日重复任务与每周期完成上限

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_vocab_app_task_status_starts_uninitialized tests/test_todo_routes.py::test_vocab_app_task_status_includes_config_before_task_exists tests/test_todo_routes.py::test_vocab_app_task_init_creates_recurring_managed_task tests/test_todo_routes.py::test_erc_app_task_init_creates_recurring_managed_task -q`
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`
  - `cd backend && uv run pytest tests/test_todo_routes.py -q`

### 2026-05-16 10:24 · 5ee0852 · feat(backend): add app task initialization

- 用户提出的需求：
  - “You are implementing Task 2 of the app-managed focus tasks plan in /Users/qishu/.codex/worktrees/4bdb/ark.”
  - “Implement only Task 2: Backend App Task Initialization and Status APIs. Do not implement Task 3 focus workflow adapter changes.”
  - “Add `/todo/app-tasks/vocab/status`, `/todo/app-tasks/vocab/init`, `/todo/app-tasks/erc/status`, `/todo/app-tasks/erc/init`.”

- 本次完成的工作：
  - 新增 Vocab/ERC app task status 与 init 后端接口，返回 `uninitialized`、`ready`、`completed_today`、`blocked`、`config_invalid` 状态
  - 新增 active `app_task_configs` 查询与创建/更新 helper，并按 Task 1 组合外键顺序先建配置再建 app-managed task
  - 初始化 Vocab 今日单词和 ERC 复习时创建或更新每日重复专注任务，写入 app metadata、配置引用、每日完成上限和今日计划标记
  - 为 Vocab 初始化增加词书存在性校验，缺失时返回 422 `词书不存在`
  - 扩展后端路由测试 fake connection，并新增 Vocab 状态、Vocab 初始化、ERC 初始化覆盖

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_vocab_app_task_status_starts_uninitialized tests/test_todo_routes.py::test_vocab_app_task_init_creates_recurring_managed_task tests/test_todo_routes.py::test_erc_app_task_init_creates_recurring_managed_task -q`
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`
  - `cd backend && uv run pytest tests/test_todo_routes.py -q`

### 2026-05-16 10:09 · 9bc8974 · fix(backend): enforce app task metadata consistency

- 用户提出的需求：
  - “Second code quality re-review found two remaining issues. I verified the current code: public create is fixed, but the FK is only on app_config_id, and PATCH ignores reserved metadata fields.”
  - “Strengthen app config FK to match user/app/type, not only config id.”
  - “Reject reserved app-managed metadata in public PATCH as well as POST.”

- 本次完成的工作：
  - 为 `app_task_configs` 增加 `(id, user_id, app_id, app_task_type)` 唯一约束，作为组合外键引用目标
  - 将 `tasks.app_config_id` 简单外键替换为 `(app_config_id, user_id, app_id, app_task_type)` 组合外键，避免跨用户或跨子应用类型误配配置
  - 在公开 `PATCH /todo/tasks/{task_id}` 中拒绝显式提交任一保留 app task metadata 字段，即使值为普通默认值也不允许经公开接口写入
  - 新增参数化 PATCH 拒绝测试，覆盖六类保留元数据字段

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_task_out_includes_app_managed_metadata -q`
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_create_task_rejects_app_managed_metadata -q`
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_update_task_rejects_app_managed_metadata -q`
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`

### 2026-05-16 09:51 · 3069e59 · fix(backend): harden app task metadata boundaries

- 用户提出的需求：
  - “Code quality review found issues that need fixes before Task 1 can be approved. Please fix only Task 1 files; do not implement Task 2 routes.”
  - “Public task creation still accepts `app_instance_key`.”
  - “Add tests for direct app-managed metadata rejection.”
  - “Strengthen DB-level consistency constraints if safe.”

- 本次完成的工作：
  - 将公开 `/todo/tasks` 创建入口的子应用元数据拒绝条件补齐到 `app_instance_key`
  - 新增参数化后端测试，覆盖 `source_type`、`managed_by_app`、`app_id`、`app_task_type`、`app_config_id`、`app_instance_key` 六类元数据直接创建均返回 422
  - 为 `tasks` 增加 app metadata 一致性约束：用户任务不得携带 app 元数据，app 任务必须由 app 托管且具备必要 app 字段
  - 在 `app_task_configs` 创建后为 `tasks.app_config_id` 增加外键约束，避免 app task config 引用悬空

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_task_out_includes_app_managed_metadata -q`
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_create_task_rejects_app_managed_metadata -q`
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`

### 2026-05-16 09:42 · b0961c3 · feat(backend): add app managed task metadata

- 用户提出的需求：
  - “Goal for Task 1: add app-managed task metadata to the backend task data model and API schemas, ensure normal user-created tasks return default metadata, and prevent public /todo/tasks creation from creating app-managed tasks directly.”
  - “添加子应用初始化生成任务的后端数据模型和 schema 基础；本次只做 Task 1，不进入 Task 2 routes。”

- 本次完成的工作：
  - 为 `tasks` 表新增 `source_type`、`app_id`、`app_task_type`、`app_config_id`、`app_instance_key`、`managed_by_app` 字段及约束，并增加幂等迁移
  - 新增 `app_task_configs` 表、状态/类型约束，以及每用户每子应用任务类型的 active 唯一索引
  - 扩展 `TaskCreateRequest`、`TaskUpdateRequest`、`TaskOut`、子应用初始化请求/状态输出模型，以及 `FocusWorkflowOut` 的 active task adapter metadata
  - 更新任务创建、列表、详情、更新、移动、完成相关的 task row projection，确保 `TaskOut` 返回 app-managed metadata 默认值
  - 在公开 `/todo/tasks` 创建入口拒绝子应用托管任务元数据，保留内部子应用初始化创建能力给后续 Task 2

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py::test_task_out_includes_app_managed_metadata -q`
  - `cd backend && uv run ruff check routes/todo tests/test_todo_routes.py`

### 2026-05-15 01:39 · 1c81b92 · feat(frontend): add task focus work view

- 用户提出的需求：
  - “好，继续”
  - “想把自定义任务也做成‘有专属专注内容’的模式”
  - “1”
  - “对，就叫暂停吧，你再确认一下现在有没有这个功能，避免功能重复。”

- 本次完成的工作：
  - 将 `task_focus` 接入前端统一 `focus-work` 运行时，使工作流中的自定义任务阶段也会打开全屏专注工作页
  - 新增 `TaskFocusWork` 极简沉浸页，默认突出任务名与计时器，并提供可展开的任务细节区
  - 在 `FocusWorkProvider` 中补齐任务型专注的 `暂停专注 / 继续专注 / 完成本轮专注 / 完成任务并结束专注 / 放弃本阶段` 动作
  - 更新顶部工作流胶囊，使 `task_focus` 暂停态显示“已暂停”并停止本地倒计时，同时关闭呼吸灯动画
  - 补充前端测试，覆盖任务型专注页渲染、暂停遮罩、胶囊 paused 文案，以及 paused 状态下导航继续锁定

- 验证情况：
  - `cd frontend && pnpm test -- FocusWorkProvider.test.tsx TaskFocusWork.test.tsx WorkflowNavProgress.test.tsx Navigation.test.tsx workflowNotifications.test.ts`
  - `cd frontend && pnpm check`

### 2026-05-15 01:29 · 4dc6d81 · feat(backend): add task focus pause runtime

- 用户提出的需求：
  - “好，继续”
  - “想把自定义任务也做成‘有专属专注内容’的模式”
  - “对，就叫暂停吧，你再确认一下现在有没有这个功能，避免功能重复。”

- 本次完成的工作：
  - 为任务型专注运行时补齐后端核心语义：工作流中的自定义任务专注阶段现在会被识别为 `task_focus`
  - 新增 `/todo/focus/workflow/pause` 与 `/todo/focus/workflow/resume`，支持在不结束阶段的前提下暂停和恢复任务型专注
  - 调整工作流快照转换逻辑，使绑定任务的专注阶段在无显式 `focus_work_type` 时也能推导出 `task_focus` 和 `fullscreen` 显示状态
  - 在阶段切换与运行时选择任务的逻辑中补齐 `task_focus` 的显示状态、专注日志和暂停态重置
  - 补充后端测试，覆盖 `task_focus` 自动激活、暂停/恢复路由，以及暂停态在工作流快照中的输出

- 验证情况：
  - `cd backend && uv run pytest tests/test_focus_workflow_app_work.py tests/test_todo_routes.py -q`
  - `cd backend && uv run ruff check routes/todo tests/test_focus_workflow_app_work.py tests/test_todo_routes.py`

### 2026-05-15 01:16 · d537324 · feat(backend): add task focus runtime fields

- 用户提出的需求：
  - “好，继续”
  - “想把自定义任务也做成‘有专属专注内容’的模式”
  - “对，就叫暂停吧，你再确认一下现在有没有这个功能，避免功能重复。”

- 本次完成的工作：
  - 为自定义任务专注工作补齐第一批后端基础字段，扩展 `FocusWorkType` 以支持 `task_focus`
  - 为工作流运行态输出新增 `is_paused` 字段，为后续“暂停专注 / 继续专注”能力铺底
  - 为 `focus_workflows` 增加 `is_paused` 与 `paused_at` 数据列，支持专注阶段内暂停态持久化
  - 放宽 `focus_app_work_logs` 的类型约束，使其可接受 `task_focus`
  - 补充后端测试，覆盖 `task_focus` schema 接受度与暂停态运行字段输出

- 验证情况：
  - `cd backend && uv run pytest tests/test_focus_workflow_app_work.py -q`

### 2026-05-15 00:39 · 1ecc9c0 · docs: clarify task focus work actions

- 用户提出的需求：
  - “这段我不大懂，只有这两个按钮吗？完成本轮专注、完成任务并结束专注、放弃本阶段 还在吗？”

- 本次完成的工作：
  - 明确补充了任务型专注页的按钮说明，区分“暂停相关文案”与“页面完整动作集合”
  - 在 spec 中将“页面按钮文案统一为”改写为“暂停相关按钮文案统一为”，避免被误解为页面只有两个按钮
  - 在默认态与暂停态两节补充说明，明确默认态仍保留“完成本轮专注 / 完成任务并结束专注 / 放弃本阶段”，暂停层只突出“继续专注”

- 验证情况：
  - 文档修订，自检通过；无额外代码验证

### 2026-05-15 00:32 · 1fd8037 · docs: add task focus work design

- 用户提出的需求：
  - “我下一阶段着重于 优化 专注工作 这一功能”
  - “想把自定义任务也做成‘有专属专注内容’的模式”
  - “对，就叫暂停吧，你再确认一下现在有没有这个功能，避免功能重复。 选择2吧”
  - “后者”

- 本次完成的工作：
  - 对现有工作流、自定义任务阶段、子应用专注工作和 `skip_phase` 行为做了设计梳理，确认当前并不存在“暂停当前专注阶段并稍后继续”的能力
  - 新增自定义任务专注工作设计文档，明确将自定义任务并入统一 `focus-work` 运行时，新增 `task_focus` 类型
  - 在设计文档中固定了自定义任务专注页的产品方向：极简沉浸页、可展开任务细节、主按钮“完成本轮专注”、次按钮“完成任务并结束专注”
  - 在设计文档中明确新增 `暂停专注 / 继续专注` 语义，并与当前 `skip_phase` 的“提前结束阶段”语义严格分离
  - 明确了第一版实现边界、后端字段与接口命名建议、前端接入点和测试策略

- 验证情况：
  - 已完成 spec 自检，确认无 `TODO / TBD` 占位，且“暂停”语义未与 `skip_phase` 混淆
  - 文档提交，无额外代码验证

### 2026-05-14 23:50 · c46c509 · feat: add focus work capsule flow

- 用户提出的需求：
  - “本次工作聚焦于 顶部工作流胶囊 这一组件，此次工作开发的所有功能都将围绕这个组件展开”
  - “子应用有一个或者多个用于专注的功能，比如说‘背单词’就是‘开始今日单词/继续今日单词’，‘ERC’的就是开始复习，点击后就会触发‘专注工作’。”
  - “顶部工作流胶囊的职责是识别当前页面的状态，页面的状态被分为‘正常状态（default）’和‘专注状态（focus）’。”
  - “进入专注工作有两种方式。一种是提前在工作流中预设好。另外一种是在子应用中提前进入。”
  - “在 专注工作 时，工作阶段倒计时结束了，一直卡在 0:00 处，没有自动进入休息阶段……刷新页面后就正常处于休息阶段了。”

- 本次完成的工作：
  - 新增页面级专注工作运行时，支持 Vocab 今日单词和 ERC 复习以大屏弹窗方式进入专注状态
  - 扩展顶部工作流胶囊与工作流阶段，支持绑定子应用专注功能、临时专注阶段、记录/不记录专注时间、完成/中止/放弃结果以及相邻同类专注工作的最小化
  - 后端新增页面级专注工作日志、运行时字段和结果提交接口，并修复首个绑定专注阶段未自动打开专注工作的状态初始化问题
  - 导航栏在全屏专注工作期间锁定 Home、Apps、About、品牌入口和日历入口，避免专注工作被导航切走
  - 修复倒计时触达 `0:00` 后前端不主动同步的问题：胶囊触零会广播 `ark:reload-focus`，使胶囊和专注弹窗同步进入后端推进后的阶段
  - 补充需求规格、实施计划、后端路由测试、导航锁定测试、胶囊触零同步回归测试，以及 Vocab/ERC 首页入口测试

- 验证情况：
  - `cd frontend && pnpm check`
  - `cd frontend && pnpm test -- Navigation.test.tsx WorkflowNavProgress.test.tsx Vocab/__tests__/Home.test.tsx ERC/__tests__/Home.test.tsx`
  - `cd backend && uv run pytest tests/test_focus_workflow_app_work.py -q`
  - `cd backend && uv run pytest tests/test_todo_routes.py -q`
  - `cd backend && uv run ruff check .`
  - 用户已完成前 3 步浏览器验收：倒计时归零、完整工作流、测试预设清理
