# 开发日志：feature/settings-modal

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-28 16:54 · 47a1d92 · style(frontend): enlarge SettingsModal and sidebar layout dimensions

- 用户提出的需求：
  - “面板太小了”

- 本次完成的工作：
  - 微调界面设置弹窗的尺寸布局，将弹窗整体宽度由 `720px` 拓宽至符合参考图精确比例的 `900px`，高度增加至 `620px`。
  - 将左侧 Tab 导航侧边栏的宽度从 `200px` 拓宽至 `260px`，右侧设置内容区域拓宽至 `640px`，使界面布局更舒展，极大优化了中文设置标签的排版和右侧滑块与预设的视觉体验。

- 验证情况：
  - 运行 `pnpm check` 验证通过。

### 2026-05-28 16:50 · 9db0bba · feat(frontend): add tabbed settings modal for custom background and character

- 用户提出的需求：
  - “/grid 我想增加一个 设置 按钮，用来调节整体，比如说于更换背景图片和前景人物。你有什么想法吗？”
  - “只讨论 ui/ux 和 功能等业务层面上的东西，不讨论代码先”
  - “ui可以，但是布局我希望可以这样：左侧是Tab，右侧是显示内容”
  - “可以，另起分支来进行开发吧”

- 本次完成的工作：
  - 新建 Zustand 状态管理器 `frontend/src/lib/customization.ts`，持久化存储并管理背景与前景的个性化属性（图片链接、背景模糊度、不透明度、人物显隐和缩放大小）。
  - 重构全局鉴权包装组件 `frontend/src/routes/RequireAuth.tsx`，将背景图源、高斯模糊和透明度与 Zustand 状态关联，实现全站背景实时重塑。
  - 重构前景人物组件 `frontend/src/components/CharacterDisplay.tsx`，响应看板娘的开关状态和缩放比例。
  - 编写经典的左侧 Tab 导航、右侧表单内容的 `frontend/src/components/SettingsModal.tsx` 弹窗组件，利用磨砂玻璃材质，包含多套预设、自定义 URL 和高精滑块微调，且支持点击取消时瞬间回滚预览快照。
  - 在全局导航栏 `frontend/src/components/Navigation.tsx` 右上角用户头像旁优雅嵌入齿轮状“设置”按钮，实现全局拉起。

- 验证情况：
  - 运行 `pnpm check` 验证 TypeScript 编译通过。
  - 运行 `npx vitest run` 验证全部 46 个文件、203 项单元测试 100% 成功通过。
  - 运行 `pnpm lint` 确保我们新建及修改的模块没有任何代码规范及风格检查警告。
