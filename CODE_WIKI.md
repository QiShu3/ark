# Ark 项目 Code Wiki

## 目录
1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [后端模块详解](#3-后端模块详解)
4. [前端模块详解](#4-前端模块详解)
5. [数据库设计](#5-数据库设计)
6. [依赖关系](#6-依赖关系)
7. [项目运行方式](#7-项目运行方式)
8. [开发指南](#8-开发指南)

---

## 1. 项目概述

### 1.1 项目简介
Ark 是一个集任务管理、专注计时、学术论文检索于一体的全栈应用。它为用户提供了一个集成的生产力平台，支持用户认证、任务追踪、专注工作流管理以及 arXiv 论文检索和管理功能。

### 1.2 核心功能
- **用户认证系统**：支持用户注册、登录、登出及用户信息管理
- **任务管理 (ToDo)**：创建、编辑、删除任务，支持优先级、周期、标签等属性
- **专注工作流**：基于番茄工作法的专注计时系统，支持自定义工作流
- **事件管理**：创建和跟踪重要事件，支持设置主事件
- **arXiv 论文检索**：搜索、收藏、标记论文，支持每日推荐
- **签到系统**：记录用户签到行为

### 1.3 技术栈
| 层级 | 技术选型 |
|------|----------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |
| 后端 | FastAPI + Python 3.11+ |
| 数据库 | PostgreSQL 16 |
| 部署 | Docker + Docker Compose |
| 包管理 | 前端: pnpm, 后端: uv |

---

## 2. 整体架构

### 2.1 系统架构图
```
┌─────────────────────────────────────────────────────────┐
│                        前端层                              │
│  React + TypeScript + Tailwind CSS                        │
│  - 页面路由 (react-router-dom)                            │
│  - 状态管理 (zustand)                                      │
│  - UI 组件库                                               │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/HTTPS
┌────────────────────▼────────────────────────────────────┐
│                      后端层                                │
│                   FastAPI 应用                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Auth 模块   │  │  ToDo 模块   │  │  arXiv 模块  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                      │
│  │ Checkin 模块 │  │ MCP 集成模块  │                      │
│  └──────────────┘  └──────────────┘                      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                     数据层                                 │
│                   PostgreSQL 16                            │
│  - auth_users (用户表)                                     │
│  - auth_access_tokens (访问令牌表)                         │
│  - tasks (任务表)                                          │
│  - focus_logs (专注记录表)                                 │
│  - focus_workflows (专注工作流表)                          │
│  - focus_workflow_presets (工作流预设表)                   │
│  - events (事件表)                                         │
│  - arxiv 相关表                                             │
└───────────────────────────────────────────────────────────┘
```

### 2.2 目录结构
```
/workspace
├── backend/                    # 后端代码
│   ├── routes/                 # API 路由模块
│   │   ├── arxiv/             # arXiv 相关路由
│   │   ├── auth_routes.py     # 认证路由
│   │   ├── checkin_routes.py  # 签到路由
│   │   └── todo_routes.py     # 任务路由
│   ├── services/               # 业务逻辑层
│   ├── scripts/                # 自检脚本
│   ├── tests/                  # 测试用例
│   ├── main.py                 # FastAPI 入口
│   ├── pyproject.toml          # Python 依赖配置
│   └── Dockerfile              # 后端 Docker 配置
├── frontend/                   # 前端代码
│   ├── src/
│   │   ├── components/         # React 组件
│   │   ├── pages/              # 页面组件
│   │   ├── hooks/              # 自定义 Hooks
│   │   ├── lib/                # 工具库
│   │   ├── routes/             # 路由守卫
│   │   └── main.tsx            # 前端入口
│   ├── package.json            # Node 依赖配置
│   └── Dockerfile              # 前端 Docker 配置
├── docker-compose.yml          # Docker Compose 配置
└── AGENTS.md                   # 项目开发指南
```

---

## 3. 后端模块详解

### 3.1 核心入口 - [main.py](file:///workspace/backend/main.py)

#### 主要职责
- FastAPI 应用初始化和配置
- 中间件设置（CORS）
- 路由注册
- 应用生命周期管理

#### 关键函数
| 函数名 | 说明 |
|--------|------|
| `_lifespan` | 应用生命周期管理器，负责各模块的初始化和关闭 |
| `health` | 健康检查接口 |

#### 注册的路由
- `/auth/*` - 认证路由
- `/todo/*` - 任务路由
- `/api/arxiv/*` - arXiv 论文路由
- `/checkin/*` - 签到路由

### 3.2 认证模块 - [auth_routes.py](file:///workspace/backend/routes/auth_routes.py)

#### 主要职责
- 用户注册和登录
- 访问令牌管理
- 用户信息查询

#### 数据模型
| 模型名 | 说明 |
|--------|------|
| `RegisterRequest` | 注册请求参数 |
| `LoginRequest` | 登录请求参数 |
| `TokenResponse` | 令牌响应 |
| `UserPublic` | 用户公开信息 |

#### API 接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 用户注册 |
| POST | `/auth/login` | 用户登录 |
| POST | `/auth/logout` | 用户登出 |
| GET | `/auth/me` | 获取当前用户信息 |
| GET | `/auth/users` | 列出用户（管理员返回全部） |

#### 关键函数
| 函数名 | 说明 |
|--------|------|
| `init_auth` | 初始化数据库连接池和表结构 |
| `close_auth` | 关闭数据库连接池 |
| `_hash_password` | PBKDF2-HMAC 密码哈希 |
| `_verify_password` | 密码验证 |
| `_issue_token` | 签发访问令牌 |
| `get_current_user` | FastAPI 依赖：从 Bearer token 解析用户 |

### 3.3 任务模块 - [todo_routes.py](file:///workspace/backend/routes/todo_routes.py)

#### 主要职责
- 任务 CRUD 操作
- 专注记录管理
- 专注工作流管理
- 事件管理

#### 数据模型
| 模型名 | 说明 |
|--------|------|
| `TaskCreateRequest` | 任务创建请求 |
| `TaskUpdateRequest` | 任务更新请求 |
| `TaskOut` | 任务输出 |
| `EventCreateRequest` | 事件创建请求 |
| `FocusLogCreateRequest` | 专注记录创建请求 |
| `FocusWorkflowCreateRequest` | 专注工作流创建请求 |

#### API 接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/todo/tasks` | 创建任务 |
| GET | `/todo/tasks` | 列出任务 |
| GET | `/todo/tasks/{task_id}` | 获取单个任务 |
| PATCH | `/todo/tasks/{task_id}` | 更新任务 |
| DELETE | `/todo/tasks/{task_id}` | 删除任务 |
| POST | `/todo/events` | 创建事件 |
| GET | `/todo/events` | 列出事件 |
| POST | `/todo/tasks/{task_id}/focus-logs` | 创建专注记录 |

#### 数据库表
- `tasks` - 任务表
- `focus_logs` - 专注记录表
- `focus_workflows` - 专注工作流表
- `focus_workflow_presets` - 工作流预设表
- `events` - 事件表

### 3.4 arXiv 模块 - [routes/arxiv/](file:///workspace/backend/routes/arxiv/)

#### 主要职责
- arXiv 论文搜索
- 论文状态管理（收藏、已读、跳过）
- 论文标签管理
- 每日论文推荐配置

#### 核心文件
| 文件 | 说明 |
|------|------|
| [routes.py](file:///workspace/backend/routes/arxiv/routes.py) | API 路由定义 |
| [service.py](file:///workspace/backend/routes/arxiv/service.py) | 业务逻辑 |
| [repository.py](file:///workspace/backend/routes/arxiv/repository.py) | 数据访问层 |

#### API 接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/arxiv/search` | 搜索 arXiv 论文 |
| POST | `/api/arxiv/papers/details` | 获取论文详情 |
| PUT | `/api/arxiv/papers/state` | 更新论文状态 |
| GET | `/api/arxiv/papers` | 列出用户论文状态 |
| GET/POST | `/api/arxiv/papers/tags` | 论文标签管理 |
| GET/PUT | `/api/arxiv/daily/config` | 每日推荐配置 |
| GET | `/api/arxiv/daily/candidates` | 获取每日推荐论文 |

---

## 4. 前端模块详解

### 4.1 核心入口 - [main.tsx](file:///workspace/frontend/src/main.tsx)

#### 主要职责
- React 应用初始化
- 路由配置
- 认证守卫配置

#### 路由配置
| 路径 | 组件 | 说明 |
|------|------|------|
| `/login` | Login | 登录页面 |
| `/` | App | 主应用（需认证） |
| `/apps` | AppCenter | 应用中心（需认证） |
| `/arxiv` | Arxiv | arXiv 页面（需认证） |

### 4.2 主应用 - [App.tsx](file:///workspace/frontend/src/App.tsx)

#### 主要职责
- 应用整体布局
- 背景图片展示
- 左右面板布局

#### 布局结构
```
App
├── Navigation (顶部导航)
├── LeftPanel (左侧面板)
└── RightPanel (右侧面板)
```

### 4.3 页面组件

#### [Login.tsx](file:///workspace/frontend/src/pages/Login.tsx)
用户登录页面，支持用户名和密码登录。

#### [AppCenter.tsx](file:///workspace/frontend/src/pages/AppCenter.tsx)
应用中心页面，展示可用的功能模块。

#### [Arxiv.tsx](file:///workspace/frontend/src/pages/Arxiv.tsx)
arXiv 论文检索和管理页面。

### 4.4 通用组件

| 组件 | 说明 |
|------|------|
| [Navigation](file:///workspace/frontend/src/components/Navigation.tsx) | 顶部导航栏 |
| [LeftPanel](file:///workspace/frontend/src/components/LeftPanel.tsx) | 左侧面板 |
| [RightPanel](file:///workspace/frontend/src/components/RightPanel.tsx) | 右侧面板 |
| [CalendarWidget](file:///workspace/frontend/src/components/CalendarWidget.tsx) | 日历组件 |
| [FocusStats](file:///workspace/frontend/src/components/FocusStats.tsx) | 专注统计 |
| [EventCountdownCard](file:///workspace/frontend/src/components/EventCountdownCard.tsx) | 事件倒计时卡片 |
| [WorkflowProgressBar](file:///workspace/frontend/src/components/WorkflowProgressBar.tsx) | 工作流进度条 |
| [MarkdownContent](file:///workspace/frontend/src/components/MarkdownContent.tsx) | Markdown 内容渲染 |
| [PhoneSimulator](file:///workspace/frontend/src/components/PhoneSimulator.tsx) | 手机模拟器 |

### 4.5 工具库

| 文件 | 说明 |
|------|------|
| [lib/api.ts](file:///workspace/frontend/src/lib/api.ts) | API 请求封装 |
| [lib/auth.ts](file:///workspace/frontend/src/lib/auth.ts) | 认证相关工具 |
| [lib/utils.ts](file:///workspace/frontend/src/lib/utils.ts) | 通用工具函数 |

### 4.6 自定义 Hooks

| Hook | 说明 |
|------|------|
| [hooks/useTheme.ts](file:///workspace/frontend/src/hooks/useTheme.ts) | 主题管理 Hook |

---

## 5. 数据库设计

### 5.1 用户认证相关表

#### auth_users
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 用户 ID（主键） |
| username | TEXT | 用户名（唯一） |
| password_hash | TEXT | 密码哈希 |
| password_salt | TEXT | 密码盐值 |
| is_active | BOOLEAN | 是否激活 |
| is_admin | BOOLEAN | 是否管理员 |
| created_at | TIMESTAMPTZ | 创建时间 |

#### auth_access_tokens
| 字段 | 类型 | 说明 |
|------|------|------|
| token | TEXT | 访问令牌（主键） |
| user_id | BIGINT | 用户 ID（外键） |
| expires_at | TIMESTAMPTZ | 过期时间 |
| created_at | TIMESTAMPTZ | 创建时间 |

### 5.2 任务管理相关表

#### tasks
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 任务 ID（主键） |
| user_id | BIGINT | 用户 ID（外键） |
| title | VARCHAR(255) | 任务标题 |
| content | TEXT | 任务内容 |
| status | VARCHAR(20) | 状态（todo/done） |
| priority | INTEGER | 优先级（0-3） |
| target_duration | INTEGER | 目标时长（秒） |
| current_cycle_count | INTEGER | 当前周期数 |
| target_cycle_count | INTEGER | 目标周期数 |
| cycle_period | VARCHAR(20) | 周期类型 |
| cycle_every_days | INTEGER | 自定义周期天数 |
| event | TEXT | 关联事件 |
| event_ids | UUID[] | 关联事件 ID 列表 |
| task_type | VARCHAR(20) | 任务类型（focus/checkin） |
| tags | TEXT[] | 标签列表 |
| actual_duration | INTEGER | 实际时长（秒） |
| start_date | TIMESTAMPTZ | 开始日期 |
| due_date | TIMESTAMPTZ | 截止日期 |
| is_deleted | BOOLEAN | 是否删除 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

#### focus_logs
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 记录 ID（主键） |
| user_id | BIGINT | 用户 ID（外键） |
| task_id | UUID | 任务 ID（外键） |
| duration | INTEGER | 持续时长（秒） |
| start_time | TIMESTAMPTZ | 开始时间 |
| end_at | TIMESTAMPTZ | 结束时间 |
| created_at | TIMESTAMPTZ | 创建时间 |

#### focus_workflows
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 工作流 ID（主键） |
| user_id | BIGINT | 用户 ID（外键） |
| task_id | UUID | 任务 ID（外键） |
| workflow_name | VARCHAR(100) | 工作流名称 |
| phases | JSONB | 阶段配置 |
| current_phase_index | INTEGER | 当前阶段索引 |
| focus_duration | INTEGER | 专注时长（秒） |
| break_duration | INTEGER | 休息时长（秒） |
| current_phase | VARCHAR(20) | 当前阶段（focus/break） |
| phase_started_at | TIMESTAMPTZ | 阶段开始时间 |
| phase_planned_duration | INTEGER | 阶段计划时长 |
| pending_confirmation | BOOLEAN | 是否待确认 |
| status | VARCHAR(20) | 状态（active/stopped） |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |
| ended_at | TIMESTAMPTZ | 结束时间 |

#### focus_workflow_presets
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 预设 ID（主键） |
| user_id | BIGINT | 用户 ID（外键） |
| name | VARCHAR(50) | 预设名称 |
| focus_duration | INTEGER | 专注时长（秒） |
| break_duration | INTEGER | 休息时长（秒） |
| phases | JSONB | 阶段配置 |
| is_default | BOOLEAN | 是否默认 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

#### events
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 事件 ID（主键） |
| user_id | BIGINT | 用户 ID（外键） |
| name | VARCHAR(255) | 事件名称 |
| due_at | TIMESTAMPTZ | 到期时间 |
| is_primary | BOOLEAN | 是否主事件 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

---

## 6. 依赖关系

### 6.1 后端依赖 ([pyproject.toml](file:///workspace/backend/pyproject.toml))

#### 核心依赖
| 包名 | 版本 | 说明 |
|------|------|------|
| fastapi | >=0.115.0 | Web 框架 |
| uvicorn[standard] | >=0.30.0 | ASGI 服务器 |
| asyncpg | >=0.31.0 | PostgreSQL 异步驱动 |
| python-dotenv | >=1.0.1 | 环境变量管理 |
| arxiv | >=2.4.0 | arXiv API 客户端 |
| httpx | >=0.27.0 | HTTP 客户端 |
| pydantic | - | 数据验证（FastAPI 依赖） |
| python-multipart | >=0.0.20 | 表单数据处理 |
| sse-starlette | >=2.0.0 | Server-Sent Events |

#### 开发依赖
| 包名 | 版本 | 说明 |
|------|------|------|
| pytest | >=9.0.2 | 测试框架 |
| pytest-asyncio | >=1.3.0 | 异步测试支持 |
| ruff | >=0.9.0 | 代码格式化和 lint |

### 6.2 前端依赖 ([package.json](file:///workspace/frontend/package.json))

#### 核心依赖
| 包名 | 版本 | 说明 |
|------|------|------|
| react | ^19.2.4 | React 框架 |
| react-dom | ^19.2.4 | React DOM |
| react-router-dom | ^7.13.2 | 路由管理 |
| zustand | ^5.0.12 | 状态管理 |
| lucide-react | ^1.7.0 | 图标库 |
| react-markdown | ^10.1.0 | Markdown 渲染 |
| remark-gfm | ^4.0.1 | GitHub Flavored Markdown |
| clsx | ^2.1.1 | 类名工具 |
| tailwind-merge | ^3.0.2 | Tailwind 类名合并 |
| canvas-confetti | ^1.9.4 | 彩带效果 |

#### 开发依赖
| 包名 | 版本 | 说明 |
|------|------|------|
| vite | ^8.0.3 | 构建工具 |
| @vitejs/plugin-react | ^6.0.1 | React 插件 |
| typescript | ~5.9.3 | TypeScript |
| tailwindcss | ^4.2.2 | CSS 框架 |
| postcss | ^8.5.3 | PostCSS |
| eslint | ^10.1.0 | 代码 lint |
| vitest | ^4.1.2 | 测试框架 |
| @testing-library/react | ^16.3.2 | React 测试库 |

---

## 7. 项目运行方式

### 7.1 使用 Docker Compose 运行（推荐）

#### 前置要求
- Docker
- Docker Compose

#### 启动步骤
1. 复制环境变量配置文件：
```bash
cd /workspace/backend
cp .env.example .env
```

2. 编辑 `.env` 文件，配置必要的环境变量：
```env
DATABASE_URL=postgresql://postgres:postgres@db:5432/ark
DEEPSEEK_API_KEY=your_api_key_here
```

3. 在项目根目录启动所有服务：
```bash
cd /workspace
docker-compose up -d
```

#### 服务访问
- 前端：http://localhost
- 后端 API：http://localhost:8000
- 后端文档：http://localhost:8000/docs
- PostgreSQL：localhost:5432

#### 停止服务
```bash
docker-compose down
```

#### 保留数据卷停止
```bash
docker-compose down -v
```

### 7.2 本地开发模式运行

#### 后端本地运行

1. 进入后端目录：
```bash
cd /workspace/backend
```

2. 安装依赖（使用 uv）：
```bash
uv sync
```

3. 配置环境变量：
```bash
cp .env.example .env
# 编辑 .env 文件
```

4. 启动后端服务：
```bash
uv run uvicorn main:app --reload --port 8000
```

#### 前端本地运行

1. 进入前端目录：
```bash
cd /workspace/frontend
```

2. 安装依赖（使用 pnpm）：
```bash
pnpm install
```

3. 启动开发服务器：
```bash
pnpm dev
```

4. 访问应用：http://localhost:5173

---

## 8. 开发指南

### 8.1 代码风格

#### 后端（Python）
- 使用 Ruff 进行代码格式化和 lint
- 行最大长度：120
- 命名规范：snake_case
- 类型提示：使用类型注解

#### 前端（TypeScript）
- 使用 ESLint 进行代码 lint
- 组件命名：PascalCase
- 文件命名：PascalCase（组件），camelCase（工具）
- 类型注解：严格 TypeScript

### 8.2 提交规范

遵循 Conventional Commits 规范：
```
<type>(<scope>): <description>

类型：
- feat: 新功能
- fix: 修复 bug
- refactor: 重构
- style: 代码格式
- docs: 文档
- test: 测试
- chore: 构建/工具

示例：
feat(frontend): 添加专注统计组件
fix(backend): 修复用户登录超时问题
```

### 8.3 测试

#### 后端测试
```bash
cd /workspace/backend
uv run pytest
```

#### 前端测试
```bash
cd /workspace/frontend
pnpm test
```

### 8.4 常见问题

#### Q: 后端无法连接数据库？
A: 确保 PostgreSQL 服务已启动，检查 `DATABASE_URL` 环境变量配置是否正确。

#### Q: 前端 API 请求失败？
A: 检查后端服务是否正常运行，检查 CORS 配置，确认 API 地址配置正确。

#### Q: Docker Compose 启动失败？
A: 检查端口 80、8000、5432 是否被占用，使用 `docker-compose logs` 查看详细错误信息。

---

## 附录

### A. 参考文档
- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [React 文档](https://react.dev/)
- [TypeScript 文档](https://www.typescriptlang.org/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [PostgreSQL 文档](https://www.postgresql.org/docs/)

### B. 相关文件
- [AGENTS.md](file:///workspace/AGENTS.md) - 项目开发指南
- [backend/README.md](file:///workspace/backend/README.md) - 后端说明
- [frontend/README.md](file:///workspace/frontend/README.md) - 前端说明
- [docker-compose.yml](file:///workspace/docker-compose.yml) - Docker Compose 配置
