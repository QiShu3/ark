# ArXiv 检索与用户论文状态后端 Spec

## Why
当前需要一个极简后端：按条件搜索 ArXiv 论文，并记录用户是否读过、是否收藏。为降低复杂度，本期不做论文版本追踪，也不引入任务与日志表。

## What Changes
- 后端统一使用 `/arxiv` 作为路由前缀
- 通过 Python `arxiv` 库调用 ArXiv API，完成论文条件检索
- 数据库仅保留一张 `papers` 表，记录用户论文状态
- 去除 `paper_versions`、`crawl_jobs`、`crawl_logs` 相关设计
- 输出最小 API 集：检索、状态写入、状态查询、健康检查
- 输出最小测试集：单元、集成、点火（冒烟）

## Impact
- Affected specs: 条件检索能力、用户论文状态能力
- Affected code: `/arxiv` 路由层、arxiv 检索服务、papers 数据访问层、测试目录

## ADDED Requirements
### Requirement: 基于 arxiv 库的条件检索
系统 SHALL 通过 Python `arxiv` 库执行论文检索，并返回标准化结果。

#### Scenario: 用户按条件检索论文
- **WHEN** 用户调用 `/arxiv/search` 并传入关键词、分类、作者、limit、排序条件
- **THEN** 系统使用 `arxiv.Client` + `arxiv.Search` 执行查询
- **THEN** 系统返回论文列表（至少包含 arxiv_id、title、authors、published、summary）

### Requirement: 单表用户状态持久化
系统 SHALL 仅使用 `papers` 一张表保存用户论文状态，不引入版本表与任务日志表。

#### Scenario: 用户标记收藏或已读
- **WHEN** 用户调用状态写入接口提交用户与论文状态
- **THEN** 系统在 `papers` 表中新增或更新对应记录
- **THEN** 记录字段至少包含：主键、所属用户、arxiv_id、是否收藏、是否读过

### Requirement: `/arxiv` API 命名空间
系统 SHALL 提供统一 `/arxiv` 前缀接口，覆盖检索与状态管理的最小闭环。

#### Scenario: 查询用户状态
- **WHEN** 用户调用 `/arxiv/papers`（按 user_id 过滤）
- **THEN** 系统返回该用户已记录的论文状态列表

### Requirement: 最小测试闭环
系统 SHALL 提供可执行测试，验证检索、状态写入与查询。

#### Scenario: 执行测试
- **WHEN** 开发者运行测试
- **THEN** 单元测试覆盖 arxiv 查询参数构建与结果映射
- **THEN** 集成测试覆盖 `/arxiv/search` 与状态写入/查询接口
- **THEN** 点火（冒烟）测试验证服务启动、健康检查、最小写读闭环

## MODIFIED Requirements
### Requirement: 精简模型策略
由“多表建模（版本、任务、日志）”调整为“单表 papers 建模”，以最小复杂度先满足检索与状态记录目标。

## REMOVED Requirements
### Requirement: 论文版本追踪与抓取任务日志
**Reason**: 当前目标仅为检索与用户状态记录，不需要版本管理与任务审计。
**Migration**: 删除 `paper_versions`、`crawl_jobs`、`crawl_logs` 设计与对应接口。
