# ToDo 后端设计与落地计划

## 目标

- 新增 ToDo 相关接口，所有 ToDo 路由集中在一个独立文件：`backend/routes/todo_routes.py`。
- 在 `backend/main.py` 中挂载该 router（`app.include_router(...)`），并在应用启动时初始化 ToDo 所需数据表。
- 使用现有的认证体系（`/auth/*` + Bearer token），所有 ToDo 接口均需登录。
- 数据库存取沿用现有后端方式：`asyncpg` + 应用启动时 `CREATE TABLE IF NOT EXISTS`。

## 现状与关键约束

- 数据库使用 PostgreSQL（pgsql），连接信息已在 `backend/.env` 中配置；后端启动时会在 `main.py` 里通过 `python-dotenv` 自动加载该 `.env`（因此 ToDo 无需新增配置项）。
- 现有用户表为 `auth_users`，主键 `id` 类型为 `BIGSERIAL/BIGINT`（见 `routes/auth_routes.py`）。因此 ToDo 表中的 `user_id` 必须与之匹配才能做外键。
- 你给出的 ToDo 设计里 `user_id` 标注为 UUID，但在当前代码库中用户 id 是 BIGINT；本计划以“与现有系统可运行”为优先：
  - `tasks.id` / `focus_logs.id` / `focus_logs.task_id` 使用 UUID。
  - `tasks.user_id` / `focus_logs.user_id` 使用 BIGINT，并外键引用 `auth_users(id)`。

## 数据库表设计（PostgreSQL）

### 1) 扩展

- 在初始化 ToDo 表时执行：
  - `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
- 目的：使用 `gen_random_uuid()` 作为 UUID 默认值。

### 2) 任务表：`tasks`

- 字段（建议落地为）：
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE`
  - `title VARCHAR(255) NOT NULL`
  - `content TEXT NULL`
  - `category VARCHAR(50) NOT NULL DEFAULT ''`
  - `status VARCHAR(20) NOT NULL DEFAULT 'todo'` + `CHECK (status IN ('todo','doing','done'))`
  - `priority INTEGER NOT NULL DEFAULT 0` + `CHECK (priority BETWEEN 0 AND 3)`
  - `target_duration INTEGER NOT NULL DEFAULT 0` + `CHECK (target_duration >= 0)`
  - `actual_duration INTEGER NOT NULL DEFAULT 0` + `CHECK (actual_duration >= 0)`
  - `due_date TIMESTAMPTZ NULL`
  - `is_deleted BOOLEAN NOT NULL DEFAULT FALSE`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- 索引：
  - `(user_id, is_deleted, status)`
  - `(user_id, is_deleted, due_date)`
  - 可选：`(user_id, is_deleted, updated_at DESC)`

### 3) 专注记录表：`focus_logs`

- 字段（建议落地为）：
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE`
  - `task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE`
  - `duration INTEGER NOT NULL` + `CHECK (duration > 0)`
  - `start_time TIMESTAMPTZ NOT NULL`
  - `end_at TIMESTAMPTZ NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- 索引：
  - `(user_id, start_time DESC)`
  - `(task_id, start_time DESC)`

## API 设计（FastAPI）

### 统一约定

- Router：
  - 文件：`backend/routes/todo_routes.py`
  - `router = APIRouter(prefix="/api", tags=["todo"])`
- 鉴权：
  - `from routes.auth_routes import get_current_user`
  - 每个路由通过 `Depends(get_current_user)` 获取当前用户（含 `id`）。
- 软删除：
  - `DELETE` 仅把 `is_deleted=true`，默认列表与查询不返回已删除任务（除非显式 `include_deleted=true`）。
- 时间：
  - `due_date/start_time/end_at` 使用 `datetime`（timezone-aware），入参/出参均使用 ISO 8601。

### Tasks 接口

1) `POST /api/tasks`
- 作用：创建任务
- 请求体（Pydantic）：
  - `title`（必填，1..255）
  - `content`（可选）
  - `category`（可选，<=50，默认空串）
  - `status`（可选，todo/doing/done，默认 todo）
  - `priority`（可选，0..3，默认 0）
  - `target_duration`（可选，>=0，默认 0）
  - `due_date`（可选）
- 返回：任务详情（包含 `id/created_at/updated_at` 等）

2) `GET /api/tasks`
- 作用：分页列出任务
- Query：
  - `status`（可选：todo/doing/done）
  - `category`（可选）
  - `q`（可选：在 title 上做 ILIKE 查询）
  - `include_deleted`（可选，默认 false）
  - `limit`（默认 50，上限 200）
  - `offset`（默认 0）
- 返回：任务数组（按 `updated_at DESC`）

3) `GET /api/tasks/{task_id}`
- 作用：获取单个任务（仅限本人）
- 行为：若找不到或不属于本人 → 404

4) `PATCH /api/tasks/{task_id}`
- 作用：更新任务（部分字段）
- 可更新字段：
  - `title/content/category/status/priority/target_duration/due_date`
- 行为：
  - 更新时同步设置 `updated_at = NOW()`
  - 若任务已软删除，返回 404（除非后续扩展“允许编辑已删除任务”，本计划不启用）

5) `DELETE /api/tasks/{task_id}`
- 作用：软删除任务
- 行为：
  - `UPDATE tasks SET is_deleted=true, updated_at=NOW() WHERE ...`
  - 幂等：重复删除仍返回成功（或 404；本计划采用“找不到/非本人/已删”统一 404，避免泄露）

### Focus Logs 接口

1) `POST /api/tasks/{task_id}/focus-logs`
- 作用：创建一次专注会话，并累计到任务 `actual_duration`
- 请求体：
  - `duration`（必填，>0，单位秒）
  - `start_time`（必填）
  - `end_at`（可选；若未传则由 `start_time + duration` 计算）
- 事务语义（同一连接 transaction）：
  - 校验任务存在且属于本人且未删除
  - 插入 `focus_logs`
  - `UPDATE tasks SET actual_duration = actual_duration + $duration, updated_at=NOW()`
- 返回：focus log 详情

2) `GET /api/tasks/{task_id}/focus-logs`
- 作用：列出某任务的专注记录
- Query：
  - `limit`（默认 50，上限 200）
  - `offset`（默认 0）
- 返回：按 `start_time DESC`

## 代码落地步骤（实施顺序）

1) 新增 ToDo 路由文件
- 创建 `backend/routes/todo_routes.py`
- 内容包括：
  - Pydantic 请求/响应模型
  - `init_todo(app)`：用 `app.state.auth_pool` 建表/建索引/扩展
  - `router` 与所有 `/api/*` 路由
  - 复用 `get_current_user` 做鉴权
  - 自己实现一个 `_pool_from_request(request)`（与 auth_routes 一致，但报错信息改为 “DB 未初始化” 等）

2) 挂载路由并接入初始化流程
- 修改 `backend/main.py`：
  - import `todo_router` 与 `init_todo`
  - `app.include_router(todo_router)`
  - 在 `_lifespan` 中 `await init_todo(app)`（放在 `await init_auth(app)` 之后）

3) 本地验证（手工 + 可选脚本）
- 方式 A（手工）：
  - 启动后端：`uv sync`、`uv run uvicorn main:app --reload --port 8000`
  - 注册/登录拿 token：`POST /auth/register`、`POST /auth/login`
  - 使用 Bearer token 调用：
    - `POST /api/tasks`
    - `GET /api/tasks`
    - `PATCH /api/tasks/{id}`
    - `POST /api/tasks/{id}/focus-logs`
    - `GET /api/tasks/{id}/focus-logs`
    - `DELETE /api/tasks/{id}`
- 方式 B（可选，新增自检脚本）：
  - 参考现有 `scripts/auth_selftest.py`，新增 `scripts/todo_selftest.py` 做端到端冒烟测试（创建任务 → 记录专注 → 校验累计时长）。

## 交付物清单

- `backend/routes/todo_routes.py`：ToDo 全部路由与表初始化逻辑
- `backend/main.py`：挂载 router，并在应用启动时初始化 ToDo 表
- （可选）`backend/scripts/todo_selftest.py`：ToDo 冒烟自检脚本
