# Ark 子应用接入指南设计

## 背景

Ark 已经有两个成熟子应用样本：

- `Vocab`，用户侧名称为“背单词”
- `ERC`，用户侧名称为“阅读训练”

它们不是独立部署的服务，而是 Ark 主应用内的业务域模块。它们复用主应用认证、受保护路由、PostgreSQL、任务系统、事件工作台、工作流和统一专注执行层。

这份设计的目标是沉淀一份“子应用接入规范文档”，给未来子应用开发提供模型说明和可执行清单。它先整理现有模式，不在本轮引入代码注册表、脚手架生成器或架构迁移。

## 目标

- 定义 Ark 子应用的标准边界。
- 从 Vocab/ERC 抽象出未来子应用的接入模板。
- 区分必接能力与按需接入能力。
- 明确前端、后端、任务系统、专注工作、事件工作台、模板商店和测试的接入要求。
- 让未来开发者可以按文档完成一个新子应用的设计、实现和验收。

## 非目标

- 不在本轮实现 `subAppsRegistry` 或代码脚手架。
- 不迁移 Vocab/ERC 现有硬编码接入点。
- 不重写应用托管任务或 focus-work 运行时。
- 不要求每个子应用都必须接入专注工作或事件模板。
- 不把子应用拆成独立前端工程、独立后端服务或独立数据库。

## 子应用定义

Ark 子应用是主应用内的一个业务域模块。它应满足以下特征：

- 有清晰的用户侧产品名称和内部 app id。
- 有自己的业务数据、业务 API 和页面命名空间。
- 复用 Ark 主认证壳、主题系统和基础客户端工具。
- 可以按业务需要接入任务、事件、工作流和专注执行层。
- 子应用自己的业务进度由子应用域维护，任务系统只承载计划、周期完成记录和专注执行入口。

成熟子应用通常包含两条主线：

- 业务主线：用户在子应用中完成学习、练习、管理或生产行为。
- Ark 集成主线：子应用把周期事项、专注执行和事件计划接入 Ark 的任务/事件/工作流体系。

## 接入层级

### Level 1: 基础子应用

基础子应用只需要成为 Ark 中可访问、可测试、可维护的业务域。

必备能力：

- App Center 入口。
- 受保护路由。
- 前端页面命名空间。
- 前端 API client 和类型文件。
- 后端 domain router。
- 后端 schemas/service/repository 分层。
- 基础页面测试和后端路由测试。

适用场景：

- 工具型子应用。
- 不需要每日计划或专注工作闭环的内容浏览/管理模块。
- 新业务早期探索版本。

### Level 2: 应用托管任务子应用

当子应用有“每日事项”“周期目标”或“是否加入今日计划”语义时，应接入应用托管任务。

新增能力：

- `app_id` 和 `app_task_type`。
- `/todo/app-tasks/<app>/status` 状态接口。
- `/todo/app-tasks/<app>/init` 初始化接口。
- `app_task_configs` 持久化配置。
- `tasks` 中的应用托管重复任务。
- `completion_records` 复用周期完成记录。
- 子应用首页展示初始化、配置、同步今日计划和完成状态。

适用场景：

- Vocab 今日单词。
- ERC 复习和真题练习。
- 任何需要进入今日计划和事件计划的长期重复事项。

### Level 3: 专注工作子应用

当子应用需要在顶部工作流胶囊、FocusWorkModalShell 或工作流阶段中运行业务内容时，应接入 focus-work。

新增能力：

- `FocusWorkType` 扩展。
- `focusWorkRegistry` 渲染适配器。
- 子应用专注工作组件。
- 通过应用托管任务 `task_id` 启动专注。
- 完成、暂停、继续、中断、放弃的业务进度同步。
- 后端 focus workflow 对新 `app_task_type` 的识别。

适用场景：

- 需要沉浸式执行的学习、练习、创作、训练类子应用。
- 需要被工作流阶段编排的子应用任务。

### Level 4: 事件工作台与模板商店子应用

当子应用任务应成为某类事件模板或事件计划的一部分时，应接入事件工作台和模板商店。

新增能力：

- 事件工作台中的应用配置编辑器。
- 保存配置时写入当前事件的应用托管任务。
- 非主事件激活时同步子应用配置。
- 事件模板商店中的 app config seed。
- 模板套用后能生成对应应用任务配置。

适用场景：

- 考研英语模板中的 Vocab/ERC 任务。
- 未来任何和事件目标强绑定的子应用。

## 命名与目录约定

### 产品命名

每个子应用至少定义三类名称：

- 用户侧名称：例如“背单词”“阅读训练”。
- 前端命名空间：例如 `Vocab`、`ERC`。
- 后端/API 命名空间：例如 `vocab`、`erc`。

如果接入任务系统，还需要：

- `app_id`：例如 `vocab`、`erc`。
- `app_task_type`：例如 `vocab_today`、`erc_review`、`erc_practice`。
- `focus_work_type`：通常与 `app_task_type` 保持一致；普通任务保留 `task_focus`。

### 前端目录

推荐结构：

```text
frontend/src/
  pages/<App>/
    Home.tsx
    Detail.tsx
    Settings.tsx
    __tests__/
  components/<App>/
    SummaryCard.tsx
    ConfigModal.tsx
  hooks/<app>/
    use<App>Overview.ts
  lib/<app>/
    api.ts
    types.ts
```

约定：

- 路由页面放在 `pages/<App>/`。
- 只服务该子应用的 UI 组件放在 `components/<App>/`。
- 只服务该子应用的 hooks 放在 `hooks/<app>/`。
- API client 和类型放在 `lib/<app>/`。
- 共享组件只有在两个以上域稳定复用时才上移到 `components/`。

### 后端目录

推荐结构：

```text
backend/routes/<app>/
  __init__.py
  routes.py
  schemas.py
  service.py
  repository.py
  importer.py
```

约定：

- `routes.py` 只处理 HTTP、鉴权依赖和请求响应绑定。
- `schemas.py` 放 Pydantic 输入输出模型。
- `service.py` 放业务规则、状态流转和算法决策。
- `repository.py` 放 SQL 和数据库读写。
- `importer.py` 仅在子应用需要静态数据导入时存在。
- `backend/main.py` 注册 init 和 router。

## 基础接入模板

一个 Level 1 子应用的最小交付清单：

- 在 `AppCenter` 添加应用入口。
- 在 `frontend/src/main.tsx` 添加受保护路由。
- 新增 `pages/<App>/Home.tsx`。
- 新增 `lib/<app>/api.ts` 和 `lib/<app>/types.ts`。
- 新增 `backend/routes/<app>/` 域模块。
- 在 `backend/main.py` 注册 router 和可选 init。
- 添加前端页面测试。
- 添加后端路由或 service 测试。

首页应采用统一子应用模板。基础子应用可以只实现其中可用的数据区，Level 2 及以上子应用必须完整实现。

固定顺序：

```text
顶部配置入口
  -> 总览
  -> 业务数据
  -> 托管安排
```

页面职责：

- 顶部配置入口：展示子应用名称、当前计划事件状态、绑定事件名称和唯一页面级“配置”按钮。
- 总览：展示当前周期最核心的 3-4 个进度指标。
- 业务数据：展示子应用沉淀的用户数据、明细入口和业务资产。
- 托管安排：展示子应用托管的任务与日程，并承载开始/继续专注、初始化、同步今日安排等操作。

页面约束：

- 页面级配置按钮统一命名为“配置”。
- 配置弹窗保存按钮统一命名为“保存配置”。
- 专注工作入口只放在托管安排任务行中。
- 业务跳转入口放在“业务数据”中，不放在顶部。
- 没有主事件或未配置时，使用统一注释样式提示。
- 外层背景板不做 hover 选中态；小指标卡可保留轻量 hover。

详见 [Ark 子应用模板共性设计](./2026-05-29-subapp-template-commonality-design.md#子应用首页统一模板)。

## 应用托管任务接入模板

当子应用需要接入 Ark 任务体系时，应采用“初始化后生成应用托管重复任务”的模式。

### 状态模型

复用 `AppTaskStatus`：

- `no_primary_event`：没有主事件，不能读取或保存事件级应用配置。
- `event_not_configured`：当前主事件存在，但该子应用任务未配置。
- `uninitialized`：子应用任务尚未初始化。
- `ready`：已初始化，当前周期可执行。
- `completed_today`：当前周期已完成。
- `blocked`：已配置，但业务内容不可执行。
- `config_invalid`：配置引用失效，需要用户修复。

### 初始化接口

推荐形态：

```text
GET  /todo/app-tasks/<app-or-task>/status
POST /todo/app-tasks/<app-or-task>/init
```

初始化 payload 应包含：

- 子应用业务配置。
- `default_focus_duration`。
- `add_to_today_plan`。
- 可选 `event_id`。

初始化后应创建或更新：

- `app_task_configs` 中的配置。
- `tasks` 中的应用托管重复任务。

### 任务语义

应用托管任务本质上仍是 `tasks` 记录：

```text
source_type: app
app_id: <app_id>
app_task_type: <app_task_type>
managed_by_app: true
is_recurring: true
period_type: daily
max_completions_per_period: 1
```

业务进度不写进任务本体。任务只表示“今天完成一次该子应用事项”。例如：

- Vocab 单词掌握状态仍归 Vocab 表维护。
- ERC 文章练习、题卡、错题和复习日志仍归 ERC 表维护。
- 今日是否完成使用任务系统的 `completion_records` 判断。

## 专注工作接入模板

当应用托管任务需要沉浸式执行时，接入 focus-work。

前端接入点：

- `frontend/src/components/focus-work/focusWorkTypes.ts`
- `frontend/src/components/focus-work/focusWorkRegistry.tsx`
- `frontend/src/components/<App>/<AppTask>FocusWork.tsx`

后端接入点：

- `backend/routes/todo/schemas.py` 中的 `FocusWorkType` 和 `AppTaskType`。
- `backend/routes/todo/helpers.py` 中 app task 到 focus work 的映射。
- focus workflow 相关测试。

启动方式：

1. 子应用首页读取 `AppTaskStatus`。
2. 用户点击开始按钮。
3. 前端调用 `/todo/tasks/{task_id}/focus/start`。
4. 前端派发 `ark:reload-focus`。
5. `FocusWorkProvider` 根据 workflow snapshot 打开对应适配器。

完成语义：

- `onComplete` 用于完成本轮专注内容。
- 如果这次执行也应完成今日任务，则同时触发任务完成记录。
- `onInterrupt` 和 `onAbandon` 应把可恢复进度回写到子应用业务状态。
- 暂停和继续由统一 focus-work 壳处理，子应用只处理必要的业务 UI 状态。

## 事件工作台接入模板

当子应用任务需要绑定到具体事件时，应接入事件工作台应用配置。

接入要求：

- 事件工作台能创建、编辑、删除该子应用任务配置。
- 配置写入时传入 `event_id`。
- 保存后刷新 `getEventWorkbench(event_id)`。
- 应用配置区展示任务名称、专注工作名称、初始化状态和是否同步今日计划。
- 删除应用配置时删除对应事件安排任务。

配置字段应使用清晰的业务命名，并在前端和后端做一次映射：

- 前端编辑器可以使用 camelCase。
- 后端 init payload 使用 snake_case。
- 写入模板或临时配置时要保持一致的转换规则。

## 事件模板商店接入模板

当子应用属于项目内置模板或用户模板的一部分时，应接入模板商店。

接入要求：

- 在模板 seed 中声明 app config。
- app config 使用稳定的 `client_id`。
- 模板 workflow 阶段可以引用 app config 的 `client_id`。
- 套用模板后，事件工作台中出现可编辑的应用任务配置。
- 当非主事件变成主事件时，`activateEventSubApps` 能把被动配置同步成真实应用托管任务。

模板中的 app config 不应直接假设用户当前全局配置。它应是事件模板携带的项目种子数据，激活后再成为该事件下的应用任务配置。

## UI 与主题约束

子应用 UI 必须遵守 Ark 主题系统：

- 使用 `text-ark-text`、`text-ark-text-muted`、`text-ark-text-faint`。
- 使用 `bg-ark-surface-subtle`、`border-ark-border`、`bg-ark-overlay` 等语义类。
- 不硬编码 `text-white`、`border-white/10`、`bg-white/5`、`bg-black/30` 或 hex dark colors。
- CTA 可以继续使用已有约定的 `bg-white` 和 `text-slate-950`。
- focus-work 组件使用 `text-[var(--focus-work-text)]` 等 component-scoped 变量。

子应用首页应优先呈现真实可执行入口，而不是营销式介绍页。对于学习/训练类子应用，第一屏应回答：

- 今天要做什么。
- 当前状态是什么。
- 如何开始或继续。
- 如果不能开始，原因是什么。

## 测试与验收清单

### Level 1

- App Center 渲染并可导航到新子应用。
- 子应用首页加载、空状态、错误状态都有测试。
- API client 使用类型化响应。
- 后端 route 覆盖鉴权、正常响应和关键错误。
- 后端 service/repository 覆盖核心业务规则。

### Level 2

- `status` 接口覆盖无主事件、未配置、已配置、今日已完成、配置失效。
- `init` 接口创建或更新 `app_task_configs`。
- `init` 接口创建或更新应用托管任务。
- 重复初始化返回同一任务或符合预期的稳定绑定。
- `add_to_today_plan` 能正确影响今日计划展示。
- 子应用首页能从不同 `AppTaskStatus` 渲染对应操作。

### Level 3

- `FocusWorkType` 和 `AppTaskType` 类型同步。
- `focusWorkRegistry` 能渲染对应适配器。
- `/todo/tasks/{task_id}/focus/start` 能启动应用托管任务。
- 顶部工作流胶囊显示正确标签。
- 完成、中断、放弃、暂停、继续不会破坏业务进度。
- 业务完成时写入子应用进度和任务完成记录。

### Level 4

- 事件工作台能保存、编辑、删除应用配置。
- 保存配置传入正确 `event_id`。
- 模板套用后 app config 出现在事件工作台。
- 非主事件激活后配置能同步为真实应用托管任务。
- 内置模板引用的 `client_id` 能被 workflow 阶段正确解析。

### 浏览器验证

涉及可见 UI 或 focus-work 的子应用必须做浏览器验证：

- App Center 入口。
- 子应用首页。
- 初始化或设置弹窗。
- 开始专注流程。
- 顶部工作流胶囊显示。
- 事件工作台里的应用配置。

## 推荐开发顺序

1. 写子应用产品 spec，明确 Level 1 到 Level 4 中本轮要做到哪一层。
2. 建后端 domain 模块和数据模型。
3. 建前端命名空间、首页和 API client。
4. 接入 App Center 和路由。
5. 补基础测试。
6. 如果需要今日计划，接入应用托管任务。
7. 如果需要沉浸执行，接入 focus-work。
8. 如果需要事件计划，接入事件工作台。
9. 如果需要内置项目模板，接入事件模板商店。
10. 做浏览器验证并补齐开发日志。

## 后续演进

这份指南先沉淀规范。等未来新增第二到第三个子应用后，可以再评估是否把规范升级为代码机制：

- `subAppsRegistry` 统一声明子应用元数据。
- App Center 从 registry 渲染。
- 事件工作台从 registry 获取 app config editor。
- focus-work 从 registry 获取适配器。
- 提供新子应用脚手架命令或模板目录。

升级为注册表前，应先确认 Vocab/ERC 的现有接入点已经稳定，否则过早抽象会让业务迭代被注册表结构绑住。
