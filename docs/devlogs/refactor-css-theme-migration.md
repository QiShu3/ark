# 开发日志：refactor/css-theme-migration

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-29 15:18 · 66c4c00 · fix(frontend): replace hardcoded dark modal backgrounds with theme-aware ark-modal class

- 用户提出的需求：
  - "这是在日间模式，为什么背景是黑色的啊？帮我看看"

- 本次完成的工作：
  - 修复了主事件详情工作台弹窗（Event Workbench Modal）以及应用配置弹窗（App Config Modal）在日间/浅色模式（Light Theme / Day Mode）下依然保持纯黑背景的问题。
  - 移除了 `EventWorkbenchModal.tsx`（原 1631 行和 1820 行）中硬编码的黑色背景和边框样式：`border border-ark-border bg-[#0d0f16] text-ark-text`。
  - 替换为全局统一的 `.ark-modal` 语义化主题类，使其在暗色模式下继承暗色背景 (`--ark-surface-strong`)，在日间模式下继承半透明亮蓝灰背景 (`rgba(239, 246, 255, 0.96)`)，且文字和高亮色在日间模式下自动适配深色（如蓝色和绿色胶囊文字自动反转），确保高可读性与视觉精致度。

- 验证情况：
  - 执行 `pnpm check` 类型检查，全部通过。
  - 执行 `pnpm test -- --run`，所有 215 个前端测试用例 100% 绿灯通过，无任何回归问题。
  - 使用内置浏览器智能体在 `localhost:5173` 分别切换为日夜间主题并进入工作台弹窗验证，背景色自适应表现极佳，文字对比度完全正常，视觉细节拉满。
