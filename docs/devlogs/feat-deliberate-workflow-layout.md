# 开发日志：feat/deliberate-workflow-layout

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-26 19:35 · eb8bdca · feat(frontend): unify event data loading and improve primary event UX

- 用户提出的需求：
  - "看看导航栏的 主事件 的功能，就是左上角的那个"
  - "我希望点击后弹出的弹窗根据是否主事件决定，当已经设定了主事件了，则直接弹出 主事件 的 编辑工作台"
  - "编辑工作台似乎没有回到 事件总览 的button"
  - "编辑工作台的 任务、日程 和 首页的任务、日程 显示的内容是一样的吗？进一步地说，来源相同吗？"
  - "在我的设想中，它们显示的内容都是一样的，因此要对此进行合并，减少代码冗余"

- 本次完成的工作：
  - 新增 `useEventArrangements` 和 `usePrimaryEvent` 共享 hooks，封装事件维度的数据加载
  - `HomeRightDashboard` 和 `EventWorkbenchModal` 改用共享 hooks，消除重复的数据加载代码
  - 点击导航栏主事件按钮时，有主事件直接打开编辑工作台（跳过事件总览列表）
  - 编辑工作台 header 的"事件总览"改为可点击的返回按钮，支持回到事件总览列表
  - 无主事件时首页回退到全量任务/日程加载（保持原行为）
  - 更新 `EventCountdownCard.test.tsx` 测试用例适配新行为

- 验证情况：
  - `cd frontend && pnpm test -- --run`，52 files / 269 tests passed，8 skipped
  - `cd frontend && npx tsc --noEmit`，零错误
  - `cd frontend && npx eslint src/hooks/useEventArrangements.ts src/hooks/usePrimaryEvent.ts src/components/HomeRightDashboard.tsx src/components/events/EventWorkbenchModal.tsx`，零新增问题
