# 开发日志：feature/erc-focus-work-refactor

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-04 18:43 · 21bd901 · feat(frontend): move submit and navigation buttons to top-right of question card

- 用户提出的需求：
  - 把 提交答案 和上下一题放在右上角吧

- 本次完成的工作：
  - **前端**：在 `ERCPracticeFocusWork.tsx` 和 `ERCReviewFocusWork.tsx` 中，将“上一题”、“下一题”和“提交答案”按钮从底部操作栏整体移至 Current Question Card 的右上角头部。
  - **前端**：将 `ERCPracticeFocusWork.tsx` 的“标记本题”和“查看解析”也集成到同一个右上角 flex 操作按钮组中，并以竖线分隔，以实现极佳的视觉紧凑度和布局对齐。
  - **前端**：移除原本在底部渲染的 `border-t pt-4` 按钮操作栏，使题目卡片的高度极大缩短。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅

### 2026-06-04 16:57 · a082200 · style(frontend): reduce option heights and remove highlight hint in ERC focus work

- 用户提出的需求：
  - 1. 去掉”相关段落已高亮，帮助你定位答案“的提示
  - 2.降低 题目选项 的高度

- 本次完成的工作：
  - **前端**：移除 `ERCPracticeFocusWork.tsx` 和 `ERCReviewFocusWork.tsx` 中“相关段落已高亮，帮助你定位答案”的提示文本与 Sparkles 图标。
  - **前端**：调整两处专注工作（Practice & Review）中题目选项按钮的样式，高度自 `min-h-[3.2rem]` 降至 `min-h-[2.5rem]`，内边距自 `py-2.5` 缩减至 `py-1.5`，使题目选项高度显著降低，从而更加紧凑。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
