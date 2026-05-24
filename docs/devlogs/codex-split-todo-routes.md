# 开发日志：codex/split-todo-routes

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-09 03:20 · ffda338 · refactor(backend): split todo routes module

- 用户提出的需求：
  - “创建一个分支来进行工作 ，不动2ms，先对 todo_routes.py 拆分吧。”

- 本次完成的工作：
  - 创建并切换到 `codex/split-todo-routes` 分支
  - 保持 `backend/2ms` 不变，将原 4000+ 行 `backend/routes/todo_routes.py` 拆分为 `backend/routes/todo/` 领域包
  - 新增 `schemas.py` 收纳 ToDo、日程、事件、成就、专注工作流相关请求/响应模型与类型定义
  - 新增 `db.py` 收纳数据库连接池获取与 `init_todo` 表初始化逻辑
  - 新增 `helpers.py` 收纳行映射、完成周期、事件传播、成就统计、日程 occurrence、专注工作流 helper
  - 新增 `routes.py` 收纳 FastAPI router 与所有 ToDo endpoint
  - 将 `todo_routes.py` 保留为兼容入口，维持现有 `from routes.todo_routes import router/init_todo/...` 与测试 monkeypatch 行为

- 验证情况：
  - `cd backend && uv run python -m py_compile routes/todo_routes.py routes/todo/*.py`
  - `cd backend && uv run ruff check .`
  - `cd backend && uv run pytest -q`
  - 结果：`120 passed`；仅保留既有 `backend/2ms` 与测试里的 deprecation warnings
