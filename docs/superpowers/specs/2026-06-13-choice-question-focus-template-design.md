# 选择题专注工作模板设计

## 1. 背景

Ark 的全屏专注工作台已经把任务完成、阶段推进、额外轮次、暂停和放弃等运行时能力集中到 `FocusWorkProvider`。子应用专注工作现在只需要完成一轮内容，并在内容自然完成时调用 `onContentCompleted`。

当前 ERC 错题复习和 ERC 真题练习都包含选择题工作台结构：

- 标题与元信息区域。
- 阅读材料区域。
- 当前题目区域。
- A/B/C/D 选项状态。
- 提交后显示正确/错误状态。
- 下一题或完成本轮内容。

这些结构在不同子应用里会继续重复出现。第一版模板化的目标，是以 ERC 错题复习为母版，抽出一个供子应用开发复用的选择题专注模板。

## 2. 目标

1. 建立 `ChoiceQuestionFocusTemplate`，复用 ERC 错题复习的布局与交互语言。
2. 让子应用只提供题目数据、材料数据、提交函数和下一题加载函数。
3. 让模板统一处理选择、提交、结果展示、下一题、空内容、暂停禁用、错误和达到目标后的内容完成回调。
4. 保持模板只处理内容层，不接管任务完成、阶段结束或 `再来一轮` 等工作台业务。
5. 让 ERC 错题复习作为第一批迁移对象，保持用户看到的界面基本不变。
6. 为 ERC 真题练习后续复用选择题题卡打基础，但不在第一版完整重构真题练习。

## 3. 非目标

1. 不开放给普通用户创建自定义题库或自定义题型。
2. 不在第一版实现填空题、解答题模板。
3. 不改后端 `FocusWorkType`、`focus_work_runs` 或任务完成语义。
4. 不重写 ERC 数据获取、错题 fallback、文章筛选或提交接口。
5. 不重做 ERC 真题练习的词汇预热、多题导航和结果汇总。
6. 不引入新的设计系统主题；继续使用现有 `--focus-work-*` 变量。

## 4. 核心边界

模板负责“选择题内容怎么做”，不负责“这个内容属于哪个任务、是否完成任务、是否结束阶段”。

### 4.1 模板负责

- 渲染专注内容标题、元信息标签和可选说明。
- 渲染可滚动材料区，例如阅读文章。
- 渲染当前题卡。
- 管理当前选择项。
- 调用提交函数。
- 根据提交结果锁定选项并标记正确/错误。
- 控制提交按钮和下一题按钮的可用状态。
- 支持 `disabled` 暂停态。
- 显示加载、错误和空内容状态。
- 达到目标题数或没有可用内容时调用 `onContentCompleted`。

### 4.2 子应用 adapter 负责

- 根据 `run.config_snapshot` 读取目标数量、范围和领域配置。
- 拉取第一题和下一题。
- 对接领域提交接口。
- 把领域题目转换为模板题目结构。
- 把模板提交结果转换为领域进度快照。
- 决定 extra run 的内容 fallback 策略。

### 4.3 全屏工作台继续负责

- 创建 counted run 和 extra run。
- 判断当前任务今日是否已完成。
- 显示 counted run 完成确认。
- 显示 extra run 完成确认。
- 结束阶段、延长阶段、暂停、继续、放弃本阶段。
- 写任务完成记录。

## 5. 模板接口

第一版接口保持窄而明确，避免为了未来题型提前泛化。

```ts
export type ChoiceQuestionOption = {
  key: string;
  text: string;
};

export type ChoiceQuestionMaterialParagraph = {
  id: string;
  label?: string;
  text: React.ReactNode;
};

export type ChoiceQuestionItem = {
  id: string;
  numberLabel: string;
  stem: React.ReactNode;
  options: ChoiceQuestionOption[];
  material?: {
    title: string;
    paragraphs: ChoiceQuestionMaterialParagraph[];
  };
  meta?: Array<{
    label: string;
    tone?: 'default' | 'blue' | 'amber' | 'emerald';
  }>;
};

export type ChoiceQuestionSubmitResult = {
  correctOptionKey?: string;
  explanation?: React.ReactNode;
  progressSnapshot?: Record<string, unknown>;
};

export type ChoiceQuestionFocusTemplateProps = {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  item: ChoiceQuestionItem | null;
  loading: boolean;
  error: string | null;
  emptyTitle: string;
  emptyDescription: string;
  answeredCount: number;
  targetCount: number;
  disabled: boolean;
  onSubmitAnswer: (item: ChoiceQuestionItem, optionKey: string) => Promise<ChoiceQuestionSubmitResult>;
  onLoadNext: () => Promise<ChoiceQuestionItem | null>;
  onContentCompleted: (progressSnapshot?: Record<string, unknown>) => void;
};
```

## 6. ERC 错题复习迁移设计

`ERCReviewFocusWork` 迁移后保留领域控制器角色：

1. 读取 `targetQuestionCount`。
2. 维护 `answeredQuestionIdsRef`。
3. 调用 `resolveReviewItem(run, answeredQuestionIdsRef.current)`。
4. 将 `ERCReviewNext` 转为 `ChoiceQuestionItem`。
5. 调用 `submitERCReview(questionId, selectedOption)`。
6. 提交成功后把题目 id 写入已答集合，并更新 answered count。
7. 把空内容状态映射给模板。

模板替代当前 ERC Review 内的 JSX：

- header 区域。
- `Reading Passage` 区域。
- `Current Question` 区域。
- 选项按钮状态计算。
- 提交 / 下一题按钮。
- 空内容状态。
- 加载 / 错误展示。

迁移后，ERC Review 文件应该更像一个 adapter，而不是大型 UI 组件。

## 7. ERC 真题练习后续关系

ERC 真题练习第一版不完整迁移，因为它还有：

- 词汇预热阶段。
- 一篇文章多道题。
- 题目上一题 / 下一题导航。
- 整篇文章统一提交。
- 结果汇总页。

后续可以先复用模板内部拆出的 `ChoiceQuestionCard` 或让 `ChoiceQuestionFocusTemplate` 增加受控模式。但第一版只要求不阻断这个演进方向。

## 8. 文件组织

新增文件建议放在 `frontend/src/components/focus-work/templates/`：

- `ChoiceQuestionFocusTemplate.tsx`
- `choiceQuestionTypes.ts`
- `ChoiceQuestionOptionGrid.tsx`，仅当主模板文件过大时再拆。

ERC adapter 仍放在 `frontend/src/components/ERC/ERCReviewFocusWork.tsx`，因为数据来源和领域 fallback 属于 ERC。

如果模板进入长期复用，需要更新 `docs/frontend-ui-unification.md` 的组件资产表，登记“选择题专注模板”的推荐用途和避免事项。

## 9. UI 与主题约束

模板必须遵守 focus-work 主题约束：

- 使用 `text-[var(--focus-work-text)]`、`text-[var(--focus-work-text-muted)]`、`border-[var(--focus-work-border)]`、`bg-[var(--focus-work-surface-raised)]` 等变量。
- 正确、错误、强调状态使用已有 `--focus-work-emerald-*`、`--focus-work-rose-*`、`--focus-work-blue-*` 变量。
- 不新增 `text-white`、`bg-white/5`、`bg-black/30` 或新的硬编码暗色值。
- CTA 的白底深字例外仍可沿用已有规则。

视觉上第一版应尽量保持 ERC 错题复习现状，只做结构抽象，不做大幅改版。

## 10. 错误与边界状态

模板需要覆盖：

- 初始加载。
- 加载失败。
- 无可用内容。
- 暂停状态下禁止提交、选择和下一题。
- 未选择时禁用提交。
- 已提交后锁定选项。
- 下一题加载失败时保留当前结果并显示错误。
- 目标数量达到后只调用一次 `onContentCompleted`。

adapter 需要继续处理领域错误文案，例如“复习题加载失败”“提交失败”。

## 11. 测试策略

新增或调整前端测试：

1. `ChoiceQuestionFocusTemplate` 渲染材料、题干、选项和元信息。
2. 未选择时提交按钮禁用。
3. 选择后提交调用 `onSubmitAnswer`。
4. 提交结果能标记正确选项和用户错误选项。
5. 提交后选项锁定，并显示下一题按钮。
6. 下一题重置选择和结果。
7. 空内容状态调用 `onContentCompleted`，且只调用一次。
8. `disabled` 时交互全部禁用。
9. ERC Review adapter 仍调用 `fetchERCReviewNext`、`submitERCReview`，并在目标题数达到后发出正确 progress snapshot。

验证命令：

- `cd frontend && pnpm check`
- `cd frontend && pnpm test -- --maxWorkers=1`

## 12. 第一版交付范围

第一版只交付选择题模板和 ERC 错题复习迁移。

完成后应满足：

- 用户进入 ERC 错题复习时界面基本不变。
- 代码中选择题通用 UI 从 ERC 领域逻辑中抽离。
- 后续新子应用可以通过 adapter 复用选择题专注模板。
- ERC 真题练习仍保持现有行为，不因本次抽象被迫重构。
