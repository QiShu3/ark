# codex/unified-question-selection-v1 开发日志

## f7f90eb · 2026-07-01 · feat: unified question selection V1

### 用户需求

落实"统一取题方案 V1"的代码改造：

- 统一专注工作的取题逻辑与配置语义
- 统一"配置 -> 筛题 -> 出题 -> 作答 -> 更新状态"的流程
- 支持 FSRS 作为可选机制
- 题量不足采用严格模式
- 支持主筛选条件、排序方式、回流规则等新配置语义
- 如果改动影响 `#/deliberate-workflow` 页面，前端必须同步修改

### 完成工作

#### 后端改造

1. **配置语义统一**：
   - `deliberate_workflow_configs` 表新增 `primary_filter` / `sort_order` / `use_fsrs` / `backflow_rule` 四个字段
   - schemas.py 中 `DeliberateWorkflowConfigOut/Create/Patch` 均新增对应字段
   - repository.py 中 config_to_dict / create_config / update_config 同步处理新字段

2. **统一筛题引擎**（`lib/question_selector.py`）：
   - 按题型适配的 `QuestionAdapter` 接口（ChoiceQuestionAdapter / VocabQuestionAdapter / InputQuestionAdapter）
   - 支持主筛选条件：全部/没做过/做错过/上次做错/到期复习
   - 支持排序方式：按序号/按到期时间/按错误优先/随机
   - 严格模式：匹配题数 < 目标且 > 0 → 实际开始并提示；= 0 → 不开始并提示

3. **统一学习档案**（`lib/study_ledger.py`）：
   - `record_answer()` 统一接口记录作答
   - 各题型适配：vocab / choice / input
   - FSRS 可选机制：开启时每次作答后立即更新调度
   - 回流规则：答错放队尾 / 答错立即再来一次

#### 前端改造

1. **CreateFocusWorkModal**：新增主筛选条件、排序方式、FSRS 开关、回流规则选择器；FSRS 关闭时「到期复习」禁用；新增提示文案
2. **EditFocusWorkModal**：同步新增四个配置字段编辑
3. **DeliberateWorkflow.tsx** 向导步骤 3：表单改用新字段
4. **API 类型**：新增 `PrimaryFilter` / `SortOrder` / `BackflowRule` 类型
5. **测试**：DeliberateWorkflow.test.tsx 新增 mock 字段

## 0aa74ef · 2026-07-01 · feat: wire up runtime renderers to unified question selection

### 用户需求

继续完成"统一取题方案"——将各题型运行时真正接入统一取题逻辑，不再各自使用旧的独立取题方式。

### 完成工作

1. **后端统一运行时 API**（`routes/focus_work/unified/routes.py`）：
   - `POST /api/focus-work/unified/{run_id}/init` — 根据 config_snapshot 构建题单，返回首题
   - `GET /api/focus-work/unified/{run_id}/next` — 取下一题
   - `POST /api/focus-work/unified/{run_id}/submit` — 提交答案，调用 study_ledger.record_answer()，处理回流规则，更新 progress_snapshot
   - 题单存储在 progress_snapshot.unified_question_pool 中
   - 严格模式：题量不足时 init 返回 warning；0 题时 total=0

2. **config_snapshot 携带新字段**：
   - `_phase_config_snapshot` 新增 `primary_filter` / `sort_order` / `use_fsrs` / `backflow_rule` / `kind` / `bank_id` / `target_count` / `scope` / `completion`
   - `_ensure_deliberate_run_for_phase` 从 config_row 提取并注入新字段

3. **前端 UnifiedFocusWork 组件**（`components/focus-work/UnifiedFocusWork.tsx`）：
   - 适配三种题型 UI：flash_card（闪卡正反面）、choice（选项选择）、input（文本输入+自评）
   - 严格模式提醒：target > matched 时提示，0 题时不让开始
   - 回流规则：答错放队尾 / 答错立即再来一次 的消息提示
   - 答题完成后回调 onContentCompleted

4. **focusWorkRegistry.tsx**：当 config_snapshot 包含 unified 字段时，flash_card/choice/input 全部路由到 UnifiedFocusWork；旧配置回退到原有 renderer

### 验证情况

- 前端 TypeScript check：通过
- 前端 lint：无新增错误
- 前端测试：271 passed / 8 failed（8 failed 均为预存失败，与本次改动无关）
- 后端测试：216 passed / 0 failed
- 后端 ruff lint：新文件全部通过

### 变更概要

| 文件 | 状态 |
|------|------|
| backend/routes/focus_work/unified/__init__.py | 新增 |
| backend/routes/focus_work/unified/routes.py | 新增（3 个端点） |
| backend/routes/todo/routes.py | 修改（config_snapshot 携带新字段） |
| backend/main.py | 修改（注册 unified_router） |
| frontend/src/components/focus-work/UnifiedFocusWork.tsx | 新增 |
| frontend/src/components/focus-work/focusWorkRegistry.tsx | 修改（统一路由） |
| frontend/src/lib/focus-work/unifiedApi.ts | 新增 |
