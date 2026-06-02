# codex/home-ui-glass-dashboard

## 2026-06-02 09:47 CST · `c4be299` · fix(frontend): resize focus-work panel to match ark-page shell frame

### 用户提出的需求

- "调整 focus-work 的弹窗大小，大小比 div 小一小圈"
- "是变大啊，大到和 ark-page 一致"
- "也不是完全一致，还是要小一点点"
- "内缩16px吧"
- "专注工作面板的背景调整为不透明的"
- "初始状态太靠下了 div 往上移动，差不多靠近上边框"
- "提前10px消失"

### 本次完成的工作

- 将 focus-work 全屏面板从居中小卡片改为贴近 ark-page 的大面板，四周内缩 16px。
- 面板背景从半透明改为不透明（暗色 rgb(8,11,16) / 亮色 rgb(248,250,252)）。
- 所有 ERC/Vocab 页面的滚动容器添加 clip-path: inset(10px round 28px)，使内容提前 10px 被裁切。
- 所有 ERC/Vocab 页面的顶部内边距从 pt-32 改为 pt-6，内容初始位置靠近上边框。

### 验证情况

- `pnpm check` 通过

## 2026-06-01 20:38 CST · `78ffa79` · fix(frontend): align erc vocab shell

### 用户提出的需求

- “`div` 这个在往下滑动的时候怎么溢出 `div` 了？”
- “那怎么办？”
- “你改了哪些页面？只改ERC和Vocab就可以了，其他地方不要改”

### 本次完成的工作

- 仅调整 ERC 与 Vocab 子应用页面容器，让页面根容器与外层壳体使用同一组可视区域：`inset-x-1 bottom-1 top-[7.5rem]`。
- 为 12 个 ERC/Vocab 页面根容器补上 `fixed` 定位、内部纵向滚动和 `rounded-[28px]`，避免滚动内容在视觉上溢出背景框。
- 保持改动范围只在 `frontend/src/pages/ERC/` 与 `frontend/src/pages/Vocab/`，没有把首页、应用中心和认证壳层改动带入本次代码提交。

### 验证情况

- `pnpm check`

---

## 2026-06-01 · `e47e0de` · fix(frontend): 修复页面内容被导航栏遮挡 + 优化应用中心页面设计

### 用户提出的需求

- "h1 这段文字被导航栏挡住了"
- "这个应用中心页面很丑，你看看怎么优化一下？"

### 本次完成的工作

- 将所有 13 个页面的 `pt-20`（80px）改为 `pt-32`（128px），解决导航栏遮挡问题。
- AppCenter 页面重写：使用 `ark-home-shortcut-card` 快捷入口样式，Lucide 图标（BookOpen、ScrollText）替代文字符号，添加副标题和响应式网格。

### 验证情况

- `pnpm check` — 通过
- `pnpm lint` — 0 错误

---

## 2026-06-01 03:38 CST · `f9adc69` · feat(frontend): polish home glass dashboard

### 用户提出的需求

- “看看这个，我想把 UI/UX 改成这样”
- “先不考虑主题，先把布局搞定”
- “背景图只占了左侧”“左右侧面板不是占满的”
- “角色对话栏和原型图也不一致，改一下，最好一模一样”
- “右侧内容和原型图对齐”
- “调整一下右侧比例 当前阶段 : 今日进度 : 今日任务 : 日历 : 底部入口 = 1.25 : 0.85 : 1.15 : 1.7 : 1”
- “全局背景也设计出圆角矩阵…用细白色的边栏包围整个页面”

### 本次完成的工作

- 将首页改为带留边的左右分栏布局，左侧承载背景图、人物和亚克力对话栏，右侧替换为新的 `HomeRightDashboard`。
- 重做右侧仪表盘结构：当前阶段、今日进度、今日任务、日历、底部三个入口，并按 `1.25 : 0.85 : 1.15 : 1.7 : 1` 分配纵向比例。
- 统一玻璃拟物卡片边框、投影、内高光和背景模糊层级，减少硬灰蓝描边。
- 优化日历、导航栏、用户头像菜单、角色位置、对话栏尺寸和透明度。
- 为主内容区添加不包含导航栏的页面级圆角底板，保持四边 8px 间距，并设置 5px 细白色边框。

### 验证情况

- `pnpm check`
- `pnpm test -- src/components/__tests__/HomeLayout.test.tsx src/components/__tests__/RightPanel.test.tsx src/components/__tests__/CalendarWidget.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/PlaceholderCard.arrangements.test.tsx src/components/__tests__/PlaceholderCard.taskAssistant.test.tsx --run`
- 使用 in-app Browser 复查首页布局、右侧比例、页面级圆角底板边距与 5px 白色边框。
