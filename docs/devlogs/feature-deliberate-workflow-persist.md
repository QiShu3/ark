# feature/deliberate-workflow-persist 分支开发日志

## 提交记录

### 2026-06-29 · `02f4fb3` · fix(backend): pass extra fields to FocusWorkflowPhase in _phase_models_from_row

**用户需求**：`_phase_models_from_row` 函数在创建 `FocusWorkflowPhase` 对象时，只传递了显式定义的字段，没有传递额外字段（如 `deck_id`、`set_id`、`target_word_count`、`daily_target_count`、`task_title`、`choice_scope`、`choice_completion` 等），导致返回的 phases 中这些字段为 null。

**完成工作**：
- 修改 `backend/routes/todo/helpers.py` 中 `_phase_models_from_row` 函数
- 将整个 `phase` 字典展开传递给 `FocusWorkflowPhase`，通过显式提取已知字段 + 构建 `extra_fields` 字典并 `**` 解包，确保 `extra='allow'` 能捕获所有额外字段
- 支持的额外字段包括：`deck_id`、`target_word_count`、`daily_target_count`、`set_id`、`article_set_id`、`input_bank_id`、`target_question_count`、`daily_question_target`、`target_article_count`、`daily_article_target`、`task_title`、`choice_scope`、`choice_completion`、`deliberate_run_id`、`deliberate_config_id`、`deliberate_kind`、`deliberate_name`、`config_id`

**验证情况**：
- 调用 `start-multi-deliberate` API 验证，返回的 phases 中第一个 phase 包含 `deck_id`、`target_word_count`、`daily_target_count`、`task_title`、`choice_scope`、`choice_completion`、`deliberate_kind`、`deliberate_name`、`config_id` 等字段（不为 null）
- 第三个 phase 也正确包含 `set_id`、`article_set_id`、`target_question_count` 等字段

**变更文件**：1 file changed, 32 insertions(+), 9 deletions(-)

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
