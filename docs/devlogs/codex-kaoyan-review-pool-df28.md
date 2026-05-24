# 开发日志：codex/kaoyan-review-pool-df28

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-13 09:40 · 83642b6 · test(frontend): align calendar widget dialog label

- 用户提出的需求：
  - “好，合并回去吧”

- 本次完成的工作：
  - 为合并 ERC 分支做基线验证时，定位到 `CalendarWidget` 测试仍在断言旧的弹窗可访问名称“多周任务日历”
  - 确认 `MultiWeekCalendarModal` 当前真实名称与 `main` 一致，均为“多周安排日历”，因此将过期测试更新为当前文案
  - 保持修正范围仅限测试，未改动多周日历组件行为

- 验证情况：
  - `cd frontend && pnpm test -- --run src/components/__tests__/CalendarWidget.test.tsx`
  - `cd frontend && pnpm test -- --run`

### 2026-05-10 01:08 · f0353dc · fix(frontend): frost erc secondary actions

- 用户提出的需求：
  - “我发现有些button是透明的，比如说开始复习、查看错题这两个button，能不能把这两个button 调成半透明呢？就是磨砂材质”

- 本次完成的工作：
  - 将 ERC 首页“开始复习”和“查看错题”从纯透明描边按钮调整为半透明磨砂按钮
  - 增加 `bg-white/10`、`backdrop-blur-xl`、`backdrop-saturate-150` 与轻微阴影，保持次级操作层级但减少透明感
  - 补充首页测试，覆盖这两个次级按钮的磨砂材质样式

- 验证情况：
  - `cd frontend && pnpm test -- src/pages/ERC/__tests__/Home.test.tsx`
  - `cd frontend && pnpm check`

### 2026-05-10 01:01 · 8c2e2b4 · feat(erc): filter library by exam

- 用户提出的需求：
  - “关于题库 可以进行进一步分类吗？”
  - “主要是考试维度就可以了，其他暂时不考虑”
  - “OK，开始吧”

- 本次完成的工作：
  - 后端 `/api/erc/articles` 新增 `exam` 查询参数，支持按考试维度筛选文章
  - Repository 查询增加 `a.exam = exam` 过滤条件，并保持原有 `set_id` 筛选兼容
  - 前端题库页加载 `/api/erc/sets`，从已有题库集合中生成考试分类按钮
  - 题库页新增“全部 / 考试名称”筛选控件；当前数据库只有 `考研英语二` 时显示“全部 / 考研英语二”，后续导入英语一会自动出现
  - 新增题库页测试，覆盖点击考试分类后按 `exam` 重新拉取文章

- 验证情况：
  - `cd backend && uv run pytest tests/test_erc_importer.py tests/test_erc_service.py tests/test_erc_routes.py -q`
  - `cd backend && uv run ruff check routes/erc routes/vocab/schemas.py tests/test_erc_importer.py tests/test_erc_service.py tests/test_erc_routes.py scripts/import_erc.py`
  - `cd frontend && pnpm test -- src/pages/ERC/__tests__/Home.test.tsx src/pages/ERC/__tests__/Library.test.tsx src/pages/ERC/__tests__/Practice.test.tsx src/pages/ERC/__tests__/Review.test.tsx`
  - `cd frontend && pnpm check`
  - `psql postgresql://postgres:postgres@127.0.0.1:5432/ark -c "SELECT exam, COUNT(*) AS article_count FROM erc_articles GROUP BY exam ORDER BY exam;"` 返回 `考研英语二=24`

### 2026-05-09 23:17 · edf0a36 · feat(erc): add vocabulary preheat session

- 用户提出的需求：
  - “接下来要干什么？”
  - “好，继续干吧”

- 本次完成的工作：
  - 新增 ERC 阅读前单词预热队列接口：按文章词表筛出当前用户未掌握、且能匹配到背单词词库的单词
  - 新增 ERC 阅读前单词预热提交接口：提交结果直接写入 `vocab_user_word_progress`、`vocab_review_logs` 与 `vocab_mistake_bucket`
  - 为 Vocab 队列类型增加 `erc_preheat` 模式，保持预热会话与背单词模块共用 FSRS 记忆结果
  - 整篇练习页增加“先预热单词”按钮和内嵌单词卡片会话，完成后提示“预热完成，可以开始做题”
  - 补充后端路由测试和前端练习页测试，覆盖预热队列加载、提交和完成态

- 验证情况：
  - `cd backend && uv run pytest tests/test_erc_importer.py tests/test_erc_service.py tests/test_erc_routes.py -q`
  - `cd backend && uv run ruff check routes/erc routes/vocab/schemas.py tests/test_erc_importer.py tests/test_erc_service.py tests/test_erc_routes.py scripts/import_erc.py`
  - `cd frontend && pnpm test -- src/pages/ERC/__tests__/Home.test.tsx src/pages/ERC/__tests__/Practice.test.tsx src/pages/ERC/__tests__/Review.test.tsx`
  - `cd frontend && pnpm check`
  - 真实数据库抽查：`get_vocabulary_preheat(..., article_id='kaoyan2_2023_text4', limit=5)` 返回 `['paradoxical', 'detached', 'considerably', 'adolescence', 'dependent']`

### 2026-05-09 22:49 · a9b56d2 · feat(erc): add article vocabulary readiness

- 用户提出的需求：
  - “回过来看看背单词模块，我想和它联动，具体表现为，在做一篇完整的文章之前，需要根据用户的掌握单词量来判断该文章的单词掌握程度，据此判断用户在这篇文章中可能遇到多少个生词，以及可以在做这篇完整的文章之前做一次根据生词以及部分重要单词生成的单词背诵。你觉得怎么样？先不改代码”
  - “做好了，你检查一下/Users/qishu/Project/英语阅读/英语二词表”
  - “那就去掉这四个短语吧”
  - “继续”

- 本次完成的工作：
  - 新增 `erc_article_words` 表，用于保存每篇阅读文章的预习词表
  - 扩展 ERC 词表导入器，支持读取 `{ article_id, words }` 的 `.words.json` 文件，并校验短语、重复词和文件名一致性
  - 为 `backend/scripts/import_erc.py` 增加 `--word-directory` 与 `--words-only`，支持只更新文章词表
  - 文章详情新增 `vocabulary_summary`，会按当前用户在背单词模块的进度计算 `mastered / learning / unstarted / unknown`
  - 整篇练习页新增“阅读前词汇预热”信息，展示文章词汇掌握率、预计生词数和部分预热词
  - 已将 `/Users/qishu/Project/英语阅读/英语二词表` 导入本地数据库，共 24 篇、562 个文章词条

- 验证情况：
  - `cd backend && uv run pytest tests/test_erc_importer.py tests/test_erc_service.py tests/test_erc_routes.py -q`
  - `cd backend && uv run ruff check routes/erc tests/test_erc_importer.py tests/test_erc_service.py tests/test_erc_routes.py scripts/import_erc.py`
  - `cd frontend && pnpm test -- src/pages/ERC/__tests__/Practice.test.tsx`
  - `cd frontend && pnpm check`
  - `cd backend && uv run python scripts/import_erc.py /Users/qishu/Project/英语阅读/英语二json --words-only --word-directory /Users/qishu/Project/英语阅读/英语二词表`
  - `psql postgresql://postgres:postgres@127.0.0.1:5432/ark -c "SELECT COUNT(DISTINCT article_pk) AS article_count, COUNT(*) AS word_count FROM erc_article_words;"`
  - 数据库返回：`article_count=24`、`word_count=562`

### 2026-05-09 19:32 · 4a9bb6d · fix(backend): randomize erc due review selection

- 用户提出的需求：
  - “怎么错题池的题目没有随机性，有跟随 fsrs算法吗？”
  - “好‘”

- 本次完成的工作：
  - 保持 FSRS 到期时间作为复习池硬门槛，只在 `due_at <= NOW()` 的到期题中抽题
  - 将复习池选题从稳定排序取第一条改为权重随机选择
  - 权重会提高活跃错题、lapse 次数较多、逾期更久题目的出现概率
  - 保留同篇文章冷却逻辑：优先避开近期刚复习过的同篇文章；如果全部候选都被冷却命中，则从全部到期题中抽取
  - 补充 service 测试，覆盖权重随机选择和同篇冷却优先级

- 验证情况：
  - `cd backend && uv run pytest tests/test_erc_service.py -q`
  - `cd backend && uv run pytest tests/test_erc_service.py tests/test_erc_routes.py -q`
  - `cd backend && uv run ruff check routes/erc tests/test_erc_service.py`

### 2026-05-09 19:25 · 5e26f7c · fix(frontend): add erc reading text surface

- 用户提出的需求：
  - “然后是左边的阅读理解的原文，这样看上去不舒服，会被后面的背景图所影响，我希望可以加一个亚克力模糊的背板，你觉得怎么样？或者你有没有什么更好的想法？”
  - “这个mcp已经失效了，你自己看不到吗？”

- 本次完成的工作：
  - 为整篇练习页和复习池页的左侧阅读原文增加深色亚克力阅读背板
  - 调整段落排版为固定段号列和正文列，减少背景图与雪景动效对英文长文阅读的干扰
  - 增加可访问标签 `阅读原文`，并补充前端测试覆盖原文区的 frosted surface 样式

- 验证情况：
  - `cd frontend && pnpm test -- src/pages/ERC/__tests__/Practice.test.tsx src/pages/ERC/__tests__/Review.test.tsx`
  - `cd frontend && pnpm check`
  - 浏览器 MCP 连接连续超时，未完成截图验收；依据组件测试和 TypeScript 检查完成代码级验证

### 2026-05-09 19:18 · 7b2e6e4 · fix(backend): count erc overview metrics independently

- 用户提出的需求：
  - “今日复习和错题怎么显示 1000 道，太吓人了”

- 本次完成的工作：
  - 排查确认真实数据为 2 篇练习、10 条作答日志、5 张到期卡、5 道活跃错题
  - 定位根因：ERC 首页 overview 统计把 attempts、logs、cards、mistakes 多个独立集合横向 join，导致计数互相乘法放大
  - 将 overview 统计改为独立子查询，避免复习数、错题数、作答数被 join 放大
  - 补充回归测试，防止 overview 统计再次使用会放大计数的多表 join

- 验证情况：
  - `cd backend && uv run pytest tests/test_erc_service.py tests/test_erc_routes.py -q`
  - `cd backend && uv run ruff check routes/erc tests/test_erc_service.py`
  - `curl -s -H 'Authorization: Bearer <token>' http://127.0.0.1:8000/api/erc/overview`
  - 返回：`due_review_count=5`、`mistake_count=5`、`practiced_article_count=2`、`practiced_question_count=10`

### 2026-05-09 19:10 · 1542afb · fix(backend): make erc practice mistakes due immediately

- 用户提出的需求：
  - “我做了两篇阅读理解，错了5道，但是在复习池上显示 暂无到期复习”

- 本次完成的工作：
  - 排查确认 5 道错题已写入 `erc_user_question_cards` 和 `erc_mistake_bucket`
  - 定位根因：FSRS 对首次 `again` 默认排到约 1 分钟后，复习池严格按 `due_at <= now` 筛选，导致用户刚做完错题时短暂显示“暂无到期复习”
  - 调整整篇练习提交逻辑：练习中答错的题立即设置为到期，确保错题立刻可在复习池出现
  - 保持答对题继续按 FSRS 正常排程
  - 补充 service 测试覆盖错题立即到期和答对题不受影响

- 验证情况：
  - `cd backend && uv run pytest tests/test_erc_service.py tests/test_erc_routes.py -q`
  - `cd backend && uv run ruff check routes/erc tests/test_erc_service.py`
  - `curl -s -H 'Authorization: Bearer <token>' http://127.0.0.1:8000/api/erc/review/next` 返回 `has_item: true`

### 2026-05-09 18:43 · 71f69e6 · fix(backend): load env in erc import script

- 用户提出的需求：
  - “启动一下前后端吧，我来验收一下”
  - “congtinue”

- 本次完成的工作：
  - 启动前端 Vite dev server
  - 启动后端 FastAPI dev server
  - 修复 `backend/scripts/import_erc.py` 直接按脚本路径运行时无法找到 `routes` 包、且未加载 `backend/.env` 的问题
  - 使用导入脚本将 `/Users/qishu/Project/英语阅读/英语二json` 下 24 篇英语二阅读 JSON 导入为 `kaoyan2_2020_2025`

- 验证情况：
  - `cd backend && uv run python scripts/import_erc.py /Users/qishu/Project/英语阅读/英语二json`
  - `curl -s http://127.0.0.1:8000/health`
  - `curl -s http://127.0.0.1:8000/api/erc/health`
  - `cd backend && uv run ruff check scripts/import_erc.py`

### 2026-05-09 18:43 · f92853c · feat(frontend): add erc reading training pages

- 用户提出的需求：
  - “必须要多用户，按方案C来吧，这本身就是作为一个产品制作的”
  - “阅读训练，因为后面会不断增加词库。接口命名 贴合 英语阅读理解，而不是只用reading。 整体架构你可以参考一下 背单词 那个产品板块”
  - “太长了，就叫 ERC 为代称吧，其他都没什么问题”
  - “OK”
  - “没问题，开始吧”
  - “1”

- 本次完成的工作：
  - 新增 `frontend/src/lib/erc/` API 与类型定义，统一调用 `/api/erc`
  - 新增阅读训练首页、题库页、整篇练习页、练习结果页、复习池页、错题本页
  - 在应用中心增加“阅读训练”入口
  - 在前端路由中接入 `/erc`、`/erc/library`、`/erc/articles/:articleId/practice`、`/erc/review`、`/erc/mistakes`
  - 补充 ERC 首页、练习漏答校验、复习空状态测试

- 验证情况：
  - `cd frontend && pnpm test -- src/pages/ERC/__tests__/Home.test.tsx src/pages/ERC/__tests__/Practice.test.tsx src/pages/ERC/__tests__/Review.test.tsx`
  - `cd frontend && pnpm check`
  - `cd frontend && pnpm test -- src/pages/Vocab/__tests__/Home.test.tsx src/pages/ERC/__tests__/Home.test.tsx`

### 2026-05-09 18:43 · 1b25c5f · feat(backend): implement erc learning services

- 用户提出的需求：
  - “没问题，开始吧”
  - “1”

- 本次完成的工作：
  - 实现 ERC 首页概览、题库列表、文章详情、整篇提交、复习抽题、单题复习提交、错题列表服务
  - 整篇提交会按题判分，写入 article attempt、review log、user question card 与 mistake bucket
  - 复习池按 `due_at <= now` 抽题，并加入同篇文章冷却判断
  - 复用 FSRS，对答错映射 `again`、答对映射 `good`
  - 补充 service helper 测试，覆盖评分映射和同篇文章冷却

- 验证情况：
  - `cd backend && uv run pytest tests/test_erc_importer.py tests/test_erc_service.py tests/test_erc_routes.py -q`
  - `cd backend && uv run ruff check routes/erc scripts/import_erc.py tests/test_erc_importer.py tests/test_erc_service.py tests/test_erc_routes.py`
  - `cd backend && uv run pytest tests/test_vocab_routes.py tests/test_erc_routes.py -q`

### 2026-05-09 18:43 · c4f2899 · feat(backend): add erc api contracts

- 用户提出的需求：
  - “没问题，开始吧”
  - “1”

- 本次完成的工作：
  - 新增 `routes/erc/schemas.py`，定义 `/api/erc` 请求与响应模型
  - 新增 `routes/erc/routes.py`，接入概览、题库、文章详情、整篇提交、复习、错题接口
  - 在后端应用中注册 ERC router
  - 补充 ERC 路由契约测试，覆盖鉴权、首页概览、整篇提交响应

- 验证情况：
  - `cd backend && uv run pytest tests/test_erc_routes.py -q`
  - `cd backend && uv run ruff check routes/erc tests/test_erc_routes.py`

### 2026-05-09 18:43 · 25eadfe · feat(backend): add erc database import flow

- 用户提出的需求：
  - “没问题，开始吧”
  - “1”

- 本次完成的工作：
  - 新增 ERC 数据表初始化，包括公共题库、用户练习、用户题目卡、复习日志、错题桶和用户设置
  - 新增幂等导入 helper，可将 JSON seed 写入 `erc_sets`、`erc_articles`、`erc_paragraphs`、`erc_questions`
  - 新增 `backend/scripts/import_erc.py`，支持导入一个 JSON 目录为题库集合
  - 在后端生命周期中接入 `init_erc`

- 验证情况：
  - `cd backend && uv run pytest tests/test_erc_importer.py -q`
  - `cd backend && uv run ruff check routes/erc scripts/import_erc.py tests/test_erc_importer.py`

### 2026-05-09 18:43 · 4ac222f · feat(backend): add erc json importer

- 用户提出的需求：
  - “没问题，开始吧”
  - “1”

- 本次完成的工作：
  - 新增 ERC JSON importer，解析单篇文章、段落、题目、选项、答案、证据与扩展字段
  - 校验文件名与 `article_id` 一致、答案只能为 `A/B/C/D`、题目与段落不能为空
  - 补充 importer 单测，覆盖正常解析、非法答案、文件名不匹配

- 验证情况：
  - `cd backend && uv run pytest tests/test_erc_importer.py -q`

### 2026-05-09 18:43 · 67abc44 · docs: add erc implementation plan

- 用户提出的需求：
  - “OK”

- 本次完成的工作：
  - 新增 ERC 实施计划，拆分后端导入器、数据库表、API、服务逻辑、前端页面、验证和开发日志任务
  - 明确每个任务的文件范围、测试策略、验证命令和提交边界

- 验证情况：
  - 文档提交，无额外代码验证

### 2026-05-09 18:43 · c63e8d8 · docs: add erc product design

- 用户提出的需求：
  - “回到之前的规划书”
  - “必须要多用户，按方案C来吧，这本身就是作为一个产品制作的”
  - “阅读训练，因为后面会不断增加词库。接口命名 贴合 英语阅读理解，而不是只用reading。 整体架构你可以参考一下 背单词 那个产品板块”
  - “太长了，就叫 ERC 为代称吧，其他都没什么问题”
  - “OK”

- 本次完成的工作：
  - 新增 ERC 阅读训练产品设计文档
  - 固化产品展示名“阅读训练”、内部代称 `ERC`、接口前缀 `/api/erc` 和表前缀 `erc_`
  - 明确多用户数据模型、页面流、API 契约、FSRS 策略、导入流程和测试策略

- 验证情况：
  - 文档提交，无额外代码验证
