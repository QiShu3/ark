# Tasks
- [x] Task 1: 梳理 Arxiv 视图数据源并定义缓存键
  - [x] SubTask 1.1: 明确 daily/search/favorites/read/skipped 各自数据来源与刷新入口
  - [x] SubTask 1.2: 设计页面级缓存结构与命中规则（首读加载、命中直出）

- [x] Task 2: 实现视图首读缓存与切换逻辑
  - [x] SubTask 2.1: 在视图切换流程接入缓存判断
  - [x] SubTask 2.2: 改造 favorites/read/skipped 拉取逻辑，支持首次拉取后复用
  - [x] SubTask 2.3: 改造 daily/search 显示逻辑，避免重复读取

- [x] Task 3: 实现缓存失效策略
  - [x] SubTask 3.1: 在收藏/已读/跳过状态变更后失效受影响缓存
  - [x] SubTask 3.2: 在“保存每日配置/立即刷新”后失效每日缓存
  - [x] SubTask 3.3: 保证缓存失效后下次进入视图会重新读取

- [x] Task 4: 验证行为与回归
  - [x] SubTask 4.1: 验证首次点击读取、再次点击命中缓存
  - [x] SubTask 4.2: 验证状态变更后的缓存失效与重新读取
  - [x] SubTask 4.3: 回归验证按钮切换与已有功能无退化

- [x] Task 5: 修复验证失败项（前端 lint 未通过）
  - [x] SubTask 5.1: 修复 PlaceholderCard 的 any 与未使用变量问题
  - [x] SubTask 5.2: 重新执行 lint/typecheck 并回填 checklist

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 2 and Task 3
- Task 5 depends on Task 4
