# 开发日志：feature/erc-focus-work-refactor

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-05 15:05 · 102cb69 · refactor(frontend): use '下一阶段：' prefix for next task display in active timer card

- 用户提出的需求：
  - 去掉 （n分钟）吧，不太好看
  - 下个任务： 也太口语化了，有没有更好的呢？先不改代码，回答我的问题。
  - 这个改一下吧，把下一阶段放到这里

- 本次完成的工作：
  - **前端**：修改 `HomeRightDashboard.tsx`，将激活状态下倒计时卡片显示的 `"下个任务："` 前缀变更为更加严谨书面的 **`"下一阶段："`**。
  - **前端**：移除了下个专注任务名称后的 `(n分钟)` 持续时间括号后缀。
  - **单元测试**：同步修改 `HomeRightDashboard.test.tsx` 中的断言，改为检验是否渲染了 `"下一阶段：ERC 真题练习"`。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `pnpm test` — 52 个测试文件、236 个测试用例全部成功通过 ✅

### 2026-06-05 11:48 · 9e08705 · feat(frontend): display next focus task and duration in active timer card

- 用户提出的需求：
  - 我希望在 专注过程或者休息过程中 显示下一个阶段的专注任务内容
  - 在进入工作流后，直接不显示倒计时数字（如 95:45），将它们替换为下个任务的信息（这会导致专注/休息时看不到具体的剩余秒数）。
  - 需要显示时间，例如：“今日单词 (20分钟)”或“首次推进 (25分钟)”。
  - 当进入工作流的最后一个专注任务（后面没有更多专注任务）时，提示文案：“无后续任务”。

- 本次完成的工作：
  - **前端**：在 `HomeRightDashboard.tsx` 中，利用 `useMemo` 添加了 `nextFocusTaskLabel` 决策器。它会在工作流激活（专注或休息中）时向前扫描 `workflow.phases`，查找下一个类型为 `focus` 的阶段，解析出其对应的任务标题或特殊专注类型名称，并拼装上它在工作流中的时间（分钟）。
  - **前端**：如果在工作流后方没有更多的专注阶段，它会回退并返回 `"无后续任务"`。
  - **前端**：修改计时卡片布局，当工作流激活时，在中间原倒计时数字位置直接隐藏倒计时（如 `95:45`），替换渲染为中等高度字体的下个任务名称（`“下个任务：{nextFocusTaskLabel}”`），防止超长文本溢出。当工作流未激活时，照常显示大号字体的 `00:00` 倒计时数字。
  - **单元测试**：在 `HomeRightDashboard.test.tsx` 中针对激活状态下的测试补充断言：检验 `"下个任务：ERC 真题练习 (25分钟)"` 是否渲染在屏幕上，以及倒计时数字是否已经正确被隐藏。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `pnpm test` — 52 个测试文件、236 个测试用例全部成功通过 ✅

### 2026-06-05 11:36 · 2561e82 · fix(frontend): adjust grid rows and card paddings to prevent clipping of workflow chips

- 用户提出的需求：
  - 100% 的情况今日进度没有完全显示工作流进度条

- 本次完成的工作：
  - **前端**：将仪表盘的全局行高度比例网格从 `grid-rows-[1.25fr_0.8fr_1.1fr_1.9fr_0.9fr]` 调整为 `grid-rows-[1.25fr_0.9fr_1.1fr_1.8fr_0.9fr]`，分给今日进度卡片更多垂直空间，日历卡片占比微降。
  - **前端**：将今日进度卡片内边距从 `py-3` 减少为 `py-2.5`。
  - **前端**：将工作流阶段芯片容器的顶部外边距从 `mt-3.5` 改为 `mt-2`，并将垂直内边距从 `py-1` 减少为 `py-0.5`，确保 100% 缩放比例时工作流进度条（芯片）完整可见、不被底层切割。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `npx vitest run` — 52 个测试文件、236 个测试用例全部通过 ✅

### 2026-06-05 11:32 · 93e0918 · fix(frontend): improve readability and visual aesthetics of achievement modal and cards

- 用户提出的需求：
  - 这是 成就部分 的弹窗，可读性较差

- 本次完成的工作：
  - **前端**：修改 `index.css`，新增 `.achievement-card` 及其子状态样式类（`.achievement-card-locked`、`.achievement-card-in-progress`、`.achievement-card-unlocked-event`、`.achievement-card-unlocked-global`）。这些样式摒弃了原有的硬编码 hex 背景与透明度降低带来的对比度低下问题，采用语义化变量和优雅的渐变高亮样式，并精细适配了暗夜与日间两种主题。
  - **前端**：新增进度条专用样式类 `.achievement-progress-track`、`.achievement-progress-fill-event` 与 `.achievement-progress-fill-global`，使用柔和的发光效果和主题变量指示，极大提升可读性。
  - **前端**：重构 `AchievementBadgeCard.tsx`，采用新定义的 CSS 样式，并添加了三类状态的 SVG 图标：已解锁（Trophy 奖杯）、进行中（Target 靶心）、未解锁（Lock 锁），去除了此前对未解锁卡片应用全局 `opacity-60` 导致内部文字对比度过差的问题。当已达成时，显示“已达成”替代百分比。
  - **前端**：重构 `AchievementModal.tsx`，将主体容器宽度从 `w-[920px]` 宽展至 `w-[960px]` 并微调内边距为 `p-6 md:p-8`；将关闭按钮替换为更现代的 SVG 图标；将两处成就大节标题调整为带左侧彩色标线（`border-l-4`）的高级排版；修改分类选择按钮在选中态与 hover 态下的缩放和光影过渡；修改卡片列表容器网格为更具响应式的 `sm:grid-cols-2 lg:grid-cols-3` 结构。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `pnpm test` — 52 个测试文件、236 个测试用例全部成功通过 ✅

### 2026-06-05 11:29 · 51b620b · fix(frontend): adjust timer card padding and height to prevent text clipping at 100% zoom

- 用户提出的需求：
  - 前者是在浏览器中缩放为 100% 时的截图 ，后者是 90% ，你有发现什么吗？在得到我的许可前不要改代码

- 本次完成的工作：
  - **前端**：修改 `HomeRightDashboard.tsx`，将倒计时卡片（`HomeCard variant="hero"`）的内边距自 `px-6 py-5` 缩减为 `px-6 py-4`。
  - **前端**：将卡片内部弹性盒容器的最小高度从 `min-h-[150px]` 降低为 `min-h-[120px]`。
  - **前端**：将“当前工作流：”提示文本的顶部外边距从 `mt-5` 压缩至 `mt-2`，以节省垂直空间，彻底解决在小屏幕/100%缩放比例下，因为卡片物理分配高度受限且带有 `overflow-hidden` 而导致的底部文字被截断、不可见 Bug。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `npx vitest run` — 52 个测试文件、236 个测试用例全部通过 ✅

### 2026-06-05 11:14 · a70774d · feat(frontend): unify empty states for tasks and schedules with card layout and icons

- 用户提出的需求：
  - 再看看 ，怎么显示逻辑不一样 (选择方案 A 将任务与日程的空状态统一为卡片样式)

- 本次完成的工作：
  - **前端**：修改 `HomeRightDashboard.tsx`，将日程 (Schedules) 的空状态也改造成与任务 (Tasks) 相同的毛玻璃边框背景卡片样式 (`ark-home-empty-task`)，并补充了左侧日历图标 (`Calendar`) 占位与统一的提示文案 `"暂无近期日程"` / `"点击右上角安排今日日程"`。
  - **前端**：优化了任务空状态的图标，由原来存在双层圆圈视觉缺陷的 `<Circle />` 图标更新为更能代表任务列表特征的 `<ListTodo />` 图标，消除视觉违和感。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `pnpm test run` — 52 个测试文件、236 个测试用例全部通过 ✅

### 2026-06-05 11:07 · 5de2cb3 · feat(frontend): remove 'View Full Entry' link from vocab today focus work


- 用户提出的需求：
  - 去掉 背单词 专注工作 的 查看完整词条 功能

- 本次完成的工作：
  - **前端**：修改 `VocabTodayFocusWork.tsx`，移除了背单词专注学习/复习卡片底部的“查看完整词条”链接。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `pnpm test run` — 52 个测试文件、236 个测试用例全部通过 ✅

### 2026-06-05 11:05 · 0643b88 · feat(frontend): display active or default workflow name in dashboard timer card

- 用户提出的需求：
  - 将 今日目标 120 分钟 的显示 改成为 当前工作流：默认工作流名字 (去掉书名号《》)

- 本次完成的工作：
  - **前端**：修改 `HomeRightDashboard.tsx`，在组件加载时（`loadDashboard`）一并拉取 `/todo/focus/workflows` 预设列表。
  - **前端**：根据状态动态计算当前工作流名称（未激活时取 `is_default` 标记的默认模板名，激活时取 `workflow.workflow_name`），并将计时器卡片中原固定文案 `今日目标 120 分钟` 变更为 `当前工作流：{currentWorkflowName}`。
  - **单元测试**：在 `HomeRightDashboard.test.tsx` 模拟接口拦截中补充对 `/todo/focus/workflows` 请求的响应逻辑，并更新初始状态及激活状态下的工作流名称文案断言。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `pnpm test run` — 52 个测试文件、236 个测试用例全部通过 ✅

### 2026-06-05 10:55 · 49f571f · fix(frontend): append trailing slash to admin page redirection URL

- 用户提出的需求：
  - 后端报错了，看看什么问题 INFO: 127.0.0.1:51043 - "GET /todo/focus/workflow/current HTTP/1.1" 200 OK INFO: 127.0.0.1:51054 - "GET /admin HTTP/1.1" 307 Temporary Redirect INFO: 127.0.0.1:51060 - "GET / HTTP/1.1" 404 Not Found

- 本次完成的工作：
  - **前端**：将 `Navigation.tsx` 中“管理页面”的跳转链接从 `/admin` 调整为 `/admin/`（补齐末尾斜杠）。
  - **原因分析**：没有斜杠访问 `/admin` 时，FastAPI 后端 `StaticFiles` 会发起 307 重定向。由于 Vite 代理配置 `changeOrigin: true`，后端在重构重定向目标时，将其指向了后端端口 `localhost:8000/admin/`，使得浏览器跳出了 Vite 开发端口 `localhost:5173`。跳出后，在 `localhost:8000` 域名下因无法读取前端 `localhost:5173` 域下的 localStorage `ark-auth` 用户信息，触发了 `app.js` 的未登录校验保护，被进一步重定向到 `/#/`，造成后端 404。通过补齐斜杠，直接请求 `/admin/`，避开了重定向，从而使端口和登录状态保持在 `5173` 前端域名下。
  - **单元测试**：同步修改 `Navigation.test.tsx` 中的断言以适配带斜杠路径 `/admin/`。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `pnpm test run` — 52 个测试文件、236 个测试用例全部通过 ✅

### 2026-06-05 10:52 · 6d56b0f · feat(frontend): add admin page redirect option in user profile dropdown menu

- 用户提出的需求：
  - 这个下拉菜单面板我想新增一个 管理页面 选项，只有管理员才可以看到这个选项

- 本次完成的工作：
  - **前端**：在导航栏 `Navigation.tsx` 用户菜单下拉框中，为管理员用户（`user.is_admin === true`）在“UI 组件库”上方新增了“管理页面”选项。
  - **前端**：使用 Lucide 图标库中的 `LayoutDashboard` 仪表盘图标，并在点击时在当前标签页中重定向至独立静态管理面板路径 `/admin`。
  - **单元测试**：在 `Navigation.test.tsx` 中新增测试用例，覆盖非管理员不可见、管理员可见且点击正确重定向到 `/admin` 的行为；同时修复了 `AchievementModal.test.tsx` 和 `Navigation.test.tsx` 中的 TypeScript 类型编译错误，确保 `pnpm check` 顺利编译通过。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `pnpm test run` — 52 个测试文件、236 个测试用例全部通过 ✅

### 2026-06-04 21:15 · 7e47f48 · refactor(frontend): simplify ERC page layout and clean up test assertions

- 用户提出的需求：
  - ERC (阅读训练) 页面主布局 有多个配置按钮，我觉得功能有点冗余，你有什么想法吗？

- 本次完成的工作：
  - **前端**：将 ERC 页面右上角的全局配置 (齿轮) 按钮移至子应用标题卡片中，并相应移除了“长期积累”栏目里冗余的 inline 配置按钮。
  - **前端**：当今日所有的已启用阅读任务全部完成时，将 Today Workspace 卡片中的“开始专注”/“继续专注”按钮置灰，并标记为“今日任务已全部完成”。
  - **前端**：对“托管安排”卡片中的任务列表进行了简化，隐藏了已完成、未启用、被阻碍及未配置任务的 inline 配置按钮（仅在 `ready` 状态显示“开始”/“继续”按钮，在 `uninitialized` 状态显示“初始化”按钮），最大程度减少主页面的视觉干扰与按钮冗余。
  - **单元测试**：全面修复并重构了受影响的单元测试集，包括 `Home.test.tsx`（断言配置按钮数量降为 1）、`PlaceholderCard.workflow.test.tsx`（适配表单简化的输入项名称与三点菜单结构）、`EventCountdownCard.test.tsx` 和 `EventWorkbenchModal.test.tsx`（更新 legacy 字段 `阶段 1 绑定任务` 为 `绑定任务`）以及 `HomeLayout.test.tsx`（补充 `MemoryRouter` 上下文）和 `AchievementModal.test.tsx`（对齐 Unified `AppModalFrame` 重构后的 DOM 节点查询）。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `pnpm test run` — 52 个测试文件、235 个测试用例全部通过 ✅

### 2026-06-04 20:02 · 351ab18 · fix(frontend): refactor ERC settings modal to use unified AppModalFrame to fix top overflow

- 用户提出的需求：
  - 看看这个弹窗，它的位置上面溢出容器了

- 本次完成的工作：
  - **前端**：将 `Home.tsx` 中 ERC 的“配置阅读训练”弹窗重构，采用统一的 `AppModalFrame` 组件进行包裹，取代原先手写的弹窗遮罩及定位逻辑。
  - **前端**：利用 `AppModalFrame` 内置的视口自适应最大高度限制（自动避开导航栏高度 120px 限制并启用滚动），使得该弹窗在小分辨率屏幕上能正确进行内部滚动，完美解决弹窗顶部向上溢出超出屏幕顶部的布局问题。
  - **前端**：保持 `ariaLabel="ERC 配置"` 属性与重构前一致，保证页面测试正常通过。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `pnpm vitest run src/pages/ERC/__tests__/Home.test.tsx` — 测试通过 ✅

### 2026-06-04 19:55 · 9679d96 · feat(frontend): add practice again and prevent duplicate completion conflict in vocab and review focus work

- 用户提出的需求：
  - 防重复打卡冲突与“再来一次”加练 每个子应用配置任务都有吗？ -> 要

- 本次完成的工作：
  - **前端**：在 `VocabTodayFocusWork.tsx` 的今日单词已完成（空状态）页面中，新增 **“再来一次”** 按钮。实现 `handlePracticeAgain` 处理器，从当前词书的所有单词中随机抽取 10 个词，并行拉取详细释义并装入本地加练队列，彻底满足了词书背完后的再来一次加练诉求，不写入后端打卡以防 409 冲突。
  - **前端**：在 `ERCReviewFocusWork.tsx` 中新增 **“再来一次”** 按钮和 **“结束并完成今日任务” / “结束本轮专注”** 按钮。如果进入时已经暂无复习任务（已完成），点击退出按钮将直接调用 `/todo/focus/stop` 结束专注以避免 409 报错；点击“再来一次”将随机加载一篇文章并抽取题目进行本轮加练。加练提交时，不重复结算工作流任务。
  - **前端**：更新了 `VocabTodayFocusWork.test.tsx` 和 `ERCReviewFocusWork.test.tsx` 单元测试，添加了对空状态退出及“再来一次”加练交互流程的覆盖断言，并修复了 `Review.test.tsx` 页面测试中对面板卡片样式的过时类名断言。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `npx vitest run src/components/Vocab/VocabTodayFocusWork.test.tsx` — 测试通过 ✅
  - `npx vitest run src/components/ERC/ERCReviewFocusWork.test.tsx` — 测试通过 ✅
  - `npx vitest run src/pages/ERC/__tests__/Review.test.tsx` — 测试通过 ✅

### 2026-06-04 19:50 · 61d184f · feat(frontend): prevent duplicate completion conflict on vocab today empty page

- 用户提出的需求：
  - 要（将“防重复打卡冲突”的退出逻辑同样引入到“背单词”应用中）

- 本次完成的工作：
  - **前端**：修改 `VocabTodayFocusWork.tsx`，在“今天这本词书的单词已经完成了”状态的空白页面中，将“完成今日单词”按钮的点击事件绑定到了新引入的 `handleExitFocus` 处理器上。
  - **前端**：在 `handleExitFocus` 处理器中，通过 `POST /todo/focus/stop` 结束当前的专注轮次并刷新页面状态。此举避开了再次提交 `completedTask: true` 的重复打卡动作，完美杜绝了当背单词本日已被完成后二次打卡引发的“当前周期已达完成上限”报错。
  - **前端**：更新了 `VocabTodayFocusWork.test.tsx` 单元测试用例，覆盖了空状态渲染与点击完成按钮时对 `POST /todo/focus/stop` 接口调用的断言，并完成了 apiJson 的 mockReset 清理工作。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `npx vitest run src/components/Vocab/VocabTodayFocusWork.test.tsx` — 测试通过 ✅

### 2026-06-04 19:40 · 30257ca · feat(frontend): hide reading passage on practice mode result phase

- 用户提出的需求：
  - 当 答题结束 后应该只出现选项，原文部分消失

- 本次完成的工作：
  - **前端**：在 `ERCPracticeFocusWork.tsx` 中，对 Reading Passage Card 组件块增加 `phase !== 'result'` 的渲染条件判定。当进入 `result`（答题结算）状态时，完全隐藏 Reading Passage 原文部分，使得 Attempt Summary 结果卡片自动撑满屏幕高度，提供更优的错题复盘与浏览视界。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `npx vitest run src/components/ERC/ERCPracticeFocusWork.test.tsx` — 测试通过 ✅

### 2026-06-04 19:31 · 49cfa7c · feat(frontend): add 'Practice Again' button to empty phase in ERC practice focus work

- 用户提出的需求：
  - 在得到我的许可前不要改代码哦，我希望在 结束并完成今日任务 按钮旁边有一个 再来一次 按钮，功能是再来一次任务，但是任务计数不变，你觉得好实现吗？

- 本次完成的工作：
  - **前端**：在 `ERCPracticeFocusWork.tsx` 的今日练习完成（空状态）页面中，新增 **“再来一次”** 按钮。
  - **前端**：实现“再来一次”的点击处理器 `handlePracticeAgain`：调用 `fetchERCArticles()` 接口获取真题列表，随机选择一篇真题，并拉取文章详情与词汇预热。同时，重置答题、选项与结果状态，将阶段转入 preheat/reading，并置 `isExtraPractice` 为 `true`。
  - **前端**：在今日练习已完成状态下，将“结束并完成今日任务”按钮绑定到 `handleExitFocus`，以直接调用 `/todo/focus/stop` 退出专注，彻底修复此状态下打卡触发的“当前周期已达完成上限”报错。
  - **前端**：当处于加练状态 (`isExtraPractice` 为真) 时，在题目做完后的 Result 结算卡片底部仅显示 **“结束本轮专注”** 按钮，点击调用退出专注而不触发打卡计数，以防抛出“当前周期已达完成上限”的报错。
  - **前端**：在 `ERCPracticeFocusWork.test.tsx` 中编写了空状态加练流程的单元测试用例，并处理了 jsdom 缺少 div.scrollTo 函数引发的兼容报错。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `npx vitest run src/components/ERC/ERCPracticeFocusWork.test.tsx` — 测试通过 ✅

### 2026-06-04 19:20 · 9e515e6 · feat(frontend): automatically end current focus round upon task completion

- 用户提出的需求：
  - 我希望在点击“结束并完成今日任务”按钮 后可以自动 结束本轮专注

- 本次完成的工作：
  - **前端**：修改 `FocusWorkProvider.tsx` 中的 `completeTaskAndFinishCurrentFocus` 函数，在成功提交今日任务的结果（调用 `/todo/focus/workflow/focus-work-result` POST）之后，自动调用 `POST /todo/focus/stop` 接口结束当前专注轮次与活动工作流。
  - **前端**：在调用停止专注后，通过 `loadSnapshot()` 重新同步当前工作流快照并派发 `ark:reload-focus` 自定义事件，使得前端能自动、平滑地退回正常面板。
  - **前端**：在 `FocusWorkProvider.test.tsx` 中针对单词任务完成提交的测试案例添加对 `/todo/focus/stop` 接口调用的断言，保证业务流与测试用例一致。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅
  - `npx vitest run src/components/__tests__/FocusWorkProvider.test.tsx` — 测试通过 ✅

### 2026-06-04 19:14 · 6feafe5 · fix(frontend): remove return to home button and fix completion button hover style in empty phase

- 用户提出的需求：
  - 这里也有相同的问题（在今日真题已完成的空状态页面，去掉“返回阅读主页”按钮，并修复“结束并完成今日任务”按钮在悬浮态时背景变暗且文字看不清的问题）

- 本次完成的工作：
  - **前端**：移除 `ERCPracticeFocusWork.tsx` 在 `phase === 'empty'`（今日练习已全部完成的空白页面）状态下的“返回阅读主页”链接按钮。
  - **前端**：修复该页面下“结束并完成今日任务”按钮的悬浮态（Hover）样式，将 `hover:bg-[var(--focus-work-surface-soft)]` 替换为 `hover:opacity-90`，确保与其它主要操作按钮的悬浮交互保持风格统一与信息清晰可读。

- 验证情况：
  - `pnpm check` — 验证通过，无编译错误 ✅

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
