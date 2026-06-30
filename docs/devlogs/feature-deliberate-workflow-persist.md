# feature/deliberate-workflow-persist 分支开发日志

## 提交记录

### 2026-06-29 · `3efb2b7` · feat: add deliberate workflow persist feature

**用户需求**：提交当前工作区的代码修改，包括刻意工作流持久化的后端、前端及测试变更。

**完成工作**：
- 提交后端 todo helpers/schemas、vocab repository/routes/service 的修改
- 提交前端 VocabTodayFocusWork 组件、vocab API 的修改
- 提交前后端测试文件更新
- 添加 Playwright 浏览器测试配置和测试用例
- 更新开发日志文档

**验证情况**：
- 代码已成功提交到 `feature/deliberate-workflow-persist` 分支

**变更文件**：20 files changed, 1753 insertions(+), 472 deletions(-)

---

### 2026-06-29 · `849d306` · feat(frontend): persist deliberate workflow group as workflow preset

**用户需求**：在刻意学习流页面的工作流编排区域，让用户可以保存/加载/删除编排配置，复用现有的工作流预设系统。

**完成工作**：
- 扩展 `WorkflowPhaseType` 类型，添加 `'deliberate_group'` 阶段类型
- 扩展 `WorkflowPresetPhase` 类型，添加 `config_ids` 和 `config_names` 字段
- 在 `DeliberateWorkflow.tsx` 中添加预设状态管理、加载/保存/删除逻辑
- 在工作流编排区域添加保存/加载/删除 UI
- 修复 `EventCountdownCard`、`EventWorkbenchModal`、`HomeRightDashboard` 中因类型扩展导致的类型错误

**验证情况**：
- `pnpm check` 通过，无类型错误
- 既有功能未受影响

**变更文件**：5 files changed, 132 insertions(+), 13 deletions(-)

---

### 2026-06-29 · `2649d51` · fix: stabilize deliberate workflow focus runs

**用户需求**：测试工作流编排完整流程，修复启动保存编排后直接跳到结算页、背单词专注工作受今日工作量限制、选择题选项不可见，以及组合工作流结算缺少 Fork 的问题；在继续重构前先提交当前代码。

**完成工作**：
- 修复保存编排列表里的“启动”按钮直接使用预设内 `config_ids`，避免 React 状态尚未刷新时启动空编排
- 为工作流记录补充运行节点追加和完成/放弃状态同步，专注工作完成、跳过、停止时能正确维护 `workflow_records`
- 将背单词专注工作调整为开放式从题库循环取题，移除“今日工作量”作为专注工作本身的结算条件
- 调整闪卡模板支持无目标数量模式，进度显示为已完成数量而非目标进度
- 优化选择题专注工作阅读题布局，使题干与选项在结算前可见可操作
- 增加/更新针对保存编排启动、背单词开放式流程、选择题模板的测试覆盖

**验证情况**：
- `cd backend && uv run ruff check routes/todo/routes.py routes/todo/helpers.py` 通过
- `cd backend && uv run pytest tests/test_todo_routes.py -q` 通过，102 passed
- `cd frontend && pnpm check` 通过
- `cd frontend && pnpm test -- DeliberateWorkflow.test.tsx -t "starts a saved orchestration directly"` 通过
- `cd frontend && pnpm test -- VocabTodayFocusWork.test.tsx` 通过，10 tests
- `cd frontend && pnpm test -- ChoiceQuestionFocusTemplate.test.tsx` 通过，8 tests
- 浏览器验证保存编排启动后进入背单词卡片，选择题 A/B/C/D 选项可见

**变更文件**：9 files changed, 374 insertions(+), 287 deletions(-)

---

### 2026-06-29 · `58a5aca` · refactor: align deliberate workflow runs with focus work

**用户需求**：按“组合编排复用专注工作启动机制重构计划”实现：保留现有入口，统一组合编排和单独专注工作的运行上下文，让 deliberate run 在阶段真正开始时创建，并修复组合工作流结算缺少 Fork 的根因。

**完成工作**：
- 将组合编排 phase 构造改为复用标准 countup deliberate focus phase，统一使用 `deliberate_config_id` 等上下文字段
- 在创建 focus work run 时按当前 phase 懒创建 `deliberate_workflow_runs`，绑定 workflow，并把 `deliberate_run_id` 写回 phase
- 让 run metadata 加载 deliberate children，结算页可基于 failed `mastery_check` 显示 Fork 子节点
- 恢复结算页循环动作：计入轮次可再来一轮，extra 轮次可结束阶段或再来一轮，无内容时显示暂无可加练内容
- 增加组合 phase、阶段运行时 deliberate run 创建、Fork 子节点显示的测试覆盖

**验证情况**：
- `cd backend && uv run ruff check routes/todo/routes.py routes/todo/helpers.py tests/test_focus_workflow_app_work.py` 通过
- `cd backend && uv run pytest tests/test_focus_workflow_app_work.py -q` 通过，29 passed
- `cd backend && uv run pytest tests/test_todo_routes.py -q` 通过，102 passed
- `cd frontend && pnpm check` 通过
- `cd frontend && pnpm test -- FocusWorkProvider.test.tsx` 通过，10 passed
- `cd frontend && pnpm test -- DeliberateWorkflow.test.tsx -t "starts a saved orchestration directly"` 通过
- 浏览器验证“完整流程测试”重新启动后进入“今日单词”背单词卡片，没有直接跳结算，并显示开放式 `已完成 0`

**变更文件**：5 files changed, 404 insertions(+), 64 deletions(-)
