# 开发日志：codex/cleanup-backend-structure

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-09 03:29 · f893928 · chore: remove temporary url test scripts

- 用户提出的需求：
  - “OK，删除掉后提交代码”

- 本次完成的工作：
  - 删除仓库根目录临时脚本 `test_regex.py`
  - 删除仓库根目录临时脚本 `test_url_stream.py`
  - 两个脚本均为临时 URL 清洗/流式 URL stripping 验证代码，无业务引用、无测试断言、未纳入项目测试目录约定

- 验证情况：
  - `cd backend && uv run ruff check .`
  - `cd backend && uv run pytest -q`
  - 结果：`120 passed`；仅保留既有 `backend/2ms` 与测试里的 deprecation warnings

### 2026-05-09 03:25 · b49d907 · chore(backend): remove unused service stubs

- 用户提出的需求：
  - “好”
  - 上下文：在 `codex/split-todo-routes` 合并后，继续执行下一步 backend 结构清理，优先处理无引用 service 文件与 backend 根目录测试文件

- 本次完成的工作：
  - 删除无业务引用的 `backend/services/arxiv_service.py` 与 `backend/services/todo_service.py`
  - 删除空的 `backend/services/__init__.py`，移除不再使用的 `services` 包
  - 删除未被当前 pytest 配置收集的 `backend/test_db.py` 与 `backend/test_default.py`
  - 移除上述根目录测试脚本中的本地数据库连接串，避免继续保留本地调试遗留

- 验证情况：
  - `cd backend && uv run ruff check .`
  - `cd backend && uv run pytest -q`
  - 结果：`120 passed`；仅保留既有 `backend/2ms` 与测试里的 deprecation warnings
