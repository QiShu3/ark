# 开发日志：feature/erc-focus-work-refactor

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-04 19:12 · 5aede74 · fix(frontend): remove return to home button and fix completion button hover style in practice mode

- 用户提出的需求：
  - 去掉返回主页button，标记为今日任务已完成 该button 在悬浮态时背景变成黑色，但是文字没有变色，导致可读性差

- 本次完成的工作：
  - **前端**：移除 `ERCPracticeFocusWork.tsx` 真题练习完成页的“返回阅读主页”按钮。
  - **前端**：修改“标记今日真题任务为已完成”按钮的悬浮态（Hover）样式，移除原本的 `hover:bg-[var(--focus-work-surface-soft)]`（该变量由于在暗色主题下为近乎透明的白色，在白色按钮上会导致覆盖出黑色块效果且文字仍是深色，极难辨认），更换为平滑的 `hover:opacity-90` 透明度过渡动画，确保在任何主题色下悬浮文字依然百分之百清晰可读。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅

### 2026-06-04 19:07 · d7f59c8 · fix(frontend): make Attempt Summary card flex and scrollable in practice mode

- 用户提出的需求：
  - 你看看是不是显示不完全，但是已经滑不下去了，怎么回事？（解决真题练习提交后的 Attempt Summary 卡片底部被裁切、按钮无法显示且无法滚动的 Bug）

- 本次完成的工作：
  - **前端**：在 `ERCPracticeFocusWork.tsx` 中，将 Attempt Summary `section` 配置为弹性布局容器（`flex flex-col min-h-0 flex-1`），并为头部与底部控制栏添加 `shrink-0`。
  - **前端**：将中间的题目结果列表的 `max-h-[50vh]` 升级为 `flex-1 min-h-0` 结合 `overflow-y-auto`，使得 Attempt Summary 卡片整体高度适配屏幕剩余空间，内部题目列表支持完美滚动，底部“标记今日真题任务为已完成”和“返回阅读主页”按钮重归可见且不会被截断。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅

### 2026-06-04 18:57 · 287d0bb · feat(frontend): remove go-to-library button and add a beautiful completed task modal

- 用户提出的需求：
  - 先去掉功能二（进入题库按钮）。然后 功能一（完成今日复习按钮），我想出现一个好看的弹窗提示该任务完成了，你有什么想法吗？

- 本次完成的工作：
  - **前端**：在 `ERCReviewFocusWork.tsx` 的“暂无到期复习”空状态卡片中移除了“进入题库”的链接按钮。
  - **前端**：在 `ERCReviewFocusWork.tsx` 中引入了 `AppModalFrame` 全局弹窗组件和 `Trophy` 奖杯图标。
  - **前端**：添加了 `showFinishModal` 弹窗展示状态。当用户点击“完成今日 ERC 复习”时，弹出一个精心设计的、符合项目整体磨砂玻璃美学的“今日复习已圆满完成！”打卡弹窗，弹窗内含闪烁跳跃的翡翠绿奖杯图标、祝福语、以及“再看看”与“好的，返回”两个操作按纽。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅

### 2026-06-04 18:49 · 0cbd8f7 · feat(frontend): highlight option cards with success/error themes after submission and remove result banner

- 用户提出的需求：
  - A方案：直接在选项框上高亮正确/错误颜色（取消提示 Banner）

- 本次完成的工作：
  - **前端**：在 `index.css` 的 focus-work 样式部分，为深色模式与浅色模式分别定义了 `--focus-work-rose-bg/border/text` 错误反馈自定义 CSS 变量，确保主题风格完美适配。
  - **前端**：在 `ERCReviewFocusWork.tsx` 中，完全重构了选项渲染样式逻辑。在用户提交答案后，直接通过红绿主色调对选项进行标识，答对显示为绿色，答错则用户选项显示为红色、正确答案显示为绿色，其它选项则自动半透明虚化。
  - **前端**：移除了原本显示在底部的正确/错误提示 Banner，既节省了纵向高度，又彻底解决了在提示 Banner 浮现时强行压缩选项卡片高度导致选项卡发生形变的体验问题。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅

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
