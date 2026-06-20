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
