# 开发日志：codex/vocab-subapp-recover

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-07 10:29 · b3db69f · feat(vocab): inherit mastered words for new decks

- 用户提出的需求：
  - “现在还要新加一个重要的功能，在切换词书时，如果该词书尚未被使用，即 已掌握单词个数 为0，会自动咨询用户是否从 累计掌握单词中 继承已掌握单词，你明白我的意思吗？”
  - “对”
  - “要”
  - “点头”

- 本次完成的工作：
  - 后端新增“已掌握单词继承”能力：支持预览目标词书可继承的单词数，并把全局已掌握单词按英文词面归一后写入新词书进度
  - 继承只作用于当前还没有进度的目标词条，并把继承结果标准化为 `Review / 已掌握` 状态，避免把旧词重新当成新词学习
  - 新增 `/inheritance-preview` 与 `/inherit-mastered-words` 接口，并在继承成功后自动重建今日计划
  - 前端把这套能力统一挂到 `DeckSwitcher`，切换到 `mastered_word_count = 0` 的新词书时自动弹出确认框
  - 用户确认继承后，首页、今日单词、学习页、复习页、错题页都会通过 `activeDeckVersion` 刷新队列与统计；用户取消时本次不继承，下次切回该新词书仍会再次提醒
  - 总览明细弹窗增加 5 分钟懒加载缓存，避免反复打开或切换词书时重复请求明细接口
  - 补充前后端测试，覆盖继承预览、继承写入、计划刷新、首页弹窗提示和各页面刷新链路

- 验证情况：
  - `cd backend && uv run pytest tests/test_vocab_service.py tests/test_vocab_routes.py tests/test_vocab_repository.py`
  - `cd backend && uv run ruff check routes/vocab/routes.py routes/vocab/schemas.py routes/vocab/service.py routes/vocab/repository.py tests/test_vocab_service.py tests/test_vocab_routes.py tests/test_vocab_repository.py`
  - `cd frontend && pnpm test -- --run src/pages/Vocab/__tests__/Home.test.tsx src/pages/Vocab/__tests__/Review.test.tsx src/pages/Vocab/__tests__/Study.test.tsx src/pages/Vocab/__tests__/Today.test.tsx`
  - `cd frontend && pnpm check`

### 2026-05-06 17:16 · a1b8770 · feat(vocab): add overview detail drilldown

- 用户提出的需求：
  - “这个我希望点击进去后可以具体显示对应的单词表”
  - “这里也是，点击后可以出现对应的词书”
  - “这里也是”
  - “直接一张全局单词表吧，你要考虑到不同词书会出现相同单词的情况”
  - “要”
  - “点头”

- 本次完成的工作：
  - 首页 `已完成词书 / 累计掌握单词 / 当前词书掌握度` 三个总览卡片改为可点击入口，统一打开“总览明细”弹窗
  - 新增总览明细弹窗，支持 `已完成词书 / 累计掌握单词 / 当前词书掌握度` 三个 tab，并保持当前 UI 风格
  - `累计掌握单词` 改为按英文词面去重后的全局已掌握词表，同词只保留一行，并展示来源词书列表与合并释义
  - 首页 `累计掌握单词` 数字同步改为去重后的全局已掌握词数，确保首页数字和弹窗明细口径一致
  - `当前词书掌握度` 明细支持 `全部 / 未开始 / 学习中 / 已掌握` 筛选，`已完成词书` 明细支持继续点入对应词书词表
  - 补充前后端测试，覆盖新接口、去重逻辑、状态筛选和首页弹窗交互

- 验证情况：
  - `cd backend && uv run pytest tests/test_vocab_service.py tests/test_vocab_routes.py`
  - `cd backend && uv run ruff check routes/vocab/routes.py routes/vocab/schemas.py routes/vocab/service.py routes/vocab/repository.py tests/test_vocab_service.py tests/test_vocab_routes.py`
  - `cd frontend && pnpm test -- --run src/pages/Vocab/__tests__/Home.test.tsx`
  - `cd frontend && pnpm check`

### 2026-05-06 16:53 · 8053d89 · feat(vocab): add global overview dashboard

- 用户提出的需求：
  - “我想要全局观察，用于查看用户 背完了多少本词书？总共掌握了多少单词？当前选定的词书单词掌握程度怎么样？”
  - “3”
  - “OK”

- 本次完成的工作：
  - 首页右侧从原来的 `Flow` 入口重构为 `总览 + 快捷入口`
  - 新增词书全局概览接口，返回已完成词书数、累计掌握单词数以及当前词书的掌握分布
  - 首页展示当前词书的 `未开始 / 学习中 / 已掌握` 状态，并保留新词、复习、错题的快捷入口
  - 补充前端首页测试，覆盖总览面板、当前词书进度和今日单词主卡片交互

- 验证情况：
  - `cd backend && uv run pytest tests/test_vocab_service.py tests/test_vocab_routes.py`
  - `cd backend && uv run ruff check routes/vocab/routes.py routes/vocab/schemas.py routes/vocab/service.py routes/vocab/repository.py tests/test_vocab_service.py tests/test_vocab_routes.py`
  - `cd frontend && pnpm test -- --run src/pages/Vocab/__tests__/Home.test.tsx`
  - `cd frontend && pnpm check`

### 2026-05-06 11:25 · 2e10189 · feat(vocab): refine today progress header

- 用户提出的需求：
  - “这里去除这四个显示，改成 批次： 当前处于第 x 批 /共 10 批 ； 已记忆 y 个单词 （y指该词书记了多少个单词）”
  - “短语和例句交换位置”

- 本次完成的工作：
  - 今日单词页顶部去掉 `剩余 / Learning / 复习 / 新词` 四项队列显示，改为显示当前批次与总批次数
  - 后端今日概览新增 `memorized_count`，用于返回当前词书累计已记忆单词数
  - 前端今日单词会话接入今日概览，展示 `已记忆 y 个单词`，并在完成新词时即时递增
  - 单词详情面板调整展示顺序为 `释义 -> 例句 -> 短语`
  - 补充前后端测试，覆盖新增统计字段、顶部批次文案和例句/短语展示顺序

- 验证情况：
  - `cd backend && uv run pytest tests/test_vocab_service.py tests/test_vocab_routes.py`
  - `cd backend && uv run ruff check routes/vocab/routes.py routes/vocab/schemas.py routes/vocab/service.py routes/vocab/repository.py tests/test_vocab_service.py tests/test_vocab_routes.py`
  - `cd frontend && pnpm test -- --run src/hooks/vocab/useVocabReviewQueue.test.ts src/hooks/vocab/useVocabTodaySession.test.ts src/pages/Vocab/__tests__/Home.test.tsx src/pages/Vocab/__tests__/Today.test.tsx src/hooks/vocab/useVocabSession.test.tsx src/pages/Vocab/__tests__/Study.test.tsx src/components/Vocab/WordMetaPanel.test.tsx`
  - `cd frontend && pnpm check`

### 2026-05-06 11:13 · 890a7dc · feat(vocab): add today batch review

- 用户提出的需求：
  - “在来下一批之前插入一个上一批的回顾吧”
  - “1。 回顾页要进行分类”
  - “1”
  - “OK”

- 本次完成的工作：
  - 今日单词流程新增“批次回顾”阶段，每完成一批 10 个单词后，先进入回顾页，再继续下一批
  - 回顾页按 `没记住 / 有点难 / 记住了 / 很轻松` 四类分组展示，词条显示英文与中文释义
  - 前端为今日单词会话新增批次状态管理，记录本批完成单词及其掌握结果
  - 当前批次若同一单词出现过多次，回顾页按本批最差结果归类，优先暴露薄弱词
  - 补充队列续拉与批次回顾相关测试，覆盖“当前批次用尽后自动加载下一批”和“10 个后进入回顾页”

- 验证情况：
  - `cd frontend && pnpm test -- --run src/hooks/vocab/useVocabReviewQueue.test.ts src/hooks/vocab/useVocabTodaySession.test.ts src/pages/Vocab/__tests__/Home.test.tsx src/pages/Vocab/__tests__/Today.test.tsx src/hooks/vocab/useVocabSession.test.tsx src/pages/Vocab/__tests__/Study.test.tsx`
  - `cd frontend && pnpm check`

### 2026-05-06 10:48 · da9cc2a · feat(vocab): make today plan adjustable

- 用户提出的需求：
  - “怎么没有今日单词栏目？这可是核心”
  - “1. 增加 调整今日单词的参数的功能，比如说今天要背什么单词”
  - “2. 今日单词背完后把 继续今日单词 的文案改成今日已完成，且点击后跳出弹窗，询问用户是否需要继续再来一次今日单词，且参数也可以调整”
  - “今日单词的比例为 30% Learning/Relearning + 10% Review + 60% New”

- 本次完成的工作：
  - 后端为今日计划补充 `daily_total_target` 配置与更新接口，允许按词书调整当天总量，并在重建计划时保留已完成单词
  - 今日计划生成改为固定配比：`30% Learning/Relearning + 10% Review + 60% New`，并按 FSRS 状态把到期词拆分为 `learning` 与 `review`
  - 新增 `learning` 队列接口与前端 `useVocabTodaySession`，让今日单词统一按 `learning -> review -> new` 的顺序推进
  - 首页新增“今日单词”主卡片和 `TodayPlanModal`，支持调整今日总量，并在完成后显示“今日已完成”按钮以继续追加一轮
  - 新增 `/vocab/today` 页面，展示今日总剩余以及 `Learning / 复习 / 新词` 分项剩余，并沿用现有 4 按钮复习风格
  - 补充前后端测试，覆盖今日计划更新、learning 队列、首页弹窗交互和今日单词页流程

- 验证情况：
  - `cd backend && uv run pytest tests/test_vocab_service.py tests/test_vocab_routes.py tests/test_vocab_repository.py`
  - `cd backend && uv run ruff check routes/vocab/routes.py routes/vocab/schemas.py routes/vocab/service.py routes/vocab/repository.py tests/test_vocab_service.py tests/test_vocab_routes.py tests/test_vocab_repository.py`
  - `cd frontend && pnpm test -- --run src/pages/Vocab/__tests__/Home.test.tsx src/pages/Vocab/__tests__/Today.test.tsx src/hooks/vocab/useVocabSession.test.tsx src/pages/Vocab/__tests__/Study.test.tsx`
  - `cd frontend && pnpm check`

### 2026-05-06 09:58 · 1c3bfb3 · feat(vocab): add daily plans with fsrs scheduling

- 用户提出的需求：
  - “回到 背单词 的算法部分，我想以 py-fsrs 这个开源仓库为基准，你看看怎么样？”
  - “忘掉我的算法，以这个开源项目为主”
  - “OK，但ui风格不变”
  - “就按照4个按钮模式。 这个项目是不是没有今日单词内容？”
  - “不行，必须要有今日单词，这是重要核心点”

- 本次完成的工作：
  - 后端引入 `fsrs` 依赖，并把背单词调度改为 `FSRS + 今日计划快照` 的混合模式
  - 新增 `vocab_daily_plans` 与 `vocab_daily_plan_items`，将“今日单词”固化为按用户、逻辑词书、日期唯一的一份学习计划
  - 学习页与复习页不再直接从实时队列取词，而是改为消费今日计划中的 `new/review` 待办项
  - 复习提交接口改成 4 档评分：`again / hard / good / easy`，并返回 `should_repeat_today` 让前端决定当前词是否留在今日队列
  - `Again` 会把当前计划项保留为 `pending` 并移动到今日队列尾部，`Hard/Good/Easy` 会标记为今日完成
  - 前端保留现有页面风格，只调整按钮文案、4 按钮提交流程和本地队列重排逻辑
  - 补充后端与前端测试，覆盖今日计划汇总、计划队列读取、提交后重排和学习页 4 按钮交互

- 验证情况：
  - `cd backend && uv run pytest tests/test_vocab_service.py tests/test_vocab_routes.py`
  - `cd backend && uv run ruff check routes/vocab/service.py routes/vocab/repository.py routes/vocab/schemas.py tests/test_vocab_service.py tests/test_vocab_routes.py`
  - `cd frontend && pnpm test -- --run src/hooks/vocab/useVocabSession.test.tsx src/pages/Vocab/__tests__/Study.test.tsx`
  - `cd frontend && pnpm check`

### 2026-05-05 18:38 · 4731a5e · feat(vocab): group deck variants and stabilize study flow

- 用户提出的需求：
  - “我页面一直在卡在 登录中，看看怎么回事？”
  - “我给你一个账号，你测试一下功能，我发现好多问题。然后回报给我”
  - “1. 这个为什么会有分块，比如说 CET6 被分成了3块？能不能统一成一起呢？”
  - “2. 显示太多词书了，改成只显示被选中的词书以及一个切换词书button”

- 本次完成的工作：
  - 后端把同一词书的分册按逻辑词书聚合，例如 `CET6_1/_2/_3 -> CET6`，并保留 `CET6luan` 这类乱序版为独立词书族
  - 今日概览、学习队列、复习队列和错题列表统一改为按逻辑词书聚合查询，避免前端看到分块词书时与学习进度脱节
  - 前端词书切换器改成默认折叠，只展示当前词书和一个切换按钮；展开后显示逻辑词书列表，选择后自动收起
  - 兼容本地已保存的旧词书键值，把 `cet4_1` 这类旧记录自动归一到 `cet4`
  - 修复学习页提交结果后的推进链路，并补充学习页相关回归测试

- 验证情况：
  - `cd backend && uv run pytest tests/test_vocab_routes.py tests/test_vocab_service.py`
  - `cd backend && uv run ruff check routes/vocab scripts/import_vocab.py tests/test_vocab_routes.py tests/test_vocab_service.py`
  - `cd frontend && pnpm test -- --run src/pages/Vocab/__tests__/Home.test.tsx src/pages/Vocab/__tests__/Review.test.tsx src/pages/Vocab/__tests__/Study.test.tsx`
  - `cd frontend && pnpm check`
