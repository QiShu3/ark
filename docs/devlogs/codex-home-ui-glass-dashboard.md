# codex/home-ui-glass-dashboard

## 2026-06-02 11:14 CST · `256bf8436fe71551fc8381ef026ddef70c19bae2` · style(frontend): align erc focus work prototype

### 用户提出的需求

- "这是新的设计稿原型图，我希望可以和他保持一致。"
- "我希望内容可以在一页中固定呈现，你看看选项的下方的提交答案这一栏都在下方需要滚动了，可读性较差"
- "连接处奇怪的阴影是什么？"
- "为什么有一部分被划起来了？"
- "[favicon.png](frontend/public/favicon.png) 左上角的icon添加回到首页的功能，并且把这个图标换成这个icon"
- "这里也有类似的问题"

### 本次完成的工作

- 将 ERC 真题专注工作从左右分栏题单改为设计稿中的全宽阅读区 + 固定底部当前题卡结构。
- 让阅读文章区域内部滚动，题目选项、上一题/提交答案/下一题控制固定在同一屏内。
- 去除阅读卡和题卡连接处叠加阴影，避免固定布局下出现脏边。
- 将“定位依据句”高亮改为用户点击后显示，默认不再自动划出一段文本。
- 将导航栏左上角 logo 改为 `frontend/public/favicon.png`，并添加点击返回首页能力。
- 优化子应用托管安排和首页安排总览里的 ready/完成任务等状态胶囊对比度，改善日间模式可读性。
- 延续子应用首页模板调整：进度环、指标 chips、托管安排时间线和 Vocab 词书进度分段条。

### 验证情况

- `pnpm check` 通过（仅有 Node 22 与项目期望 Node 20.x 的 engine warning）
- `pnpm test Navigation` 通过，7 个测试通过
- `pnpm test PlaceholderCard.arrangements` 通过，12 个测试通过
- in-app Browser 复查 ERC 真题专注工作：阅读区、当前题卡和提交控制可在同一屏固定呈现；左上角 favicon logo 可从 `#/erc` 跳回 `#/`
- in-app Browser 复查安排总览：日间模式下“完成任务”胶囊使用更清晰的文字、边框和背景对比度

## 2026-06-02 10:22 CST · `1f82d9f` · style(frontend): differentiate subapp home sections

### 用户提出的需求

- "先讨论一下，直到我说让你改代码。我觉得不同的板块的颜色太过相近了，不好区分，看上好累"
- "OK，开干吧"

### 本次完成的工作

- 为子应用首页新增三组语义色层级：今日工作台沿用主蓝色、长期积累使用青绿色、托管安排使用琥珀色。
- 在 `index.css` 中增加 `--ark-learning-*` 与 `--ark-arrangement-*` theme token，并新增对应的模板/卡片/空状态 CSS 类。
- 将共享 `SubAppHomeTemplate` 的 Hero、指标条、长期积累标题接入新的语义色样式。
- 将 Vocab/ERC 长期积累卡片改为青绿色 tint，将 `SubAppArrangements` 改为琥珀 tint，减少板块之间的视觉同质感。

### 验证情况

- `pnpm check` 通过（仅有 Node 22 与项目期望 Node 20.x 的 engine warning）
- `pnpm test -- src/pages/Vocab/__tests__/Home.test.tsx src/pages/ERC/__tests__/Home.test.tsx --run` 通过
- `pnpm lint` 通过，保留仓库既有 8 条 hook dependency warnings
- in-app Browser 通过 DOM/computed style 复查 `#/vocab`：Hero、长期积累、托管安排已分别应用蓝/青绿/琥珀语义样式；当前专注工作弹窗覆盖页面，未强行关闭

## 2026-06-02 10:12 CST · `429a1ca` · refactor(frontend): refresh subapp home template

### 用户提出的需求

- "那把范围放大到更改这个子应用首页模板的美学设计上吧，你觉得要怎么改比较好呢？"
- "好，先看看当前git工作区，在干活前先提交代码吧"

### 本次完成的工作

- 新增共享 `SubAppHomeTemplate`，统一 ERC/Vocab 子应用首页的页面外壳、今日工作台 Hero、指标条、长期积累区和配置入口。
- 将 Vocab 首页从“总览 / 业务数据”面板重构为“今日单词任务 + 长期积累”，保留词书进度明细弹窗和托管安排行为。
- 将 ERC 首页接入同一模板，突出“今日优先任务”、历史正确率、题库进度、错题资产和推荐练习。
- 更新 Vocab/ERC 首页测试断言，使测试覆盖新模板语义和原有配置、初始化、启动专注工作行为。

### 验证情况

- `pnpm check` 通过（仅有 Node 22 与项目期望 Node 20.x 的 engine warning）
- `pnpm test -- src/pages/Vocab/__tests__/Home.test.tsx src/pages/ERC/__tests__/Home.test.tsx --run` 通过
- `pnpm lint` 通过，保留仓库既有 8 条 hook dependency warnings
- in-app Browser DOM 复查 `#/vocab` 新模板已渲染；当前有专注工作弹窗覆盖，未强行关闭以免影响用户状态

## 2026-06-02 10:01 CST · `59e94a0` · fix(frontend): prevent home dashboard list overflow

### 用户提出的需求

- "好，先看看当前git工作区，在干活前先提交代码吧"

### 本次完成的工作

- 提交当前工作区中已有的首页右侧仪表盘改动。
- 将任务行与日程行拆成可复用渲染函数，供实际展示和隐藏测量共用。
- 为任务列表和日程列表加入 ResizeObserver 高度测量，在空间不足时从 3 条切换到 2 条，避免卡片内容溢出。

### 验证情况

- `pnpm check` 通过（仅有 Node 22 与项目期望 Node 20.x 的 engine warning）

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
