# ERC 阅读训练产品设计

## 背景

ERC 是 English Reading Comprehension 的内部代称。用户侧产品名称为“阅读训练”。第一版面向考研英语阅读理解，后续会继续扩展新的题库集合，例如考研英语一、考研英语二、四六级或其他阅读题库。

当前已有英语二 2020-2025 阅读理解 JSON 题库，共 24 篇文章、120 道题。JSON 作为静态题库源文件保留，系统运行时通过导入脚本写入数据库。

## 目标

第一版要做成一个多用户学习产品，而不是自用题库工具。核心目标是让用户完成“整篇练习 -> 结果反馈 -> 单题复习 -> 错题沉淀”的闭环。

MVP 包含：

- 从 JSON 导入 ERC 题库数据。
- 展示阅读训练首页、题库页、整篇练习页、结果页、复习池页、错题页。
- 支持多用户隔离的练习记录、题目卡、复习日志和错题桶。
- 首次整篇练习后，把每道题生成或更新为用户级 FSRS 复习卡。
- 复习池按到期时间和错题权重返回单道题。

MVP 不包含：

- AI 解析。
- 证据句高亮。
- 错因分类。
- 题型专项训练。
- 题库后台管理。
- 自定义 FSRS 参数。
- 复杂学习报告。

## 命名

- 产品展示名：阅读训练
- 内部代称：ERC
- 后端模块：`routes/erc`
- API 前缀：`/api/erc`
- 数据表前缀：`erc_`
- 前端命名空间：`ERC`

## 架构

ERC 参考现有背单词板块的分层方式，但阅读理解多一层文章结构。

后端模块：

```text
backend/routes/erc/
  __init__.py
  routes.py
  schemas.py
  repository.py
  service.py
  importer.py
```

前端模块：

```text
frontend/src/pages/ERC/
  Home.tsx
  Library.tsx
  Practice.tsx
  PracticeResult.tsx
  Review.tsx
  Mistakes.tsx

frontend/src/components/ERC/
frontend/src/hooks/erc/
frontend/src/lib/erc/
```

数据关系：

```text
ERC Set
  -> Article
    -> Paragraph
    -> Question

User
  -> Article Attempt
  -> Question Card
  -> Review Log
  -> Mistake Bucket
  -> Settings
```

## 数据模型

### 公共题库表

`erc_sets`

- `id`
- `key`，例如 `kaoyan2_2020_2025`
- `name`，例如 `考研英语二 2020-2025`
- `description`
- `exam`
- `source_version`
- `article_count`
- `question_count`
- `created_at`
- `updated_at`

`erc_articles`

- `id`
- `set_id`
- `article_id`，例如 `kaoyan2_2025_text1`
- `exam`
- `year`
- `text_no`
- `title`
- `sort_order`
- `created_at`
- `updated_at`

`erc_paragraphs`

- `id`
- `article_id`
- `paragraph_no`
- `text`

`erc_questions`

- `id`
- `article_id`
- `question_id`，例如 `kaoyan2_2025_text1_q21`
- `question_no`，保留原试卷题号，例如 `21`
- `stem`
- `options_json`
- `answer`
- `evidence_json`
- `explanation`
- `question_type`
- `sort_order`
- `created_at`
- `updated_at`

### 用户数据表

`erc_user_article_attempts`

- `id`
- `user_id`
- `article_id`
- `correct_count`
- `question_count`
- `time_spent_ms`
- `started_at`
- `submitted_at`
- `created_at`

`erc_user_question_cards`

- `id`
- `user_id`
- `question_id`
- `due_at`
- `fsrs_card_json`
- `wrong_count`
- `right_count`
- `lapse_count`
- `last_review_at`
- `last_answer_correct`
- `last_chosen_option`
- `created_at`
- `updated_at`

`erc_review_logs`

- `id`
- `user_id`
- `article_id`
- `question_id`
- `attempt_id`
- `mode`，`practice` 或 `review`
- `chosen_option`
- `correct_option`
- `is_correct`
- `rating`，`again`、`hard`、`good`、`easy`
- `time_spent_ms`
- `created_at`

`erc_mistake_bucket`

- `user_id`
- `article_id`
- `question_id`
- `wrong_count`
- `last_wrong_at`
- `is_active`

`erc_user_settings`

- `user_id`
- `daily_review_target`
- `same_article_cooldown_hours`
- `created_at`
- `updated_at`

第一版默认 `daily_review_target = 20`，`same_article_cooldown_hours = 24`。

## API 契约

所有用户相关接口都依赖现有认证，使用当前登录用户的 `user_id`。

`GET /api/erc/overview`

返回阅读训练首页所需摘要：

- 今日到期复习数。
- 已练文章数。
- 已练题目数。
- 总正确率。
- 错题数。
- 推荐继续练习的文章。

`GET /api/erc/sets`

返回可用题库集合，例如考研英语二 2020-2025。

`GET /api/erc/articles?set_id=...`

返回文章列表。每篇文章包含用户状态：

- `unstarted`
- `practiced`
- `has_due_review`
- `mistake_count`
- `last_attempt_at`

`GET /api/erc/articles/{article_id}`

返回整篇练习页数据：

- 文章信息。
- 段落列表。
- 题目、选项。
- 用户最近一次练习摘要。

`POST /api/erc/articles/{article_id}/submit`

提交整篇练习。请求包含每题选择、总用时、每题用时。服务端负责判分并生成：

- `erc_user_article_attempts`
- `erc_review_logs`
- `erc_user_question_cards`
- `erc_mistake_bucket`

返回结果页数据：总分、每题对错、正确答案、用户答案、是否进入错题桶、下一次复习时间。

`GET /api/erc/review/next`

返回当前用户下一道到期复习题。筛选规则：

- 只返回 `due_at <= now` 的题目卡。
- 错题和高 `lapse_count` 加权优先。
- 同一篇文章默认 24 小时内最多出现 1 题。
- 每次只返回 1 道题。

如果没有到期题，返回空状态和下一道最早到期时间。

`POST /api/erc/review/submit`

提交单题复习答案。服务端判分并更新：

- `erc_review_logs`
- `erc_user_question_cards`
- `erc_mistake_bucket`

第一版评分映射：

- 答错：`again`
- 答对：`good`

`GET /api/erc/mistakes`

返回错题本数据，按文章聚合。每道错题包含最近错误时间、错误次数、当前是否到期、题干、用户最近选择和正确答案。

## 学习流程

### 首次整篇练习

用户从题库页进入文章练习页。页面左侧展示文章，右侧展示 5 道题和答题状态。用户一次性提交整篇答案。

提交后服务端逐题判分。每道题都作为一次 FSRS review：

- 答错映射为 `again`。
- 答对映射为 `good`。

每道题都会生成或更新用户级 `erc_user_question_cards`。做错的题进入 `erc_mistake_bucket`。

### 复习池

复习池每次只返回一道题，但保留阅读语境。第一版由于 evidence 还未标注，默认展示全文或可折叠全文。后续补齐 evidence 后，再默认展示相关段落。

同篇文章冷却是 MVP 必做规则，避免用户短时间内连续看到同一篇文章的多道题，导致背答案而不是复习理解过程。

### 错题本

错题本按文章聚合。第一版提供查看和再次复习入口，不做错因分类。错题是否活跃由 `erc_mistake_bucket.is_active` 控制；当用户后续稳定答对后，可以由服务层把错题标记为非活跃。

## 前端体验

阅读训练首页强调“今天该做什么”：

- 今日待复习。
- 推荐练习。
- 已练文章和正确率。
- 复习池入口。
- 题库入口。

题库页按题库集合、年份、Text 展示。文章卡片显示状态，不把用户先带进管理系统。

整篇练习页采用阅读产品布局：

- 文章正文是主体验。
- 题目区域支持快速定位题号和未答状态。
- 提交前检查是否漏答。

结果页强调反馈：

- 总分。
- 每题对错。
- 错题进入复习池提示。
- 继续练下一篇或进入复习池。

## 导入流程

静态题库继续以 JSON 文件维护。导入脚本位置：

```text
backend/scripts/import_erc.py
```

导入脚本读取 JSON 目录，校验：

- JSON 合法。
- 文件名与 `article_id` 一致。
- `article_id`、`question_id` 唯一。
- `answer` 只能是 `A/B/C/D`。
- 段落与题目非空。

导入行为应幂等。重复导入同一题库时更新公共题库内容，不删除用户练习数据。

## 错误处理

- 未登录访问用户接口返回 401。
- 不存在的文章或题目返回 404。
- 提交缺少题目答案返回 400，并说明缺失题号。
- 非法选项返回 400。
- 重复提交同一篇文章允许生成新的 attempt，但不会重复创建公共题库数据。
- 没有到期复习题时，复习接口返回空状态，不作为错误。

## 测试策略

后端测试：

- JSON 导入器校验与幂等导入。
- 文章列表和详情接口。
- 整篇提交判分、日志写入、题目卡生成。
- 复习池只返回当前用户到期题。
- 多用户数据隔离。
- 同篇文章冷却规则。
- 错题桶写入与更新。

前端测试：

- 阅读首页摘要渲染。
- 题库页状态展示。
- 练习页漏答校验。
- 提交结果页对错展示。
- 复习页无到期题状态。
- 错题页按文章聚合。

## 后续迭代

第二阶段：

- evidence 段落展示。
- 题型标签。
- 解析区。
- 学习日历。
- 更细的今日任务。

第三阶段：

- 证据定位卡。
- 错因分类。
- 长难句辅助。
- AI 讲解。
- 按题型专项训练。

