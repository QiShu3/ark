# Ark 项目 Code Wiki

> 本文档是 Ark 项目的完整代码知识库，涵盖项目架构、核心模块、关键类与函数、依赖关系及运行方式等关键信息。

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [后端架构](#3-后端架构)
4. [前端架构](#4-前端架构)
5. [iOS 端架构](#5-ios-端架构)
6. [核心业务模块](#6-核心业务模块)
7. [数据库设计](#7-数据库设计)
8. [API 接口概览](#8-api-接口概览)
9. [项目配置与依赖](#9-项目配置与依赖)
10. [开发与运行指南](#10-开发与运行指南)
11. [部署指南](#11-部署指南)
12. [编码规范](#12-编码规范)

---

## 1. 项目概述

### 1.1 项目简介

Ark 是一个以「专注」为核心的个人生产力应用，融合了事件管理、任务安排、工作流、专注工作、成就系统等功能，帮助用户在有时间边界的「事件」框架内高效推进目标。

### 1.2 核心设计理念

- **事件驱动**：以「事件」（Event）作为最上层组织单元，设定开始与截止日期
- **专注工作**：全屏、有退出成本的工作台设计，刻意提高切换成本
- **工作流编排**：将不同类型任务通过「专注-休息」循环串联
- **成就反馈**：自动追踪里程碑，在漫长事件周期中给予正向反馈
- **子应用扩展**：通过子应用注册机制支持背单词、阅读训练等专项学习

### 1.3 技术栈

| 层级 | 技术选型 |
|------|---------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS 4 + Zustand |
| 后端 | Python 3.11 + FastAPI + asyncpg + PostgreSQL |
| 移动端 | SwiftUI (iOS) |
| 数据库 | PostgreSQL 16 |
| 部署 | Docker + Docker Compose |
| 测试 | Vitest (前端) + pytest (后端) |

---

## 2. 整体架构

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────┐
│                      客户端层                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Web 前端     │  │  iOS App     │  │  管理后台     │  │
│  │  (React)     │  │  (SwiftUI)   │  │  (静态HTML)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼─────────────────┼──────────────────┼──────────┘
          │                 │                  │
          └─────────────────┼──────────────────┘
                            │ HTTP/HTTPS
                            ▼
┌─────────────────────────────────────────────────────────┐
│                      服务层                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │              FastAPI 后端服务                      │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │   │
│  │  │ Auth   │ │ Todo   │ │ Vocab  │ │ Choice │    │   │
│  │  │ 模块   │ │ 模块   │ │ 模块   │ │ 模块   │    │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘    │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐                │   │
│  │  │ Deliber│ │ Input  │ │ Chat   │                │   │
│  │  │ ate    │ │ 模块   │ │ 模块   │                │   │
│  │  └────────┘ └────────┘ └────────┘                │   │
│  └──────────────────────────────────────────────────┘   │
│                            │                             │
│                            ▼                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │              PostgreSQL 数据库                    │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
ark/
├── backend/                    # FastAPI 后端
│   ├── main.py                 # 应用入口
│   ├── lib/                    # 核心库（子应用注册等）
│   ├── routes/                 # API 路由模块
│   ├── scripts/                # 工具脚本
│   ├── tests/                  # pytest 测试
│   ├── web/admin/              # 管理后台静态页面
│   ├── pyproject.toml          # Python 依赖配置
│   └── Dockerfile
├── frontend/                   # React + TypeScript 前端
│   ├── src/
│   │   ├── components/         # UI 组件
│   │   ├── pages/              # 页面组件
│   │   ├── hooks/              # 自定义 Hooks
│   │   ├── lib/                # 工具库与 API 客户端
│   │   ├── routes/             # 路由守卫
│   │   ├── adapters/           # 专注工作适配器
│   │   └── index.css           # 全局样式与主题
│   ├── package.json
│   └── Dockerfile
├── ios/                        # iOS 原生应用
│   └── ArkMobile/
│       ├── Screens/            # 页面
│       ├── Models/             # 数据模型
│       ├── Networking/         # 网络层
│       └── Session/            # 会话管理
├── docs/                       # 项目文档
│   ├── devlogs/                # 开发日志
│   ├── testing/                # 测试文档
│   └── 功能说明.md             # 功能说明
├── docker-compose.yml          # Docker 编排
└── AGENTS.md                   # 仓库开发指南
```

---

## 3. 后端架构

### 3.1 入口与生命周期

**入口文件**：[main.py](file:///Users/qishu/Project/ark/backend/main.py)

FastAPI 应用使用 `lifespan` 上下文管理器管理启动/关闭生命周期：

```python
@asynccontextmanager
async def _lifespan(app: FastAPI):
    await init_auth(app)       # 初始化认证模块（建表、连接池）
    await init_checkin(app)    # 初始化打卡模块
    await init_todo(app)       # 初始化任务/事件/工作流模块
    await init_vocab(app)      # 初始化词汇模块
    await init_choice(app)     # 初始化选择题库模块
    # ... 更多模块初始化
    try:
        yield
    finally:
        await close_auth(app)  # 关闭连接池
```

**关键特性**：
- 使用 `asyncpg` 异步 PostgreSQL 连接池
- 所有模块共享 `app.state.auth_pool` 数据库连接池
- 支持 CORS（开发环境允许 localhost:5173）
- 静态文件挂载：`/uploads`（上传文件）、`/admin`（管理后台）

### 3.2 路由模块一览

| 模块 | 路由前缀 | 文件路径 | 核心功能 |
|------|---------|---------|---------|
| Auth | `/auth` | [auth_routes.py](file:///Users/qishu/Project/ark/backend/routes/auth_routes.py) | 用户注册/登录、邮箱验证、密码重置、个人资料、文件上传 |
| Todo | `/todo` | [routes/todo/routes.py](file:///Users/qishu/Project/ark/backend/routes/todo/routes.py) | 事件、任务、日程、工作流、专注记录、成就系统 |
| Vocab | `/api/vocab` | [routes/vocab/routes.py](file:///Users/qishu/Project/ark/backend/routes/vocab/routes.py) | 单词书、今日学习、复习队列、错词本、FSRS 间隔重复 |
| Choice | `/api/choice` | [routes/choice/routes.py](file:///Users/qishu/Project/ark/backend/routes/choice/routes.py) | 统一选择题库（兼容 ERC 阅读）、练习、错题复习 |
| Deliberate | `/api/admin` | [routes/deliberate/routes.py](file:///Users/qishu/Project/ark/backend/routes/deliberate/routes.py) | 刻意练习工作流配置（管理员）、题库导入 |
| Input | `/api/input` | [routes/input/routes.py](file:///Users/qishu/Project/ark/backend/routes/input/routes.py) | 输入型题目练习、题库上传 |
| Check-in | `/api/checkin` | [checkin_routes.py](file:///Users/qishu/Project/ark/backend/routes/checkin_routes.py) | 每日打卡、连续天数统计 |
| Chat | `/api/chat` | [chat_routes.py](file:///Users/qishu/Project/ark/backend/routes/chat_routes.py) | AI 对话代理（DeepSeek/OpenAI 兼容） |
| Admin | `/api/admin` | [admin_routes.py](file:///Users/qishu/Project/ark/backend/routes/admin_routes.py) | 管理员功能、用户管理 |
| App Registry | `/api/app-registry` | [app_registry_routes.py](file:///Users/qishu/Project/ark/backend/routes/app_registry_routes.py) | 子应用注册信息查询 |

### 3.3 核心库

#### 3.3.1 子应用注册系统

**文件**：[lib/sub_app_registry.py](file:///Users/qishu/Project/ark/backend/lib/sub_app_registry.py)

子应用注册是前后端共享的核心机制，定义了 Ark 中可扩展的子应用（如背单词、阅读训练）。

**关键数据类**：

- `SubAppDeclaration` — 子应用声明
  - `id`: 唯一标识（如 `vocab`, `erc`）
  - `name`: 显示名称
  - `icon`: Lucide 图标名
  - `route`: 前端路由路径
  - `focus_works`: 专注工作类型列表
  - `sections`: 首页模板分区

- `FocusWorkDeclaration` — 专注工作声明
  - `type`: 类型标识（如 `vocab_today`, `review`）
  - `template`: 使用的模板（`flashcard` / `choice_question`）
  - `content_bank_type`: 内容库类型（`word_deck` / `article_set`）
  - `content_selector`: 内容选择策略
  - `content_fields`: 配置字段定义

**内置子应用**：
1. **VOCAB（背单词）** — 今日单词、FSRS 混合复习
2. **ERC（阅读训练）** — 真题练习、错题复习

**核心函数**：
- `get_all()` — 返回所有已注册子应用
- `get_by_id(app_id)` — 按 ID 获取子应用
- `register(app)` — 动态注册新子应用（持久化到 JSON）

#### 3.3.2 内容选择器

**文件**：[lib/content_selector.py](file:///Users/qishu/Project/ark/backend/lib/content_selector.py)

定义内容选择策略接口，支持多种选题算法：
- `sequential` — 顺序选择
- `weighted_mistake` — 按错误权重选择
- `fsrs_mixed` — FSRS 间隔重复混合

### 3.4 模块架构模式

每个业务模块遵循统一的分层架构：

```
routes/xxx/
├── __init__.py       # 模块导出
├── routes.py         # API 路由层（请求处理、参数校验）
├── schemas.py        # Pydantic 数据模型（请求/响应）
├── service.py        # 业务逻辑层（核心算法）
├── repository.py     # 数据访问层（SQL 查询）
├── importer.py       # 数据导入（可选）
└── db.py             # 建表与初始化（可选）
```

**层间调用关系**：
```
routes.py → service.py → repository.py → PostgreSQL
```

### 3.5 认证与权限

**认证方式**：Bearer Token（PBKDF2 密码哈希）

**核心函数**（[auth_routes.py](file:///Users/qishu/Project/ark/backend/routes/auth_routes.py)）：

- `get_current_user()` — 从 Bearer Token 解析当前用户（FastAPI Dependency）
- `_hash_password()` — PBKDF2-HMAC-SHA256 密码哈希
- `_create_token()` — 生成访问令牌

**用户角色**：
- 普通用户
- 管理员（`is_admin=True`）— 可访问 `/api/admin/*` 路由

---

## 4. 前端架构

### 4.1 入口与路由

**入口文件**：[main.tsx](file:///Users/qishu/Project/ark/frontend/src/main.tsx)

使用 `HashRouter` 进行客户端路由，路由结构：

```
/login              # 登录页
/reset-password     # 重置密码
/                   # 首页（App 组件）
/apps               # 应用中心
/:appId             # 动态子应用首页
/vocab/today        # 词汇 - 今日学习
/vocab/study        # 词汇 - 学习
/vocab/review       # 词汇 - 复习
/vocab/mistakes     # 词汇 - 错词本
/vocab/words/:wordId # 词汇 - 单词详情
/admin/ui           # 管理员 UI 组件库
/deliberate-workflow # 刻意练习工作流（管理员）
```

**路由守卫**：
- `RequireAuth` — 需登录才能访问
- `RequireAdmin` — 需管理员权限

### 4.2 状态管理

使用 **Zustand** 进行状态管理，主要 Store：

| Store | 文件 | 用途 |
|-------|------|------|
| useAuthStore | [lib/auth.ts](file:///Users/qishu/Project/ark/frontend/src/lib/auth.ts) | 认证状态、用户信息、Token 持久化 |

**认证 Store 结构**：
```typescript
type AuthState = {
  token: string | null;           // 访问令牌
  expiresAt: number | null;       // 过期时间戳
  user: User | null;              // 用户信息
  setSession: (token, expiresIn) => void;
  setUser: (user) => void;
  clear: () => void;
};
```

持久化方式：`localStorage`（key: `ark-auth`）

### 4.3 API 客户端

**核心文件**：[lib/api.ts](file:///Users/qishu/Project/ark/frontend/src/lib/api.ts)

- `apiFetch(path, init)` — 自动注入 Bearer Token 的 fetch 封装
- `apiJson<T>(path, init)` — 带错误解析的 JSON 请求，401 自动跳转登录

**错误处理**：自动解析 FastAPI 验证错误，提取字段级错误信息并友好展示

**领域 API 模块**：

| 模块 | 文件 |
|------|------|
| Vocab | [lib/vocab/api.ts](file:///Users/qishu/Project/ark/frontend/src/lib/vocab/api.ts) |
| ERC | [lib/erc/api.ts](file:///Users/qishu/Project/ark/frontend/src/lib/erc/api.ts) |
| Choice | [lib/choice/api.ts](file:///Users/qishu/Project/ark/frontend/src/lib/choice/api.ts) |
| Events | [lib/events/api.ts](file:///Users/qishu/Project/ark/frontend/src/lib/events/api.ts) |
| Input | [lib/input/api.ts](file:///Users/qishu/Project/ark/frontend/src/lib/input/api.ts) |
| Deliberate | [lib/deliberate/api.ts](file:///Users/qishu/Project/ark/frontend/src/lib/deliberate/api.ts) |

### 4.4 子应用注册系统（前端）

**文件**：[lib/subAppRegistry.ts](file:///Users/qishu/Project/ark/frontend/src/lib/subAppRegistry.ts)

与后端 `sub_app_registry.py` 镜像对应，维护子应用声明。

**核心概念**：
- `SubAppDeclaration` — 子应用声明
- `FocusWorkDeclaration` — 专注工作声明
- `ContentConfigField` — 内容配置字段

**动态加载**：`loadDynamicRegistry()` 从后端 `/api/app-registry` 拉取动态注册的子应用，与内置声明合并。

### 4.5 专注工作系统

专注工作是 Ark 的核心体验，采用**适配器模式**统一不同类型的专注工作。

#### 4.5.1 类型定义

**文件**：[components/focus-work/focusWorkTypes.ts](file:///Users/qishu/Project/ark/frontend/src/components/focus-work/focusWorkTypes.ts)

```typescript
type FocusWorkType = 'vocab_today' | 'review' | 'practice' | 'task_focus' | 'input';

type FocusWorkDefinition = {
  type: FocusWorkType;
  title: string;
  subtitle: string;
  render: (props: FocusWorkRendererProps) => React.ReactNode;
};
```

#### 4.5.2 注册机制

**文件**：[components/focus-work/focusWorkRegistry.tsx](file:///Users/qishu/Project/ark/frontend/src/components/focus-work/focusWorkRegistry.tsx)

通过 `RENDER_MAP` 将专注工作类型映射到渲染组件：

| 类型 | 组件 | 说明 |
|------|------|------|
| `vocab_today` | `VocabTodayFocusWork` | 今日单词 |
| `review` | `ReviewFocusWork` | ERC 错题复习 |
| `practice` | `PracticeFocusWork` | ERC 真题练习 |
| `task_focus` | `TaskFocusWork` | 任务专注计时器 |
| `input` | `InputFocusWork` | 输入型练习 |

#### 4.5.3 模板系统

专注工作模板位于 [components/focus-work/templates/](file:///Users/qishu/Project/ark/frontend/src/components/focus-work/templates/)：

| 模板 | 文件 | 用途 |
|------|------|------|
| Flashcard | [FlashcardFocusTemplate.tsx](file:///Users/qishu/Project/ark/frontend/src/components/focus-work/templates/FlashcardFocusTemplate.tsx) | 闪卡模式（背单词） |
| Choice Question | [ChoiceQuestionFocusTemplate.tsx](file:///Users/qishu/Project/ark/frontend/src/components/focus-work/templates/ChoiceQuestionFocusTemplate.tsx) | 选择题模式 |
| Input Question | [InputQuestionFocusTemplate.tsx](file:///Users/qishu/Project/ark/frontend/src/components/focus-work/templates/InputQuestionFocusTemplate.tsx) | 输入题模式 |

#### 4.5.4 状态管理

**文件**：[components/focus-work/FocusWorkProvider.tsx](file:///Users/qishu/Project/ark/frontend/src/components/focus-work/FocusWorkProvider.tsx)

`FocusWorkProvider` 是专注工作的全局状态提供者，管理：
- 当前工作流状态
- 活动专注运行
- 阶段进度
- 全屏/最小化/关闭状态

### 4.6 首页布局

**文件**：[App.tsx](file:///Users/qishu/Project/ark/frontend/src/App.tsx)

首页采用左右双面板布局：

```
┌──────────────────────────────────────┐
│           Navigation Bar              │
├──────────────┬───────────────────────┤
│              │                       │
│  LeftPanel   │    RightPanel         │
│  (主内容区)  │    (侧边栏)           │
│              │                       │
│  - 主事件    │  - 安排列表           │
│  - 专注工作台│  - 工作流             │
│              │  - 成就               │
│              │  - 日历               │
└──────────────┴───────────────────────┘
```

**左面板组件**：[LeftPanel.tsx](file:///Users/qishu/Project/ark/frontend/src/components/LeftPanel.tsx)
**右面板组件**：[RightPanel.tsx](file:///Users/qishu/Project/ark/frontend/src/components/RightPanel.tsx)

### 4.7 主题系统

**文件**：[index.css](file:///Users/qishu/Project/ark/frontend/src/index.css)

使用 CSS 变量实现主题切换，通过 `data-theme` 属性切换：

```css
:root[data-theme="dark"]  { /* 暗色主题变量 */ }
:root[data-theme="light"] { /* 亮色主题变量 */ }
```

**语义化颜色变量**：
- `--ark-text` / `--ark-text-muted` / `--ark-text-faint`
- `--ark-surface` / `--ark-surface-strong` / `--ark-surface-subtle`
- `--ark-border` / `--ark-border-strong`
- `--ark-overlay` / `--ark-overlay-strong`
- `--ark-accent` / `--ark-accent-soft`

**专注工作组件**使用独立的组件级变量：
- `var(--focus-work-text)`
- `var(--focus-work-border)`
- `var(--focus-work-surface-soft)`

### 4.8 组件库

#### 4.8.1 基础组件

| 组件 | 文件 | 用途 |
|------|------|------|
| Button | [components/Button.tsx](file:///Users/qishu/Project/ark/frontend/src/components/Button.tsx) | 按钮 |
| AppModalFrame | [components/AppModalFrame.tsx](file:///Users/qishu/Project/ark/frontend/src/components/AppModalFrame.tsx) | 模态框框架 |
| HomeCard | [components/HomeCard.tsx](file:///Users/qishu/Project/ark/frontend/src/components/HomeCard.tsx) | 首页卡片 |
| HomeSectionHeader | [components/HomeSectionHeader.tsx](file:///Users/qishu/Project/ark/frontend/src/components/HomeSectionHeader.tsx) | 首页区块标题 |
| ToastContainer | [components/ToastContainer.tsx](file:///Users/qishu/Project/ark/frontend/src/components/ToastContainer.tsx) | 消息提示 |

#### 4.8.2 表单组件

位于 [components/forms/](file:///Users/qishu/Project/ark/frontend/src/components/forms/)：
- `FormInput` / `FormTextarea` / `FormSelect`
- `FormCheckbox` / `FormDateTimeInput` / `FormFieldLabel`

#### 4.8.3 日历组件

| 组件 | 文件 |
|------|------|
| CalendarWidget | [components/CalendarWidget.tsx](file:///Users/qishu/Project/ark/frontend/src/components/CalendarWidget.tsx) |
| MultiWeekCalendarGrid | [components/MultiWeekCalendarGrid.tsx](file:///Users/qishu/Project/ark/frontend/src/components/MultiWeekCalendarGrid.tsx) |
| MultiWeekCalendarModal | [components/MultiWeekCalendarModal.tsx](file:///Users/qishu/Project/ark/frontend/src/components/MultiWeekCalendarModal.tsx) |

### 4.9 事件工作台系统

**核心组件**：[EventWorkbenchModal.tsx](file:///Users/qishu/Project/ark/frontend/src/components/events/EventWorkbenchModal.tsx)

事件工作台是事件的核心操作面板，支持：
- AI 生成规划草案
- 从模板快速套用
- 编辑草案项
- 一键生成正式安排（任务+日程）

**相关 Hook**：
- `useEventArrangements` — 事件安排管理
- `usePrimaryEvent` — 当前主事件

---

## 5. iOS 端架构

### 5.1 项目结构

**目录**：[ios/ArkMobile/](file:///Users/qishu/Project/ark/ios/ArkMobile/)

```
ArkMobile/
├── ArkMobileApp.swift      # App 入口
├── RootView.swift          # 根视图
├── Screens/                # 页面
│   ├── Home/               # 首页
│   ├── Auth/               # 登录
│   ├── AppCenter/          # 应用中心
│   ├── Focus/              # 专注
│   ├── Tasks/              # 任务
│   ├── Vocab/              # 词汇
│   ├── ERC/                # 阅读
│   └── Settings/           # 设置
├── Models/                 # 数据模型
├── Networking/             # 网络层
├── Session/                # 会话管理
└── Design/                 # 设计系统
```

### 5.2 核心模块

| 模块 | 文件 | 功能 |
|------|------|------|
| APIClient | [Networking/APIClient.swift](file:///Users/qishu/Project/ark/ios/ArkMobile/ArkMobile/Networking/APIClient.swift) | API 请求客户端 |
| AppSession | [Session/AppSession.swift](file:///Users/qishu/Project/ark/ios/ArkMobile/ArkMobile/Session/AppSession.swift) | 全局会话状态 |
| KeychainTokenStore | [Session/KeychainTokenStore.swift](file:///Users/qishu/Project/ark/ios/ArkMobile/ArkMobile/Session/KeychainTokenStore.swift) | Keychain 令牌存储 |
| ArkTheme | [Design/ArkTheme.swift](file:///Users/qishu/Project/ark/ios/ArkMobile/ArkMobile/Design/ArkTheme.swift) | 主题设计系统 |

---

## 6. 核心业务模块

### 6.1 事件系统 (Event)

**后端**：[routes/todo/](file:///Users/qishu/Project/ark/backend/routes/todo/)

**核心概念**：
- **Event（事件）**：最上层组织单元，有开始日期和截止日期
- **Task（任务）**：需要推进完成的事项，支持周期循环
- **Appointment（日程）**：有明确时间点的安排
- **FocusWorkflow（工作流）**：专注-休息循环编排
- **Achievement（成就）**：里程碑追踪与反馈

**核心数据结构**（[schemas.py](file:///Users/qishu/Project/ark/backend/routes/todo/schemas.py)）：
- `TaskOut` / `TaskCreateRequest` / `TaskUpdateRequest`
- `EventOut` / `EventCreateRequest` / `EventUpdateRequest`
- `AppointmentOut` / `AppointmentCreateRequest`
- `FocusWorkflowOut` / `FocusWorkflowCreateRequest`
- `AchievementSummaryOut` / `AchievementSectionOut`

**事件存储**：[event_store.py](file:///Users/qishu/Project/ark/backend/routes/todo/event_store.py) 负责事件 CRUD

### 6.2 专注工作流 (Focus Workflow)

**后端核心**：[routes/todo/helpers.py](file:///Users/qishu/Project/ark/backend/routes/todo/helpers.py)

包含 50+ 个辅助函数，覆盖：
- 工作流创建与阶段管理
- 专注运行生命周期
- 任务完成状态计算
- 成就判定逻辑
- 日程重复规则解析

**工作流阶段**：
```
focus → pending_confirmation → break → focus → ... → completed
```

### 6.3 词汇系统 (Vocab)

**后端**：[routes/vocab/](file:///Users/qishu/Project/ark/backend/routes/vocab/)

**核心功能**：
- 多词书管理（Deck）
- 今日学习计划
- FSRS 间隔重复算法
- 错词本
- 词书继承（已掌握单词跨词书继承）

**核心数据结构**（[schemas.py](file:///Users/qishu/Project/ark/backend/routes/vocab/schemas.py)）：
- `VocabDeckOut` — 词书信息
- `VocabTodaySummaryOut` — 今日学习摘要
- `VocabOverviewOut` — 学习总览
- `VocabReviewSubmitIn/Out` — 复习提交

**服务层**：[service.py](file:///Users/qishu/Project/ark/backend/routes/vocab/service.py)
- `get_today_summary()` — 今日摘要
- `get_study_queue()` — 学习队列
- `get_review_queue()` — 复习队列
- `submit_review()` — 提交复习结果（FSRS 更新）

**前端**：
- 页面：[pages/Vocab/](file:///Users/qishu/Project/ark/frontend/src/pages/Vocab/)
- 组件：[components/Vocab/](file:///Users/qishu/Project/ark/frontend/src/components/Vocab/)
- Hooks：[hooks/vocab/](file:///Users/qishu/Project/ark/frontend/src/hooks/vocab/)

### 6.4 选择题库系统 (Choice / ERC)

**后端**：[routes/choice/](file:///Users/qishu/Project/ark/backend/routes/choice/)

**适配器模式**：[adapters.py](file:///Users/qishu/Project/ark/backend/routes/choice/adapters.py)

通过统一的选择题库接口兼容 ERC 阅读训练数据：
- `list_erc_as_choice_banks()` — 将 ERC 文章集映射为题库
- `list_erc_as_choice_items()` — 将 ERC 题目映射为选择题
- `resolve_choice_set_id()` — 解析题库 ID

### 6.5 刻意练习 (Deliberate)

**后端**：[routes/deliberate/](file:///Users/qishu/Project/ark/backend/routes/deliberate/)

**核心功能**：
- 工作流配置管理
- 多题库类型支持（闪卡、选择、输入）
- 题库导入与验证

**前端**：[pages/DeliberateWorkflow.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/DeliberateWorkflow.tsx)

### 6.6 打卡系统 (Check-in)

**后端**：[checkin_routes.py](file:///Users/qishu/Project/ark/backend/routes/checkin_routes.py)

**接口**：
- `POST /api/checkin` — 打卡
- `GET /api/checkin/status` — 获取打卡状态

**统计项**：
- 今日是否已打卡
- 当前连续天数（Streak）
- 累计打卡天数
- 打卡日期列表

### 6.7 AI 对话 (Chat)

**后端**：[chat_routes.py](file:///Users/qishu/Project/ark/backend/routes/chat_routes.py)

代理 OpenAI 兼容接口（DeepSeek 等），用于：
- 任务助手（自然语言生成任务）
- 事件工作台规划草案生成

**配置**：
- `CHAT_API_KEY` — API 密钥
- `CHAT_BASE_URL` — Base URL
- `CHAT_MODEL` — 模型名

---

## 7. 数据库设计

### 7.1 数据库选型

- **数据库**：PostgreSQL 16
- **驱动**：asyncpg（异步）
- **建表方式**：应用启动时自动建表（`CREATE TABLE IF NOT EXISTS`）

### 7.2 核心表概览

| 表名 | 所属模块 | 用途 |
|------|---------|------|
| `users` | auth | 用户表 |
| `auth_tokens` | auth | 访问令牌 |
| `email_verifications` | auth | 邮箱验证码 |
| `password_resets` | auth | 密码重置令牌 |
| `user_uploads` | auth | 用户上传文件 |
| `checkins` | checkin | 打卡记录 |
| `todo_events` | todo | 事件 |
| `todo_tasks` | todo | 任务 |
| `todo_appointments` | todo | 日程 |
| `todo_completion_records` | todo | 完成记录 |
| `focus_workflows` | todo | 工作流 |
| `focus_workflow_presets` | todo | 工作流预设 |
| `focus_logs` | todo | 专注日志 |
| `focus_app_work_logs` | todo | 子应用专注日志 |
| `event_plan_templates` | todo | 事件规划模板 |
| `event_template_store_templates` | todo | 模板库 |
| `vocab_decks` | vocab | 词书 |
| `vocab_words` | vocab | 单词 |
| `vocab_word_translations` | vocab | 单词释义 |
| `vocab_word_phrases` | vocab | 单词短语 |
| `vocab_word_sentences` | vocab | 单词例句 |
| `vocab_user_word_state` | vocab | 用户单词状态（FSRS） |
| `vocab_mistakes` | vocab | 错词本 |
| `vocab_snapshots` | vocab | 学习快照 |
| `choice_sets` | choice | 选择题集 |
| `choice_questions` | choice | 选择题目 |
| `choice_user_state` | choice | 用户答题状态 |
| `choice_mistakes` | choice | 错题本 |
| `choice_set_snapshots` | choice | 题库快照 |
| `input_sets` | input | 输入题集 |
| `input_questions` | input | 输入题目 |
| `input_user_state` | input | 用户答题状态 |
| `content_banks` | content_bank | 内容库 |
| `deliberate_workflow_configs` | deliberate | 刻意练习配置 |

### 7.3 建表位置

各模块独立负责建表，在各自的 `init_xxx()` 函数中执行：

| 模块 | 建表位置 |
|------|---------|
| auth | `init_auth()` in [auth_routes.py](file:///Users/qishu/Project/ark/backend/routes/auth_routes.py) |
| todo | `init_todo()` in [routes/todo/db.py](file:///Users/qishu/Project/ark/backend/routes/todo/db.py) |
| vocab | `init_vocab()` in [routes/vocab/repository.py](file:///Users/qishu/Project/ark/backend/routes/vocab/repository.py) |
| choice | `init_choice()` in [routes/choice/repository.py](file:///Users/qishu/Project/ark/backend/routes/choice/repository.py) |
| input | `init_input()` in [routes/input/db.py](file:///Users/qishu/Project/ark/backend/routes/input/db.py) |

---

## 8. API 接口概览

### 8.1 认证模块 (`/auth`)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/auth/register` | 用户注册 | 公开 |
| POST | `/auth/login` | 用户登录 | 公开 |
| POST | `/auth/verify-email` | 邮箱验证 | 公开 |
| POST | `/auth/verification/resend` | 重发验证码 | 公开 |
| POST | `/auth/password/forgot` | 忘记密码 | 公开 |
| POST | `/auth/password/reset` | 重置密码 | 公开 |
| GET | `/auth/me` | 获取当前用户 | 登录 |
| PATCH | `/auth/profile` | 更新个人资料 | 登录 |
| POST | `/auth/logout` | 登出 | 登录 |
| POST | `/auth/upload` | 上传文件 | 登录 |
| GET | `/auth/uploads` | 获取上传列表 | 登录 |
| DELETE | `/auth/uploads` | 删除上传文件 | 登录 |
| GET | `/auth/users` | 用户列表 | 登录/管理员 |

### 8.2 打卡模块 (`/api/checkin`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/checkin` | 打卡 |
| GET | `/api/checkin/status` | 获取打卡状态 |

### 8.3 任务/事件模块 (`/todo`)

**事件**：
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/todo/events` | 事件列表 |
| POST | `/todo/events` | 创建事件 |
| PATCH | `/todo/events/{id}` | 更新事件 |
| DELETE | `/todo/events/{id}` | 删除事件 |
| GET | `/todo/events/primary` | 获取主事件 |

**任务**：
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/todo/tasks` | 任务列表 |
| POST | `/todo/tasks` | 创建任务 |
| PATCH | `/todo/tasks/{id}` | 更新任务 |
| POST | `/todo/tasks/{id}/complete` | 完成任务 |

**日程**：
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/todo/appointments` | 日程列表 |
| POST | `/todo/appointments` | 创建日程 |
| PATCH | `/todo/appointments/{id}` | 更新日程 |

**工作流**：
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/todo/focus-workflow` | 当前工作流 |
| POST | `/todo/focus-workflow/start` | 启动工作流 |
| POST | `/todo/focus-workflow/pause` | 暂停 |
| POST | `/todo/focus-workflow/resume` | 恢复 |
| POST | `/todo/focus-workflow/skip-phase` | 跳过阶段 |

**成就**：
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/todo/achievements` | 成就总览 |
| GET | `/todo/achievements/sections` | 成就分区 |

### 8.4 词汇模块 (`/api/vocab`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vocab/decks` | 词书列表 |
| GET | `/api/vocab/decks/{id}/today` | 今日学习摘要 |
| GET | `/api/vocab/decks/{id}/overview` | 学习总览 |
| GET | `/api/vocab/decks/{id}/study-queue` | 学习队列 |
| GET | `/api/vocab/decks/{id}/review-queue` | 复习队列 |
| POST | `/api/vocab/decks/{id}/review` | 提交复习 |
| GET | `/api/vocab/decks/{id}/mistakes` | 错词本 |
| GET | `/api/vocab/words/{id}` | 单词详情 |

### 8.5 选择题库模块 (`/api/choice`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/choice/banks` | 题库列表 |
| GET | `/api/choice/items` | 题目列表 |
| GET | `/api/choice/overview` | 学习总览 |
| POST | `/api/choice/practice/start` | 开始练习 |
| POST | `/api/choice/practice/submit` | 提交答案 |
| GET | `/api/choice/review/next` | 下一道复习题 |
| POST | `/api/choice/review/submit` | 提交复习 |
| GET | `/api/choice/mistakes` | 错题本 |

### 8.6 输入题库模块 (`/api/input`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/input/banks` | 题库列表 |
| POST | `/api/input/banks` | 上传题库 |
| GET | `/api/input/practice/next` | 下一道题 |
| POST | `/api/input/practice/submit` | 提交答案 |

### 8.7 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 后端健康检查 |

---

## 9. 项目配置与依赖

### 9.1 后端依赖

**文件**：[backend/pyproject.toml](file:///Users/qishu/Project/ark/backend/pyproject.toml)

**核心依赖**：
| 包 | 版本 | 用途 |
|----|------|------|
| fastapi | >=0.115.0 | Web 框架 |
| uvicorn | >=0.30.0 | ASGI 服务器 |
| asyncpg | >=0.31.0 | PostgreSQL 异步驱动 |
| fsrs | >=6.3.1 | 间隔重复算法 |
| pydantic | - | 数据验证（FastAPI 内置） |
| python-dotenv | >=1.0.1 | 环境变量加载 |
| httpx | >=0.27.0 | HTTP 客户端 |
| python-multipart | >=0.0.20 | 文件上传 |
| sse-starlette | >=2.0.0 | Server-Sent Events |
| pyyaml | >=6.0.0 | YAML 解析 |

**开发依赖**：
- pytest >=9.0.2
- pytest-asyncio >=1.3.0
- ruff >=0.9.0

### 9.2 前端依赖

**文件**：[frontend/package.json](file:///Users/qishu/Project/ark/frontend/package.json)

**核心依赖**：
| 包 | 版本 | 用途 |
|----|------|------|
| react | ^19.2.4 | UI 框架 |
| react-dom | ^19.2.4 | React DOM |
| react-router-dom | ^7.13.2 | 路由 |
| zustand | ^5.0.12 | 状态管理 |
| lucide-react | ^1.7.0 | 图标库 |
| tailwindcss | ^4.2.2 | CSS 框架 |
| @tailwindcss/postcss | ^4.2.2 | Tailwind PostCSS |
| clsx | ^2.1.1 | class 名合并 |
| tailwind-merge | ^3.0.2 | Tailwind class 合并 |
| react-markdown | ^10.1.0 | Markdown 渲染 |
| remark-gfm | ^4.0.1 | GFM 支持 |
| katex | ^0.17.0 | 数学公式 |
| @dnd-kit/core | ^6.3.1 | 拖拽 |
| @dnd-kit/sortable | ^10.0.0 | 可排序拖拽 |
| canvas-confetti | ^1.9.4 | 庆祝动画 |

**开发依赖**：
- vite ^8.0.3
- typescript ~5.9.3
- vitest ^4.1.2
- eslint ^10.1.0
- @testing-library/react ^16.3.2

### 9.3 环境变量

**后端环境变量**（[.env.example](file:///Users/qishu/Project/ark/.env.example)）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | - |
| `AUTH_TOKEN_TTL_SECONDS` | Token 有效期（秒） | 86400 |
| `AUTH_PASSWORD_ITERATIONS` | PBKDF2 迭代次数 | 210000 |
| `AUTH_EMAIL_TOKEN_TTL_SECONDS` | 邮箱验证码有效期 | 1800 |
| `AUTH_EMAIL_DELIVERY_MODE` | 邮件发送模式 | `log` |
| `CHAT_API_KEY` | AI 对话 API Key | - |
| `CHAT_BASE_URL` | AI 对话 Base URL | - |
| `CHAT_MODEL` | AI 对话模型 | - |
| `MCP_SERVERS` | MCP 服务器配置 | - |
| `MCP_ALLOW_TOOLS` | MCP 工具白名单 | - |

---

## 10. 开发与运行指南

### 10.1 前置要求

- Node.js 20.x + pnpm 9.x
- Python 3.11+ + uv
- PostgreSQL 16（或使用 Docker）

### 10.2 后端开发

```bash
cd backend

# 安装依赖
uv sync

# 复制环境变量
cp .env.example .env
# 编辑 .env，配置 DATABASE_URL 等

# 启动开发服务器（热重载）
uv run uvicorn main:app --reload --port 8000
```

**访问**：http://localhost:8000

**运行测试**：
```bash
uv run pytest
```

**代码检查**：
```bash
uv run ruff check .
```

### 10.3 前端开发

```bash
cd frontend

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

**访问**：http://localhost:5173

**类型检查**：
```bash
pnpm check
```

**构建生产版本**：
```bash
pnpm build
```

**运行测试**：
```bash
pnpm test
```

**代码检查**：
```bash
pnpm lint
```

### 10.4 默认测试账号

- **用户名**：`qishuadmin`
- **密码**：`12345678`

### 10.5 一键启动脚本

后端提供 `dev.sh` 一键启动脚本：
```bash
cd backend
chmod +x dev.sh
./dev.sh
```

---

## 11. 部署指南

### 11.1 Docker Compose 部署

**配置文件**：[docker-compose.yml](file:///Users/qishu/Project/ark/docker-compose.yml)

```bash
# 克隆代码
git clone <repo-url>
cd ark

# 准备环境变量
cp .env.example backend/.env
# 编辑 backend/.env，配置 CHAT_API_KEY 等

# 构建并启动
docker compose build --no-cache
docker compose up -d

# 查看日志
docker compose logs -f
```

**服务端口**：
| 服务 | 端口 | 说明 |
|------|------|------|
| 前端 (nginx) | 80 | 浏览器访问 |
| 后端 (uvicorn) | 8000 | API 服务 |
| PostgreSQL | 5432 | 数据库 |

### 11.2 日常运维

```bash
# 查看状态
docker compose ps

# 更新代码并重启
git pull
docker compose build --no-cache
docker compose up -d

# 仅重启后端
docker compose build backend
docker compose up -d backend

# 停止服务
docker compose down

# 数据库备份
docker exec ark-db-1 pg_dump -U postgres ark > backup.sql

# 数据库恢复
cat backup.sql | docker exec -i ark-db-1 psql -U postgres ark
```

---

## 12. 编码规范

### 12.1 后端规范（Python）

- **代码风格**：Ruff 格式化，行宽 120
- **命名约定**：snake_case（模块、函数、变量）
- **类型标注**：使用类型提示（`typing.Annotated` 等）
- **异步优先**：数据库操作全部使用 asyncpg 异步
- **模块结构**：routes → service → repository 三层架构

### 12.2 前端规范（TypeScript/React）

- **组件命名**：PascalCase（`AppCenter.tsx`）
- **Hooks 命名**：`useX` 前缀
- **样式**：Tailwind CSS 语义化类（`text-ark-text` 等），禁止硬编码颜色
- **状态管理**：Zustand + localStorage 持久化
- **测试**：Vitest + Testing Library
- **子应用分组**：大模块按命名空间分组（`pages/Vocab/`、`components/Vocab/` 等）

### 12.3 UI 统一规范

详见 [docs/frontend-ui-unification.md](file:///Users/qishu/Project/ark/docs/frontend-ui-unification.md)

- 优先复用基础组件：`Button`、`AppModalFrame`、`HomeCard`、`HomeSectionHeader`
- 使用语义化 Tailwind 类，引用 `--ark-*` CSS 变量
- 专注工作组件使用 `var(--focus-work-*)` 组件级变量
- 新增组件需更新 UI 统一文档

### 12.4 提交规范

- 格式：`type(scope): description`
- 类型：`feat` / `fix` / `chore` / `refactor` / `docs`
- 示例：`feat(frontend): add vocab focus work UI`

---

## 附录

### A. 参考文档

- [AGENTS.md](file:///Users/qishu/Project/ark/AGENTS.md) — 仓库开发指南
- [docs/功能说明.md](file:///Users/qishu/Project/ark/docs/功能说明.md) — 产品功能说明
- [docs/frontend-ui-unification.md](file:///Users/qishu/Project/ark/docs/frontend-ui-unification.md) — 前端 UI 统一规范
- [docs/开发日志.md](file:///Users/qishu/Project/ark/docs/开发日志.md) — 开发日志
- [DEPLOY.md](file:///Users/qishu/Project/ark/DEPLOY.md) — 部署指南
- [backend/README.md](file:///Users/qishu/Project/ark/backend/README.md) — 后端说明
- [frontend/README.md](file:///Users/qishu/Project/ark/frontend/README.md) — 前端说明

### B. 关键设计模式

| 模式 | 应用场景 |
|------|---------|
| 子应用注册模式 | 前后端共享的子应用扩展机制 |
| 适配器模式 | Choice 模块兼容 ERC、专注工作模板适配 |
| 三层架构 | routes → service → repository |
| 生命周期管理 | FastAPI lifespan 管理模块初始化/销毁 |
| 状态机 | 工作流阶段、专注运行状态 |

---

*最后更新：2026-06-28*
