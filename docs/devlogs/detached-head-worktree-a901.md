# 开发日志：detached-head/worktree-a901

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-31 19:04 · 9aaf9a7 · refactor(frontend): align vocab page with subapp template

- 用户提出的需求：
  - “好，基于此为我重构 vocab 页面吧。”
  - “PLEASE IMPLEMENT THIS PLAN: # 重构 Vocab 首页为统一子应用模板”
  - “去掉这个，强制同步到今日安排中”
  - “去掉这个，意义不明”
  - “当鼠标移到背景板时，背景板也会高亮被显示选中，这样不好看，去掉悬浮态显示”
  - “这类文字应该属于 注释字体 吧？可不可以统一一下这些字体？它在夜间模式下可视化较差”

- 本次完成的工作：
  - 将 Vocab 首页重构为统一子应用模板顺序：顶部配置入口、总览、业务数据、托管安排。
  - 将词书选择、今日目标和默认专注时长移动到“配置今日单词”弹窗中，移除旧 hero、快捷入口和独立当前任务区。
  - 将今日单词的开始、继续、初始化、配置动作收敛到托管安排任务行中。
  - 移除 Vocab 配置中的“同步到今日安排”开关和“单词黄金配比方案”，保存配置和初始化任务固定同步到今日安排。
  - 调整通用 `SubAppArrangements`，支持任务状态、主操作按钮、可选同步开关和统一托管安排文案；保留 ERC 的同步开关能力。
  - 移除全局 `ark-panel-card` 背景板 hover，给 Vocab 小指标卡显式保留 hover 反馈，并新增 `ark-annotation` 注释样式用于低强调提示。

- 验证情况：
  - `cd frontend && pnpm test -- Home.test.tsx`
  - `cd frontend && pnpm check`
  - 当前环境提示 Node v22.18.0 与项目期望 Node 20.x 不一致，但前端测试和类型检查通过。
