# fix/choice-submit-result-reset

## 修复：选择题提交后结果状态被 useEffect 误重置

**用户请求**：启动 test-focus 页面的"测试 408-2020"专注工作，测试选择题答题→提交流程是否正常运行。

**提交**：`d008ff42`

**问题现象**：在 test-focus 页面选择选项并点击"提交答案"后，API 请求返回 200 且数据正确，但 UI 没有任何反馈——选项没有绿色/红色标注、没有"下一题"按钮、没有解析展示。

**根因分析**：
- `ChoiceQuestionFocusTemplate.tsx` 的 `useEffect` 依赖数组为 `[item?.id, item]`
- 父组件 `ERCPracticeFocusWork` 每次渲染通过 `choiceItemToChoiceQuestion()` 创建新的 item 对象
- 提交答案后父组件 `setCompletedQuestionCount` 等状态更新触发重渲染 → 新 item 引用 → `useEffect` 误触发 → `setResult(null)` + `setSelected(null)` 清空了答题结果

**修复**：将 `useEffect` 依赖从 `[item?.id, item]` 改为 `[item?.id]`，只在题目 ID 真正变化时重置状态。

**验证**：在浏览器中重新启动"测试 408-2020"专注工作，选择 C 选项提交后，正确显示绿色高亮和"下一题"按钮。

---

## 修复：真题练习题目进度标签显示全局索引

**用户请求**：修复"题目 1/1"始终显示的问题——专注工作不止一道题，应显示全局进度。

**提交**：`c631eaec`

**问题现象**：真题练习界面右上角的 meta 标签始终显示"题目 1 / 1"，即使本次专注工作包含 40 道题。

**根因分析**：
- `choiceItemToChoiceQuestion` 使用 `questionIndex + 1 / item.question_count` 作为进度标签
- 对单题 item（`question_count = 1`），始终显示 "题目 1/1"
- 缺少跨 item 的全局题号概念

**修复**：
- 新增 `computeGlobalQuestionIndex` 辅助函数，累加当前 item 之前所有 item 的 `question_count` 再加上本地 `questionIndex`
- `choiceItemToChoiceQuestion` 新增可选参数 `globalIndex` 和 `globalTotal`
- 三个调用点（渲染时、同 item 下一题、跨 item 下一题）均传入全局索引和总数

**验证**：浏览器测试 408-2020 真题练习，第一题显示"题目 1 / 40"，提交后翻页显示"题目 2 / 40"。

---

## 移除真题练习头部冗余的年份和科目标签

**用户请求**：去掉真题练习头部显示的 "2020" 和 "408" 两个标签。

**提交**：`5cf075d8`

**问题现象**：真题练习头部同时显示 heading（"2020年 数据结构 第1题"）、subtitle（"2020 408"）和 meta tag 标签（"408"），信息冗余。

**修复**：
- 移除 `ChoiceQuestionFocusTemplate` 中 subtitle 的渲染（heading 已包含完整信息）
- 移除 `choiceItemToChoiceQuestion` 中将 tag 推入 meta 数组的代码

**验证**：浏览器检查 meta 区域只剩 "题目 1 / 40"，"2020" 和 "408" 均已移除。

---

## 移除题目区域中间的 numberLabel 徽章

**用户请求**：去掉 "Current Question" 标题旁的 #417 标签。

**提交**：`6a288ae0`

**问题现象**：题目区域 header 中间显示 `#417` 等序号徽章（来自 `item.sort_order`），与 meta 区域的 "题目 X / Y" 信息重复。

**修复**：移除 `ChoiceQuestionFocusTemplate` 中渲染 `currentItem.numberLabel` 的绝对定位 div。

**验证**：文档提交，无额外代码验证（TypeScript 编译通过）。
