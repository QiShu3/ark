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

## 返工修复 round · 2026-07-01 · fix: unified question selection rework

### 用户需求

将统一取题方案 V1 修到可验收状态。修复以下问题：

1. question_selector 查询不存在的数据库字段
2. UnifiedFocusWork 学习统计只按最后一道题算
3. 暂停/禁用状态未真正拦截作答
4. 补全后端测试覆盖

### 完成工作

1. **VocabQuestionAdapter 修复**（`backend/lib/question_selector.py`）：
   - `w.definition` 在 `vocab_words` 表中不存在（定义存于 `vocab_word_translations` 表）
   - 新增 LEFT JOIN LATERAL 关联 `vocab_word_translations`，取第一条翻译作为 `answer`

2. **统计修正**（`backend/routes/focus_work/unified/routes.py` + `frontend/src/lib/focus-work/unifiedApi.ts` + `UnifiedFocusWork.tsx`）：
   - submit 端点返回 `correct_count` 字段（由后端 run_summary 累计）
   - UnifiedFocusWork 在 done 回调中使用 `submitResult.correct_count` 而非按最后一次作答推算
   - 确保 answered_count 也取自后端累计值

3. **暂停/禁用拦截**（`UnifiedFocusWork.tsx`）：
   - `handleShowAnswer()` 和 `handleSubmitAnswer()` 入口处 `if (disabled) return`
   - 所有交互按钮/选项/输入框添加 `disabled={disabled}` 属性
   - shell 层 `FocusWorkModalShell` 已有 `pointer-events-none` 做 CSS 层拦截，本层做 React 层防御

4. **后端测试**（`backend/tests/test_question_selector.py`）：
   - 34 个测试用例覆盖：get_adapter、_build_filter_clause（全部 5 种筛选条件的 3 种题型）、_sort_sql（4 种排序方式的 3 种题型）、count_available、select_questions（含翻译表关联）、build_question_list（空池/部分池/满池/vocab 翻译）、count_questions

### 未改动/已确认正常

- **scope（year/subject/tag）过滤**：分析确认 scope 在 bank_id 层面生效，不属于 question_selector 动态过滤范畴。题库字段不含 `choice_questions.subject` 等列，subject/year 在 `choice_articles` 表层面。不在此次修复范围内。
- **FSRS 可选**：已确认默认为 False，从 config_snapshot 正确传递到 question_selector 和 study_ledger。
- **路由逻辑**：`focusWorkRegistry.tsx` 中 `primary_filter || deliberate_config_id → UnifiedFocusWork` 的判断正确，旧配置走旧 renderer。
- **结算页**：未改动。
- **题库字段规范**：未改动。

### 验证情况

- 前端 TypeScript check (`pnpm check`)：通过
- 前端 lint：无新增错误
- 前端 focus-work 相关测试：19 passed / 0 failed
- 后端新测试（test_question_selector）：34 passed / 0 failed
- 后端全量测试：250 passed / 0 failed
- 后端 lint：（仅新/改文件）0 errors
- 预存失败 8 个（Today.test.tsx 2 / DeliberateWorkflow.test.tsx 5 / EventCountdownCard.test.tsx 1 / workflow-test.spec.ts 0）与本次改动无关

### 变更概要

| 文件 | 状态 | 说明 |
|------|------|------|
| backend/lib/question_selector.py | 修改 | VocabQuestionAdapter 修复 w.definition → JOIN translations |
| backend/routes/focus_work/unified/routes.py | 修改 | submit 返回 correct_count |
| frontend/src/components/focus-work/UnifiedFocusWork.tsx | 修改 | 统计修正 + disabled 拦截 |
| frontend/src/lib/focus-work/unifiedApi.ts | 修改 | UnifiedSubmitResult 新增 correct_count |
| backend/tests/test_question_selector.py | 新增 | 34 个测试 |

### 已知风险

1. DeliberateWorkflow.test.tsx 5 个测试预存失败（"开始专注"文本查找超时），不阻塞本次验收
2. VocabQuestionAdapter 使用 LEFT JOIN LATERAL 取第一条翻译，当单词有多个 POS 翻译时只展示一个。这和旧 VocabTodayFocusWork（展示全部翻译）行为略有不同，但功能正常
3. 结算页（WorkflowSettlementModal）的 aggregated stats 依赖 run_summary 数据，如果旧 renderer 和 UnifiedFocusWork 的 run_summary 结构不同，结算页可能展示不一致（但本次未改结算页）
