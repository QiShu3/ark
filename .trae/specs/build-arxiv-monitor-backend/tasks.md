# Tasks
- [ ] Task 1: 接入 arxiv 库并实现检索服务
  - [ ] SubTask 1.1: 使用 arxiv.Client 构建可复用客户端
  - [ ] SubTask 1.2: 使用 arxiv.Search 组装关键词/分类/作者查询
  - [ ] SubTask 1.3: 统一映射返回字段（arxiv_id、title、authors、published、summary）

- [ ] Task 2: 设计并实现单表 papers
  - [ ] SubTask 2.1: 定义字段（id、user_id、arxiv_id、is_favorite、is_read）
  - [ ] SubTask 2.2: 添加唯一约束（user_id + arxiv_id）
  - [ ] SubTask 2.3: 实现 upsert 逻辑写入用户状态

- [ ] Task 3: 实现 /arxiv API 最小闭环
  - [ ] SubTask 3.1: 实现 POST /arxiv/search（条件检索）
  - [ ] SubTask 3.2: 实现 PUT /arxiv/papers/state（写入收藏/已读状态）
  - [ ] SubTask 3.3: 实现 GET /arxiv/papers（按用户查询状态列表）
  - [ ] SubTask 3.4: 实现 GET /arxiv/health（健康检查）

- [ ] Task 4: 建立测试与验收
  - [ ] SubTask 4.1: 单元测试（查询参数构建、结果映射、状态更新）
  - [ ] SubTask 4.2: 集成测试（search + 状态写入 + 状态查询）
  - [ ] SubTask 4.3: 点火测试（服务启动、健康检查、最小写读闭环）

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1 and Task 2
- Task 4 depends on Task 3
