# main 分支开发日志

## 分支分片索引

- [feature/deliberate-workflow-persist](./feature-deliberate-workflow-persist.md) — 刻意工作流编排持久化
- [feat/deliberate-sub-app](./feat-deliberate-sub-app.md) — 刻意工作流子应用系统
- [feat/guest-onboarding](./feat-guest-onboarding.md) — 游客事件引导 + 预制子应用

## 提交记录

### 2026-07-12 · `6b65800` · fix(deploy): support system nginx production stack

**用户需求**："那你开始吧"、"汇报一下情况"，以及对 ARM 本机构建与 x86 服务器部署方式的确认。

**完成工作**：
- 生产环境改为系统 Nginx 处理 HTTPS 和静态文件，Docker Compose 仅运行 PostgreSQL 与 FastAPI；后端仅绑定 `127.0.0.1:8000`。
- 新增 Nginx 站点配置，静态资源发布到 `/var/www/ark`，避免放宽 `/home/ubuntu` 的访问权限。
- 修复空数据库首次启动时 ToDo 表在创建前执行迁移的问题，并调整题库初始化顺序。
- 使用腾讯云 PyPI 镜像构建后端，避免生产构建依赖 GHCR 与默认 PyPI 的不稳定下载。
- 写入当前生产数据库生成的游客题库 ID；游客完成 408 事件初始化后可生成 408、英语二、数学二、政治四个子应用，408 额外绑定四个专项题库以支持 Fork。

**验证情况**：
- `backend`: `uv run pytest tests/test_todo_routes.py`，102 passed。
- `backend`: `uv run ruff check routes/todo/db.py`，passed。
- `frontend`: `pnpm check` 与 `pnpm build`，passed。
- 服务器：Docker backend 与 PostgreSQL healthy，`https://strangetalking.xin/` 和 `/health` 均返回 200。
- 服务器：真实临时游客完成 408 事件初始化后，应用清单返回 408、英语二、数学二、政治及正确题库绑定。

### 2026-07-12 · `f4c39902` · feat(deploy): add Docker Compose production stack

**用户需求**："那直接用nginx就行了吧？"、"OK"，以及"那你开始吧"。

**完成工作**：
- 新增单机 Docker Compose 生产栈，包含前端 Nginx、FastAPI 后端和 PostgreSQL；仅暴露 80/443。
- 前端 Nginx 使用 `strangetalking.xin` 的既有证书，代理 Ark 的 API、认证、任务、上传、后台和健康检查路由。
- 新增服务器本地环境变量模板和部署说明；数据库与上传文件使用命名卷持久化。
- 收紧前后端 Docker 构建上下文，排除本地密钥、依赖和运行时目录。

**验证情况**：
- `frontend`: `pnpm build`，passed。
- `frontend`: `pnpm check`，passed。
- `docker compose --env-file /tmp/ark-deploy.env -f deploy/compose.yml config`，passed。

### 2026-07-11 · `72355e0` · feat: 新增游客登录功能

**用户需求**："我想设置一个游客登录，你有什么想法吗？" — 体验试用场景，游客可使用大部分功能，数据仅 localStorage，暂不清理。

**完成工作**：
- 后端 `auth_users` 表新增 `is_guest BOOLEAN DEFAULT FALSE` 列
- `UserPublic` 和 `_AuthUser` 新增 `is_guest` 字段，所有用户查询 SQL 同步更新
- 新增 `POST /auth/guest` 端点：自动生成 `guest_{随机字符}` 用户名，创建游客用户（无密码、无邮箱），签发 token
- 前端 `User` 类型新增 `is_guest` 字段
- 登录页添加"游客体验"按钮，调用 `/auth/guest` 完成游客登录

**验证情况**：
- `frontend`: `pnpm check`，passed
- `backend`: `uv run ruff check`，passed
- `backend`: `uv run pytest`，275 passed

### 2026-07-09 · `f9deb34` · feat(frontend): enhance focus work completion panel UI

**用户需求**：优化专注工作完成面板 UI，匹配新原型设计

**完成工作**：
- 添加头部背景图（读书少女插画）
- 优化圆形进度环：渐变色、发光效果、终点高光点
- 统计卡片改为水平布局，添加彩色图标
- 推荐卡片添加玻璃质感（backdrop-filter）
- 3D 图标添加 drop-shadow 滤镜
- 优化标题文字可读性

**验证情况**：
- `frontend`: `pnpm check`，passed
- `frontend`: `pnpm build`，passed

### 2026-07-09 · `2072e2e` · feat(frontend): update focus work completion panel UI

**用户需求**：更新专注工作完成面板 UI，匹配新原型设计

**完成工作**：
- 将矩形进度条替换为圆形进度环（SVG 实现）
- 副标题改为 party emoji + 时长格式："🎉 棒极了！你刚刚完成了 X 分钟的专注"
- 数据指标从 4 列单行改为 2×2 网格布局，每项添加图标
- 推荐卡片使用 3D 图标（book.png, pencil.png, target.png）
- 统计图标添加圆形背景
- 新增 CircularProgress、ClipboardIcon、CheckCircleIcon、PercentIcon、ClockIcon 组件

**验证情况**：
- `frontend`: `pnpm check`，passed
- `frontend`: `pnpm build`，passed

### 2026-07-02 · `13fee1d` · fix(frontend): 修复输入题图片不显示 & 优化列表折叠展示

**用户需求**："你看看输入练习的专注工作，怎么图片没有正确显示？"以及"题库管理板块的题库默认只显示3个吧，然后第四个是展开，不要不太好看"以及"专注工作管理也做这个处理吧。"以及"好，先提交代码吧"

**完成工作**：
- 修复 `UnifiedFocusWork` 中输入题（input）题干和阅读材料直接渲染纯文本的问题，改用 `MarkdownContent` 组件渲染，支持图片、列表等 Markdown 语法正确显示。
- 优化 `DeliberateWorkflow` 页面的题库管理列表：默认显示 3 个题库，超过时显示「展开全部」按钮，点击可展开/收起。
- 优化 `DeliberateWorkflow` 页面的专注工作管理列表：同样默认显示 3 项，超过时显示展开/收起按钮。
- 切换题库类型或重新加载配置时，自动重置为收起状态。

**验证情况**：
- `frontend`: `pnpm check`，passed
- 浏览器验证：输入题图片正确渲染，列表折叠功能正常

### 2026-07-02 · `c30a998` · fix(focus-work): restore unified run config and summary stats

**用户需求**：“专注工作 计算页面 的 正确率 用时似乎都没有正常运行？”以及“可以了，提交代码吧”

**完成工作**：
- 修复统一题目选择在 choice 题库下按错误字段过滤的问题，改为通过 `choice_articles.set_id` 关联题库。
- 补全 deliberate workflow 写入和恢复的统一配置快照，保证 `bank_id`、筛选规则、排序、FSRS 与回流策略能在运行态正确还原。
- 调整 choice 答题记账，补充 `chosen_option`、`correct_option`、practice review log 与错题桶同步更新。
- 重构统一 choice 专注题目的前端渲染，兼容字符串形式的 `options_json`，恢复左右分栏题面布局。
- 在统一专注完成时补齐 `accuracy` 与 `duration_seconds`，并把结算卡片的耗时展示改成秒/分/小时的真实格式。
- 新增并修正统一专注工作相关测试，覆盖完成结算统计与题库查询路径。

**验证情况**：
- `backend`: `uv run pytest tests/test_question_selector.py tests/test_focus_workflow_app_work.py -q`，56 passed
- `frontend`: `pnpm test -- --run src/components/focus-work/UnifiedFocusWork.test.tsx src/components/focus-work/templates/ChoiceQuestionFocusTemplate.test.tsx src/components/ERC/PracticeFocusWork.test.tsx`，18 passed
- `frontend`: `pnpm check`，passed

### 2026-06-26 · `c9b2aa2` · refactor(focus-work): extract duplicate utility functions and add browser automation tests

**用户需求**：重构三种刻意工作流组件，提取重复代码，并创建浏览器自动化测试。

**完成工作**：
- 从 PracticeFocusWork、ReviewFocusWork、VocabTodayFocusWork 中提取重复的工具函数到共享模块
- 统一各组件的导入路径，消除内联重复逻辑
- 创建浏览器自动化测试套件，覆盖核心工作流交互
- 生成测试报告，记录覆盖范围和执行结果

**验证情况**：
- 所有浏览器自动化测试通过
- TypeScript 编译成功，无新增错误
- 既有单元测试未受影响

**变更文件**：10 files changed, 633 insertions(+), 347 deletions(-)

### 2026-06-22 · `c6fc060a` · feat: add deliberate workflow admin app

**用户需求**：用户希望实现「刻意工作流」管理员子应用，并持续调整为渐进式、可持久化、可切换已保存工作流的体验；期间明确提出“选择题中的练习模式和复习模式的题库不应该是一样的吗？”以及“每次进入该页面都要重新过一遍流程，这不好，我希望可以持久化保存刻意工作流，支持切换刻意工作流和再次新建工作流”。

**完成工作**：
- 新增 `deliberate` 后端领域模块，支持管理员配置 CRUD、题库上传校验、运行档案查询和正式启动接口。
- 新增 `content_bank` 初始化模块，并由 lifespan 调用，减少 `main.py` 中的表初始化混杂。
- 将旧测试专注启动复用新的正计时专注启动逻辑，保留兼容入口。
- 为选择题提交增加 `practice/review` mode，并让选择题快照统计按题库过滤。
- 新增管理员「刻意工作流」子应用页面和 API client，应用中心仅管理员展示入口。
- 页面改为渐进式创建：选择类型、题库资产、工作参数、运行复盘。
- 将选择题练习/复习与题库资产解耦：同一份 `choice_set` 题库可绑定练习或复习模式。
- 已保存工作流支持持久化展示、下拉切换、再次新建和再次启动，不再每次进入都强制重走创建流程。
- 修复开发热重载下 `todo` 初始化重复创建约束/索引导致的启动失败。

**验证情况**：
- `backend`: `uv run pytest`，212 passed
- `backend`: `uv run ruff check routes/todo/db.py`，passed
- `frontend`: `pnpm check`，passed
- `frontend`: `pnpm test`，250 passed，8 skipped
- 临时启动 `uvicorn main:app --port 8011`，startup complete
- 当前 `http://127.0.0.1:8000/docs` 返回 200 OK
- 浏览器烟测确认管理员入口、已保存工作流默认展示、新建向导、工作流切换、选择题题库/练习复习绑定关系正常

**变更文件**：26 files changed, 2627 insertions(+), 209 deletions(-)

### 2026-06-20 · `e65b54d6` · refactor: 统一 Choice 数据层，彻底废弃 ERC 模块

**用户需求**：将 ERC 旧题库路径合并到 content_banks 体系，统一数据层命名

**完成工作**：
- 合并 routes/erc/ 到 routes/choice/ (repository/service/importer)
- 重命名数据库表 erc_* → choice_* (10 张表 + 3 个索引)
- 移除 sync 机制，Admin import 直接写 choice_sets
- 重命名专注工作类型 erc_practice → practice, erc_review → review
- 前端渲染器统一走 Choice API，删除旧 ERC 独立页面
- 清理前端命名 (ERCPracticeFocusWork → PracticeFocusWork 等)
- 删除 routes/erc/ 目录、admin HTML 页面、旧测试文件

**验证**：Backend 202/202 tests pass, Frontend 249/250 tests pass (1 pre-existing), TypeScript 编译通过

**变更文件**：56 files changed, 519 insertions(+), 1753 deletions(-)
