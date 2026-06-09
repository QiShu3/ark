# 开发日志：codex/focus-work-runs-workbench-boundary

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-09 11:51 · `33b90f2` · feat(focus-work): centralize run handling in workbench

- 用户提出的需求：
  - “我想只让全屏工作台负责任务相关的功能，子应用的专注工作只提供工作内容本身，不涉及任务相关的业务功能”
  - “把 继续一轮 改成再来一轮吧”
  - “对了，记得子应用去除 专注工作的任务业务功能”
  - “你再点击再来一轮看看？还是有问题”
  - “出现了一个很严重的bug，后端高强度刷新这个接口”

- 本次完成的工作：
  - 新增 focus_work_runs 运行模型，将任务完成、阶段结束、额外轮次、超时确认等业务动作集中到全屏工作台
  - 将 Vocab/ERC/TaskFocus 子应用专注内容改为只执行内容并发出 `onContentCompleted`，移除子应用内“再来一次/加练/完成任务”等任务业务
  - 支持 counted run 与 extra run：任务轮次完成后进入“完成任务并结束阶段 / 再来一轮”，额外轮次完成后进入“结束阶段 / 再来一轮”
  - 修复 Vocab 额外轮次仍校验今日计划导致“单词不在今日计划中”的问题，额外轮次改用内容进度提交
  - 修复 ERC Practice 额外轮次仍依赖今日推荐文章导致“再来一轮”秒完成的问题，额外轮次改从文章库取内容
  - 修复 ERC Review 额外轮次无到期复习时秒完成的问题，额外轮次可 fallback 到错题/文章库内容
  - 修复阶段超时后“延长时间”只增加计划时长但仍处于超时态的问题，改为从当前已耗时补齐后再延长
  - 修复首页倒计时在 `phase_time_expired_prompt` 下反复拉取 `/todo/focus/workflow/current` 的请求风暴，并为当前工作流 GET 添加共享 in-flight 去重
  - 新增 [focus_work_runs 与全屏工作台边界重构设计文档](../superpowers/specs/2026-06-08-focus-work-runs-and-workbench-boundary-design.md) 与实施计划

- 验证情况：
  - 前端：`pnpm check`
  - 前端：`pnpm test -- --maxWorkers=1`，52 files / 245 tests passed
  - 后端：`uv run pytest`，180 tests passed
  - 空白检查：`git diff --check`
  - 浏览器：在 `http://localhost:5173/#/` 验证 ERC Practice “再来一轮”进入真题内容，不再秒完成
  - 浏览器：在时间到提示态等待 5 秒，未观察到 `/todo/focus/workflow/current` 持续请求增长
