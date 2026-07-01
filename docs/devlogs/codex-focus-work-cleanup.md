# codex/focus-work-cleanup

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
