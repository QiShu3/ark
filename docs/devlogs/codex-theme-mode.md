# 开发日志：codex/theme-mode

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

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
