# main 分支开发日志

## 提交记录

### 2026-06-20 · `e65b54d6` · refactor: 统一 Choice 数据层，彻底废弃 ERC 模块

**用户需求**：将 ERC 旧题库路径合并到 content_banks 体系，统一数据层命名

**完成工作**：
- 合并 routes/erc/ 到 routes/choice/ (repository/service/importer)
- 重命名数据库表 erc_* → choice_* (10 张表 + 3 个索引)
- 移除 sync 机制，Admin import 直接写 choice_sets
- 重命名专注工作类型 erc_practice → practice, erc_review → review
- 前端渲染器统一走 Choice API，删除旧 ERC 独立页面
- 清理前端命名 (ERCPracticeFocusWork → PracticeFocusWork 等)
- 删除 routes/erc/ 目录、admin HTML 页面、旧测试文件

**验证**：Backend 202/202 tests pass, Frontend 249/250 tests pass (1 pre-existing), TypeScript 编译通过

**变更文件**：56 files changed, 519 insertions(+), 1753 deletions(-)
