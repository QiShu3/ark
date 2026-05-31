# Admin Panel Design

## Overview

Ark 管理员面板是一个独立的后台管理系统，供管理员查看系统数据、管理用户和内容。采用纯静态 HTML + 原生 JS 实现，由 FastAPI 直接 serve，无构建步骤。

## 架构决策

- **独立 SPA**：与主前端 `frontend/` 完全隔离，放在 `backend/web/admin/`
- **纯静态**：HTML + CSS + 原生 JS，零依赖，无 npm/构建
- **暖色调设计**：独立于主应用的暗色风格，使用纸张暖色系（棕色调强调色）
- **侧边栏导航**：固定左侧，三个分组（主看板、子应用、功能）

## 目录结构

```
backend/
  web/
    admin/
      index.html          # 主看板（用户概览 + 签到专注）
      apps.html           # 子应用宫格
      apps-vocab.html     # 词汇管理详情
      apps-erc.html       # ERC 管理详情
      users.html          # 用户管理
      templates.html      # 模板商店
      css/
        common.css         # 共享设计系统
      js/
        api.js             # API 调用封装（fetch + auth token）
        app.js             # 全局逻辑（侧边栏高亮、权限检查）
```

来源：`backend/temp/Web-Prototype/` 中的设计稿直接搬入改造。

## 页面结构

### 主看板 `/admin/index.html`

**区块 A — 用户概览**（4 个统计卡片）
- 总用户数 + 较上月变化
- 今日新增 + 较昨日变化
- 邮箱验证率
- 7日活跃用户数

**区块 B — 签到与专注**
- 左侧大卡片：今日签到率 / 今日总专注时长 / 人均专注时长 + 近7天趋势柱状图
- 右侧卡片：连续签到 Top 5 用户列表

### 子应用宫格 `/admin/apps.html`

- 2×n 网格，每个子应用一张卡片（Icon + 名称 + 摘要数据 + 箭头）
- 当前子应用：词汇、ERC
- 点击进入对应管理页

### 词汇管理 `/admin/apps-vocab.html`

- 面包屑：子应用 > 词汇
- 统计区：总学习单词数 / 今日复习量 / 平均正确率
- 列表区：词汇库表格（名称、单词数、学习人数）

### ERC 管理 `/admin/apps-erc.html`

- 面包屑：子应用 > ERC
- 统计区：总做题数 / 今日做题量 / 平均正确率
- 列表区：阅读集表格（名称、文章数、做题人数）

### 用户管理 `/admin/users.html`

- 筛选：搜索框（用户名/邮箱）+ 状态筛选（全部/管理员/普通/已禁用）+ 排序（注册时间/用户名/最后活跃）
- 表格：头像、用户名、邮箱、验证状态、管理员标识、状态（启用/禁用）、注册时间、操作（编辑/重置密码/删除）
- 分页

### 模板商店 `/admin/templates.html`

- 操作栏：新建模板按钮
- 模板卡片列表（名称、分类、描述、关联项数）
- 操作：编辑、删除

## 后端 API

新增 `backend/routes/admin_routes.py`，前缀 `/api/admin`。

### 权限

```python
async def require_admin(user = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(403, "Admin access required")
    return user
```

### 端点

**主看板：**
- `GET /api/admin/stats/overview` — 总用户数、今日新增、验证率、7日活跃
- `GET /api/admin/stats/checkin` — 今日签到率、连续签到 Top 5
- `GET /api/admin/stats/focus` — 今日总专注时长、人均时长、近7天趋势

**子应用：**
- `GET /api/admin/apps` — 子应用列表 + 摘要数据
- `GET /api/admin/apps/vocab/stats` — 词汇学习数据总览
- `GET /api/admin/apps/vocab/decks` — 词汇库列表 + 统计
- `GET /api/admin/apps/erc/stats` — ERC 做题数据总览
- `GET /api/admin/apps/erc/sets` — 阅读集列表 + 统计

**用户管理：**
- `GET /api/admin/users` — 用户列表（分页、搜索、筛选）
- `PATCH /api/admin/users/{id}` — 编辑（启用/禁用、设为管理员）
- `POST /api/admin/users/{id}/reset-password` — 重置密码（生成临时密码）
- `DELETE /api/admin/users/{id}` — 删除用户

**模板商店：**
- `GET /api/admin/templates` — 模板列表
- `POST /api/admin/templates` — 创建模板
- `PATCH /api/admin/templates/{id}` — 编辑模板
- `DELETE /api/admin/templates/{id}` — 删除模板

## 前端 JS

### api.js

封装所有 `/api/admin/*` 调用，自动附加 Bearer token（从主应用的 localStorage `ark-auth` 中读取），处理 401 跳转。

### app.js

- 页面加载时检查 `is_admin`，非管理员跳转首页
- 侧边栏当前页高亮
- 数据加载和表格渲染
- Toast 通知系统
- 模态框（确认删除、重置密码结果等）

## 权限与安全

- 后端每个端点都经过 `require_admin` 依赖校验
- 前端加载时检查 `user.is_admin`，非管理员立即跳转
- Admin token 与主应用共用，无需额外登录

## 路由挂载

在 `backend/main.py` 中：

```python
from starlette.staticfiles import StaticFiles
app.mount("/admin", StaticFiles(directory="web/admin", html=True), name="admin")
```

访问 `http://localhost:8000/admin/` 即可进入管理面板。

## 分阶段实现

**阶段 1（当前）：**
- 搬入设计稿，改造为动态页面
- 实现主看板 API + 页面数据对接
- 实现用户管理 API + 完整 CRUD

**阶段 2：**
- 子应用宫格 + 词汇/ERC 管理页面对接
- 模板商店 CRUD

**阶段 3：**
- 数据导出功能
- 更多统计指标
