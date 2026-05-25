# 开发日志：codex/home-onboarding-preview-anchor

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-25 23:29 · f332b5a · fix(frontend): remove trae solo badge

- 用户提出的需求：
  - “前端有个 跳转到 trae SOLO 的链接 的button，你找找”
  - “删掉它”
  - “提交本次工作的代码吧”

- 本次完成的工作：
  - 移除 `vite-plugin-trae-solo-badge` 的 Vite 插件导入和插件配置
  - 从 `frontend/package.json` 删除 `vite-plugin-trae-solo-badge` 依赖
  - 同步清理 `frontend/pnpm-lock.yaml` 中对应 importer、package 和 snapshot 条目

- 验证情况：
  - 执行 `pnpm build`，构建通过；仅出现当前 Node 版本与既有 chunk size 提示
  - 执行 `rg -i "trae|solo" frontend`，确认前端目录无残留匹配
