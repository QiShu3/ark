# Tasks
- [x] Task 1: 新增 Arxiv“每日”入口与页面骨架
  - [x] SubTask 1.1: 在视图切换区新增“每日”按钮并接入状态切换
  - [x] SubTask 1.2: 新增每日页容器与三块区域（配置、论文列表、AI 聊天框）
  - [x] SubTask 1.3: 保持搜索/收藏/已读视图行为不变

- [x] Task 2: 实现每日任务配置与存储
  - [x] SubTask 2.1: 设计每日配置数据结构（检索参数 + 每日更新时间）
  - [x] SubTask 2.2: 提供创建/更新每日配置接口
  - [x] SubTask 2.3: 前端提交与回显每日配置

- [x] Task 3: 实现每日定时更新未读论文
  - [x] SubTask 3.1: 增加定时调度入口并按用户配置触发检索
  - [x] SubTask 3.2: 过滤已读论文并更新当日候选阅读集
  - [x] SubTask 3.3: 暴露当日候选集查询接口供前端展示

- [x] Task 4: 实现每日 AI 总结秘书
  - [x] SubTask 4.1: 组装当天候选论文标题与摘要上下文
  - [x] SubTask 4.2: 输出简要中文总结报告（主题与优先级建议）
  - [x] SubTask 4.3: 在每日页聊天框展示总结并支持手动刷新

- [x] Task 5: 落实每日 AI 任务权限与确认流
  - [x] SubTask 5.1: 限制每日 AI 仅可查看与添加任务
  - [x] SubTask 5.2: 禁止删除任务并返回明确权限提示
  - [x] SubTask 5.3: 复用 `div` 现有确认弹窗协议（先确认后创建）
  - [x] SubTask 5.4: 批量加任务前发起确认，确认后按论文逐条创建任务
  - [x] SubTask 5.5: 用户取消时不创建任何任务

- [x] Task 6: 验证与回归
  - [x] SubTask 6.1: 增加后端测试（配置接口、调度更新、权限限制）
  - [x] SubTask 6.2: 增加前端测试或类型校验（每日页交互与状态）
  - [x] SubTask 6.3: 回归验证现有 Arxiv 与通用聊天能力

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 1 and Task 3
- Task 5 depends on Task 4
- Task 6 depends on Task 3, Task 4 and Task 5
