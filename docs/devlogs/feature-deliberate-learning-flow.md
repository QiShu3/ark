# feature/deliberate-learning-flow

## 2026-06-29 14:42:13 +0800 · 7d4414cbe455120971dfdc1e4a6944aa355bf926 · fix(deliberate): honor focus work question scope

### 用户提出的需求

> 专注工作管理中的，是不是有个 开始 button ，这个button会涉及到下面的工作流吗？
> 这里的题库怎么没有根据上面的类型做出区分？不管我选择哪个类型，可选择的题库都是一样的。
> 然后如果我删除掉专注工作管理中的唯一一个专注工作，这页面就会发生大改变，你可以试一下。怎么会这样？觉得这个逻辑有问题，至少题库应该还在。
> 你怎么没有按照专注工作的配置来？还是显示600多条题目，我明明只配置了10道题目。
> 然后我发现每次专注工作都是重复的题目，不会从上次完成后的专注工作继续。不是有存档吗，你看看怎么回事？

### 本次完成的工作

- 修复新建/编辑专注工作弹窗的题库列表，按当前选择的类型分别加载选择题、闪卡和输入题题库，并在切换类型时重置不匹配的题库与筛选。
- 修复删除唯一专注工作后 `/deliberate-workflow` 直接切到新建向导、隐藏题库管理和存档可视化的问题；无专注工作时页面仍保留题库与存档区域，仅专注工作区显示空状态。
- 修复选择题专注练习未遵守目标题数的问题，后端 practice 配置写入 `target_question_count` / `daily_question_target`，前端题号、结束条件和完成摘要都按配置的题数计算。
- 修复下一次专注练习重复从题库开头取题的问题：`/api/choice/items` 支持按当前用户排除已答题目，练习页默认按未完成题目继续加载，并保留年份、科目、标签筛选。
- 增加前后端回归测试，覆盖目标题数兜底、继续未答题加载和后端过滤已答题题目的分支。

### 验证情况

- `frontend`: `pnpm test -- PracticeFocusWork.test.tsx` 通过，7 passed；仅出现已有 Node engine warning。
- `frontend`: `pnpm check` 通过；仅出现已有 Node engine warning。
- `backend`: `uv run pytest tests/test_choice_adapter.py -q` 通过，19 passed。
- `backend`: `uv run pytest tests/test_focus_workflow_app_work.py -q` 通过，27 passed。
- `backend`: `uv run ruff check routes/choice/adapters.py routes/choice/routes.py tests/test_choice_adapter.py` 通过。

## 2026-06-29 12:02:32 +0800 · a050e233d73eb1ade223bf7e74cfc1dde0481a56 · fix(deliberate): complete forked focus workflow runs

### 用户提出的需求

> Fork 测试方案：后端运行在 http://localhost:8000，前端运行在 http://localhost:5173，测试账号 qishuadmin / 12345678。测试 fork父节点测试 mastery_check 失败后点击 fork子节点测试 推荐，应加载子配置题目而不是直接跳到结算页面；继续回答子节点题目。修复该 bug，然后重新测试。如果测试没有通过，继续修改，直到测试完全通过。用内置浏览器测试，不要用其他的。还要确认完成任务并结束阶段这个按钮的可实现性，要完整地实现一次。

### 本次完成的工作

- 修复 fork 子配置时只复用父运行上下文的问题：前端 fork 请求携带 `child_config_id`，后端按子 deliberate 配置创建新的 deliberate run / focus run，并写入完整题库、scope、completion、pass_criteria 和 deliberate 上下文。
- 修复 fork 后 React 工作台复用父 run 组件状态的问题，按 `activeRun.id` remount 当前专注工作内容。
- 修复 admin deliberate workflow 的动态 UUID 路由吞掉 `/banks` 静态路由导致 HTTP 500 的问题。
- 修复“完成任务并结束阶段”在无绑定 Todo 任务的刻意学习 run 上返回 `当前轮次不计入任务完成` 的问题；无任务 run 现在会完成 focus run、关闭日志、标记刻意学习完成并推进阶段，任务绑定 run 仍保持原有任务完成记录逻辑。
- 增加后端回归测试，覆盖无绑定 deliberate run 点击完成任务并结束阶段的分支。

### 验证情况

- `backend`: `uv run pytest tests/test_focus_workflow_app_work.py` 通过，26 passed。
- `backend`: `uv run python -m py_compile routes/todo/routes.py routes/todo/schemas.py routes/deliberate/routes.py` 通过。
- `frontend`: `pnpm check` 通过；仅出现已有 Node engine warning。
- 内置浏览器完整验证通过：
  - 打开 `http://localhost:5173/#/deliberate-workflow` 无 HTTP 500。
  - 启动 `fork父节点测试` 后加载 `2025年 数据结构 第1题`，底部显示 `正在专注于：真题练习`。
  - 父节点故意答错后显示 `Round Complete`、`检验未通过`、`正确率 0% / 80%`、`fork子节点测试 推荐`、`完成任务并结束阶段`。
  - 点击 `fork子节点测试 推荐` 后加载题目页，未直接跳到 `本轮专注工作已完成`，底部仍显示 `正在专注于：真题练习`，且未出现 `未知任务`。
  - 子节点提交答案后正常显示 `Round Complete`。
  - 子节点点击 `完成任务并结束阶段` 后弹窗消失、Round Complete 消失、无 HTTP 500、无新增控制台错误。
