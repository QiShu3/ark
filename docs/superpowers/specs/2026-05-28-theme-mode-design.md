# 日间 / 夜间模式设计

## 1. 背景

Ark 当前的视觉体系以夜间沉浸式舞台为主：全局背景图、深色遮罩、磨砂导航栏、深色弹窗和右侧工作台共同构成主体验。仓库中已有 `frontend/src/hooks/useTheme.ts`，但它目前没有接入全局壳层和实际 UI 表面；真正影响当前界面的主要是 `frontend/src/lib/customization.ts` 与 `SettingsModal` 中的背景、透明度、看板娘配置。

本次目标是在不重做全项目视觉系统、不改后端账号资料的前提下，添加可用且一致的 `跟随系统 / 日间 / 夜间` 三态主题偏好。日间模式不是把 Ark 首页改成普通白色后台，而是在保留首页沉浸感的同时，让设置、弹窗、应用中心和子应用首页更接近清爽的浅色工作台。

## 2. 目标

- 支持三态主题偏好：`跟随系统`、`日间`、`夜间`。
- 偏好只保存在当前浏览器，不同步到账号资料。
- 导航栏提供快速日夜切换入口。
- 设置弹窗提供完整三态选择入口。
- 建立主题令牌，让核心表面从硬编码深色样式逐步迁移到可切换主题。
- 优先适配全局壳层、导航栏、设置弹窗、首页核心表面、应用中心、Vocab/ERC 首页。
- 夜间模式保持现有 Ark 基调，避免视觉退化。

## 3. 非目标

- 不改后端 schema，不新增用户资料字段。
- 不做跨设备主题同步。
- 不一次性迁移全项目所有 `bg-white/10`、`text-white/70` 等硬编码类名。
- 不重做全部深层学习、练习、工作流运行页。
- 不覆盖用户已有背景图、背景模糊、背景透明度、看板娘显隐和缩放设置。

## 4. 主题模型

主题偏好使用三个值：

- `system`：跟随系统。
- `light`：固定日间。
- `dark`：固定夜间。

实际生效主题使用两个值：

- `light`：日间渲染。
- `dark`：夜间渲染。

初始化时从 `localStorage` 读取 `ark-theme-preference`。如果没有值，默认使用 `system`。如果读到未知值，回退到 `system`。当偏好是 `system` 时，前端读取 `window.matchMedia('(prefers-color-scheme: dark)')` 计算实际主题，并监听系统主题变化；当偏好是 `light` 或 `dark` 时，系统变化不覆盖用户选择。

主题模块负责把实际主题写到 `document.documentElement`：

- `data-theme="light"` 或 `data-theme="dark"`。
- 同步维护 `light` / `dark` class，兼容已有 `useTheme` 语义和可能存在的 Tailwind dark-mode 使用方式。

## 5. 状态与 API 边界

把现有 `frontend/src/hooks/useTheme.ts` 升级成全局可复用的主题入口，并继续以 `useTheme()` 作为组件消费的公开 API。内部实现可以使用 React state 或轻量 store，但组件层只通过 `useTheme()` 读写主题，避免出现多个主题状态来源。公开 API 需要提供：

- `themePreference`：`system | light | dark`。
- `resolvedTheme`：`light | dark`。
- `setThemePreference(nextPreference)`。
- `toggleResolvedTheme()`：导航栏快速切换使用。
- `isDark`：兼容现有调用语义。

组件不直接读取 `matchMedia`，也不各自写 `documentElement`。系统偏好监听、localStorage 校验和 DOM 写入都集中在主题模块。

测试环境需要兜底：如果 `window.matchMedia` 不存在，`system` 固定解析为 `dark`，因为 Ark 现有视觉基线是夜间。

## 6. 交互入口

### 6.1 导航栏快速切换

在 `frontend/src/components/Navigation.tsx` 中，将主题按钮放在设置齿轮附近。

按钮图标按当前状态显示：

- 实际主题为日间时显示太阳类图标。
- 实际主题为夜间时显示月亮类图标。
- 如果偏好是 `system`，使用 `Monitor` 图标，并通过标题提示 `跟随系统`。

导航栏按钮的行为是快速切换实际日夜模式，不负责选择 `跟随系统`：

- 当前实际主题为 `light` 时，点击写入 `dark`。
- 当前实际主题为 `dark` 时，点击写入 `light`。
- 如果当前偏好是 `system`，点击后也写入明确的 `light` 或 `dark`，相当于用户手动覆盖系统。

当专注工作锁定导航时，主题按钮应与设置按钮保持一致：禁用或不可点击，避免全屏专注期间出现不必要的全局 UI 变化。

### 6.2 设置弹窗三态选择

在 `frontend/src/components/SettingsModal.tsx` 的「个性化」Tab 顶部增加 `外观模式` 设置组，位于背景和看板娘配置之前。

控件使用分段按钮：

`跟随系统` / `日间` / `夜间`

选择后立即预览主题。设置弹窗打开时记录主题偏好快照：

- 点击取消或遮罩关闭时，回滚到打开弹窗前的主题偏好。
- 点击保存时，保留当前选择。

当用户选择 `跟随系统` 时，辅助文案显示当前解析结果，例如：

`当前跟随为：夜间`

## 7. 视觉策略

本轮采用“主题令牌 + 核心表面”的实现深度。

在 `frontend/src/index.css` 中定义以下基础主题令牌，并在首批适配范围内优先使用这些名字：

- `--ark-page-bg`
- `--ark-text`
- `--ark-text-muted`
- `--ark-surface`
- `--ark-surface-strong`
- `--ark-surface-subtle`
- `--ark-border`
- `--ark-overlay`
- `--ark-overlay-strong`
- `--ark-focus-ring`
- `--ark-accent`
- `--ark-accent-soft`

夜间值贴近当前界面：黑色/深蓝底、白色文字、白色透明边框、深色磨砂层。

日间值采用浅色工作台：浅灰页面底、深色文字、白色或半透明白表面、浅灰边框、柔和蓝色强调色。首页保留背景图和舞台感，但遮罩改为浅雾或柔和渐变，避免人物和主事件区域被纯白覆盖。

## 8. 首批适配范围

### 8.1 全局壳层

`frontend/src/routes/RequireAuth.tsx`

- 页面底色使用主题令牌。
- 背景图遮罩按主题切换。
- 日间模式增强文字可读性，避免背景图过曝。

### 8.2 导航栏

`frontend/src/components/Navigation.tsx`

- 导航栏背景、边框、链接、头像旁按钮使用主题令牌。
- 新增主题快速切换按钮。
- 保持工作流胶囊位置和行为不变。

### 8.3 设置弹窗

`frontend/src/components/SettingsModal.tsx`

- 新增 `外观模式` 三态选择。
- 弹窗壳、侧栏、表单、上传区域、滑块、底部按钮迁到主题令牌。
- 取消时回滚主题偏好。

### 8.4 首页核心

`frontend/src/components/EventCountdownCard.tsx`

- 主事件圆形入口和事件弹窗核心表面适配日间可读。

`frontend/src/components/RightPanel.tsx`

- 右侧面板折叠按钮和面板容器适配主题。

`frontend/src/components/PlaceholderCard.tsx`

- 首屏可见卡片、工作流状态、安排入口和主要弹窗优先适配。
- 深层安排管理中的所有细碎控件不要求一次性迁完，但不能出现日间模式下明显不可读的核心文本。

### 8.5 应用中心和子应用首页

`frontend/src/pages/AppCenter.tsx`

- 应用卡片在日间下变为浅色工作台风格。

`frontend/src/pages/Vocab/Home.tsx`

- 首页主卡、总览、快捷入口优先适配。

`frontend/src/pages/ERC/Home.tsx`

- 顶部介绍、主要行动按钮、统计卡片和设置入口优先适配。

深层 Vocab/ERC 学习、练习、复习页面本轮不主动重塑，除非实现过程中发现入口路径已经明显不可读。

## 9. 错误处理与边界

- `localStorage` 不可用时，主题仍能以默认 `system -> dark` 渲染，不阻塞页面。
- `matchMedia` 不可用时，`system` 兜底到夜间。
- 未知主题偏好值回退到 `system` 并覆盖本地无效值。
- 系统主题变化只影响 `system` 偏好。
- 导航栏快速切换会退出 `system`，写入明确的 `light` 或 `dark`。
- 设置弹窗取消时，需要回滚主题偏好；其他个性化快照逻辑保持现状。

## 10. 测试策略

### 10.1 主题 hook

覆盖：

- 无本地偏好时默认 `system`。
- 读取合法本地偏好。
- 未知本地偏好回退 `system`。
- `system` 模式响应系统主题变化。
- 手动 `light` / `dark` 不受系统主题变化影响。
- DOM 上写入 `data-theme` 和 class。

### 10.2 导航栏

更新 `frontend/src/components/__tests__/Navigation.test.tsx`：

- 渲染主题快速切换按钮。
- 点击按钮在日间/夜间之间切换。
- 当前为 `system` 时，点击后写入明确主题。
- 专注导航锁定时，主题按钮禁用规则与设置按钮一致。

### 10.3 设置弹窗

为 `SettingsModal` 增加或扩展测试：

- `外观模式` 三态控件存在。
- 切换三态会更新主题偏好并即时预览。
- 点击取消会回滚。
- 点击保存保留当前选择。
- `跟随系统` 显示当前解析结果。

### 10.4 视觉验收

实现后用浏览器验证：

- 首页夜间模式保持当前基调。
- 首页日间模式下主事件、右侧面板、工作流入口、安排入口可读。
- 设置弹窗日间/夜间均可读，上传区域、滑块、按钮状态清楚。
- 应用中心、Vocab 首页、ERC 首页在日间下接近浅色工作台，不显得像半成品深色界面。

## 11. 实施顺序建议

1. 重构 `useTheme`，建立 `themePreference` / `resolvedTheme` 和 DOM 写入。
2. 在 `index.css` 定义主题令牌。
3. 将主题入口接入 `RequireAuth`，确保全局初始化。
4. 在 `Navigation` 增加快速切换按钮。
5. 在 `SettingsModal` 增加三态选择与取消回滚。
6. 迁移全局壳层、导航栏、设置弹窗的核心样式到令牌。
7. 迁移首页核心表面和主要弹窗。
8. 迁移应用中心、Vocab 首页、ERC 首页。
9. 补充测试并进行浏览器视觉验收。

## 12. 验收标准

- 用户可以在导航栏快速切换日间/夜间。
- 用户可以在设置弹窗选择 `跟随系统 / 日间 / 夜间`。
- 主题偏好只保存在当前浏览器。
- `跟随系统` 能响应系统主题变化。
- 手动日间/夜间不会被系统主题变化覆盖。
- 设置弹窗取消会回滚主题偏好，保存会保留选择。
- 首页、设置弹窗、应用中心、Vocab 首页、ERC 首页在日间和夜间都保持核心文字可读。
- 不改后端、不引入账号同步、不影响背景/看板娘个性化设置。
