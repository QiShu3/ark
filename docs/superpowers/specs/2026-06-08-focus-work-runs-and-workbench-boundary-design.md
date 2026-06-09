# 专注工作 run 模型与全屏工作台边界重构设计

## 1. 背景与问题

Ark 当前已经把任务专注、Vocab 今日单词、ERC 复习/练习接入同一个全屏专注工作台，但职责边界仍然混杂：

- 全屏工作台既承担运行时容器，又把一部分任务业务语义下放到了子应用专注组件。
- 子应用专注组件不仅执行内容，还读取任务完成态、提供加练/再来一次、影响任务完成与工作流流转。
- `结束本轮专注` 同时混杂了“结束一轮具体内容执行”“完成任务”“推进阶段”三层含义。
- “内容自然完成”“任务完成”“阶段结束”当前没有明确分层，导致误完成任务、加练链路脆弱、暂停/结束语义含混等问题。
- 当前模型更像“一次阶段只允许一个专注内容对象”，不适合表达同一 `focus` 阶段内一轮又一轮的具体专注工作。

这次重构的目标不是微调几个按钮，而是重建三个层次的边界：

1. 全屏工作台负责任务业务与工作流运行时。
2. 子应用任务负责把某类任务绑定到对应专注工作。
3. 子应用专注工作只负责内容执行与内容进度。

## 2. 设计目标

1. 让全屏工作台独占任务相关业务功能。
2. 让子应用专注工作彻底去任务化，只执行内容本身。
3. 将“一轮具体专注工作”建模为独立 `focus_work_run`。
4. 支持同一 `focus` phase 内连续执行多轮 run。
5. 允许任务完成后继续 `再来一轮`，但额外轮次不计入任务完成。
6. 保留子应用内容进度保存，不把任务业务与内容业务重新搅在一起。
7. 去掉 `结束本轮专注` 这一歧义过高的全局功能。
8. 为后续更多子应用接入全屏工作台提供统一运行时模型。

## 3. 非目标

1. 不重做 Vocab/ERC 的领域数据模型、FSRS 逻辑或答题算法。
2. 不改变 `completion_records` 的业务含义。
3. 不把子应用内容拆成更细颗粒度任务，例如“单个单词”“单道题”。
4. 不在本次引入复杂历史报表或 run 可视化分析页。
5. 不要求第一版一次性迁掉所有旧查询或旧日志读路径。
6. 不重构 break phase 为 run 模型，run 仅覆盖具体专注工作。

## 4. 核心概念

### 4.1 子应用任务

由子应用配置生成并长期存在的 app-managed task，例如：

- Vocab 的“今日单词”
- ERC 的“ERC 复习”
- ERC 的“ERC 真题练习”

子应用任务属于任务系统的一部分，拥有：

- `task_id`
- 周期配置
- 今日是否完成
- `completion_records`
- 事件/安排绑定
- 是否加入今日计划

但它的内容业务进度仍由子应用自己的表维护。

### 4.2 具体专注工作

一次真正可执行的内容单元，例如：

- 背 100 个单词
- 做一篇 ERC 真题
- 完成一轮 ERC 复习

具体专注工作只关心内容的开始、进行和自然完成，不关心任务完成与否。

### 4.3 Focus Workflow

工作流运行态，描述当前处于哪个阶段、阶段计时、暂停状态、是否待确认、是否待选任务等。

### 4.4 Focus Phase

工作流中的一个阶段。本设计重点覆盖 `focus` phase。

### 4.5 Focus Work Run

同一 `focus` phase 内的一轮具体专注工作执行记录。run 是本设计新增的一等实体，用来表达：

- 当前这一轮属于哪个 workflow 和 phase
- 绑定的是哪个 task
- 调用的是哪类子应用专注工作
- 这一轮是否计入任务完成
- 这一轮执行到了什么状态

### 4.6 Counted Run

计入任务完成资格的 run。通常是某个 `focus` phase 内执行的第一轮任务性 run。

Counted run 的内容自然完成后，用户可以在工作台确认 `完成任务并结束阶段`。

### 4.7 Extra Run

不计入任务完成的额外 run。它仍然正常保存子应用内容进度，但不会写任务完成记录。

Extra run 主要来自两类场景：

- 当前任务今天已完成，用户仍想再做一轮
- Counted run 已完成后，用户选择 `再来一轮`

## 5. 职责边界

### 5.1 全屏工作台负责什么

全屏工作台是任务与工作流的统一运行时。它负责：

- 识别当前阶段绑定的是哪类任务
- 根据绑定关系创建对应 counted run 或 extra run
- 管理 phase 级按钮与阶段计时
- 决定任务是否已完成
- 决定是否写 `completion_records`
- 决定是否允许 `再来一轮`
- 决定阶段何时结束
- 在不同运行时状态下渲染不同主体状态面

### 5.2 子应用任务层负责什么

子应用任务层负责：

- 定义 `app_task_type`
- 保存任务配置，例如“每轮 100 个单词”
- 提供初始化与启动全屏工作台的入口
- 声明该任务绑定哪类具体专注工作

子应用任务层可以知道 task，但不直接承担全屏工作台运行时。

### 5.3 子应用专注工作层负责什么

子应用专注工作层只负责：

- 根据 `config_snapshot` 执行一轮内容
- 正常保存内容业务进度
- 在内容自然完成时向工作台发出完成信号

它不负责：

- 判断任务是否已完成
- 决定任务是否完成
- 推进工作流
- 结束阶段
- 提供 `再来一轮`
- 提供任务完成相关按钮

### 5.4 后端 workflow/run 层负责什么

后端负责：

- 创建和管理 run
- 维护 workflow 的阶段状态机
- 接收工作台按钮意图并执行真实状态转移
- 决定何时写 task completion record
- 维护 run 与 workflow 之间的关联关系

前端只发意图，不自己拼最终状态。

## 6. 子应用去任务化约束

这是本设计的硬约束。

### 6.1 子应用专注工作禁止读取任务态

子应用专注工作不再接收或读取：

- `workflow`
- `task`
- `is_task_completed_today`
- 任何 phase/runtime/task 级布尔或状态对象

### 6.2 子应用专注工作禁止暴露任务语义回调

子应用专注工作不再接收或输出：

- `onCompleteTaskAndFinish`
- `registerResetCommand`
- `onEndPhase`
- `onSkipTask`
- `onRequestNextRound`
- 任何带 task/workflow/phase 业务语义的回调

### 6.3 子应用专注工作只接收内容语义 props

建议最终边界收敛到类似：

```ts
type FocusWorkContentProps = {
  configSnapshot: Record<string, unknown>;
  disabled: boolean;
  onContentCompleted: (progressSnapshot?: Record<string, unknown>) => void;
};
```

是否需要 `onProgressChanged` 可由实现时再决定，但它也只能表达内容进度，不表达任务业务。

### 6.4 子应用专注工作禁止出现任务业务 UI

专注内容内部不再显示：

- `再来一轮`
- `加练`
- `完成任务`
- `结束阶段`
- `推进下一阶段`
- `今日任务已完成`

这些全部回收到全屏工作台主体状态面。

### 6.5 子应用内容进度仍然照常保存

去任务化不代表去内容化。Vocab/ERC 仍然照常保存：

- 单词复习结果
- 文章作答结果
- ERC 复习结果
- FSRS/错题/attempt 等内容域进度

也就是说：

- 内容进度照常
- 任务完成记录禁止由子应用触发

## 7. 顶部全局控制

全屏工作台顶部常驻全局控制只保留两项：

- `暂停专注` / `继续专注`
- `放弃本阶段`

`结束本轮专注` 被彻底移除。

原因：

- 它把“提前停止 run”“完成任务”“推进阶段”混在一起
- 当前设计已经接受：用户若中途不想继续该轮，只能 `放弃本阶段`
- run 的正常完成只允许来自内容自然完成

这个取舍会让数据语义明显变干净：

- 内容自然完成 -> `completed`
- 用户主动终止 -> `abandoned`

不再存在“未完成内容但手动正常结束 run”的灰色状态。

## 8. 生命周期

### 8.1 进入 focus phase

工作流进入 `focus` phase 时，全屏工作台先识别当前绑定任务。

可能出现三种入口：

1. 当前任务可执行
   - 创建一个 counted run
   - 工作台进入运行中状态

2. 当前任务今日已完成
   - 不创建 counted run
   - 工作台进入“任务已完成空态”

3. 当前 phase 需要先选任务
   - 维持现有 `pending_task_selection`

### 8.2 counted run 运行中

工作台根据 run 绑定的 `app_id + app_task_type + config_snapshot` 渲染对应子应用专注内容。

子应用只执行内容本身。

### 8.3 counted run 内容自然完成

子应用发出 `onContentCompleted` 后：

- run 进入 `content_completed`
- workflow 进入 counted 完成确认态
- 阶段计时继续走

此时主体按钮为：

- `完成任务并结束阶段`
- `再来一轮`

### 8.4 counted 确认态点击完成任务

用户点击 `完成任务并结束阶段` 后：

- run 进入 `completed`
- 写 task completion record
- 当前 `focus` phase 自动结束
- workflow 进入休息或下一阶段

### 8.5 counted 确认态点击再来一轮

用户点击 `再来一轮` 后：

- 当前 counted run 保持已完成
- 在同一个 `workflow_id + phase_index` 下创建新的 extra run
- 新 run `counts_for_task_completion = false`

### 8.6 extra run 运行中与完成

Extra run 与 counted run 一样执行内容并保存内容进度。

内容自然完成后：

- run 进入 `content_completed`
- workflow 进入 extra 完成态

主体按钮为：

- `结束阶段`
- `再来一轮`

### 8.7 extra 完成态点击结束阶段

用户点击 `结束阶段` 后：

- 当前 extra run 正常记为 `completed`
- 不写 task completion record
- 当前 phase 结束

### 8.8 任务已完成空态

若当前 phase 绑定任务今天已完成，则不创建 counted run，主体直接展示：

- `结束阶段`
- `再来一轮`

用户点击 `再来一轮` 时，直接创建 extra run。

### 8.9 放弃本阶段

用户在任意运行态或完成态点击 `放弃本阶段` 后：

- 若有 active run，则 run 进入 `abandoned`
- 已保存的内容进度保留
- 不写 task completion record
- 当前 phase 结束

### 8.10 时间到强提示态

如果当前处于以下状态且阶段倒计时到点：

- counted 完成确认态
- extra 完成态
- 任务已完成空态

则工作台不自动替用户收口，而是进入“本阶段时间已到”强提示态。

主体按钮为：

- `延长时间`
- `结束该阶段`

点击 `结束该阶段` 时：

- 若当前 run 已内容自然完成，则 run 正常记为 `completed`
- 子应用内容进度正常保留
- 专注工作记录正常保留
- 不自动写 task completion record，除非用户此前已明确确认完成任务
- 当前 phase 结束

### 8.11 暂停

暂停作用于 workflow 与当前 active run：

- workflow 冻结阶段计时
- active run 进入暂停语义
- 子应用内容不可操作

恢复后继续当前同一轮 run。

## 9. 工作台主体状态面

### 9.1 运行中

进入条件：

- 有 active run
- `run.status = running`

主体行为：

- 渲染子应用专注内容
- 不显示任务业务按钮

### 9.2 counted 完成确认态

进入条件：

- active run 为 counted run
- `run.status = content_completed`

主体文案建议：

- `本轮专注工作已完成`
- `本轮计入当前任务`

按钮：

- `完成任务并结束阶段`
- `再来一轮`

### 9.3 extra 完成态

进入条件：

- active run 为 extra run
- `run.status = content_completed`

主体文案建议：

- `本轮额外专注已完成`
- `本轮不计入任务完成`

按钮：

- `结束阶段`
- `再来一轮`

### 9.4 任务已完成空态

进入条件：

- 当前 phase 绑定任务今日已完成
- 没有 active counted run

主体文案建议：

- `当前阶段绑定任务今日已完成`
- `可以直接结束该阶段，或再来一轮额外专注`

按钮：

- `结束阶段`
- `再来一轮`

### 9.5 时间到强提示态

进入条件：

- 当前阶段计时到点
- 原状态为 counted 完成确认态、extra 完成态或任务已完成空态

主体文案建议：

- `本阶段时间已到`
- `请选择延长时间或结束该阶段`

按钮：

- `延长时间`
- `结束该阶段`

## 10. Run 状态机

### 10.1 状态枚举

`focus_work_runs.status` 建议使用：

- `running`
- `paused`
- `content_completed`
- `completed`
- `abandoned`

### 10.2 状态语义

- `running`
  - 当前这轮正在执行
- `paused`
  - 当前这轮被暂停，非结束态
- `content_completed`
  - 内容目标已自然完成，但尚未被工作台最终收口
- `completed`
  - 这轮已正常收口
- `abandoned`
  - 这轮因放弃阶段而异常结束

核心原则：

```text
run.status = completed
不代表 task completed
```

因为 extra run 也会 `completed`，但不会写任务完成记录。

### 10.3 状态转移

- `running -> paused`
  - 点击 `暂停专注`
- `paused -> running`
  - 点击 `继续专注`
- `running -> content_completed`
  - 子应用发出 `onContentCompleted`
- `content_completed -> completed`
  - 点击 `完成任务并结束阶段`
  - 点击 `再来一轮`
  - 点击 `结束阶段`
  - 时间到强提示态点击 `结束该阶段`
- `running -> abandoned`
  - 点击 `放弃本阶段`
- `paused -> abandoned`
  - 暂停态点击 `放弃本阶段`
- `content_completed -> abandoned`
  - 完成态点击 `放弃本阶段`

不允许：

- `running -> completed`

因为本设计已经去掉 `结束本轮专注`，用户不能在内容未完成时手动把 run 正常结束。

### 10.4 run 附加语义字段

建议 run 至少携带：

- `counts_for_task_completion`
- `completion_reason`
- `source_run_id`

其中：

- `counts_for_task_completion`
  - 表示该 run 是否具备映射为任务完成的资格
- `completion_reason`
  - 记录该 run 最终如何收口
- `source_run_id`
  - 可用于串起连续 `再来一轮` 的关系

建议 `completion_reason` 枚举：

- `task_confirmed`
- `extra_phase_ended`
- `phase_time_expired_ended`
- `run_again`
- `phase_abandoned`

## 11. Workflow 状态机

### 11.1 为什么需要两层状态

`run.status` 只记录这一轮执行事实；工作台还需要知道当前 phase 应给用户展示什么交互面。

同样的 `run.status = content_completed`，可能对应：

- counted 完成确认态
- extra 完成态
- 时间到强提示态之前的原态

因此需要在 workflow 层保留独立 `phase_runtime_state`。

### 11.2 建议的 phase_runtime_state

- `running_run`
- `counted_run_completed_confirming`
- `extra_run_completed`
- `task_already_completed`
- `phase_time_expired_prompt`
- `pending_task_selection`
- `break_running`

### 11.3 与 run.status 的映射

- `run.status = running`
  - `phase_runtime_state = running_run`

- `run.status = paused`
  - 仍保留原主态，再由 `workflow.is_paused = true` 叠加暂停展示

- `run.status = content_completed`
  - 若 `counts_for_task_completion = true`
    - `phase_runtime_state = counted_run_completed_confirming`
  - 若 `counts_for_task_completion = false`
    - `phase_runtime_state = extra_run_completed`

- 当前 phase 无 active run 且绑定任务已完成
  - `phase_runtime_state = task_already_completed`

- 时间已到，且原状态为
  - `counted_run_completed_confirming`
  - `extra_run_completed`
  - `task_already_completed`
  则：
  - `phase_runtime_state = phase_time_expired_prompt`

### 11.4 暂停是 overlay，不是主状态

建议暂停不单独占据一个 `phase_runtime_state` 值，而是保留：

- `workflow.is_paused = true`
- `run.status = paused`

前端在原主态之上叠加暂停层。

### 11.5 timeout prompt 需要记住来源状态

建议 workflow 额外保存：

- `phase_runtime_state_before_timeout_prompt`

这样点击 `延长时间` 时，能准确回到倒计时到点前的状态面。

## 12. 数据模型变更

### 12.1 新增 focus_work_runs

建议新增 `focus_work_runs` 表，至少包含：

- `id`
- `user_id`
- `workflow_id`
- `phase_index`
- `task_id`
- `focus_work_type`
- `app_id`
- `app_task_type`
- `counts_for_task_completion`
- `status`
- `record_focus`
- `config_snapshot`
- `progress_snapshot`
- `completion_reason`
- `source_run_id`
- `started_at`
- `paused_at`
- `ended_at`
- `created_at`
- `updated_at`

### 12.2 config_snapshot

`config_snapshot` 只保存这一轮内容目标，不保存整个任务对象。

示例：

Vocab：

```json
{
  "deck_id": "deck-1",
  "target_word_count": 100,
  "default_focus_duration": 1500
}
```

ERC review：

```json
{
  "review_scope": "due",
  "daily_question_target": 20
}
```

ERC practice：

```json
{
  "daily_article_target": 1,
  "include_preheat": true
}
```

### 12.3 progress_snapshot

`progress_snapshot` 只保存跨子应用都能读懂的轮次摘要，不替代子应用主数据表。

示例：

Vocab：

```json
{
  "completed_word_count": 100,
  "target_word_count": 100
}
```

ERC practice：

```json
{
  "article_id": "2026-text-2",
  "correct_count": 3,
  "question_count": 5
}
```

### 12.4 focus_workflows 新增字段

建议在 `focus_workflows` 上新增：

- `active_run_id`
- `phase_runtime_state`
- `phase_runtime_state_before_timeout_prompt`

并逐步废弃 run 级 workflow 字段，例如：

- `active_focus_work_type`
- `focus_work_result`
- `focus_work_progress_snapshot`

workflow 应只指向当前 active run，而不再直接承载这一轮的结果。

### 12.5 focus_app_work_logs 过渡策略

`focus_app_work_logs` 与 `focus_work_runs` 语义高度重叠，长期并存会导致双主记录。

建议策略：

1. 迁移期允许短暂双写。
2. `focus_work_runs` 成为“一轮具体专注工作”的主记录。
3. `focus_app_work_logs` 逐步降级为兼容日志或派生用途。
4. 查询和前端读路径完成切换后，停止把旧表当作主执行记录。

### 12.6 与 completion_records 的关系

`completion_records` 不需要重做，只调整触发条件：

只有满足以下条件时才写任务完成记录：

1. run 是 counted run
2. run 已内容自然完成
3. 用户在工作台明确点击 `完成任务并结束阶段`

## 13. API 与事件流

### 13.1 读取当前 workflow 运行态

当前 workflow 快照应返回：

- workflow 基础状态
- `active_run_id`
- `active_run` 摘要
- `phase_runtime_state`

前端工作台不应靠多个分散字段自己推导所有状态面。

### 13.2 创建 run

建议新增：

`POST /todo/focus/workflow/runs`

请求体：

```json
{
  "mode": "counted"
}
```

或：

```json
{
  "mode": "extra"
}
```

前端只表达意图，后端根据当前 workflow、phase、task 绑定关系，创建对应 run。

### 13.3 子应用上报内容自然完成

建议新增：

`POST /todo/focus/workflow/runs/{run_id}/content-complete`

请求体可带轻量 `progress_snapshot`：

```json
{
  "progress_snapshot": {
    "completed_word_count": 100,
    "target_word_count": 100
  }
}
```

后端负责：

- run -> `content_completed`
- workflow -> counted 完成确认态或 extra 完成态

### 13.4 完成任务并结束阶段

建议新增：

`POST /todo/focus/workflow/runs/{run_id}/complete-task-and-end-phase`

后端负责：

- run -> `completed`
- 写 `completion_records`
- 结束当前 phase

### 13.5 结束阶段

建议新增或统一：

`POST /todo/focus/workflow/end-phase`

适用场景：

- extra 完成态点击 `结束阶段`
- 任务已完成空态点击 `结束阶段`
- 时间到强提示态点击 `结束该阶段`

后端负责：

- 若 active run 已内容完成，则 run 正常记为 `completed`
- 不自动写 task completion
- 结束当前 phase

### 13.6 再来一轮

复用 run 创建接口：

`POST /todo/focus/workflow/runs`

```json
{
  "mode": "extra"
}
```

后端负责：

- 创建新的 extra run
- 更新 `active_run_id`
- workflow 进入运行中状态

### 13.7 延长时间

建议新增：

`POST /todo/focus/workflow/extend-phase`

后端负责：

- 更新当前 phase 的计划结束时间或时长
- 从 `phase_time_expired_prompt` 返回原状态面

### 13.8 暂停 / 继续

保留 phase 级接口：

- `POST /todo/focus/workflow/pause`
- `POST /todo/focus/workflow/resume`

后端同时更新：

- workflow 的暂停状态
- active run 的暂停语义

### 13.9 放弃本阶段

保留 phase 级接口，但明确语义：

- 若有 active run，则 run -> `abandoned`
- phase 结束
- 不写 task completion

## 14. 迁移计划

### 14.1 M1：run 主路径

目标：

- 新增 `focus_work_runs`
- workflow 增加 `active_run_id` 与 `phase_runtime_state`
- 跑通 counted run 的主路径

范围：

- 进入 phase 创建 counted run
- 子应用上报内容完成
- 工作台 counted 完成确认态
- `完成任务并结束阶段`

### 14.2 M2：extra run 与去任务化

目标：

- 接入 extra run 完整链路
- 接入时间到强提示态
- 子应用专注工作去任务化

范围：

- `再来一轮`
- 任务已完成空态
- extra 完成态
- `结束阶段`
- `延长时间`
- 移除子应用中的任务业务 props、文案和按钮

### 14.3 M3：旧逻辑清理

目标：

- 收束旧接口和旧表职责
- 删除 workflow 上遗留的 run 级字段

范围：

- 降级或停用 `focus_app_work_logs` 的主职责
- 清理旧 `focus-work-result` 的“大一统收口”语义
- 删除子应用里遗留的 reset/加练/任务完成耦合

## 15. 风险与兼容性

1. 旧 workflow 运行态可能不存在 run 记录，需要兼容历史数据或在进入新逻辑时补建。
2. 迁移期若双写 `focus_app_work_logs` 与 `focus_work_runs`，必须明确哪个是主记录。
3. 子应用去任务化后，旧测试用例可能把错误语义固化，需要同步改写断言。
4. 时间到强提示态要避免偷偷替用户完成任务。
5. 一个 phase 内多轮 extra run 会引入更复杂的回放与调试需求，需要尽早固定 `completion_reason` 和 `source_run_id`。

## 16. 验证与测试

### 16.1 后端

- run 状态机单测
- workflow `phase_runtime_state` 映射单测
- counted run 完成并写 task completion 的路径
- counted run 完成后 `再来一轮` 的路径
- extra run 完成后 `结束阶段` 的路径
- 时间到强提示态 `延长时间` / `结束该阶段` 路径
- `放弃本阶段` 将 active run 置为 `abandoned` 的路径

### 16.2 前端

- 工作台主体 5 个状态面的渲染测试
- 顶部只保留 `暂停/继续专注` 与 `放弃本阶段`
- counted 确认态按钮行为测试
- extra 完成态按钮行为测试
- 任务已完成空态按钮行为测试
- 时间到强提示态行为测试
- 子应用专注工作不再接收任务业务 props 的组件测试

### 16.3 回归

- Vocab 内容进度保存仍正常
- ERC review 内容进度保存仍正常
- ERC practice 内容进度保存仍正常
- 任务完成记录只在工作台明确确认时写入

## 17. 结论

本设计通过引入 `focus_work_runs`，把“任务承诺”“阶段运行时”“具体专注执行”三层语义彻底拆开：

- `completion_records` 记录任务业务完成
- `focus_workflows` 记录阶段运行时
- `focus_work_runs` 记录一轮具体专注工作

在这个模型下：

- 全屏工作台独占任务业务功能
- 子应用任务只负责绑定关系与配置
- 子应用专注工作只负责内容执行与内容进度
- 同一 `focus` phase 可以跑一轮又一轮 run
- 额外轮次不会污染任务完成状态

这将为 Ark 后续引入更多子应用专注能力提供稳定且可扩展的统一运行时骨架。
