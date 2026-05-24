# 开发日志：detached-head/worktree-8fea

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-05 09:54 · a00f82c · feat: add vocab subapp first phase

- 用户提出的需求：
  - “我要开发一个‘背单词子应用’……”
  - “关于前端目录，我希望再来一个文件夹来收纳这些文件，不要散着，比如说 pages下再建立一个 Vocab文件夹来收纳”
  - “回到之前的命名风格 ，第一种”
  - “那还是 单词书切换吧”
  - “好，继续”

- 本次完成的工作：
  - 新增 `backend/routes/vocab/` 领域模块，接入主应用生命周期，并初始化 `vocab_*` 数据表
  - 新增词书导入器与 `backend/scripts/import_vocab.py`，支持从 `english-vocabulary` 的 sentence-rich JSON 导入词书
  - 新增背单词相关后端接口，包括词书列表、今日概览、学习/复习队列、复习提交、错题池和单词详情
  - 新增 `frontend/src/pages/Vocab/`、`components/Vocab/`、`hooks/vocab/`、`lib/vocab/` 目录，完成首页、学习页、复习页、错题页和详情页第一版
  - 在应用中心增加“背单词”入口，并把对应路由接入前端主路由表
  - 补充前后端针对性测试，覆盖导入解析、复习结果逻辑、路由返回和首页/词书 hook 基础行为

- 验证情况：
  - `cd backend && uv run pytest tests/test_vocab_routes.py tests/test_vocab_service.py tests/test_vocab_importer.py -v`
  - `cd backend && uv run ruff check routes/vocab tests/test_vocab_routes.py tests/test_vocab_service.py tests/test_vocab_importer.py scripts/import_vocab.py`
  - `cd frontend && pnpm install`
  - `cd frontend && pnpm test -- src/pages/Vocab/__tests__/Home.test.tsx src/pages/Vocab/__tests__/Review.test.tsx`
  - `cd frontend && pnpm check`
