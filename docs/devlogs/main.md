# 开发日志：main

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-24 23:47 · c592bba · feat: add event store template cleanup

- 用户提出的需求：
  - “好，删除掉事件商店的所有模板，等会我会提供给你一个模板”
  - “错了，我想任务日常工作流应用配置这四个东西是同级的，删除事件前也要把这些一起清理掉，要提醒用户”
  - “把这个事件作为 事件 商店的模板吧，你知道我的意思吗？”
  - “是，start_date 改成 当天，due_at改成2026-12-26 8:00:00+08”
  - “OK，提交代码吧。不过我发现用户好像没有删除模板的入口，你看看怎么回事？”

- 本次完成的工作：
  - 将事件删除语义调整为容器清理：删除事件前提供 `delete-preview`，前端确认弹窗提示会同步清理任务、日程、工作流和应用配置；删除时同步清理事件下的 app config、工作流，并软删除事件任务和日程。
  - 清空事件商店原有内置模板，并新增项目内置 `考研英语` 模板：默认开始日期为 `2026-05-24`，默认到期时间为 `2026-12-26 08:00:00+08`，包含词书、ERC 真题练习、ERC 复习 3 个 app 配置和 1 个工作流。
  - 查明个人事件模板后端已有删除接口，但前端缺少入口；新增个人模板删除 API 封装和“删除模板”按钮，确认后调用 `DELETE /todo/event-plan-templates/{template_id}` 并从下拉框移除。
  - 已同步把 `kaoyan-english` 模板写入当前本地数据库，刷新事件商店即可看到。

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py tests/test_todo_event_store.py -q`，97 个后端测试通过。
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx EventWorkbenchModal.test.tsx`，2 个测试文件 / 27 个测试通过。
  - `cd frontend && pnpm check`，TypeScript 检查通过。
  - `cd backend && uv run ruff check routes/todo/db.py ../backend/tests/test_todo_routes.py`，Ruff 检查通过。
  - `git diff --check` 通过。
  - 当前环境提示 Node v22.18.0 与项目期望 Node 20.x 不一致，但前端测试和类型检查通过。

### 2026-05-22 21:15 · 588b249 · feat(frontend): add unified SubAppArrangements component and integrate in Vocab and ERC sub-apps

- 用户提出的需求：
  - “我想新增入口，而不是之前的入口，最好是统一的，这样后续添加子应用的话也有模板”
  - “不对，统一的入口卡片组件的功能不是跳转专注，跳转专注是首页启动工作流时运行到对应任务阶段才启动的功能，和当前子应用页面的功能不同。这个统一的入口卡片组件称为 子应用安排，其功能只有两个，任务和日程：任务就是展示本子应用产生的任务（子应用任务在配置完成后产生），纵向排列，每条任务都绑定了对应的专注工作，比如说 背单词 子应用只有今日单词一个专注工作，则任务只有 今日单词 一个任务；日程展示本子应用产生的任务（子应用日程在配置完成后产生），现在还没有，仅占位。明白了吗？”

- 本次完成的工作：
  - **设计并开发高端通用组件 `SubAppArrangements.tsx`**：在 `frontend/src/components/SubAppArrangements.tsx` 中开发了高颜值的通用子应用安排组件。它具备精致的玻璃拟态外观、1:1 响应式双栏布局（左侧垂直排布任务列表，右侧留有质感拉满的日程占位卡片）、灵动的微交互悬浮态和顺滑的切换动效。
  - **背单词子应用（Vocab）无缝集成与重构**：
    - 在 `frontend/src/pages/Vocab/Home.tsx` 中完美渲染了此组件，展示了绑定的“今日单词”任务及专注工作名，支持“同步到今日安排”的 toggle 切换。
    - 移除了设置弹窗 `TodayPlanModal.tsx` 内冗余的同步开关，使用户在设置时专注于词书配置、目标数量和 FSRS 算法。
  - **阅读训练子应用（ERC）精细化集成与重构**：
    - 在 `frontend/src/pages/ERC/Home.tsx` 中同样集成子应用安排卡片，展示并托管“真题练习”（绑定“真题练习”专注）和“错题复习”（绑定“开始复习”专注）两个子任务，且各自有独立的同步开关控制。
    - 移除了 ERC 设置弹窗中多余的开关控件，使用户在此仅针对日常目标值进行参数设置，且保证设置保存时不被修改现有的同步开关状态。
  - **全面修复单元测试与静态类型检查**：
    - 修复了 `Vocab` 中 `Home.test.tsx` 多个 `'今日单词'` 匹配引发的 regression，确保了单测环境中的元素精细匹配。
    - 全量单测、类型检查和代码审查均无任何错误。

- 验证情况：
  - `cd frontend && pnpm check`，验证结果为 TypeScript 编译无任何类型和语法错误。
  - `cd frontend && pnpm exec vitest run`，前端 209 个单元测试全部成功通过。
  - `cd backend && uv run pytest`，后端 201 个 pytest 单元测试全部成功通过。

### 2026-05-22 16:52 · 3083af8 · feat(vocab): integrate today plan toggle and focus duration settings in sub-app

- 用户提出的需求：
  - “取消这个 子应用快捷入口，我的意思是在子应用页面用有没有任务管理？”
  - “revert”

- 本次完成的工作：
  - **背单词任务配置页全新升级**：在 `frontend/src/components/Vocab/TodayPlanModal.tsx` 中新增“同步到主页”（`add_to_today_plan`）的高级开关和“默认专注时长”（以分钟计）的输入框。仅在开启同步时，展示今日总量与默认专注时长的配置选项及单词黄金配比方案。
  - **背单词页面联动重构**：在 `frontend/src/pages/Vocab/Home.tsx` 中，提取并传入 appTaskStatus 内存储的 `add_to_today_plan` 与 `default_focus_duration` 的真实配置，在用户保存设置时，同步调用 `initializeVocabAppTask` 并安全传递新的配置参数。
  - **完全兼容单元测试与静态类型**：通过了 `TodayPlanModal` 调整带来的组件传参兼容校验，保持了界面对原有测试用例（如查找 `'今日总量'` 与 `'调整今日单词'`）的完全向后兼容。

- 验证情况：
  - `cd frontend && pnpm check`，验证结果为 TypeScript 编译无任何类型和语法错误。
  - `cd frontend && pnpm exec vitest run`，前端 209 个单元测试全部成功通过。
  - `cd backend && uv run pytest`，后端 201 个 pytest 单元测试全部成功通过。

### 2026-05-22 16:40 · bd38d7b · feat(todo): split ERC into practice and review tasks with homepage sync hooks

- 用户提出的需求：
  - “本次任务是 子应用的任务设置，你先看看子应用的功能吧，只看 背单词 和 ERC”
  - “我希望在这两个子应用中，可以管理对应的子任务，然后自动添加到主页的安排管理中，你明白我的意思吗？ /grill-me”

- 本次完成的工作：
  - **后端数据库与约束升级**：在 `backend/routes/todo/db.py` 中更新约束以接受 `erc_practice` 任务类型，更新 `helpers.py` 和 `schemas.py` 中的类型校验，实现真题练习状态查询与初始化路由 `/app-tasks/erc-practice/status` 及 `/app-tasks/erc-practice/init`。
  - **沉浸式真题练习专注模式**：实现并注册 `<ERCPracticeFocusWork />` 组件，集成 FSRS 驱动的词汇预热、文章纯净阅读流与即时交互答题卡。
  - **ERC 子任务精细化拆分管理**：重构 ERC 首页，将阅读训练精细化拆分为“真题练习”与“复习”两个独立模块，并配套独立的任务启用开关，状态切换时自动增删主页安排管理中的 `erc_practice` 或 `erc_review` 托管任务。
  - **测试套件回归与稳定性维护**：新增 `<ERCPracticeFocusWork />` 的完整交互测试，更新并修复 `PlaceholderCard.workflow.test.tsx` 等单元测试因布局混合与文案变动引发的遗留 regression。

- 验证情况：
  - `cd backend && uv run pytest`，201 个后端 pytest 用例全部成功通过。
  - `cd frontend && pnpm vitest run`，209 个前端单元测试全部通过。
  - `cd frontend && pnpm check` 验证没有任何 TypeScript 静态类型报错。

### 2026-05-22 16:09 · 7cd9d7d · feat(frontend): integrate sub-app task management in arrangement panel

- 用户提出的需求：
  - “我们先探讨 安排管理 的界面表现。你提到的专门分组“应用任务”是指在 原本的任务日程导航栏处新增嘛？是的话我要修正，子应用任务是隶属于任务下的，和之前的任务是同一个东西，只是来源不一样，前者来自具体的子应用，后者来自用户。”
  - “我希望在安排管理处中可以管理子应用的任务，子应用任务的编辑仍在子应用内部你有什么计划吗？”

- 本次完成的工作：
  - 移除了今日安排（左栏）与安排仓库（右栏“任务” Tab）中多余的“应用任务”二级副标题与独立列表分组，将自建任务与子应用任务完全混合并排展示。
  - 在托管任务卡片底部新增高颜值、低饱和度的彩色来源小角标（绿色“单词”与蓝色“ERC”），既保持界面一体化又指明任务来源。
  - 在 `TaskEditModal` 中实现针对子应用托管任务的受限编辑保护：当检测到 `managed_by_app === true` 时，只读锁定标题、备注、任务类型、完成周期、最大完成次数与工作日模式等核心字段，保留优先级、起止日期等外围排程参数可编辑。
  - 在 `TaskEditModal` 的 PATCH 提交数据中智能过滤隐藏字段，避免直接传输核心属性导致后端 422 报错；顶部增加前往子应用配置的安全 Banner 与平滑路由跳转；针对子应用卡片的删除确认，提示“仅跳过今日，次日照常生成”的友好指引。
  - 维护并新增本次混合任务管理的实施计划与验收文件。

- 验证情况：
  - `cd frontend && pnpm check`，验证结果为 TypeScript 编译无任何类型和语法错误。
  - 代码回归测试与 Browser 手动冒烟验证通过。

### 2026-05-22 15:44 · b4dbcf4 · refactor(frontend): simplify workflow launcher hover

- 用户提出的需求：
  - “这个入口悬浮态还残留着很多先前的功能，你看看，先不要改代码”
  - “对于残留部分，你觉得怎么处理呢？”
  - “那新的还保留有hover操作”
  - “你怎么动我这部分？我不是让你只改开始任务部分吗？”
  - “制动左边的任务入口处啊！”

- 本次完成的工作：
  - 将首页左上主入口的 hover 操作限定为工作流语义，移除旧的“切换专注任务”和“完成任务并停止专注”快捷按钮
  - 保留 `开始工作流` 主入口中的当前工作流名称切换能力，点击工作流名仍打开 `选择工作流`
  - 恢复右侧中间工作流卡位原有的 `运行 {工作流名}` 与 `工作流设置` 行为，避免误改非本次范围
  - 补充前端回归测试，覆盖主入口 hover 只保留工作流切换，并防止右侧工作流卡位再次被替换为空状态

- 验证情况：
  - `cd frontend && pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx`，1 file / 19 tests passed
  - `cd frontend && pnpm check`
  - `cd frontend && pnpm exec eslint src/components/PlaceholderCard.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx`，0 errors / 1 existing warning
  - `git diff --check -- frontend/src/components/PlaceholderCard.tsx frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`
  - Browser 验收：在 `http://localhost:5173/` 确认左上入口显示 `开始工作流 / 验收工作流`，hover 后仅保留 `切换工作流 验收工作流`；右侧中间卡位恢复为 `运行 验收工作流`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-22 11:00 · 803d8da · feat(frontend): switch selected home workflow

- 用户提出的需求：
  - “只需选工作流预设或者新建工作流（如果点击新建工作流就跳转到 工作流预设管理面板）就可以了”
  - “副文案是 当前选择的工作流名字，点击后可以切换工作流”

- 本次完成的工作：
  - 将 `开始工作流` 入口的副文案改为可点击的当前工作流名称
  - 新增轻量 `选择工作流` 面板，只负责切换已保存预设，不创建运行态工作流
  - 切换选择后写入 `ark-home-selected-workflow-preset-id`，下次进入优先恢复上次选择
  - 在选择面板中提供 `新建工作流`，点击后跳转到既有工作流预设管理弹窗
  - 补充前端回归测试，覆盖切换预设不启动工作流、从选择面板新建、空状态新建

- 验证情况：
  - `cd frontend && pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx`，1 file / 17 tests passed
  - `cd frontend && pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/PlaceholderCard.arrangements.test.tsx`，2 files / 29 tests passed
  - `cd frontend && pnpm check`
  - `cd backend && uv run pytest tests/test_todo_routes.py -q -k "start_focus_workflow_preset or focus_workflow_presets or select_focus_workflow_task"`，6 passed / 88 deselected
  - `cd backend && uv run ruff check .`
  - Browser 验收：在 `http://localhost:5173/` 使用临时本地用户确认主入口显示 `开始工作流`，副文案显示当前工作流；点击工作流名打开 `选择工作流`；切换到 `验收 B 工作流` 后刷新仍保持选择；点击 `开始工作流` 后进入 `选择任务` 待选状态；从选择面板点击 `新建工作流` 打开既有 `工作流预设` 弹窗
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试通过

### 2026-05-22 10:49 · 11daadb · feat(frontend): start selected workflow from home

- 用户提出的需求：
  - “开始工作流 面板是已有的功能吗？”
  - “只需选工作流预设或者新建工作流（如果点击新建工作流就跳转到 工作流预设管理面板）就可以了”
  - “默认选择为上次选择的工作流，如果已经选择了工作流，点击开始工作流后直接开始该项工作流”
  - “副文案是 当前选择的工作流名字，点击后可以切换工作流”

- 本次完成的工作：
  - 将首页主面板专注入口的正常态文案从 `开始专注` 改为 `开始工作流`
  - 为主面板维护当前选中的工作流预设，优先读取上次选择，其次回退到默认预设或最近更新预设
  - 点击 `开始工作流` 时直接调用 `POST /todo/focus/workflows/{preset_id}/start` 启动当前选中的工作流
  - 未存在可启动预设时，将主入口切换为 `新建工作流` 并打开既有工作流预设管理弹窗
  - 补充前端回归测试，覆盖默认预设启动和上次选择优先级

- 验证情况：
  - `cd frontend && pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx`，1 file / 14 tests passed
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试通过

### 2026-05-22 10:42 · bad4653 · feat(backend): start focus workflow presets

- 用户提出的需求：
  - “我想让这个入口重构成 开始工作流 的入口，和工作流深度绑定”
  - “默认选择为上次选择的工作流，如果已经选择了工作流，点击开始工作流后直接开始该项工作流”

- 本次完成的工作：
  - 新增按工作流预设启动运行态的后端接口 `POST /todo/focus/workflows/{preset_id}/start`
  - 启动时校验预设归属和当前活动工作流冲突，不修改预设本身或默认工作流标记
  - 支持首个专注阶段未绑定任务时进入 `pending_task_selection`
  - 支持首个专注阶段已绑定任务时直接进入任务专注，并写入专注日志
  - 补充后端回归测试，覆盖未绑定任务、绑定任务、跨用户预设和活动工作流冲突

- 验证情况：
  - `cd backend && uv run pytest tests/test_todo_routes.py -q -k "start_focus_workflow_preset or focus_workflow_presets"`，5 passed / 89 deselected

### 2026-05-21 23:01 · 7da3db6 · refactor(frontend): simplify workflow preset editor

- 用户提出的需求：
  - “主要看工作流预设界面”
  - “去掉绑定页面专注工作这个选项”
  - “阶段中选择专注和休息的选择框也删除掉，因为它语意重复了，专注和休息两个阶段本就是交替出现的，没有必要选择。”
  - “上移下移可以只针对专注阶段，且对休息阶段的UI进行简化，以突出专注阶段，同时去掉上移下移功能”
  - “休息阶段是绑定上一个专注阶段的，也就是每次创建或删除专注阶段都会附带休息阶段”
  - “去除默认专注计时方式，和下面功能重复了”

- 本次完成的工作：
  - 简化工作流预设编辑界面，移除“绑定页面专注工作”“默认专注计时方式”和阶段类型选择
  - 将阶段编辑模型改为“专注阶段 + 配套休息”的阶段组，新增或删除专注阶段时同步增删对应休息阶段
  - 移除阶段上移 / 下移能力，避免破坏专注与休息的固定配对语义
  - 弱化休息阶段 UI，仅保留配套休息时长配置，突出专注阶段的计时方式和任务绑定
  - 保存时继续输出后端需要的 `focus -> break` 阶段数组，并从第一个专注阶段推导兼容用的 `default_focus_timer_mode`
  - 补充回归测试，覆盖旧控件缺席、阶段组成组增删、保存 payload 不再包含页面专注工作绑定

- 验证情况：
  - `cd frontend && pnpm test -- PlaceholderCard.workflow.test.tsx`，1 file / 12 tests passed
  - `cd frontend && pnpm check`
  - 验证时 pnpm 提示当前 Node v22.18.0 与项目期望 Node 20.x 不一致，但测试和 TypeScript 检查通过

### 2026-05-02 10:24 · 336d83e · fix: resolve lint failures blocking ci

- 用户提出的需求：
  - “CI 报错了，你检查一下”
  - “好”

- 本次完成的工作：
  - 排查最新 GitHub Actions 失败记录，确认 `CI` 工作流在前后端 lint 步骤同时失败，而不是部署流报错
  - 修复前端一组 ESLint 阻塞项，包括成就弹窗的 ref/render 与焦点回收问题、编辑弹窗的状态初始化方式、自动开场 chat hook 的调度逻辑，以及多处未使用变量与测试桩参数
  - 调整后端 `2ms` 测试文件的导入顺序，清除 Ruff 的 `I001` 报错
  - 保留两条前端 hooks warning，不影响当前 CI 通过

- 验证情况：
  - `pnpm lint`
  - `pnpm build`
  - `uv run ruff check .`
  - `uv run pytest`

### 2026-05-01 16:35 · b6fe998 · docs: add frontend architecture diagram design

- 用户提出的需求：
  - “我希望有一张前端的架构图，用于开发，你有什么建议吗？”
  - “用业务词吧，不要用真实文件/木块名”

- 本次完成的工作：
  - 新增前端架构图设计文档，明确这张图的目标受众是新成员快速理解项目
  - 对比了路由优先、分层优先、混合级主图三种组织方式，并确定采用混合级主图
  - 固化主图三层结构、首页工作台局部展开、智能体会话台关键链路展开，以及业务词优先的命名规则
  - 为后续 draw.io 出图定义了连线语义、视觉组织建议、首版不纳入图中的信息范围和交付产物

- 验证情况：
  - 文档提交，无额外代码验证

### 2026-04-22 00:56 · 0b0f051 · feat: fix calendar overlap and auto-advance countdown workflows

- 用户提出的需求：
  - “你看看多周日历视图，长条任务和原点日程位置发生冲突了”
  - “我想更新机制：如果是倒计时的话则从专注阶段切换到休息阶段是自动切换的，不需要等待用户确认”

- 本次完成的工作：
  - 修复多周日历里点状日程与跨日长条任务的布局冲突
  - 为日历点状条目补充统一的高度、间距与可见数量布局常量
  - 让整周长条任务层根据该周点状条目占位高度整体下移，避免重叠
  - 调整前端回归测试，覆盖“同周同时存在点状日程与长条任务时长条必须避让”的场景
  - 更新专注工作流同步机制：倒计时 `focus` 阶段自然到点后自动推进到下一阶段
  - 保留正计时阶段、手动跳过阶段、运行时选任务等现有行为不变
  - 新增后端回归测试，覆盖“倒计时专注超时后自动切换到休息阶段”

- 验证情况：
  - `pnpm test -- src/components/__tests__/CalendarDayCell.test.tsx src/components/__tests__/MultiWeekCalendarGrid.test.tsx src/components/__tests__/MultiWeekCalendarModal.test.tsx`
  - `pnpm test -- src/lib/__tests__/workflowNotifications.test.ts src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/WorkflowProgressBar.test.tsx src/components/__tests__/WorkflowNavProgress.test.tsx`
  - `pnpm check`
  - `uv run pytest tests/test_todo_routes.py -k workflow -v`
  - `uv run ruff check routes/todo_routes.py tests/test_todo_routes.py`

### 2026-04-21 19:17 · aa9b131 · test(backend): stabilize recurring appointment completion test

- 用户提出的需求：
  - “可以了，合并到主分支吧，删除这个分支吧”

- 本次完成的工作：
  - 在将 `codex/event-achievements-design` 本地快进合并到 `main` 后复跑前后端验证
  - 发现 `tests/test_todo_routes.py` 中一条重复日程完成测试使用固定过去时间，已随当前日期漂移而失败
  - 将该测试改为使用相对当前时间的未来结束时间，避免继续随日期变化失效
  - 为后续删除功能分支清理掉合并后 `main` 上的测试阻塞

- 验证情况：
  - `pnpm test -- --run src/components/__tests__/AchievementCard.test.tsx src/components/__tests__/AchievementModal.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/RightPanel.test.tsx`
  - `pnpm check`
  - `uv run pytest tests/test_todo_routes.py -v`
