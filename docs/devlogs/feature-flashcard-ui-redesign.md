# 开发日志：feature/flashcard-ui-redesign

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-07-03 22:50 · 1422c08 · style(frontend): 优化选择题专注工作界面布局

- 用户提出的需求：
  - "看看这个页面的布局，介绍一下，我对其不怎么满意。"
  - 确认 5 个问题后，用户决定：结构保留、Current Question 改"选项"、提交按钮位置保留、进度移到标题右边、去掉上方卡片 header
  - "两张卡片在左右分栏时，上下滑动的话两张卡片就会一起滑动...我希望这两张卡片的高度是和专注工作栏高度一致的，只是内部可以滑动"
  - "把选项卡片中的提交按钮Button放在右下角吧，然后去掉Header栏"

- 本次完成的工作：
  - 选择题选项区域标题从英文 "Current Question" 改为中文 "选项"
  - 移除左侧题目/阅读材料卡片的 header 区域（书本图标、标题、进度徽章）
  - 进度徽章（题目 X/Y）移到外层弹窗标题右侧，通过新增的 `FocusWorkHeaderRightContext` 实现内层组件向外层 shell 注入内容
  - 提交/下一题按钮从选项卡片顶部移到底部右下角，按钮样式统一为蓝色实心
  - 移除选项卡片的 header 区域（"选项"标题行）
  - 修复左右分栏下两张卡片联动滚动问题：choice 模式容器改为 `flex h-full flex-col`，两张卡片各自撑满高度并独立滚动
  - 清理未使用的 import（`BookOpen`、`BarChart3`、`metaClass`）

- 验证情况：
  - `cd frontend && pnpm check` — TypeScript 检查通过
  - 共修改 4 个文件：`FocusWorkModalShell.tsx`、`FocusWorkProvider.tsx`、`UnifiedFocusWork.tsx`、`ChoiceQuestionFocusTemplate.tsx`
