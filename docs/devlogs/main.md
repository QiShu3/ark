# main 分支开发日志

## 分支分片索引

- [feature/deliberate-workflow-persist](./feature-deliberate-workflow-persist.md) — 刻意工作流编排持久化

## 提交记录

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
