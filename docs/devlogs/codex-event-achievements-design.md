# 开发日志：codex/event-achievements-design

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-04-21 19:17 · 4616857 · feat(frontend): animate achievement modal exit

- 用户提出的需求：
  - “好”

- 本次完成的工作：
  - 为成就弹窗增加 200ms 的退场动画，关闭时不再瞬间消失
  - 将成就弹窗改为“延迟卸载”模式，等待退场动画完成后再从 DOM 中移除
  - 为退场遮罩层和弹窗主体补充自定义 CSS keyframes，保留与现有入场动画兼容的视觉语言
  - 更新前端回归测试，覆盖 Esc 关闭后的延迟卸载、滚动锁定恢复时机与退场动画类

- 验证情况：
  - `pnpm test -- --run src/components/__tests__/AchievementModal.test.tsx`
  - `pnpm test -- --run src/components/__tests__/AchievementCard.test.tsx src/components/__tests__/AchievementModal.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/RightPanel.test.tsx`
  - `pnpm check`

### 2026-04-21 19:07 · 1fb2c33 · feat(frontend): animate achievement modal

- 用户提出的需求：
  - “加动画吧”

- 本次完成的工作：
  - 为成就弹窗遮罩层补充淡入动画，使打开时的背景过渡更平滑
  - 为成就弹窗主体补充缩放进入动画，和现有任务/日程弹窗的动效语言保持一致
  - 增加前端回归测试，确保成就弹窗 overlay 与 surface 都保留入场动画类

- 验证情况：
  - `pnpm test -- --run src/components/__tests__/AchievementModal.test.tsx`
  - `pnpm test -- --run src/components/__tests__/AchievementCard.test.tsx src/components/__tests__/AchievementModal.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/RightPanel.test.tsx`
  - `pnpm check`

### 2026-04-21 19:02 · f25ea25 · test(frontend): cover achievement modal scroll lock

- 用户提出的需求：
  - “好，继续补吧”

- 本次完成的工作：
  - 将成就弹窗的页面滚动锁定从仅处理 `body` 扩展为同时处理 `html` 与 `body`
  - 关闭成就弹窗时恢复打开前已有的滚动样式，避免覆盖页面原本状态
  - 补充成就弹窗回归测试，覆盖打开时锁定页面滚动与关闭后恢复原样

- 验证情况：
  - `pnpm test -- --run src/components/__tests__/AchievementModal.test.tsx`
  - `pnpm test -- --run src/components/__tests__/AchievementCard.test.tsx src/components/__tests__/AchievementModal.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/RightPanel.test.tsx`
  - `pnpm check`

### 2026-04-21 18:57 · 63a5eaf · feat(frontend): improve achievement modal focus

- 用户提出的需求：
  - “什么焦点管理？”
  - “OK”

- 本次完成的工作：
  - 为成就卡片补充触发按钮引用，用于弹窗关闭后的焦点回收
  - 为 `AchievementModal` 增加打开后自动聚焦关闭按钮的行为
  - 支持按 `Esc` 关闭成就弹窗，并在关闭后把焦点还回成就卡片
  - 增加弹窗内 `Tab` / `Shift+Tab` 的焦点循环，避免焦点跳出到右栏其他区域
  - 补充前端回归测试，覆盖打开后聚焦与 `Esc` 关闭后的焦点恢复

- 验证情况：
  - `pnpm test -- --run src/components/__tests__/AchievementCard.test.tsx src/components/__tests__/AchievementModal.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/RightPanel.test.tsx`
  - `pnpm check`

### 2026-04-21 09:22 · f60e041 · fix(frontend): portal achievement modal

- 用户提出的需求：
  - “点击成就卡片后，怎么不是跳出弹窗？只是展开而已，看不完全东西”

- 本次完成的工作：
  - 将 `AchievementModal` 改为通过 `createPortal` 挂载到 `document.body`
  - 为成就弹窗补充 `dialog` 语义，避免它继续表现成右栏内部展开层
  - 调整弹窗容器的视口高度与顶边留白，减少内容看不全的问题
  - 补充回归测试，确保弹窗不会再渲染在右栏容器内部

- 验证情况：
  - `pnpm test -- --run src/components/__tests__/AchievementCard.test.tsx`
  - `pnpm test -- --run src/components/__tests__/AchievementModal.test.tsx`
  - `pnpm test -- --run src/components/__tests__/AchievementCard.test.tsx src/components/__tests__/AchievementModal.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/RightPanel.test.tsx`
  - `pnpm check`

### 2026-04-20 18:49 · 3722cae · feat(frontend): add event achievement surfaces

- 用户提出的需求：
  - “最好是每个事件都有自己独立的一套成就进度，切换事件就切换战绩，当然也有不依赖于事件的全局成就，比如说总共专注时长”
  - “全局成就总是出现，即使存在事件时也会显示全局成就”
  - “应该有两个ui，一个是卡片状态，另外一个是点开后的弹窗状态”
  - “给我展示的页面背景做成黑色（注意不是卡片状态和弹窗状态本身，而是展示用的背景）”
  - “可以，不错”
  - “好，继续吧”
  - “OK”

- 本次完成的工作：
  - 新增 `AchievementCard`、`AchievementModal`、`AchievementBadgeCard` 与共享类型
  - 将右侧面板原本静态的“成就”占位替换成真实的成就入口组件
  - 实现卡片状态与弹窗状态两层 UI
  - 实现弹窗中的事件切换，以及始终显示的全局成就区域
  - 补充前端单测覆盖卡片摘要、弹窗打开、事件切换和入口挂载

- 验证情况：
  - `pnpm test -- --run src/components/__tests__/AchievementCard.test.tsx src/components/__tests__/AchievementModal.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/RightPanel.test.tsx`
  - `pnpm check`

### 2026-04-20 18:49 · d3f1446 · feat(todo): derive event achievements summary

- 用户提出的需求：
  - “C。对了，我希望成就也是跟着事件走的，你看看关于事件的代码再回复我吧”
  - “最好是每个事件都有自己独立的一套成就进度，切换事件就切换战绩，当然也有不依赖于事件的全局成就，比如说总共专注时长”
  - “全局成就总是出现，即使存在事件时也会显示全局成就”

- 本次完成的工作：
  - 新增 `/todo/achievements/summary` 汇总接口
  - 为成就响应补充事件成就与全局成就的结构化返回模型
  - 基于现有 `events`、`tasks`、`appointments`、`completion_records`、`focus_logs` 实现第一版派生计算
  - 事件成就按 `event_id` 过滤完成记录与专注时长
  - 全局成就始终返回，不依赖主事件是否存在
  - 顺手修复一个时间脆弱的后端测试，使其使用相对当前时间而非固定过去时间

- 验证情况：
  - `uv run pytest tests/test_todo_routes.py -k "achievement_summary_without_primary_event or achievement_summary_defaults_to_primary_event" -v`
  - `uv run pytest tests/test_todo_routes.py -k "filters_event_completions_and_focus" -v`
  - `uv run pytest tests/test_todo_routes.py -v`

### 2026-04-20 18:32 · 54d88b1 · docs: add event achievements design

- 用户提出的需求：
  - “看看成就板块相关的代码”
  - “好啊，我们继续讨论接下来怎么办吧”
  - “C的轻量版”
  - “有没有demo，文字还是太苍白了”
  - “C。对了，我希望成就也是跟着事件走的，你看看关于事件的代码再回复我吧”
  - “最好是每个事件都有自己独立的一套成就进度，切换事件就切换战绩，当然也有不依赖于事件的全局成就，比如说总共专注时长”
  - “全局成就总是出现，即使存在事件时也会显示全局成就”
  - “应该有两个ui，一个是卡片状态，另外一个是点开后的弹窗状态”

- 本次完成的工作：
  - 梳理成就入口、事件模型、任务 / 日程 / 专注与事件的现有关系
  - 通过浏览器讨论页迭代确认“事件成就 + 常驻全局成就”的产品方向
  - 确认成就板块存在两个独立 UI：卡片状态与弹窗状态
  - 新增事件成就设计文档，明确产品模型、成就池、接口形状、前端组件拆分、空状态和测试范围
  - 在独立分支 `codex/event-achievements-design` 上提交设计文档

- 验证情况：
  - 文档提交，无额外代码验证
