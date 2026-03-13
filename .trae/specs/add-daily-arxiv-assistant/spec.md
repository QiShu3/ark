# Arxiv 每日秘书页 Spec

## Why
当前 Arxiv 仅支持手动检索与逐条阅读，缺少“每日自动更新 + 当日阅读摘要”能力。需要新增每日工作流，帮助用户固定时间获得未读论文并由 AI 给出阅读提要。

## What Changes
- 在 Arxiv 顶部视图切换区新增“每日”按钮，位置在“已读”右侧。
- 新增“每日”页面，复用检索参数输入能力，并增加“每日更新时间”参数。
- 支持创建每日任务配置：根据用户填写参数，在每日固定时间自动更新“相关且未读”论文集合。
- 在“每日”页面新增 AI 聊天框，自动基于当日论文标题与摘要生成简要总结报告。
- 为“每日”AI 配置任务管理权限：仅允许查看任务与添加任务，不允许删除任务。
- “每日”AI 在建议添加任务时，必须沿用现有 `div` 中的确认弹窗逻辑（先弹窗确认，再执行）。

## Impact
- Affected specs: Arxiv 检索与视图切换、每日任务调度、AI 助手权限控制、任务创建确认流
- Affected code: frontend/src/pages/Arxiv.tsx、frontend/src/components/ChatBox.tsx、backend/main.py、backend/MCP/assistant_runner.py、backend/routes/arxiv_routes.py、任务相关后端路由与权限校验模块

## ADDED Requirements
### Requirement: 每日入口与页面
系统 SHALL 在 Arxiv 页面提供“每日”入口，并展示独立的每日配置与摘要区域。

#### Scenario: 用户切换到每日页
- **WHEN** 用户点击“每日”按钮
- **THEN** 页面切换到每日视图，并展示每日配置表单、当日论文列表区域、每日 AI 聊天框

### Requirement: 每日任务配置与定时更新
系统 SHALL 允许用户保存每日检索配置，并在指定时间自动刷新当日相关未读论文。

#### Scenario: 创建每日任务成功
- **WHEN** 用户填写关键词/分类/作者/排序/每页数量及每日更新时间并提交
- **THEN** 系统保存配置，并按该时间每天执行检索
- **THEN** 系统写入“相关且未读”的论文结果作为当日候选阅读集

#### Scenario: 定时更新执行
- **WHEN** 到达用户设置的每日更新时间
- **THEN** 系统按保存配置执行检索并更新当日未读候选集
- **THEN** 已标记已读论文不会重复进入当日候选集

### Requirement: 每日 AI 总结秘书
系统 SHALL 在每日页提供 AI 秘书能力，自动总结当天待阅读论文。

#### Scenario: 生成当日摘要报告
- **WHEN** 用户打开每日页或触发“生成今日总结”
- **THEN** AI 读取当天候选论文的标题与摘要
- **THEN** 返回简要中文报告，包含主题概览与建议阅读优先级

### Requirement: 每日 AI 任务权限约束
系统 SHALL 对每日 AI 的任务管理权限做最小化限制，仅允许查看与新增任务。

#### Scenario: 允许查看与新增任务
- **WHEN** 每日 AI 访问任务工具
- **THEN** 可调用任务查询与任务新增能力

#### Scenario: 禁止删除任务
- **WHEN** 每日 AI 尝试调用任务删除能力
- **THEN** 系统拒绝执行并返回权限受限提示

### Requirement: 每日 AI 批量加任务确认
系统 SHALL 在把当天 n 篇论文写入任务前，使用与 `div` 现有逻辑一致的确认弹窗向用户发起确认。

#### Scenario: 确认后批量创建任务
- **WHEN** AI 生成“将今日 n 篇论文加入任务”的建议
- **THEN** 前端弹出确认弹窗，展示将要创建的任务数量与摘要信息
- **WHEN** 用户在弹窗中确认
- **THEN** 系统为每篇论文创建一条任务
- **THEN** 任务标题和描述包含论文标题与摘要要点

#### Scenario: 用户取消不创建
- **WHEN** 前端弹出确认弹窗且用户取消
- **THEN** 系统不创建任何任务

## MODIFIED Requirements
### Requirement: Arxiv 视图切换
系统 SHALL 将 Arxiv 顶部视图从“搜索/收藏/已读”扩展为“搜索/收藏/已读/每日”，并保持现有三类视图行为不变。

### Requirement: AI 工具权限模型
系统 SHALL 支持按场景隔离 AI 允许工具集合：普通聊天保留原有能力；每日秘书仅保留任务查看与添加能力，不含删除能力。

### Requirement: 任务创建确认交互一致性
系统 SHALL 统一“每日”AI 与 `div` 现有 AI 的任务创建确认行为：涉及新增任务时必须先弹窗确认，未确认不得落库。

## REMOVED Requirements
### Requirement: 无
**Reason**: 本次为增量扩展，不移除既有需求。  
**Migration**: 无需迁移。
