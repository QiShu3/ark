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

#### 本期未处理

- 不改结算页结构
- 不改存档可视化结构
- 不强制推进统一题库字段规范
- 不做智能补题
- 不做自动放宽条件
- 不做复杂题量配比策略
- 各题型运行时 renderer（VocabTodayFocusWork / ChoiceFocusWork / InputFocusWork）尚未接入统一选择器

### 验证情况

- 前端 TypeScript check 通过
- 前端 lint（仅预存已存在的 errors，无新增）
- 前端测试：50 passed / 4 failed（4 failed 均为预存失败，与本次改动无关）
- 后端测试：216 passed / 0 failed
- 后端 ruff lint：通过（仅预存 import sorting 提示）
