# Arxiv 每日阅读栏新增“跳过”功能计划

## Summary

* 目标：在每日阅读卡片（`div`）中新增“跳过”按钮，行为与“收藏/已读”一致走后端持久化状态。

* 过滤规则：每日候选生成时过滤 `已收藏`、`已读`、`已跳过` 三类论文，并尽量补齐到用户设置条数（`limit`）。

* 交互规则：点击“跳过”后仅标记状态，不自动跳到下一篇。

## Current State Analysis

* 前端每日卡片在 [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx) 中渲染，右侧已存在“收藏”“标记已读”两个状态按钮。

* 前端状态结构 `PaperState` / `PaperStateMap` 仅包含 `is_favorite`、`is_read`，`upsertState` 仅支持这两项字段更新。

* 后端状态表 `papers`（[arxiv\_routes.py](file:///Users/qishu/Project/ark/backend/routes/arxiv_routes.py)）当前字段为 `is_favorite`、`is_read`，无 `is_skipped`。

* 每日候选刷新函数 `_refresh_daily_candidates_for_user` 已支持“先多拉取再过滤并截断到 limit”，当前只过滤 `is_favorite OR is_read`。

* 现有测试 [test\_arxiv\_routes.py](file:///Users/qishu/Project/ark/backend/tests/test_arxiv_routes.py) 覆盖状态写入与查询，但未覆盖 `is_skipped`。

## Proposed Changes

### 1) 后端：扩展论文状态模型支持 `is_skipped`

* 文件： [arxiv\_routes.py](file:///Users/qishu/Project/ark/backend/routes/arxiv_routes.py)

* 改动：

  * 在 `init_arxiv` 的建表/补字段逻辑中新增 `is_skipped BOOLEAN NOT NULL DEFAULT FALSE`。

  * 扩展 `PaperStateUpsertRequest`、`PaperStateOut` 增加 `is_skipped`。

  * 更新 `_row_to_paper_state` 映射 `is_skipped`。

  * 更新 `/papers/state` 的 UPSERT SQL：写入并返回 `is_skipped`。

  * 更新 `/papers` 查询 SELECT 字段，保证前端可拿到 `is_skipped`。

* 原因：让“跳过”与收藏/已读保持一致的持久状态能力。

### 2) 后端：每日候选过滤纳入 `is_skipped`

* 文件： [arxiv\_routes.py](file:///Users/qishu/Project/ark/backend/routes/arxiv_routes.py)

* 改动：

  * `_refresh_daily_candidates_for_user` 的过滤条件扩展为：

    * `is_read = TRUE OR is_favorite = TRUE OR is_skipped = TRUE`

  * 保留“多拉取补齐 + 截断到配置 limit”的现有策略。

* 原因：被跳过论文不再出现在每日候选中，同时尽量满足用户设置条数。

### 3) 前端：每日阅读卡片新增“跳过”按钮

* 文件： [Arxiv.tsx](file:///Users/qishu/Project/ark/frontend/src/pages/Arxiv.tsx)

* 改动：

  * 扩展前端 `PaperState` / `PaperStateMap` 类型增加 `is_skipped`。

  * 扩展 `upsertState` patch 类型支持 `is_skipped` 并在提交时带上该字段。

  * 在每日阅读卡片右侧按钮组新增“跳过”按钮（样式与现有按钮体系一致）。

  * 点击“跳过”只更新状态，不触发自动翻页（按已确认偏好）。

  * 按钮文案/样式建议：未跳过显示“跳过”，已跳过显示“已跳过”。

* 原因：完成用户在 `div` 卡片区域内的功能诉求，并与现有交互风格保持一致。

### 4) 测试与回归

* 文件： [test\_arxiv\_routes.py](file:///Users/qishu/Project/ark/backend/tests/test_arxiv_routes.py)

* 改动：

  * 扩展假连接 `_FakeConn` 的状态结构，支持 `is_skipped`。

  * 增加/更新状态流测试：校验 `/papers/state` 能写入并返回 `is_skipped`。

  * 增加过滤逻辑测试：验证被标记 `is_skipped` 的 arxiv\_id 不进入每日候选集（可通过 monkeypatch `_search_arxiv` + fake fetch 返回实现）。

* 原因：避免状态字段和过滤规则回归。

## Assumptions & Decisions

* 已确认决策 1：`跳过` 为持久状态（非仅今日、非仅会话）。

* 已确认决策 2：点击“跳过”后仅标记，不自动跳转下一篇。

* 假设：`daily limit` 仍以当前配置 `limit_count` 为唯一目标条数来源，不新增额外前端选择器语义。

## Verification Steps

* 后端测试：执行 `backend/tests/test_arxiv_routes.py`，确认新增字段与过滤逻辑通过。

* API验证：

  * `PUT /api/arxiv/papers/state` 传 `is_skipped=true` 后，`GET /api/arxiv/papers` 返回包含该字段。

  * 刷新 `POST /api/arxiv/daily/refresh` 后，被跳过论文不在候选结果中。

* 前端验证：

  * 每日卡片出现“跳过”按钮，点击后按钮状态切换为“已跳过”。

  * 点击“跳过”后当前卡片不自动翻页。

  * 刷新每日候选后，被跳过论文不再出现，候选条数尽量贴近 `limit`。

