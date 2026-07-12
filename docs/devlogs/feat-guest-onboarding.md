# feat/guest-onboarding 分支开发日志

## 提交记录

### 2026-07-12 · `1cedacb` · fix(guest): resume onboarding in event workbench

**用户需求**："点击事件后，进入到这个页面，引导中断了"。

**完成工作**：
- 游客初始化完成后主动刷新顶部主事件卡片，避免仍显示“未设置主事件”。
- 主事件尚未刷新时，游客点击事件入口会重新获取主事件并直接打开 `22408考研` 工作台。
- 事件总览作为请求失败时的兜底分支，主事件卡片可继续引导进入工作台，不再丢失引导状态。
- 补充游客初始化后直达工作台的回归测试，并调整异步工作台挂载的引导断言。

**验证情况**：
- `frontend`: `pnpm check`，passed。
- `frontend`: 新增事件刷新回归用例，passed。
- `frontend`: `pnpm exec vitest run src/components/__tests__/GuestOnboarding.test.tsx`，5 passed。
- 事件卡片全量测试另有 1 条失败，受工作区既有的应用配置字段变动影响，与本次修复无关。

### 2026-07-12 · `a5ab7e4` · feat(guest): refine 408 onboarding experience

**用户需求**："可以，开干吧"、"这里换成左右排版而非上下"、"这里的svg图标换成png吧"、"我还希望可以分别介绍下面的任务日常 和 工作流"、"在最后结束引导时，在增加一步用于感谢用户使用吧"。

**完成工作**：
- 首页将今日进度卡片替换为最近完成工作流的结果摘要，展示完成工作、专注时间和正确率；点击可打开既有结算回顾。
- 工作流记录接口支持跨子应用查询，首页按实际完成时间选择最近一次完成记录。
- 结果卡片的三项指标改为横向成对排版，标题图标复用现有时钟 PNG 资源。
- 游客事件工作台引导拆分为事件信息、任务与日程、工作流三步，并修复内部滚动后高亮框坐标漂移。
- 408 练习体验引导拆分为题干、选项和完成操作，避免提示气泡与高亮目标重叠；结算完成后增加感谢体验页。
- 补充首页工作流结果、游客引导、工作流结算、选择题引导锚点和跨子应用工作流记录的前后端测试。

**验证情况**：
- `backend`: `uv run pytest tests/test_focus_workflow_app_work.py`，25 passed。
- `backend`: `uv run ruff check routes/todo/routes.py tests/test_focus_workflow_app_work.py`，passed。
- `frontend`: `pnpm test -- HomeRightDashboard.test.tsx`，7 passed。
- `frontend`: `pnpm test -- GuestOnboarding.test.tsx EventWorkbenchModal.test.tsx`，11 passed。
- `frontend`: `pnpm test -- ChoiceQuestionFocusTemplate.test.tsx FocusWorkProvider.test.tsx`，20 passed。
- `frontend`: `pnpm test -- GuestOnboarding.test.tsx FocusWorkProvider.test.tsx ChoiceQuestionFocusTemplate.test.tsx`，26 passed。
- `frontend`: `pnpm check`，passed。

### 2026-07-12 · `994b72e` · feat(guest): guide 408 fork experience in context

**用户需求**："找到时间 和 回到首页之间缺少过渡"、"将 体验流程提示 也扩展为高亮引导吧"，以及"太生硬了，我觉得应该先高亮主题内容，再高亮要按的按钮"。

**完成工作**：
- 在游客事件工作台中补充事件内容介绍，再引导关闭并回到首页启动学习。
- 新增游客 408 Fork 体验引导：首轮检测、未通过结果、专项 Fork、专项通过回流、复检达标和结算均按真实工作流状态衔接。
- 每个体验节点改为两步：先高亮并说明当前题目、结果或学习路径，再提示下一步实际操作，避免直接催促点击。
- 为检测说明、结果卡片、Fork 目标、回流/结束按钮和结算学习路径补充高亮锚点；新增和更新相关前端测试。

**验证情况**：
- `frontend`: `pnpm check`，passed。
- `frontend`: `pnpm exec vitest run src/components/__tests__/FocusWorkProvider.test.tsx src/components/focus-work/WorkflowSettlementModal.test.tsx src/components/__tests__/GuestOnboarding.test.tsx`，18 passed。

### 2026-07-12 · `084a0d6` · feat(guest): complete 408 onboarding journey

**用户需求**："看看游客登录的引导"、"从游客登录开始，完整测试一遍，记录一下出现的问题和对应的改进方案"、"要提供跳出引导 button"，以及"我看引导过程，点击事件后没有引导用户关掉事件弹窗，点击开始学习button也没有引导用户一步进行学习啊"。

**完成工作**：
- 游客入口收敛为单一 408 考研体验，并提供跳过与从导航栏重新进入引导的能力。
- 引导流程补全为：查看主事件、关闭事件工作台、开始学习、选择 408 学习应用、启动工作流；每一步均有高亮提示。
- 处理异步弹窗挂载的锚点重试，避免工作流选择弹窗出现后丢失引导提示。
- 游客初始化接口仅创建 408 子应用、专注配置和工作流预设，并清理旧版英语/数学/政治游客演示数据。
- 为事件工作台关闭按钮、工作流选择和启动按钮增加引导锚点；补充游客引导、登录、导航和首页工作流测试。

**验证情况**：
- `frontend`: `pnpm test -- --run src/components/__tests__/GuestOnboarding.test.tsx src/components/__tests__/HomeRightDashboard.test.tsx`，11 passed。
- `frontend`: `pnpm check`，passed。
- `backend`: `uv run pytest tests/test_auth_email.py -q`，3 passed。
- 应用内浏览器：以游客身份完整验证 408 体验、事件工作台关闭引导、学习应用选择、工作流启动与输入练习首步。

### 2026-07-12 · `b5c4537` · feat: 子应用归属用户与事件

**用户需求**："我希望可以跟踪，然后游客登录复用这个功能"，以及"子应用除了刚刚说到的跟踪用户之外，会跟踪事件吗？跟踪事件也很重要"。

**完成工作**：
- 新增持久化 `deliberate_sub_apps` 注册表，记录子应用的所有者、创建者、可见范围、模板来源和事件归属。
- 管理员创建的子应用迁移为公共/系统定义；普通用户可创建仅自己可见的子应用，并只能管理自己的定义。
- 游客引导将四个考研模板实例化为当前游客专属的子应用，复用统一的子应用、配置和工作流模型。
- 游客实例、专注配置与工作流预设均关联到同一个 `22408考研` 事件；配置从子应用继承事件归属。
- 子应用创建/编辑界面支持普通用户选择所属事件；事件变更同步到内部配置和预设。
- 删除事件时保留子应用、配置、预设和学习记录，仅解除事件关联；纯事件工作流仍按原规则清理。
- 修复游客可启动刻意工作流、子应用预设关联、引导点击事件后隐藏等回归问题。

**验证情况**：
- `frontend`: `pnpm check`，passed
- `backend`: `uv run ruff check`，passed
- `backend`: `uv run pytest tests/test_auth_email.py tests/test_todo_routes.py -q`，105 passed
- 应用内浏览器：确认游客数学二子应用加载题库、专注配置和工作流预设。

### 2026-07-11 · `b658f47` · feat: 游客事件引导 + 预制子应用 + 题库隔离

**用户需求**：为游客登录增加事件引导流程。登录后弹窗引导选择事件类型（考研）和目标专业（22408），创建主事件后在应用中心展示4个预制子应用（英语二/数学二/政治/408），并通过气泡引导用户查看事件和开始学习。

**完成工作**：
- 数据库：`vocab_decks`/`choice_sets`/`input_sets` 三张题库表新增 `is_guest_only` 列
- 后端：题库列表函数（`list_vocab_decks`/`list_set_rows`/`list_input_sets`）增加 `is_guest` 参数，按用户类型过滤
- 后端：`AppDeclaration` 新增 `guest_only` 字段，注册4个游客子应用常量（`guest-english`/`guest-math`/`guest-politics`/`guest-408`）
- 后端：`get_all_for_user()` 函数按用户类型返回不同应用列表
- 后端：`/api/app-registry` 改为 auth-aware，根据用户类型过滤
- 后端：新增 `POST /auth/guest/setup-event` 端点，创建游客主事件（22408考研，截止2026-12-20）
- 前端：新增 `GuestOnboarding.tsx` 组件，含事件类型选择弹窗、专业选择弹窗、气泡高亮引导
- 前端：`AppCenter` 按用户类型过滤应用，游客只看 `guestOnly` 应用
- 前端：`Login.tsx` 游客登录后清空应用注册表缓存
- 前端：`DeliberateWorkflow` 隐藏游客的"上传新题库"按钮
- 脚本：`backend/scripts/seed_guest_banks.py` 预置游客演示题库

**验证情况**：
- `frontend`: `pnpm check`，passed
- `backend`: `uv run ruff check`，passed（pre-existing errors only）
- `backend`: `uv run pytest`，275 passed
