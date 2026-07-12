# feat/guest-onboarding 分支开发日志

## 提交记录

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
