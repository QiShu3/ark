# feat/set-snapshot

## 用户请求
实现「题库存档」功能，在专注学习阶段结束时自动捕获掌握度数据，供后续 AI 学习分析使用。

## 完成工作
- 新建 `choice_set_snapshots` 数据库表
- 实现 Repository 层：`aggregate_set_snapshot`、`aggregate_focus_stats`、`insert_set_snapshot`、`list_set_snapshots`
- 实现 Service 层：`snapshot_set`、`get_set_snapshots`
- 添加 `SetSnapshotOut` Schema 和 `GET /api/choice/snapshots` 路由
- 在 `end_focus_workflow_phase` 和 `complete_focus_workflow_run_task_and_end_phase` 中接入存档触发
- 前端添加 `SetSnapshot` 类型和 `fetchSetSnapshots` API
- 创建 `SetSnapshotPanel` 组件展示存档记录
- 集成到 ERC 应用首页「长期积累」区域
- 创建管理员存档分析子应用（应用中心 → 存档分析）
- 修复快照 API：支持 content_bank_id → choice_set_id 名称映射
- 补录历史运行数据脚本

## 验证
- 后端 202 测试全部通过
- 前端 250 测试全部通过
- 前端构建和类型检查通过
