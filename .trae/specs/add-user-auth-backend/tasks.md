# Tasks
- [x] Task 1: 盘点现有后端结构与依赖
  - [x] 确认 FastAPI 入口文件位置与当前路由挂载方式
  - [x] 确认是否已有数据库/ORM/用户表或类似能力
  - [x] 确认现有配置加载方式（.env / pydantic settings 等）

- [x] Task 2: 设计并实现 Auth 独立路由文件
  - [x] 创建单一 Auth 路由文件，集中定义注册/登录/当前用户/用户管理端点
  - [x] 定义鉴权依赖（Bearer token 解析、当前用户获取）
  - [x] 定义请求/响应 schema（避免泄露敏感字段）

- [x] Task 3: 实现用户模型与安全存储
  - [x] 创建/复用用户数据模型（至少：id、用户名或邮箱、密码哈希、状态/角色可选）
  - [x] 实现密码哈希与校验
  - [x] 实现访问令牌签发与校验（含过期）

- [x] Task 4: 在 main.py 挂载 Auth 路由并完成联调
  - [x] 在 main.py 使用 include_router 挂载 Auth 路由模块
  - [x] 确保现有路由（如 /health、/api/chat）不受影响
  - [x] 端到端验证注册→登录→访问 /auth/me→（可选）用户列表

- [x] Task 5: 添加最小测试与开发校验手册
  - [x] 添加单元/集成测试（或最小可重复校验脚本）覆盖关键路径与失败路径
  - [x] 更新/补充运行所需环境变量说明（不写入密钥）

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 2, Task 3
- Task 5 depends on Task 4
