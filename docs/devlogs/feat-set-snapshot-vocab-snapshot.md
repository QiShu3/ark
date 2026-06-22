# 开发日志：feat/set-snapshot/vocab-snapshot

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-22 12:30 · ad2751d · feat(backend): add vocab snapshot support and fix ID mapping

- 用户提出的需求：
  - "完成专注工作后还是没有存档，你再看看"
  - "还是没有啊？你测试一下，用agentbrowser"

- 本次完成的工作：
  - 新增 `vocab_deck_snapshots` 表和仓库函数（聚合、插入、查询）
  - 修改 `_maybe_snapshot_choice_set` 支持 vocab_today 类型，重命名为 `_maybe_snapshot_focus_run`
  - 修复使用 `run.focus_work_type` 而非 `config_snapshot.focus_work_type`（后者为空）
  - 在快照 API 中增加 `content_banks` → `vocab_decks` 的 ID 映射逻辑
  - 修复 JSONB 字段需要解析为 dict 才能通过 Pydantic 验证
  - 新增 `migrate_choice_banks.py` 数据迁移脚本和 `test_import_choice.py` 测试

- 验证情况：
  - `uv run pytest` — 212 passed
  - `pnpm check` — TypeScript 编译通过
  - agent-browser 测试：完成 vocab_today 专注工作后，存档分析页显示 "1 条存档"，正确展示掌握度分布
