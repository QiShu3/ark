# 顶部工作流胶囊与子应用专注工作需求对齐 (Draft)

## 1. 背景

- 本次工作聚焦于“顶部工作流胶囊”组件，但需求已经从“胶囊自身增强”扩展为“胶囊 + 子应用专注工作”的联动设计。
- 第一阶段只关注两个子应用：
  - `Vocab`（背单词）
  - `ERC`（英语阅读理解）
- 设计起点不是独立做一套抽象专注系统，而是从子应用里已经存在的“用于专注的功能”出发。

## 2. 当前确认的核心思路

### 2.1 子应用先于抽象系统

- 从子应用已有的专注功能开始改造，而不是先做一个完全脱离业务的统一任务选择器。
- 这些子应用功能在改造后，会被统一视为“专注工作”。

### 2.2 第一批接入的专注功能

- `Vocab`
  - `开始今日单词`
  - `继续今日单词`
- `ERC`
  - `开始复习`

### 2.3 点击专注功能后的行为

- 用户点击上述入口后，不是直接进入普通页面流，而是触发对应的“专注工作”。
- “专注工作”以大屏弹窗的形式承载原本的工作内容。

### 2.4 工作流是主骨架

- 当前确认：专注工作必须与现有工作流强绑定。
- 工作流由多个阶段组成，其中 `focus` 阶段可以绑定一个页面级专注工作。
- 绑定关系发生在阶段层，而不是整个工作流层。
- 多个 `focus` 阶段可以绑定同一个页面级专注工作。
- `break` 阶段不承载子应用专注工作。

## 3. 专注工作弹窗

### 3.1 基本形态

- “专注工作”是一个大屏弹窗。
- 弹窗内容承载原来对应专注功能的主要内容。
- 屏占比大约为主要内容区域的 `90%`。
- 弹窗呈现在导航栏下方，不侵占导航栏区域。
- 它覆盖的是页面主内容区，而不是整个浏览器窗口。

### 3.2 打开后的页面状态

- 当“专注工作”打开时，页面进入 `focus` 状态。
- 当没有任何“专注工作”打开时，页面处于 `default` 状态。
- 当工作流处于 `break` 阶段时，页面不显示大屏专注工作，主内容区恢复可见。

### 3.3 focus 状态下的交互约束

- 专注工作弹窗位于当前页面最上层。
- 除弹窗与导航栏外，其余页面区域整体半透明。
- 被半透明覆盖的页面区域不可点击。
- 该约束的目的：
  - 凸显专注工作
  - 减少分心
  - 防止用户在专注状态中继续触发别的页面操作

### 3.4 专注工作的显示状态

- 专注工作本身有独立的显示状态：
  - `fullscreen`
  - `minimized`
  - `closed`
- `fullscreen` 表示当前专注工作以大屏弹窗形式打开。
- `closed` 表示当前没有保留该专注工作。
- `minimized` 表示该专注工作在主内容区中缩成小浮层或小卡片，暂时挂起。
- `minimized` 只服务于短周期衔接：如果当前 `focus` 阶段结束进入 `break`，且下一个阶段仍绑定同一个页面级专注工作，则该专注工作可以进入 `minimized`。
- 当工作流推进到下一个同工作 `focus` 阶段时，`minimized` 会自动恢复为 `fullscreen`。
- `minimized` 只判断下一个阶段是否绑定同一个页面级专注工作，不考虑跨多个阶段后的恢复。

## 4. 顶部工作流胶囊的职责

### 4.1 胶囊负责识别页面状态

- 胶囊识别当前页面处于以下主状态之一：
  - `default`
  - `focus`
  - `break`
- `minimized` 不是胶囊主状态，而是 `break` 下的附加标记。
- 当存在短暂挂起的专注工作时，胶囊可以携带 `hasMinimizedWork` 标记。

### 4.2 胶囊负责在进入专注工作前发起询问

- 当用户从子应用中提前进入专注工作时，顶部工作流胶囊会触发轻量浮层提示。
- 提示的核心问题是：
  - 是否需要记录此次工作。
- 工作流预设阶段进入专注工作时，不再询问“是否记录专注”。

### 4.3 是否记录，不影响是否进入专注状态

- 如果用户选择“记录”：
  - 进入 `focus` 状态
  - 打开专注工作弹窗
  - 记录此次专注
- 如果用户选择“不记录”：
  - 仍然进入 `focus` 状态
  - 仍然打开专注工作弹窗
  - 但不记录此次专注

### 4.4 胶囊三种主状态的职责

- `default`
  - 展示当前工作流概览或可启动入口。
  - 承接子应用临时进入时的“是否记录专注”确认。
  - 可以进入工作流相关操作。
- `focus`
  - 展示当前工作流、当前阶段、当前页面级专注工作、计时与记录状态。
  - 承接阶段结束、进入休息等工作流提示。
  - 可以提供工作流层级的结束按钮。
- `break`
  - 展示休息阶段与剩余时间。
  - 展示下一个阶段绑定的页面级专注工作。
  - 如果存在 `hasMinimizedWork`，提示当前有短暂挂起的专注工作。

## 5. 子应用与专注工作的关系

### 5.1 子应用中的专注功能要被改造

- `Vocab` 与 `ERC` 中现有的相关功能，需要从“普通页面入口”改造成“专注工作入口”。
- 这意味着实际工作内容要能在大屏弹窗中运行，而不是只能以普通页面形态存在。

### 5.2 在哪触发，就在哪进入专注工作

- 当前确认：点击专注功能后，直接在当前页原地进入专注工作。
- 不采用“先跳转到别的路由，再进入专注状态”的模式。
- 例如：
  - 从 `Vocab/Home` 点击 `开始今日单词`，就在 `Vocab/Home` 上方打开对应专注工作。
  - 从 `ERC/Home` 点击 `开始复习`，就在 `ERC/Home` 上方打开对应专注工作。

### 5.3 进入专注工作的两种方式

- 当前确认：进入专注工作有两种来源，且两者的语义不同。

#### 方式 A：在工作流中预设

- 工作流的 `focus` 阶段可以预先绑定某个页面级专注工作。
- 当工作流推进到该 `focus` 阶段时，直接进入对应专注工作。
- 这种方式不需要再次询问“是否记录专注”，因为它已经属于工作流编排的一部分。

#### 方式 B：在子应用中提前进入

- 用户在子应用页面上点击某个专注功能时，可以从当前页面直接提前进入专注工作。
- 只有这种“从子应用中提前进入”的方式，才会提示用户“是否记录专注”。
- 该提示的使用场景包括：
  - 用户在应用中临时发现某个功能，想先试一下
  - 用户想进入专注工作，但不一定希望把这次尝试计入正式专注记录

### 5.4 子应用提前进入时对工作流的影响

- 当用户从子应用中提前进入专注工作时，系统根据当前是否处于工作流来决定处理方式。
- 如果当前没有处于任何工作流：
  - 独立启动一条临时工作流。
  - 该临时工作流默认只有一个临时 `focus` 阶段。
- 如果当前已经处于某条工作流，且当前阶段是 `break`：
  - 不新建独立工作流。
  - 在当前工作流中插入：
    - 一个临时专注阶段
    - 以及其后的 `5 分钟休息阶段`
- 如果当前处于 `focus` 阶段：
  - 不会出现从子应用临时进入另一个专注工作的情况。
  - 因为 `focus` 状态下除专注工作与导航栏外，其余页面区域不可点击。
- 该规则的目的：
  - 允许用户在工作流之外临时试用某个专注功能
  - 同时仍然保持工作流阶段序列的连续性
  - 并保留“不记录这次专注”的可能

## 6. 工作流专注阶段绑定模型

### 6.1 绑定颗粒度

- 第一版绑定到页面级专注工作。
- 页面级专注工作的判定标准是 `focusWorkType`。
- 例如：
  - `vocab_today`
  - `erc_review`
- 同一个页面级专注工作不再进一步细分到词书、批次、题号等上下文。

### 6.2 预设层最小字段

- 每个 `focus` 阶段至少需要能声明：
  - `phase_type`
  - `duration`
  - `timer_mode`
  - `focus_work_type`
- `focus_work_type` 用于说明该阶段要打开哪个页面级专注工作。
- `break` 阶段不需要 `focus_work_type`。

### 6.3 运行层最小字段

- 工作流运行态至少需要能表达：
  - 当前阶段实际打开的 `active_focus_work_type`
  - 当前专注工作的 `focus_work_display_state`
  - 当前阶段结束时专注工作返回的 `focus_work_result`
- `focus_work_display_state` 可取：
  - `fullscreen`
  - `minimized`
  - `closed`
- `focus_work_result` 可取：
  - `completed`
  - `interrupted`
  - `abandoned`

### 6.4 不进入第一版阶段绑定模型的字段

- 第一版不把以下业务细节写入工作流阶段预设：
  - 词书 ID
  - 当前批次 ID
  - 文章 ID
  - 题号
  - 业务级进度快照
- 这些内容属于子应用自己的运行上下文。

## 7. 专注工作结果语义

### 7.1 三种结果

- `completed`
  - 页面级专注工作按自己的业务规则自然完成。
  - 例如今日单词全部完成，或 ERC 本轮复习完成。
- `interrupted`
  - 页面级专注工作还没有完成，但当前专注阶段结束，工作流继续。
  - 典型场景：用户主动或被动选择进入休息阶段。
- `abandoned`
  - 用户明确放弃当前专注阶段中的这次专注工作。

### 7.2 结果只作用于当前专注阶段

- `completed`、`interrupted`、`abandoned` 都是专注工作对当前 `focus` 阶段返回的结果。
- 三者都会结束当前 `focus` 阶段。
- 三者都不会直接结束整个工作流。
- 整个工作流是否结束，由工作流自己的结束按钮控制。

### 7.3 专注阶段时间到后的处理

- 当 `focus` 阶段时间到了，而绑定的专注工作尚未自然完成时：
  - 系统提示用户进入休息阶段。
  - 如果用户进入休息阶段，则当前专注工作返回 `interrupted`。
  - 第一版不允许在阶段时间到后继续停留在当前专注阶段无限延长。

### 7.4 放弃与退出确认

- 用户主动关闭或退出当前专注工作时，需要先进行二次确认。
- 用户确认后，当前专注工作返回 `abandoned`。
- `abandoned` 只结束当前专注阶段，不直接结束整个工作流。

### 7.5 不使用 resultDetail

- 第一版不引入 `resultDetail`。
- 结果协议使用：
  - `focusWorkType` 表示是哪种页面级专注工作
  - `result` 表示阶段结果
  - `progressSnapshot` 表示业务进度细节
  - `displayState` 表示显示状态
- 不再维护 `vocab_today_completed`、`erc_review_completed` 这类由工作类型和结果拼接出的二级结果枚举。
- 如后续某个子应用确实需要在 `completed` 下细分原因，再为该子应用补充业务字段，不提前引入容易冲突的双结果模型。

## 8. 已明确排除的情况

- `focus` 状态下不会允许用户再次点击其他子应用专注功能。
- 原因不是额外做一层冲突处理，而是由界面交互约束直接避免：
  - 页面其余区域不可点击
  - 用户没有机会再触发第二个专注工作

## 9. 当前需求的本质

- 这次需求的重点，不是单独增强一个顶部胶囊。
- 更准确地说，是：
  - 让顶部工作流胶囊成为 `default/focus` 状态与“是否记录专注”的入口层
  - 让子应用中的一批功能升级为可在大屏弹窗中运行的“专注工作”
  - 让专注状态成为一种覆盖当前主内容区的统一交互模式

## 10. 待继续讨论的问题

- 专注工作弹窗的统一壳结构应该包含哪些公共区块：
  - 标题
  - 计时/记录状态
  - 关闭方式
  - 完成动作
- `Vocab` 的“今日单词”与 `ERC` 的“开始复习”，哪些现有页面内容可以直接复用，哪些需要拆分。
- “记录此次专注”落库时，最终需要记录哪些字段、由谁触发结束写入、以及如何兼容现有工作流/专注表结构。

## 11. 子应用专注功能模板

### 11.1 为什么需要模板

- 子应用中的“专注功能”不是普通导航入口，而是进入统一专注态的起点。
- 如果没有统一模板，每个子应用都会各自定义：
  - 入口行为
  - 专注工作内容边界
  - 完成条件
  - 记录语义
- 这会导致顶部工作流胶囊与专注工作弹窗无法稳定复用。

### 11.2 一个子应用专注功能至少要提供什么

- `入口名称`
  - 用户在页面上看到的动作名称。
  - 例如：`开始今日单词`、`继续今日单词`、`开始复习`
- `来源页面`
  - 该入口位于哪个子应用页面。
  - 例如：`Vocab/Home`、`ERC/Home`
- `专注工作标题`
  - 进入专注态后，在弹窗顶部状态栏中展示的标题。
- `专注工作主体`
  - 真正用于完成任务的内容区域。
  - 要能脱离原页面壳，在统一大屏弹窗中独立运行。
- `完成条件`
  - 明确定义什么情况下视为“该专注工作完成”。
  - 可以是用户点击完成，也可以是业务动作自然到达完成态。
- `中止条件`
  - 明确定义什么情况下该专注工作返回 `interrupted`。
  - 典型场景是当前工作流阶段进入休息。
- `放弃条件`
  - 明确定义什么情况下该专注工作返回 `abandoned`。
- `退出行为`
  - 明确用户主动关闭时如何退出 `focus` 状态。
- `记录语义`
  - 当本次选择“记录”时，最终记录的任务名称、任务类型、业务结果由什么定义。
- `显示状态支持`
  - 明确该专注工作如何支持 `fullscreen`、`minimized`、`closed`。
- `进度快照`
  - 明确结束当前阶段时可以返回哪些轻量业务进度。

### 11.3 一个子应用专注功能应遵守的约束

- 必须能在“当前页原地”进入专注工作，不依赖先跳转到其他页面。
- 必须支持被统一专注工作弹窗承载，而不是只能作为完整页面运行。
- 必须明确区分：
  - 哪些内容属于“专注工作主体”
  - 哪些内容只是仪表盘、导航、统计或外围信息
- 必须提供稳定的阶段结果信号，用于通知工作流当前 `focus` 阶段如何收口。
- 在“不记录模式”下，仍然可以完整运行该专注工作，只是不产生专注记录。
- 必须能在当前阶段结束时返回 `completed`、`interrupted` 或 `abandoned` 之一。
- 如果下一个阶段仍绑定同一个页面级专注工作，必须能进入 `minimized` 并在下一阶段恢复。

### 11.4 推荐的数据模板

- 后续每个子应用接入专注功能时，至少应整理出如下信息：
  - `focusWorkType`
  - `sourceApp`
  - `sourcePage`
  - `entryLabel`
  - `focusTitle`
  - `workBodyDescription`
  - `completionRule`
  - `interruptionRule`
  - `abandonRule`
  - `progressSnapshotSchema`
  - `minimizeSupport`

### 11.5 推荐的返回协议

- 页面级专注工作结束当前阶段时，向工作流返回：
  - `workType`
  - `result`
  - `progressSnapshot`
  - `displayState`
- `result` 只使用：
  - `completed`
  - `interrupted`
  - `abandoned`
- 第一版不返回 `resultDetail`。

### 11.6 第一批模板实例

- `Vocab / 开始今日单词`
  - 来源页面：`Vocab/Home`
  - 专注工作标题：`今日单词`
  - 专注工作主体：今日单词流程中的批次信息、卡片内容、提交记忆结果、批次推进
  - `completed`：今日单词自然完成
  - `interrupted`：当前专注阶段结束但今日单词尚未完成
  - `abandoned`：用户确认放弃当前阶段中的今日单词专注工作
  - 不包含：首页总览、词书外围导航、统计卡片
- `Vocab / 继续今日单词`
  - 与“开始今日单词”共用同一套专注工作主体，但入口语义不同
- `ERC / 开始复习`
  - 来源页面：`ERC/Home`
  - 专注工作标题：`阅读复习`
  - 专注工作主体：复习题目、选项作答、提交结果、下一题或完成态
  - `completed`：本轮复习自然完成
  - `interrupted`：当前专注阶段结束但本轮复习尚未完成
  - `abandoned`：用户确认放弃当前阶段中的 ERC 复习
  - 不包含：题库导航、错题入口、首页概览信息

### 11.7 模板用途

- 该模板用于后续所有子应用接入“专注工作”时的需求整理与设计评审。
- 只有满足模板要求的功能，才适合接入统一专注态。

## 12. 阶段数据模型草案

### 12.1 现有模型基础

- 当前工作流阶段已经通过 `phases JSONB` 存在于：
  - `focus_workflow_presets.phases`
  - `focus_workflows.phases`
- 当前 `focus` 阶段已经支持：
  - `phase_type`
  - `duration`
  - `timer_mode`
  - `task_id`
- 第一版继续扩展现有阶段 JSON，不新增独立阶段表。

### 12.2 focus 阶段扩展字段

建议第一版 `focus` 阶段扩展为：

```ts
type FocusWorkflowPhase = {
  phase_type: 'focus' | 'break';
  duration: number;
  timer_mode?: 'countdown' | 'countup' | null;

  focus_target_type?: 'app_work' | 'task' | null;
  focus_work_type?: 'vocab_today' | 'erc_review' | null;
  task_id?: string | null;

  is_temporary?: boolean;
  record_focus?: boolean;
};
```

字段语义：

- `focus_target_type`
  - `app_work` 表示绑定页面级专注工作。
  - `task` 表示沿用现有任务专注能力。
- `focus_work_type`
  - 仅在 `focus_target_type = app_work` 时使用。
  - 第一批支持 `vocab_today`、`erc_review`。
- `task_id`
  - 仅在 `focus_target_type = task` 时使用。
  - 用于兼容现有任务专注能力。
- `is_temporary`
  - 标记该阶段是否由子应用临时进入生成。
  - 预设工作流阶段通常为 `false` 或缺省。
- `record_focus`
  - 标记该阶段是否计入专注记录。
  - 工作流预设阶段默认 `true`。
  - 子应用临时进入时由用户选择。

### 12.3 预设层与运行层边界

- 预设层保存阶段要绑定什么：
  - `focus_target_type`
  - `focus_work_type`
  - `task_id`
  - `duration`
  - `timer_mode`
- 运行层保存当前显示和结果如何：
  - `active_focus_work_type`
  - `focus_work_display_state`
  - `focus_work_result`
  - `focus_work_progress_snapshot`
- `is_temporary` 与 `record_focus` 放在运行态阶段 JSON 中，因为它们属于临时插入阶段的编排属性。

### 12.4 运行态字段

建议工作流运行态至少支持：

```ts
type FocusWorkflowRuntime = {
  active_focus_work_type?: 'vocab_today' | 'erc_review' | null;
  focus_work_display_state?: 'fullscreen' | 'minimized' | 'closed' | null;
  focus_work_result?: 'completed' | 'interrupted' | 'abandoned' | null;
  focus_work_progress_snapshot?: Record<string, unknown> | null;
};
```

## 13. 状态流转草案

### 13.1 预设工作流进入

当工作流推进到一个 `focus` 阶段：

- 如果 `focus_target_type = app_work`：
  - 读取 `focus_work_type`。
  - 打开对应页面级专注工作。
  - 设置 `focus_work_display_state = fullscreen`。
  - 页面进入 `focus`。
  - 不询问是否记录，因为它已经属于工作流预设编排。
- 如果 `focus_target_type = task`：
  - 沿用现有任务专注逻辑。
  - 任务有效时开始计时。
  - 任务缺失或需要运行时选择时进入 `pending_task_selection`。
- 如果没有有效 target：
  - 第一版应视为配置错误，或退化为 `pending_task_selection`。

### 13.2 子应用临时进入

当用户从子应用点击页面级专注功能：

- 胶囊弹出轻量浮层，询问是否记录。
- 用户选择后得到 `record_focus = true | false`。
- 如果当前没有活动工作流：
  - 创建一条临时工作流。
  - `phases` 只包含一个临时 `focus` 阶段。
  - 该阶段设置 `focus_target_type = app_work`、`focus_work_type`、`is_temporary = true`、`record_focus`。
  - 打开专注工作大屏。
  - 页面进入 `focus`。
- 如果当前有活动工作流且处于 `break`：
  - 在当前工作流中插入临时 `focus` 阶段。
  - 在其后插入一个 `5 分钟 break` 阶段。
  - 立即进入该临时专注阶段。
  - 原工作流后续阶段顺延。

### 13.3 专注阶段结束

页面级专注工作结束当前阶段时返回：

```ts
{
  workType: 'vocab_today' | 'erc_review';
  result: 'completed' | 'interrupted' | 'abandoned';
  progressSnapshot?: Record<string, unknown>;
  displayState: 'closed' | 'minimized';
}
```

工作流收到后：

- 关闭或最小化当前专注工作。
- 保存当前阶段结果与进度快照。
- 如果 `record_focus = true`，结算当前阶段专注记录。
- 推进到下一个阶段。

### 13.4 focus 到 break 的显示判定

当当前 `focus` 阶段结束且下一个阶段是 `break`：

- 如果 `break` 后的下一个 `focus` 阶段绑定同一个 `focus_work_type`：
  - 当前专注工作进入 `minimized`。
  - 主内容区显示最小化浮层或小卡片。
  - 胶囊进入 `break` 状态，并带 `hasMinimizedWork`。
- 如果后续不是同一个 `focus_work_type`：
  - 当前专注工作进入 `closed`。
  - 胶囊进入 `break` 状态。
  - 不保留最小化浮层。

### 13.5 break 到 focus 的恢复判定

当休息结束，工作流进入下一个 `focus` 阶段：

- 如果存在 `minimized`，且该阶段绑定同一个 `focus_work_type`：
  - 自动恢复为 `fullscreen`。
  - 页面进入 `focus`。
- 否则：
  - 打开该阶段绑定的新页面级专注工作。
  - 页面进入 `focus`。

### 13.6 工作流结束按钮

- 工作流结束是独立动作。
- 胶囊或导航栏提供工作流结束入口。
- 它直接结束整条工作流。
- 它不由 `completed`、`interrupted`、`abandoned` 决定。
- 如果当前有专注工作打开或最小化，需要一并清理显示状态。

## 14. API 与后端表结构草案

### 14.1 phases JSONB 扩展

预设阶段示例：

```json
{
  "phase_type": "focus",
  "duration": 1500,
  "timer_mode": "countdown",
  "focus_target_type": "app_work",
  "focus_work_type": "vocab_today",
  "task_id": null
}
```

运行态临时阶段示例：

```json
{
  "phase_type": "focus",
  "duration": 1500,
  "timer_mode": "countdown",
  "focus_target_type": "app_work",
  "focus_work_type": "erc_review",
  "task_id": null,
  "is_temporary": true,
  "record_focus": false
}
```

约束建议：

- 预设阶段允许 `focus_target_type` 与 `focus_work_type`。
- `is_temporary` 与 `record_focus` 只在运行态阶段中出现。
- `task_id` 继续保留，服务 `focus_target_type = task`。

### 14.2 focus_workflows 运行态列

建议新增列：

```sql
ALTER TABLE focus_workflows
ADD COLUMN IF NOT EXISTS active_focus_work_type VARCHAR(50) NULL,
ADD COLUMN IF NOT EXISTS focus_work_display_state VARCHAR(20) NULL,
ADD COLUMN IF NOT EXISTS focus_work_result VARCHAR(20) NULL,
ADD COLUMN IF NOT EXISTS focus_work_progress_snapshot JSONB NULL;
```

约束建议：

```sql
focus_work_display_state IN ('fullscreen', 'minimized', 'closed')
focus_work_result IN ('completed', 'interrupted', 'abandoned')
```

`active_focus_work_type` 第一版由应用层校验，支持 `vocab_today` 与 `erc_review`。

### 14.3 FocusWorkflowOut 扩展

`GET /todo/focus/workflow/current` 建议增加：

```ts
active_focus_work_type?: 'vocab_today' | 'erc_review' | null;
focus_work_display_state?: 'fullscreen' | 'minimized' | 'closed' | null;
focus_work_result?: 'completed' | 'interrupted' | 'abandoned' | null;
focus_work_progress_snapshot?: Record<string, unknown> | null;
next_focus_work_type?: 'vocab_today' | 'erc_review' | null;
has_minimized_work?: boolean;
```

### 14.4 新增 API

`POST /todo/focus/workflow/start-app-work`

- 用于从子应用临时进入专注工作。
- 请求体：

```json
{
  "focus_work_type": "vocab_today",
  "record_focus": true
}
```

后端处理：

- 无活动工作流：创建临时单阶段工作流。
- 当前是 `break`：插入临时 `focus` 阶段与 `5 分钟 break` 阶段。
- 当前是 `focus`：返回 `409`。

`POST /todo/focus/workflow/focus-work-result`

- 用于专注工作向工作流提交当前阶段结果。
- 请求体：

```json
{
  "result": "interrupted",
  "progress_snapshot": {
    "completedCount": 12,
    "remainingCount": 8
  },
  "display_state": "minimized"
}
```

后端处理：

- 校验当前阶段是 `focus`。
- 保存结果与快照。
- 如果 `record_focus = true`，关闭并结算当前 focus log。
- 推进到后续阶段。

### 14.5 现有接口兼容

- `/todo/focus/workflow/current` 继续作为胶囊与专注工作壳的主要快照来源。
- `/todo/focus/workflow/confirm` 继续服务阶段到时后的确认推进。
- `/todo/focus/workflow/select-task` 继续服务 `focus_target_type = task` 的任务选择。
- `/todo/focus/stop` 或新的工作流 stop 接口用于结束整条工作流，不等价于专注工作 `abandoned`。

### 14.6 后端边界

- 后端专注模块不需要理解 `Vocab` 与 `ERC` 的业务细节。
- 统一只保存：
  - `focus_work_type`
  - `result`
  - `progress_snapshot`
- 子应用业务进度不进入 `focus_workflows` 的固定列。

## 15. 前端组件边界草案

### 15.1 FocusWorkProvider

前端需要一个专注工作协调层，负责：

- 拉取 `/todo/focus/workflow/current`。
- 暴露当前页面状态：
  - `default`
  - `focus`
  - `break`
- 暴露当前 `active_focus_work_type`。
- 暴露 `has_minimized_work`。
- 提供动作：
  - `requestStartAppWork(focusWorkType)`
  - `submitFocusWorkResult(result)`
  - `stopWorkflow()`
  - `refreshWorkflow()`

### 15.2 WorkflowNavProgress

现有 `WorkflowNavProgress` 需要从“仅运行中显示的进度条”升级为“工作流状态窗口”。

- `default`
  - 显示当前工作流概览或启动入口。
  - 承接“是否记录专注”的轻量确认。
- `focus`
  - 显示当前工作流、阶段、绑定专注工作、计时与记录状态。
  - 承接阶段结束提示。
  - 提供工作流结束入口。
- `break`
  - 显示休息倒计时。
  - 显示下一个专注工作。
  - 如果有最小化专注工作，显示挂起提示。

### 15.3 FocusWorkModalShell

统一的大屏专注工作壳负责：

- 渲染在导航栏下方。
- 占主要内容区约 `90%`。
- 提供遮罩，使弹窗和导航栏外的主内容不可点击。
- 根据 `active_focus_work_type` 渲染对应专注工作内容。
- 处理退出确认。
- 将阶段结果提交给 `FocusWorkProvider`。

### 15.4 MinimizedFocusWorkCard

主内容区的小浮层或小卡片。

出现条件：

- 工作流处于 `break`。
- `has_minimized_work = true`。
- 当前有被短暂挂起的同页面级专注工作。

职责：

- 显示挂起中的专注工作标题。
- 显示下一个阶段会自动恢复。
- 作为视觉提示，不承担复杂交互。
- 不从这里手动恢复，恢复由工作流进入下一个同工作 `focus` 阶段自动触发。

### 15.5 FocusWorkRegistry

前端需要轻量注册表，将 `focus_work_type` 映射到组件。

```ts
const focusWorkRegistry = {
  vocab_today: {
    title: '今日单词',
    render: VocabTodayFocusWork,
  },
  erc_review: {
    title: '阅读复习',
    render: ERCReviewFocusWork,
  },
};
```

### 15.6 子应用内容适配器

第一批适配器：

- `VocabTodayFocusWork`
  - 复用当前 `Vocab/Today` 的核心内容。
  - 不包含首页仪表盘和导航入口。
  - 自然完成时返回 `completed`。
  - 阶段结束进入休息时返回 `interrupted`。
  - 用户确认放弃时返回 `abandoned`。
- `ERCReviewFocusWork`
  - 复用当前 `ERC/Review` 的核心内容。
  - 不包含 ERC 首页、题库、错题入口。
  - 本轮复习自然完成时返回 `completed`。
  - 阶段结束进入休息时返回 `interrupted`。
  - 用户确认放弃时返回 `abandoned`。

### 15.7 子应用入口改造

- `Vocab/Home`
  - `开始今日单词 / 继续今日单词` 不再直接跳 `#/vocab/today`。
  - 改为调用 `requestStartAppWork('vocab_today')`。
- `ERC/Home`
  - `开始复习` 不再直接跳 `/erc/review`。
  - 改为调用 `requestStartAppWork('erc_review')`。

入口点击后：

- 胶囊触发轻量确认是否记录。
- 后端启动临时工作流或插入临时阶段。
- `FocusWorkModalShell` 打开对应专注工作。

### 15.8 推荐实现顺序

第一批建议顺序：

- `FocusWorkProvider`、`FocusWorkRegistry`、`FocusWorkModalShell`
- 胶囊状态窗口改造
- `VocabTodayFocusWork`
- `ERCReviewFocusWork`

## 16. 文档用途

- 本文档用于记录当前已经对齐的需求边界。
- 它是后续正式设计与实现拆解的基础，不代表最终实现规格已经完全定稿。
