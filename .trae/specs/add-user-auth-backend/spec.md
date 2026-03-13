# 用户管理 Auth 后端 Spec

## Why
当前后端缺少统一的用户认证与用户管理能力，导致需要鉴权的接口难以复用与维护。将所有 Auth 相关路由集中到独立文件，并在 main.py 统一挂载，可降低耦合并便于扩展。

## What Changes
- 新增 Auth 路由模块：将所有与认证/用户管理相关的路由集中到一个独立的 Python 文件中（例如 `backend/auth_routes.py` 或 `backend/routes/auth.py`）。
- 在 `main.py` 中挂载该 Auth 路由模块（FastAPI `include_router`），并统一设置路由前缀（建议 `/auth` 与 `/users` 或合并为 `/auth` 下的子路由）。
- 新增用户数据模型与持久化（复用现有数据库/ORM 方案；若当前无数据库层，则引入最小可用的持久化方案）。
- 新增鉴权依赖（例如 Bearer Token），为后续需要登录态的接口提供可复用的 `get_current_user` 能力。
- 新增安全能力：密码安全存储（哈希+盐）、访问令牌签发与校验、基础错误处理。
- **BREAKING（可选）**：若项目已有零散的 auth 相关路由，迁移至新模块后原路由路径可能调整；需在实现阶段确认并提供兼容或迁移说明。

## Impact
- Affected specs: 用户注册/登录、访问令牌鉴权、用户信息查询、用户列表管理（可选管理员）。
- Affected code: `backend/main.py`、新增/修改 Auth 路由文件、用户模型文件、配置加载（环境变量）、（可选）数据库初始化与迁移脚本。

## ADDED Requirements

### Requirement: Auth 路由集中化
系统 SHALL 将所有与认证与用户管理相关的 HTTP 路由定义在同一个独立的 Python 文件中，并通过 `main.py` 挂载对外提供服务。

#### Scenario: 路由挂载成功
- **WHEN** 服务启动
- **THEN** `main.py` 已包含对 Auth 路由模块的挂载
- **AND** 访问 `GET /health` 仍正常（不受影响）

### Requirement: 用户注册
系统 SHALL 提供用户注册接口，用于创建本地用户账号。

#### Scenario: 注册成功
- **WHEN** 客户端提交合法的用户名/邮箱与密码
- **THEN** 系统创建用户记录
- **AND** 密码不以明文存储
- **AND** 返回用户基础信息（不包含密码相关字段）

### Requirement: 用户登录与令牌签发
系统 SHALL 提供登录接口，校验凭证并签发访问令牌（Bearer Token）。

#### Scenario: 登录成功
- **WHEN** 客户端提交正确的用户名/邮箱与密码
- **THEN** 系统返回访问令牌
- **AND** 令牌可用于访问受保护接口

#### Scenario: 登录失败
- **WHEN** 客户端提交错误凭证
- **THEN** 系统返回明确的 401/403 错误响应（不泄露敏感信息）

### Requirement: 当前用户查询
系统 SHALL 提供查询当前登录用户信息的接口（例如 `GET /auth/me`）。

#### Scenario: 查询成功
- **WHEN** 客户端携带有效 Bearer Token 请求
- **THEN** 返回该 token 对应用户的基础信息

#### Scenario: 查询失败
- **WHEN** 客户端缺少 token 或 token 无效/过期
- **THEN** 返回 401

### Requirement: 用户管理（最小集）
系统 SHALL 提供用户管理能力用于后端管理用户账户（最小集：列表/查询；扩展：禁用/启用/删除）。

#### Scenario: 列出用户（受保护）
- **WHEN** 已认证用户请求用户列表
- **THEN** 系统根据权限策略决定是否允许访问（默认：仅管理员可访问；若无管理员概念则暂时仅允许自身信息查询）

### Requirement: 配置与密钥
系统 SHALL 从环境变量读取鉴权相关配置（例如 JWT 密钥、算法、过期时间），并拒绝在日志或响应中泄露密钥。

## MODIFIED Requirements

### Requirement: main.py 路由组织
`main.py` SHALL 作为统一入口，负责挂载 API 路由模块（包含现有路由与新增的 Auth 路由模块），避免在入口文件中直接堆叠业务路由实现。

## REMOVED Requirements

### Requirement: 分散的 Auth 路由（如存在）
**Reason**: 统一维护与复用鉴权依赖，减少重复实现与安全风险。
**Migration**: 将既有 auth 相关端点迁移至独立 Auth 路由文件；如对外路径变化，在实现阶段提供临时兼容路由或更新前端调用路径。

