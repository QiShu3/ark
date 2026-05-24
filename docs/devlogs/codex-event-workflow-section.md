# 开发日志：codex/event-workflow-section

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-24 18:18 · 03d47a2 · feat: add event workflow section

- 用户提出的需求：
  - “好，另起branch进行开发，不要在main上进行开发”
  - “PLEASE IMPLEMENT THIS PLAN: ... 先实现事件里的固定 `工作流` 板块管理 ...”
  - “工作流和安排 位置互换”
  - “这里的工作流任务没有可用的任务选取，我希望它可以选取安排中的任务”
  - “重点是 新建应用后衍生的任务，这个你没有测试”
  - “怎么添加事件后，工作流没有同步到 主页的工作流上呢？”
  - “主页显示的是全局和当前事件的工作流”
  - “工作流预设中的已保存预设中还是找不到 创建事件时创建的工作流”

- 本次完成的工作：
  - 在事件工作台中增加事件固定“工作流”板块，复用工作流预设编辑器管理当前事件自己的工作流。
  - 后端新增事件工作流 CRUD，并让首页 `/todo/focus/workflows` 能返回全局工作流与事件工作流的事件归属信息。
  - 首页工作流启动器和“工作流预设”弹窗只展示全局工作流与当前主事件工作流；当前事件工作流可复制、可启动，但不在主页直接编辑/删除/设默认。
  - 新建事件流程支持先添加工作流草稿，并允许工作流阶段绑定安排中的任务和应用衍生任务；创建事件后会把草稿保存为该事件的工作流。
  - 当当前没有主事件且新建事件附带工作流时，创建完成后自动将该事件设为主事件，让事件工作流能出现在主页已保存预设中。
  - 补充前后端测试覆盖事件工作流创建、任务绑定、主页过滤与事件工作流只读展示。

- 验证情况：
  - `uv run pytest tests/test_todo_routes.py -q`
  - `pnpm test -- EventCountdownCard.test.tsx PlaceholderCard.workflow.test.tsx`
  - `pnpm check`
  - `git diff --check`
  - `curl -I http://localhost:5173/`
  - `agent-browser --session ark-workflow-2 open http://localhost:5173/`，页面可打开但当前停在 `#/login`，未进行登录后的手工点击验证。
