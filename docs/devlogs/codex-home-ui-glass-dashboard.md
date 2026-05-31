# codex/home-ui-glass-dashboard

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
