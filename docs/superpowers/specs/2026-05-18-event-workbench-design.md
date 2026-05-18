# 事件工作台设计

## 概述

本设计将“事件”从一个倒计时和绑定标签，升级为 Home 内的核心沉浸式工作空间。

用户从 Home 左侧主事件倒计时卡片进入全屏事件工作台。工作台覆盖当前 Home，不切换路由；关闭后回到原界面。事件工作台负责围绕一个事件完成计划搭建、模板套用、计划草稿编辑、正式任务/日程生成，以及已创建安排的聚合查看。

第一版不做自定义成就、不做 AI 拆解、不做多事件路由页、不做事件阶段/路线图。成就只展示现有自动派生的事件成就摘要。

## 已确认的产品决策

- 采用完整事件工作台方向，事件是核心功能，不只是创建时的附属配置。
- 事件工作台入口来自 Home 左侧倒计时卡片。
- 工作台使用全屏沉浸弹窗，不切换路由。
- 创建事件时必须填写事件名称、开始日期、截止时间。
- `start_date` 是必填日期字段；`due_at` 保持日期时间字段。
- 成就子功能第一版跳过自定义配置，仅展示现有自动成就摘要。
- 砍掉事件计划/阶段功能。
- 支持全局模板库，模板不归属于某个事件。
- 模板库第一版支持完整管理：新建、编辑、复制、删除。
- 模板支持两种时间规则：从开始日期顺推、从截止时间倒推。
- 模板编辑器分为任务模板区和日程模板区。
- 模板项只保存基础字段：标题、备注、相对时间。
- 套用模板后，在事件工作台内生成一份计划草稿。
- 计划草稿分为任务草稿和日程草稿。
- 模板编辑器轻；事件工作台里的计划草稿可以进行接近完整的任务/日程编辑。
- 单个事件只保留当前一份计划草稿。
- 如果事件已有计划草稿，再套用模板时提示覆盖当前计划草稿。
- 计划草稿生成正式安排后，从草稿区移走，进入已创建任务/日程聚合区。
- 多方案能力放在模板库中解决，不在单个事件里保存多份计划草稿。
- 用户在事件里修改计划草稿后，可以选择回写模板或另存为新模板。

## 目标

- 让事件成为用户组织一段目标工作的中心。
- 创建事件后，用户可以在同一个工作台里规划任务和日程。
- 让模板成为可长期积累的个人计划资产。
- 模板套用后先形成可检查、可编辑的计划草稿，再由用户生成正式安排。
- 正式任务和日程继续进入已有任务系统、日程系统和日历系统，同时保留 `event_id` 关联供事件工作台聚合。
- 在不改造成完整项目管理系统的前提下，提供清晰的事件规划闭环。

## 非目标

- 不新增事件阶段、路线图或看板。
- 不做自定义成就模板、手动成就或成就条件编辑。
- 不做 AI 自动拆解。
- 不新增独立 `/events/:id` 页面路由。
- 不支持单个事件保存多份事件内计划草稿。
- 不在模板项里保存完整任务/日程字段。
- 不替代现有任务、日程、日历和成就系统。

## 用户体验

### 入口

Home 左侧主事件倒计时卡片成为事件工作台入口。

- 有主事件时，点击倒计时卡片打开该事件工作台。
- 没有主事件时，卡片显示创建事件入口。
- 创建事件成功后，直接进入新事件工作台。
- 原有事件编辑能力并入工作台的事件管理区。

### 创建事件

创建事件需要填写：

- 事件名称
- 开始日期
- 截止时间
- 是否设为主事件

开始日期用于顺推模板，截止时间用于倒计时和倒推模板。

### 工作台结构

工作台第一版包含五个区域。

#### 事件总览

展示和管理当前事件：

- 事件名称
- 开始日期
- 截止时间
- 倒计时
- 主事件标记
- 编辑事件
- 删除事件
- 设为主事件

截止时间变更时，继续沿用现有继承逻辑：绑定到事件且未手动覆盖时间的任务/日程随事件时间更新。

#### 模板区

模板区用于快速规划当前事件。

能力包括：

- 选择模板
- 套用模板
- 打开模板管理弹窗
- 将当前计划草稿另存为模板
- 将当前计划草稿回写到来源模板

如果当前事件已有计划草稿，套用模板前需要确认覆盖。

#### 计划草稿区

计划草稿是模板套用到当前事件后的可编辑预览。它还不是正式任务或日程。

计划草稿分为：

- 任务草稿
- 日程草稿

计划草稿可以在工作台里进行接近完整的编辑。任务草稿可补充优先级、目标时长、任务类型、日期、标签、重复规则等常用任务字段。日程草稿可补充开始/结束时间、备注、重复规则、关联任务等常用日程字段。

用户点击“生成正式安排”后，系统将任务草稿创建到任务系统，将日程草稿创建到日程/日历系统，并全部绑定当前事件。

#### 已创建安排区

已创建安排区按当前 `event_id` 聚合正式任务和日程。

它展示：

- 已创建任务
- 已创建日程

这些记录不是事件工作台私有数据，而是已有任务系统和日程系统中的正式记录。事件工作台只是按事件聚合展示它们。

计划草稿生成正式安排后，对应草稿从草稿区移走，正式记录出现在已创建安排区。

#### 成就摘要区

成就摘要区只读展示现有自动派生的事件成就摘要。

第一版不在事件工作台中编辑成就，不新增自定义成就。该区域可以提供打开现有成就弹窗或详情的入口。

## 模板库

模板库是全局能力，不属于某个事件。

模板管理弹窗支持：

- 新建模板
- 编辑模板
- 复制模板
- 删除模板
- 查看模板列表

模板包含：

- 模板名称
- 模板说明
- 时间模式
- 任务模板项
- 日程模板项

时间模式有两种：

- `from_start`：从事件开始日期顺推。模板项的相对时间表示开始后第 N 天。
- `before_due`：从事件截止时间倒推。模板项的相对时间表示截止前 N 天。

模板项只保存基础字段：

- 标题
- 备注
- 相对时间
- 排序

模板项不保存优先级、目标时长、重复规则、标签等完整任务/日程字段。这些细节在模板套用到事件后，由计划草稿编辑补充。

## 数据模型

### 事件

现有 `events` 表新增：

- `start_date DATE NOT NULL`

旧数据迁移时，用 `due_at::date` 作为兜底值，保证迁移可执行。用户之后可以在事件工作台中编辑真实开始日期。

事件 API 的创建、更新、返回结构都需要包含 `start_date`。

### 模板表

新增 `event_plan_templates`：

- `id UUID PRIMARY KEY`
- `user_id BIGINT NOT NULL`
- `name VARCHAR(255) NOT NULL`
- `description TEXT NULL`
- `schedule_mode VARCHAR(32) NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

`schedule_mode` 取值：

- `from_start`
- `before_due`

新增 `event_plan_template_items`：

- `id UUID PRIMARY KEY`
- `template_id UUID NOT NULL`
- `kind VARCHAR(32) NOT NULL`
- `title VARCHAR(255) NOT NULL`
- `content TEXT NULL`
- `offset_days INTEGER NOT NULL`
- `sort_order INTEGER NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

`kind` 取值：

- `task`
- `appointment`

### 计划草稿表

每个事件最多一份当前计划草稿。

新增 `event_plan_drafts`：

- `id UUID PRIMARY KEY`
- `event_id UUID NOT NULL`
- `user_id BIGINT NOT NULL`
- `source_template_id UUID NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

需要对 `event_id` 建唯一约束，保证单事件单草稿。

新增 `event_plan_draft_items`：

- `id UUID PRIMARY KEY`
- `draft_id UUID NOT NULL`
- `kind VARCHAR(32) NOT NULL`
- `title VARCHAR(255) NOT NULL`
- `content TEXT NULL`
- `scheduled_for TIMESTAMPTZ NULL`
- `starts_at TIMESTAMPTZ NULL`
- `ends_at TIMESTAMPTZ NULL`
- `payload_json JSONB NOT NULL DEFAULT '{}'`
- `sort_order INTEGER NOT NULL`
- `created_subject_id UUID NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

任务草稿主要使用 `scheduled_for` 或 payload 中的任务日期字段。日程草稿主要使用 `starts_at` 和 `ends_at`。`payload_json` 保存任务/日程的额外编辑字段，例如优先级、目标时长、标签、重复规则等。

生成正式安排成功后，设置 `created_subject_id`。前端默认隐藏已生成的草稿项，改由已创建安排区展示正式记录。

## API 设计

### 事件 API 扩展

现有事件接口新增 `start_date`：

- `POST /todo/events`
- `GET /todo/events`
- `GET /todo/events/primary`
- `PATCH /todo/events/{event_id}`

### 模板 API

新增模板库接口：

- `GET /todo/event-plan-templates`
- `POST /todo/event-plan-templates`
- `GET /todo/event-plan-templates/{template_id}`
- `PATCH /todo/event-plan-templates/{template_id}`
- `POST /todo/event-plan-templates/{template_id}/copy`
- `DELETE /todo/event-plan-templates/{template_id}`

模板详情返回模板主体和任务/日程模板项。

### 工作台 API

新增事件工作台接口：

- `GET /todo/events/{event_id}/workbench`
  - 返回事件信息、当前计划草稿、已创建任务、已创建日程、成就摘要。
- `POST /todo/events/{event_id}/plan-draft/apply-template`
  - 输入 `template_id`。
  - 按事件 `start_date` 或 `due_at` 生成并覆盖当前计划草稿。
- `PATCH /todo/events/{event_id}/plan-draft/items/{item_id}`
  - 更新任务草稿或日程草稿。
- `DELETE /todo/events/{event_id}/plan-draft/items/{item_id}`
  - 删除计划草稿项。
- `POST /todo/events/{event_id}/plan-draft/generate`
  - 将未生成的草稿项批量创建为正式任务/日程。
- `POST /todo/events/{event_id}/plan-draft/save-as-template`
  - 将当前计划草稿另存为新模板。
- `POST /todo/events/{event_id}/plan-draft/update-source-template`
  - 将当前计划草稿回写到来源模板。

## 时间计算规则

### 从开始日期顺推

模板模式为 `from_start` 时：

- `offset_days = 0` 表示事件开始日。
- `offset_days = 1` 表示开始后第 1 天。
- 生成日期为 `event.start_date + offset_days`。

### 从截止时间倒推

模板模式为 `before_due` 时：

- `offset_days = 0` 表示截止当天。
- `offset_days = 1` 表示截止前 1 天。
- 生成日期为 `event.due_at::date - offset_days`。

任务草稿默认使用生成日期作为计划日期或截止日期。日程草稿默认使用生成日期，并可在草稿编辑中补充具体开始/结束时间。

## 生成正式安排

用户点击“生成正式安排”后，后端在事务中处理当前事件未生成的草稿项。

任务草稿：

- 创建正式任务。
- 写入当前 `event_id`。
- 同步 `event` 文本为当前事件名称，兼容现有旧字段。
- 根据草稿字段设置标题、备注、日期、优先级、目标时长、任务类型、标签、重复规则等。

日程草稿：

- 创建正式日程。
- 写入当前 `event_id`。
- 根据草稿字段设置标题、备注、开始/结束时间、重复规则、关联任务等。

如果任一草稿项创建失败，整批回滚。前端展示失败原因，草稿保留，用户可继续编辑后重试。

## 错误处理

- 创建事件缺少名称、开始日期或截止时间时，返回校验错误。
- 模板为空时，套用模板返回明确错误。
- 模板时间模式与事件时间数据不匹配时，返回明确错误。新事件强制有 `start_date`，但旧数据和异常数据仍要兜底。
- 套用模板覆盖当前计划草稿前，前端必须弹出确认。
- 后端以单事件单草稿为准，避免并发创建多份草稿。
- 删除模板时，如果事件草稿引用了该模板，草稿保留，`source_template_id` 可置空或允许空引用处理。
- 回写模板时，如果来源模板已删除，提示用户改用“另存为新模板”。
- 生成正式安排必须事务保护，避免任务成功但日程失败的半成功状态。

## 前端实现方向

### 组件边界

建议新增事件命名空间组件，而不是继续扩大 `EventCountdownCard.tsx`：

- `frontend/src/components/events/EventWorkbenchModal.tsx`
- `frontend/src/components/events/EventOverviewPanel.tsx`
- `frontend/src/components/events/EventTemplatePanel.tsx`
- `frontend/src/components/events/EventPlanDraftPanel.tsx`
- `frontend/src/components/events/EventCreatedArrangementsPanel.tsx`
- `frontend/src/components/events/EventTemplateManagerModal.tsx`

共享类型和 API 封装放入：

- `frontend/src/lib/events/types.ts`
- `frontend/src/lib/events/api.ts`

现有 `EventCountdownCard` 只保留倒计时入口和打开工作台的职责。

### UI 原则

- 工作台是全屏沉浸弹窗，保持 Home 背景被遮罩。
- 工作台里清楚区分“计划草稿”和“已创建安排”。
- 产品文案使用“计划草稿”“任务草稿”“日程草稿”“生成正式安排”，避免使用“下放”等不直观词。
- 模板管理使用独立弹窗，避免工作台主界面过载。
- 计划草稿编辑可以复用现有任务/日程编辑逻辑和字段约定，但需要在 UI 上明确它还不是正式记录。

## 测试策略

### 后端测试

覆盖：

- 事件创建必须提供 `start_date`。
- 事件更新支持 `start_date`。
- 旧事件迁移为 `start_date = due_at::date`。
- 模板 CRUD。
- 模板复制。
- 模板项任务/日程分区保存。
- `from_start` 模板套用时间计算。
- `before_due` 模板套用时间计算。
- 套用模板覆盖当前计划草稿。
- 单事件不能产生多份当前计划草稿。
- 草稿项编辑和删除。
- 生成正式安排创建任务和日程。
- 生成正式安排写入 `event_id`。
- 生成正式安排失败时事务回滚。
- 计划草稿另存为模板。
- 计划草稿回写来源模板。

### 前端测试

覆盖：

- 点击倒计时卡片打开事件工作台。
- 没有主事件时创建事件入口可用。
- 创建事件要求开始日期和截止时间。
- 工作台展示事件总览。
- 模板管理弹窗可以新建、编辑、复制、删除模板。
- 套用模板生成计划草稿。
- 已有计划草稿时套用模板触发覆盖确认。
- 任务草稿和日程草稿分区展示。
- 草稿编辑后数据保留在计划草稿区。
- 点击生成正式安排后，草稿区移除对应项，已创建安排区出现正式记录。
- 成就摘要仍能展示现有自动成就数据。

## 迁移策略

建议分阶段实现：

1. 扩展事件模型，新增 `start_date` 并补齐事件 API。
2. 增加模板库后端模型和 CRUD。
3. 增加计划草稿后端模型、套用模板和生成正式安排 API。
4. 抽出前端 events 命名空间，搭建工作台弹窗。
5. 接入模板管理弹窗。
6. 接入计划草稿编辑和生成正式安排。
7. 将倒计时卡片入口从事件编辑弹窗改为事件工作台。
8. 补齐测试和视觉验收。

## 开放但已延后的能力

- 更多内置模板类型。
- AI 事件拆解。
- 事件阶段、路线图、看板。
- 单事件多份计划草稿。
- 自定义成就。
- 独立事件列表或事件路由页。
- 事件复盘和完成报告。
