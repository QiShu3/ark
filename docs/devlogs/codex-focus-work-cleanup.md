# codex/focus-work-cleanup

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
