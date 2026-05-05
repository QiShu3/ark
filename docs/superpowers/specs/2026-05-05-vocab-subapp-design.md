# 背单词子应用设计

## 概述

本设计为 Ark 主应用新增一个“背单词子应用”，目标是在不拆分主认证与主数据库的前提下，接入独立的词书学习能力。

该子应用采用 `Ark 内嵌式词库模块` 方案：

- `english-vocabulary` 仓库仅作为词库源数据
- Ark 负责前端页面、后端接口、用户学习状态与部署
- 认证复用主应用现有 Bearer token 体系
- 数据库复用主应用现有 PostgreSQL 实例

本轮设计确认采用：

- `多词书切换`
- `完整记忆版第一期`
- 前端采用 `pages/Vocab/ + components/Vocab/ + hooks/vocab/ + lib/vocab/` 的命名空间结构

## 已确认的产品决策

- 背单词能力作为 Ark 主应用中的一个新子应用，而不是独立部署服务
- 词库支持多词书并存与切换，不限制为单一词书
- 词库数据从外部仓库导入，不在运行时直接读取外部本地文件
- 第一阶段就为完整记忆版预留数据结构，包括学习、复习、错题与会话
- 前端文件不散落在共享目录中，采用 `Vocab` 业务命名空间收纳
- 复习算法由后端统一决策，前端不自行计算间隔或掌握度

## 目标

- 在 Ark 中新增一个可持续扩展的背单词子应用
- 支持多词书切换与按词书维度隔离用户进度
- 支持新词学习、定时复习、错题回顾与基础测验
- 复用主应用的认证、用户表与 PostgreSQL 实例
- 让词库导入、学习状态和复习算法彼此解耦，便于后续演进

## 非目标

- 不把 `english-vocabulary` 改造成一个独立可运行应用
- 不在第一期引入独立 FastAPI 服务或独立前端工程
- 不在第一期实现复杂游戏化、排行榜或社交机制
- 不在第一期实现跨设备冲突解决
- 不在第一期强依赖在线音频或第三方发音资源

## 当前上下文

Ark 当前已经具备以下基础设施：

- 前端为 `React 19 + TypeScript + Vite + Tailwind`
- 后端为 `FastAPI + asyncpg + PostgreSQL`
- 前端存在统一鉴权壳 `RequireAuth`
- 后端使用 Bearer token 并通过 `auth_users` 维护主用户
- 现有业务模块已复用同一个 PostgreSQL 实例与 `auth_pool`

这意味着背单词子应用最适合沿用现有模式：

- 前端新增独立受保护路由
- 后端新增独立 router / service / repository
- 业务表通过 `user_id REFERENCES auth_users(id)` 与主用户表关联

## 方案选择

本轮比较过以下三种方案：

### 方案一：Ark 内嵌式词库模块

- 词库导入 Ark
- 页面与接口直接放在主仓库
- 学习进度直接绑定主账号

优点：

- 复用认证、用户、数据库与部署
- 架构最贴合当前代码库
- 开发与运维成本最低

缺点：

- 背单词模块成为主应用内部的一部分

### 方案二：Ark + 外部词库同步层

- 词库源与应用代码分开
- Ark 通过同步脚本或定时任务拉取词库

优点：

- 数据源边界更清晰

缺点：

- 第一阶段引入额外同步复杂度

### 方案三：独立背单词服务

- 独立前后端服务
- Ark 只保留入口

优点：

- 系统边界最独立

缺点：

- 认证复用、网关代理、部署与进度同步复杂

### 最终选择

采用 `方案一：Ark 内嵌式词库模块`。

## 前端结构设计

前端采用业务命名空间目录，避免将背单词模块文件散落在共享目录中。

```text
frontend/src/
├── pages/
│   └── Vocab/
│       ├── Home.tsx
│       ├── Study.tsx
│       ├── Review.tsx
│       ├── Mistakes.tsx
│       └── WordDetail.tsx
├── components/
│   └── Vocab/
│       ├── DeckSwitcher.tsx
│       ├── StudyCard.tsx
│       ├── ReviewResultPanel.tsx
│       ├── WordMetaPanel.tsx
│       ├── ProgressSummary.tsx
│       └── QuizRenderer.tsx
├── hooks/
│   └── vocab/
│       ├── useVocabDeck.ts
│       ├── useVocabSession.ts
│       └── useVocabReviewQueue.ts
└── lib/
    └── vocab/
        ├── api.ts
        └── types.ts
```

### 页面职责

- `Home.tsx`
  - 词书切换
  - 今日学习概览
  - 新词 / 复习 / 错题入口
- `Study.tsx`
  - 新词学习流
- `Review.tsx`
  - 定时复习流与题目作答
- `Mistakes.tsx`
  - 错题本回顾
- `WordDetail.tsx`
  - 单词详情、释义、短语、例句与个人状态

### 前端状态边界

- 页面与组件只负责展示和交互采集
- 后端返回今日学习统计、学习队列、复习队列与作答后状态
- 前端不自行计算掌握度、复习间隔或下次复习时间

## 后端结构设计

后端建议新增一个明确的 `vocab` 域目录。

```text
backend/
├── routes/vocab/
│   ├── __init__.py
│   ├── routes.py
│   ├── repository.py
│   ├── service.py
│   ├── schemas.py
│   └── importer.py
├── scripts/
│   └── import_vocab.py
└── tests/
    ├── test_vocab_routes.py
    ├── test_vocab_service.py
    └── test_vocab_importer.py
```

### 模块职责

- `routes.py`
  - HTTP 路由、鉴权依赖、请求响应绑定
- `schemas.py`
  - Pydantic 输入输出模型
- `repository.py`
  - 数据库读写与 SQL
- `service.py`
  - 学习流程与复习算法决策
- `importer.py`
  - 词库解析与导入逻辑
- `scripts/import_vocab.py`
  - 命令行导入入口

## 路由与接口边界

推荐接口分为五组。

### 词书与首页

- `GET /api/vocab/decks`
  - 返回可用词书和用户在每本词书上的概览
- `GET /api/vocab/decks/{deck_id}/today`
  - 返回今日新词数、待复习数、错题数和快捷入口信息

### 学习与复习

- `GET /api/vocab/decks/{deck_id}/study`
  - 拉取新词学习卡片
- `GET /api/vocab/decks/{deck_id}/review`
  - 拉取应复习队列
- `POST /api/vocab/reviews`
  - 提交一次作答结果，并由后端更新学习状态

### 错题与单词详情

- `GET /api/vocab/mistakes`
  - 返回错题列表，支持按词书过滤
- `GET /api/vocab/words/{word_id}`
  - 返回单词详情和当前用户状态

## 数据库设计

数据库放在 Ark 现有 PostgreSQL 的同一 schema 中，统一采用 `vocab_` 前缀隔离。

### 公共词库表

#### `vocab_decks`

- `id`
  - 词书主键
- `key`
  - 稳定程序标识，如 `cet4`
- `name`
  - 显示名称
- `description`
  - 词书描述
- `source_version`
  - 导入源版本
- `word_count`
  - 词书单词总数
- `created_at`
- `updated_at`

#### `vocab_words`

- `id`
  - 词条主键
- `deck_id`
  - 所属词书
- `word`
  - 原始单词
- `normalized_word`
  - 标准化单词，用于搜索与唯一性约束
- `us_pronunciation`
  - 美式音标
- `uk_pronunciation`
  - 英式音标
- `sort_order`
  - 在原词书中的顺序
- `created_at`

约束：

- `UNIQUE(deck_id, normalized_word)`

#### `vocab_word_translations`

- `id`
- `word_id`
- `pos`
  - 词性
- `translation`
  - 中文释义
- `sort_order`

#### `vocab_word_phrases`

- `id`
- `word_id`
- `phrase`
  - 短语
- `translation`
  - 短语中文释义
- `sort_order`

#### `vocab_word_sentences`

- `id`
- `word_id`
- `sentence`
  - 英文例句
- `translation`
  - 例句中文翻译
- `sort_order`

### 用户学习表

#### `vocab_user_deck_settings`

- `user_id`
- `deck_id`
- `daily_new_limit`
  - 每日新词上限
- `daily_review_limit`
  - 每日复习上限
- `is_active`
  - 是否启用该词书
- `created_at`
- `updated_at`

约束：

- `PRIMARY KEY(user_id, deck_id)`

#### `vocab_user_word_progress`

- `id`
- `user_id`
- `deck_id`
- `word_id`
- `status`
  - 总体状态，如未学、学习中、已掌握
- `mastery_score`
  - 掌握度分值
- `review_state`
  - 当前复习状态
- `last_reviewed_at`
  - 上次复习时间
- `next_review_at`
  - 下次应复习时间
- `lapse_count`
  - 忘记回退次数
- `correct_count`
  - 累计答对次数
- `wrong_count`
  - 累计答错次数
- `ease_factor`
  - 记忆算法难度系数
- `interval_days`
  - 当前复习间隔天数
- `is_starred`
  - 是否标星 / 收藏
- `is_suspended`
  - 是否暂停进入学习流
- `created_at`
- `updated_at`

约束：

- `UNIQUE(user_id, deck_id, word_id)`

#### `vocab_review_logs`

- `id`
- `user_id`
- `deck_id`
- `word_id`
- `review_mode`
  - 作答模式，如新学、复习、错题
- `prompt_type`
  - 题型
- `result`
  - 结果，如答对、答错、跳过
- `response_ms`
  - 作答耗时
- `reviewed_at`
  - 作答时间
- `snapshot_json`
  - 题目上下文快照

#### `vocab_learning_sessions`

- `id`
- `user_id`
- `deck_id`
- `session_type`
  - 会话类型，如学习、复习、错题训练
- `status`
  - 会话状态
- `started_at`
- `ended_at`
- `planned_count`
  - 计划题量
- `completed_count`
  - 已完成题量

#### `vocab_mistake_bucket`

- `user_id`
- `deck_id`
- `word_id`
- `last_wrong_at`
  - 最近答错时间
- `wrong_streak`
  - 连续答错次数
- `resolved_at`
  - 从错题状态恢复的时间

约束：

- `PRIMARY KEY(user_id, deck_id, word_id)`

## 词库导入流程

`english-vocabulary` 仓库只作为导入源，不参与运行时访问。

### 数据源选择

优先使用：

- `json_original/json-sentence`

原因：

- 同时包含单词、释义、短语、例句与英美音标
- 更符合完整记忆版第一期的内容需求

### 导入职责分层

- `backend/scripts/import_vocab.py`
  - 命令行入口
- `backend/routes/vocab/importer.py`
  - 负责解析外部 JSON 并转换成 Ark 内部导入结构

### 导入策略

采用 `按词书幂等重建` 策略：

- 先按 `deck key` 查找或创建 `vocab_decks`
- 再导入该词书的 `vocab_words`
- 其下的 `translations / phrases / sentences` 允许按词书范围重建

理由：

- 词库更新频率低
- 第一阶段优先保证导入逻辑稳定、可重复执行
- 避免在早期引入复杂 diff 同步

### 运行时约束

- 线上运行不依赖本地词库目录路径
- 前后端所有查询只访问 PostgreSQL
- 外部词库仓库可以不存在于部署机上，只需在导入阶段可访问

## 学习流程设计

第一期将完整记忆版拆成四条主流程。

### 新词学习流

- 从某本词书中选出未学习过的新词
- 展示单词、音标、释义、短语、例句
- 用户对词进行初步确认，例如认识、模糊、不认识
- 学习完成后写入 `vocab_user_word_progress`
- 新学完的词进入短期待复习状态，而不是直接标记已掌握

### 复习流

- 由后端根据 `next_review_at` 拉取应复习词
- 以后端题型策略生成复习卡片
- 前端提交结果后，由后端统一计算新的掌握度和下次复习时间

### 错题流

- 错题来源于学习与复习中的错误记录
- 一旦满足条件，词条进入 `vocab_mistake_bucket`
- 用户可在错题页对这些词单独强化
- 错题页本质是学习系统的一个视图，不是独立词库

### 会话流

- 每次学习、复习或错题训练都建立一条 `vocab_learning_sessions`
- 支持中断恢复、完成统计与后续学习报告

## 复习算法边界

第一期不直接实现重型算法，但为未来升级预留接口。

### 第一阶段算法建议

采用 `简化间隔重复`：

- 初学后短期复习一次
- 连续答对则逐步拉长间隔
- 答错则缩短间隔并提升错题优先级

### 为后续升级保留的字段

- `mastery_score`
- `ease_factor`
- `interval_days`
- `lapse_count`
- `next_review_at`

后续若升级到更正式的记忆算法，优先修改 `service.py` 中的调度和评分逻辑，而不是推翻数据库模型。

## 错误处理

### 导入阶段

- 对缺失字段或非标准结构做解析失败记录
- 对整本词书导入失败提供清晰错误输出
- 不允许半导入后静默成功

### 运行时

- 非法 `deck_id` 或 `word_id` 返回明确 404
- 用户访问不属于自己的学习状态时按鉴权规则拒绝
- 学习与复习提交需做幂等保护，避免刷新导致重复记日志

## 测试策略

### 后端

- `test_vocab_importer.py`
  - 验证样例词库解析正确
- `test_vocab_service.py`
  - 验证新词选择、复习调度、错题沉淀与状态更新
- `test_vocab_routes.py`
  - 验证鉴权、词书接口、学习接口与作答提交流程

### 前端

- 页面测试验证词书首页、学习页、复习页与错题页关键结构存在
- hooks 测试验证会话初始化、队列刷新与提交后状态转换
- 不在测试中硬编码具体复习算法细节，由后端返回作为契约

## 交付边界

完整记忆版第一期建议包含：

- 多词书切换
- 今日新词学习
- 定时复习
- 错题本
- 2 到 3 种基础题型
- 收藏 / 标星词

完整记忆版第一期不包含：

- 复杂游戏化体系
- 排行榜
- 跨设备同步冲突解决
- 在线音频资源依赖

## 风险与后续演进

### 风险

- 外部词库数据结构可能存在局部不统一，需要 importer 做适配
- 若未来要求跨词书统一词典，会引入额外的归一化层
- 若题型增加过快，前端展示组件需要及时抽象

### 后续演进方向

- 增加统计页与学习报告
- 引入更成熟的记忆调度算法
- 引入跨词书词汇映射与全局词典视图
- 增加更多训练模式，如拼写、听写或例句填空
