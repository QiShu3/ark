# codex/focus-work-cleanup

## 9b7f53c - fix(focus-work): prevent empty runs from auto-completing

**提交时间**: 2026-07-01

**用户请求**: “我发现有些bug，在运行工作流时有些专注工作没有内容直接跳转到结算阶段了”；随后要求“好，提交代码吧”，并确认 `docs/开发日志.md` 需要恢复。

**完成工作**:
- 修复 Choice / Flashcard / Input 三类 Focus Work 模板的空内容完成逻辑：初始加载后没有题目时保留空状态，不再直接触发结算。
- 保留“已经答过题后题库耗尽”的正常完成路径，避免工作流卡在最后一题后无法进入后续阶段。
- 移除 `PracticeFocusWork` 对空 choice 内容的额外自动完成逻辑，避免职责在容器和模板之间重复扩散。
- 为三类模板补充或更新空内容测试，覆盖“初始空内容不结算”和“有进度后耗尽可结算”的行为。
- 修复接口验收中发现的两个后端问题：choice mistakes 的 SQL 参数占位符错误，以及 deliberate workflow snapshot_type 空值归一化导致的 500。
- 更新 todo 路由测试假连接，兼容迁移清理 SQL。

**验证**:
- `cd frontend && ./node_modules/.bin/tsc -b --noEmit`: 通过
- `cd frontend && ./node_modules/.bin/vitest run src/components/focus-work/templates/ChoiceQuestionFocusTemplate.test.tsx src/components/focus-work/templates/InputQuestionFocusTemplate.test.tsx src/components/focus-work/templates/FlashcardFocusTemplate.test.tsx src/components/ERC/PracticeFocusWork.test.tsx src/components/ERC/ReviewFocusWork.test.tsx`: 5 files / 31 tests passed
- `cd backend && uv run pytest`: 216 passed

## fd856b5 - refactor: remove practice/review dual mode and migrate vocab→flash in public layer

**用户请求**: 公开语义收尾——去掉 choice 的 practice/review 双模式，vocab 公开语义迁到 flash，集中 legacy alias

**完成工作**:
- 移除 `ChoiceAppMode` 类型和 `choiceMode` 选择器 UI（EventCountdownCard、EventWorkbenchModal）
- ERC practice/review 配置统一为单一 `choice` config（前端 types/configSync/eventAppSync、后端 schemas/routes）
- ERC_APP 两个 FocusWorkDeclaration（practice+review）合并为一个（choice）
- `AppTaskId` 从 `'vocab' | 'erc' | 'input'` 改为 `'flash' | 'erc' | 'input'`
- 前端路由 `/vocab/*` → `/flash/*`，API `/todo/app-tasks/vocab/*` → `/todo/app-tasks/flash/*`
- 后端 app_registry id `vocab` → `flash`，route `/vocab` → `/flash`
- 新增 legacy app_id normalize 层：DB 查找兼容 `flash`+`vocab`，Pydantic 输出规范化 `vocab`→`flash`
- DB CHECK 约束加入 `'flash'`（保留 `'vocab'` 兼容旧数据）
- 所有 legacy alias 集中在 normalize 层：`focus_work_types.py`、`appConfigTypes.ts`、`focusWorkTypes.ts`

**验证**:
- tsc: 0 errors
- pytest: 216 passed
- grep: 无对外 `/api/vocab`、无 `choiceMode`、无公开 `practice/review` 双模式、无 canonical `flashcard`/`choice_question`/`vocab_today`

## d8058cc - refactor: migrate vocab/choice/input into focus_work namespace

**用户请求**: 把专注工作相关实现彻底迁入 focus_work 目录，删除旧目录，统一 vocab→flash 接口，收口 choice 双模式

**完成工作**:
- 后端 routes/vocab/* → routes/focus_work/flash/*
- 后端 routes/choice/* → routes/focus_work/choice/*
- 后端 routes/input/* → routes/focus_work/input/*
- 对外接口 /api/vocab → /api/flash
- choice 收口: 移除 practice/review 双模式公开 API
- 更新所有外部引用 (admin_routes, todo, deliberate, tests, scripts)
- 更新前端 API 调用，移除 submitChoiceAnswer 的 mode 参数
- 删除旧三目录

**验证**:
- grep 检查: 无 routes.vocab/routes.choice/routes.input 残留
- tsc 检查: 通过
- pytest: 79 passed
