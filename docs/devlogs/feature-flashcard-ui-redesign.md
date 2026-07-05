# 开发日志：feature/flashcard-ui-redesign

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-07-05 10:01 · 5a95f78 · feat(frontend): add workflow settlement clear hero asset

- 提交哈希：`5a95f78450e0d1578cbc79afdb1cda501e4c958b`

- 用户提出的需求：
  - "这个结算弹窗太丑了，我重新设计了一版，你看看怎么样？后端要不要加东西？尽可能不要动后端。"
  - "要视觉化通关。你看看你这个背景就不怎么好看，你可以截图自己看一下。"
  - "你可以给我一个提示词，我去帮你生图。"
  - 用户提供生成后的通关背景图，并要求："好，提交代码吧"

- 本次完成的工作：
  - 将用户生成的通关背景图压缩为 `frontend/public/images/workflow-settlement-clear.webp`，用于工作流结算弹窗的视觉化通关 hero。
  - 补充 `WorkflowSettlementModal.test.tsx`，覆盖小于 1 分钟的工作流结算时长展示，避免历史记录显示空时长。
  - 保持结算弹窗继续使用现有 `WorkflowSettlement` DTO；本次视觉接入不新增后端字段。

- 验证情况：
  - `cd frontend && pnpm test -- WorkflowSettlementModal.test.tsx` — 通过
  - `cd frontend && pnpm exec eslint src/components/focus-work/WorkflowSettlementModal.tsx src/components/focus-work/WorkflowSettlementModal.test.tsx` — 通过
  - `cd frontend && pnpm exec tsc --noEmit --pretty false` — 通过
  - in-app browser 桌面截图验证结算弹窗；390px 窄屏视口验证布局无明显挤压

### 2026-07-05 · 5df46ac1 · feat(frontend): 登录页改版与图形验证码

- 用户提出的需求：
  - "看看登录页面，我想修改成这样，功能不变"
  - "不行，背景图用我这个，覆盖整个页面"
  - "左上角的图标用这个项目的Logo"
  - "左上角的文案更改一下：莫宁改成Ark，你的AI学习伙伴改成及时反馈你的每一个学习"
  - "登录注册是不是要用到验证码机制，防止高频操作"
  - "然后是登录卡片，在切换登录注册的时候，它的高度会发生比较剧烈的改变，看上去很不顺畅"
  - "固定高度，注册部分内容较多，都无法完全显示了"
  - "总感觉怪怪的，我还是觉得两个卡片可以不同高度，但是切换要有过渡动画"
  - "下面的其他方式登录，明明不支持还是删掉这些吧"

- 本次完成的工作：
  - 登录页全新设计：全屏背景图、左侧品牌展示区（Logo + Slogan + 三大特性卡片）、右侧毛玻璃登录卡片
  - 新增图形验证码模块：后端 `captcha_service.py` 生成图片验证码，注册必输、登录失败后自动显示
  - 登录/注册/找回密码三模式切换：高度平滑过渡（`useLayoutEffect` 测量 + `transition: height`）+ 内容交叉淡入淡出
  - 移除未实现的第三方登录入口（Google / GitHub / 更多）

- 验证情况：
  - `cd frontend && pnpm check` — TypeScript 检查通过
  - 共修改/新增 7 个文件：`Login.tsx`、`Login.test.tsx`、`index.css`、`login-bg.png`、`captcha_service.py`、`auth_routes.py`、`pyproject.toml`

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
