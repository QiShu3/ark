# feat/deliberate-sub-app 分支开发日志

## 2026-07-09 · 刻意工作流子应用系统

**提交哈希**: `773c2cd` → `e4ad0be`（6 个提交）

**用户提出的需求**：
> 刻意工作流页面有几个主要功能？→ 确认有 4 个（题库管理、专注工作管理、工作流编排、运行档案）
> 保存这四个功能的配置到"子应用"（新增的概念），当新增"子应用"的时候，会默认在应用中心页面复制一个UI和 /deliberate-workflow 页面完全一致的页面，同时也会新增页面，但是四大功能的数据来源不同，也就是说不同子应用的，虽然功能相同，但是它们里面的数据不同。
> 对，要重新加载对应数据。
> 子应用页面是所有用户都可以访问的，但是里面的配置是用户独有的。

**本次完成的工作**：

1. **移除旧版功能**：删除"当前工作流"选择器和 4 步新建向导（draft mode），减少约 500 行代码
2. **数据库迁移**：`deliberate_workflow_configs`、`deliberate_workflow_runs`、`focus_workflow_presets`、`workflow_records` 四张表新增 `app_id` 列
3. **后端 API 改造**：
   - `list_configs`、`create_config` 支持 `app_id` 参数
   - `list_focus_workflow_presets`、`list_workflow_records` 支持 `app_id` 筛选
   - 新增子应用 CRUD 接口（`/api/admin/deliberate-sub-apps`）
4. **前端子应用选择器**：替代旧版"当前工作流"，支持全局/子应用切换
5. **前端子应用弹窗**：`CreateSubAppModal`、`EditSubAppModal`，支持题库多选和上传
6. **路由支持**：`AppDeclaration` 添加 `type` 字段，`DynamicSubAppHome` 支持 deliberate-workflow 类型
7. **题库过滤**：根据子应用 `bank_ids` 过滤显示的题库
8. **数据联动**：切换子应用时四个功能区域全部重新加载
9. **页面差异化**：子应用页面标题显示子应用名称，去掉 Admin 面包屑

**提交记录**：
| 哈希 | 信息 |
|------|------|
| `773c2cd` | feat: deliberate workflow 子应用系统 |
| `ad5b1de` | fix: 将刻意工作流作为内置管理员应用注册到 app_registry |
| `3758b49` | fix: 切换子应用时四个功能区域全部重新加载 |
| `24ecd51` | fix: 修复子应用切换时 loadConfigs 被重复调用导致数据被覆盖 |
| `0c041b8` | fix: 题库管理区域根据子应用 bank_ids 过滤显示 |
| `e4ad0be` | fix: 子应用页面标题和面包屑 |

**验证情况**：
- TypeScript 编译通过
- ESLint 无错误
- 9 个单元测试全部通过
- 浏览器手动验证：子应用 CRUD、切换数据联动、题库过滤、页面标题差异化均正常
- E2E 测试方案已创建：`docs/testing/plans/deliberate-sub-app-20260709-plan.md`
