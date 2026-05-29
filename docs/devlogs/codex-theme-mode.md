# 开发日志：codex/theme-mode

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-29 10:35 · 13c6430 · feat(frontend): refine theme typography

- 用户提出的需求：
  - “OS截图应该可用了。还有日间模式太亮了，有些文字都看不到了。你再配合截图优化一下”
  - “在内置浏览器上截图吧”
  - “字体设置很丑，你有什么方案吗？”
  - “不行，一定要用Claude进行开发。继续尝试吧”
  - “网络突然中断了，你再看看”
  - “提交代码吧。然后总结一下这种 用claude code进行开发，你负责其他事务的 方法”

- 本次完成的工作：
  - 由 Claude Code 参与前端实现，Codex 负责任务编排、命令监控、diff 审查、验证和截图复核。
  - 新增统一的系统字体令牌 `--ark-font-sans`、`--ark-font-display`、`--ark-font-mono`，并补充 `.ark-font-display`、`.ark-font-mono` 工具类。
  - 优化日间模式的文字、面板、边框和覆盖层令牌，让浅色主题不再过亮，并提升首页右侧卡片、日历、成就和备案信息的可读性。
  - 调整中文界面的字体重量和字距，弱化过重的 `font-bold`、`uppercase`、大字距效果，让导航、倒计时卡片、安排区、弹窗标题和对话区更协调。

- 验证情况：
  - `cd frontend && pnpm check`
  - `cd frontend && pnpm test -- --run src/components/__tests__/RightPanel.test.tsx src/components/__tests__/Navigation.test.tsx src/components/__tests__/HomeLayout.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/AchievementCard.test.tsx`
  - `git diff --check`
  - `git diff --cached --check`
  - 内置浏览器验证：在 `http://localhost:5173/` 复核日间和夜间模式，截图保存到 `/private/tmp/ark-theme-mode-light.png` 和 `/private/tmp/ark-theme-mode-dark.png`。
  - `cd frontend && pnpm lint` 未通过；失败点为仓库既有 ESLint 问题，包括 ERC/Vocab/FocusWork 的 hooks 或未使用变量规则，以及已有的 `jsx-a11y/no-noninteractive-element-interactions` 规则定义问题。

### 2026-05-29 00:30 · 2814e15 · feat(frontend): add local theme modes

- 用户提出的需求：
  - “我想添加 日间/夜间模式”
  - “确认，不过要另起branch进行开发，不要在main分支上进行开发”

- 本次完成的工作：
  - 新增本地 `跟随系统 / 日间 / 夜间` 主题偏好，并通过 `useTheme()` 统一管理解析主题、DOM 标记和 localStorage 持久化。
  - 在导航栏新增日夜快速切换入口，在界面设置中新增完整三态外观模式选择，支持即时预览、取消回滚和保存保留。
  - 建立主题 CSS 令牌，并适配全局壳层、导航栏、设置弹窗、首页核心表面、应用中心、Vocab 首页和 ERC 首页。
  - 补充主题 hook、导航栏、设置弹窗、壳层初始化、右侧面板和应用中心的专项测试。

- 验证情况：
  - `cd frontend && pnpm test -- --run src/hooks/useTheme.test.tsx src/components/__tests__/Navigation.test.tsx src/components/__tests__/SettingsModal.theme.test.tsx src/components/__tests__/HomeLayout.test.tsx src/components/__tests__/RightPanel.test.tsx src/pages/__tests__/AppCenter.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx`
  - `cd frontend && pnpm check`
  - `cd frontend && pnpm build`
  - `git diff --check`
  - 浏览器验证：使用本地临时账号进入已登录首页，确认导航栏快切可在日间/夜间间切换；设置弹窗显示 `外观模式`，`跟随系统 / 日间 / 夜间` 可即时预览，取消会回滚，保存会保留；应用中心、Vocab 首页、ERC 首页均挂载主题页面类并在日间/夜间壳层下正常显示。截图接口超时且 OS 截图受 macOS 屏幕录制权限限制，未保存最终截图。
