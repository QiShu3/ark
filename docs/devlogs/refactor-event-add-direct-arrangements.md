# 开发日志：refactor/event-add-direct-arrangements

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-23 09:45 · 36baaac · feat(frontend): configure sub-app tasks inside add event modal and synchronize on primary event activation

- 用户提出的需求：
  - “不用了，就在当前分支进行开发。你知道应用配置怎么配置吗？它根源于子应用上的配置，你要过去看看”
  - “在添加事件中对子应用的配置也要同步到 子应用的配置上，钩子和安排一样，也是在 设置为主事件 的时候”

- 本次完成的工作：
  - **单列“应用”模块配置集成**：在 `frontend/src/components/EventCountdownCard.tsx` 的“添加事件”弹窗中新增单列“应用”配置栏，位置恰好在“安排”模块上方。配置组件完全对齐子应用本身的设置：
    - **今日单词**：支持动态读取后端词书 (`fetchVocabDecks`)，设置每日目标词数与默认专注时长；
    - **真题练习**：支持配置每日目标文章数与默认专注时长；
    - **错题复习**：支持配置复习范围（`due`/`mistakes`/`all`）与每日目标题数、专注时长。
  - **托管任务虚拟预览**：当用户在弹窗中配置好子应用后，“安排”模块的任务栏中将即时并行动态展现出高亮的虚拟任务预览卡片，右上角带有精致的 `托管` 标志，向用户传递确凿的关联反馈。
  - **轻量级临时状态暂存**：创建事件时，如果当前事件**非主事件**，应用配置将被序列化为 JSON 文本存储在一个包含 `__app_task_config` 与具体 `appType` 双标签的普通临时任务中，不对全局子应用配置和首页造成任何干扰。
  - **主事件激活同步机制**：
    - 创建了通用同步模块 `frontend/src/lib/events/eventAppSync.ts`，内置 `activateEventSubApps(eventId)` 同步函数。
    - 联动 `EventWorkbenchModal.tsx`（当事件通过“设为主事件”或“保存事件详情并设为主事件”时）以及 `EventCountdownCard.tsx`（直接创建为主事件时）的触发时机，激活并同步当前事件下的所有临时配置至真实子应用的后端初始化 API。同步完成后自动清除临时 placeholder 任务。

- 验证情况：
  - `cd frontend && pnpm check`，验证结果为 TypeScript 编译无任何类型和语法错误。
  - `cd frontend && pnpm test -- --run`，前端 49 个测试文件共 209 个单元测试全部成功通过。

### 2026-05-23 09:27 · c3ecef4 · refactor(frontend): filter arrangements by primary event and refine sync trigger timing

- 用户提出的需求：
  - “对了，我说错了，同步安排 的钩子不应该在创建事件，而是在 设置为主事件 时，同时安排应该只显示当前事件的日程或者任务”

- 本次完成的工作：
  - **精准控制同步触发钩子**：移除了 `EventCountdownCard.tsx` 中 `refreshAll()` 通用函数中的全局 `'ark:reload-focus'` 事件分发。改在 `submitCreateEvent()`（创建主事件时）、`handleSetPrimaryEvent()`（在工作台显式设为主事件时）和 `handleSaveEventDetails()`（编辑并勾选设为主事件时）中精准分发，确保仅当主事件发生实际变动时才同步主页。
  - **主事件关联安排过滤**：在 `PlaceholderCard.tsx` 中定义 `primaryEvent` 的 React.useMemo 计算，并将“安排总览（左栏）”及“安排仓库（右栏）”中任务与日程列表绑定为 `arrangementTasks` 与 `arrangementAppointments`。如果存在主事件，则过滤仅展示属于该主事件的安排；若无主事件，则作为兜底展示全部安排，完美契合业务需求并保障了现有全局测试套件的兼容。

- 验证情况：
  - `cd frontend && pnpm check`，验证结果为 TypeScript 编译无任何类型和语法错误。
  - `cd frontend && pnpm test -- --run`，前端 49 个测试文件共 209 个单元测试全部成功通过。

### 2026-05-23 09:10 · 5270bcd · refactor(frontend): create real tasks and appointments directly in event add flow

- 用户提出的需求：
  - “你看看 事件 部分，尤其是 事件部分 的安排 部分”
  - “同意，但你要另起 branch 来开发，不要在main分支上开发”

- 本次完成的工作：
  - **重构事件新建流程中的安排创建机制**：在 `frontend/src/components/EventCountdownCard.tsx` 中，移除了过时的 `createEventPlanDraftItem` 和 `EventPlanDraftItemCreateInput`。引入了 `arrangementApi` 中的 `createEventArrangementTask` 和 `createEventArrangementAppointment`。
  - **直接实例化真实任务和日程**：重构了 `createWorkbenchItemsForEvent`，不再将添加事件时预设的安排作为草稿写入数据库，而是直接构造结构完整的 `EventArrangementTaskInput` / `EventArrangementAppointmentInput` 载荷（注入状态、优先级、单词周期数与时间覆写等），直接写入真实的 Task 和 Appointment。从而让用户创建事件后，安排能立即在“安排”工作台和主页正常渲染，根治了草稿遗留导致的“安排消失” Bug。
  - **同步重构单元测试**：重构了 `EventCountdownCard.test.tsx` 里的 `'creates blank workbench content without selecting an event template'` 测试用例，将原先断言创建草稿项的逻辑改为断言 `POST /todo/tasks`，使测试与最新的“直接管理”架构保持完美一致。

- 验证情况：
  - `cd frontend && pnpm check`，验证结果为 TypeScript 编译无任何类型和语法错误。
  - `cd frontend && pnpm test -- EventCountdownCard.test.tsx --run`，测试全部成功通过。
  - `cd frontend && pnpm test -- --run`，前端 49 个测试文件共 209 个单元测试全部成功通过。
