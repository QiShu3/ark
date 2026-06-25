# feat/input-focus-work 分支开发日志

## 提交记录

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
