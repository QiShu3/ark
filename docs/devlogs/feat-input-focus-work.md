# feat/input-focus-work 分支开发日志

## 提交记录

### 2026-06-25 · `8f2e339` · feat(snapshot): support input type in content bank list and snapshot visualization

**用户需求**：存档可视化页面看不到 input 类型的存档

**完成工作**：
- `backend/routes/admin_routes.py` 的 `list_content_banks` 添加 `input_sets` 查询
- `frontend/src/pages/SnapshotSubApp.tsx` 支持 input 类型快照的展示
  - 根据 `fw_type` 调用不同的 API（`/api/input/snapshots` 或 `/api/choice/snapshots`）
  - 显示 input 快照的统计数据（总题数、已作答、正确数、用时）
  - 显示 input 快照的历史表格

**验证情况**：`pnpm check` 和 `uv run ruff check` 通过

---

### 2026-06-25 · `692f514` · fix(frontend): add input type label in focusTypeLabel

**用户需求**：选择"输入类专注工作"后显示的还是"选择练习"

**完成工作**：
- `frontend/src/pages/DeliberateWorkflow.tsx` 的 `focusTypeLabel` 函数添加 `input` 类型处理
- 返回正确的标签"输入练习"而非默认的"选择练习"

**验证情况**：`pnpm check` 类型检查通过

---

### 2026-06-25 · `9aa44be` · fix(todo): add input type to _focus_work_app_metadata

**用户需求**：选择"输入类专注工作"后显示的还是"选择练习"

**完成工作**：
- `backend/routes/todo/routes.py` 的 `_focus_work_app_metadata` 函数添加 `input` 类型处理
- 返回 `("input", "input")` 而非 `(None, None)`

**验证情况**：`uv run ruff check routes/todo/routes.py -q` 通过

---

### 2026-06-25 · `ec12e5d` · feat(input): support input type in admin routes and fix paragraph layout

**用户需求**：帮我提交代码

**完成工作**：
- admin_routes 支持 input 类型的 content bank 列表（`list_content_banks_for_type`）
- admin_routes 测试配置支持 input 类型（`create_test_focus_config`）
- 导出 input router
- workflow phases 白名单添加 `input_bank_id`
- InputQuestionFocusTemplate 修复无 label 段落的布局（全宽显示）

**验证情况**：提交成功，5 files changed, 33 insertions(+), 15 deletions(-)

---

### 2026-06-25 · `1c171e4` · feat(input): add InputFocusWork component

**用户需求**：实现 Task 10 — Frontend InputFocusWork component

**完成工作**：
- 创建 `frontend/src/components/Input/InputFocusWork.tsx`
- 组件接收 FocusWorkRendererProps，从 run.config_snapshot 提取 bank_id
- 通过 fetchInputNext API 获取下一篇文章，转换 DTO 为 InputArticleItem/InputQuestionItem
- 传递给 InputQuestionFocusTemplate 模板组件
- 支持同一文章内多题顺序作答，答完自动加载下一篇
- 跟踪 correct/wrong 计数用于进度快照
- 适配实际模板接口（article + currentQuestion 分离式 props）

**验证情况**：`pnpm check` 类型检查通过，`pnpm lint` 无新增错误

### 2026-06-25 · `ad29fe4b` · feat(input): add InputQuestionFocusTemplate component

**用户需求**：实现 Task 9 — Frontend template component

**完成工作**：
- 创建 `frontend/src/components/focus-work/templates/InputQuestionFocusTemplate.tsx`
- 渲染文章段落材料（复用 ChoiceQuestionFocusTemplate 的 article 布局模式）
- 支持填空题（exact/contains/regex 匹配）和主观题（AI 评分）模式
- 提交后显示结果：填空题显示正确/错误+标准答案，主观题显示得分+反馈
- 进度管理：answeredCount / targetCount 显示
- 键盘快捷键：Ctrl+Enter 提交，Enter 下一题（仅填空题正确时）
- 遵循 focus-work 组件样式约定，使用 CSS 变量而非硬编码颜色

**验证情况**：TypeScript 类型检查通过，ESLint 无新增错误

### 2026-06-25 · `d484f275` · feat(input): add service layer with fill match and AI grading

**用户需求**：实现 Task 4 — Backend service with fill match + AI grading

**完成工作**：
- 创建 `backend/routes/input/service.py`，实现服务层逻辑
- `match_fill_answer()` — 填空模式匹配，支持 exact/contains/regex 三种规则
- `ai_grade()` — 主观题 AI 评分（硬编码 OpenAI API）
- `submit_answer()` — 根据题目模式分发到 fill 或 subjective 评分
- `import_input_bank()` — 支持 JSON 和 ZIP 上传，ZIP 自动提取图片并重写路径
- `_parse_articles()` — 解析文章结构（段落 + 题目）
- `_rewrite_image_paths()` — 将 markdown 图片路径重写为服务器路径
- 修复 ruff lint 问题：将 `_UPLOADS_DIR` 提升为模块级常量，添加缺失的顶层 imports

**验证情况**：
- `backend`: `uv run ruff check routes/input/service.py`，passed

**变更文件**：1 file changed, 384 insertions(+)
