# 开发日志：feature/settings-modal

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-28 17:32 · cfa8a50 · feat: add image upload, profile sync, and settings profile tab

- 用户提出的需求：
  - "推进"（继续实现图片上传与多端同步功能）

- 本次完成的工作：
  - **后端**：在 `auth_users` 表中新增 7 个个性化列（`avatar_url`、`custom_background_url`、`custom_character_url`、`background_blur`、`background_opacity`、`show_character`、`character_scale`），使用 `ALTER TABLE ADD COLUMN IF NOT EXISTS` 实现平滑迁移。
  - **后端**：新增 `POST /auth/upload` 图片上传接口，SHA256 内容寻址去重，限制 5MB 和图片格式。
  - **后端**：新增 `PATCH /auth/profile` 增量更新接口，动态 SQL 仅更新非空字段。
  - **后端**：升级 `UserPublic`、`_AuthUser` 模型以及所有用户端点，完整返回个性化属性。
  - **前端**：在 `api.ts` 中新增 `uploadFile` 和 `updateProfile` API 函数。
  - **前端**：`customization.ts` 新增 `avatarUrl` 字段和 `loadFromServer` 动作，支持登录后云端配置同步。
  - **前端**：`Navigation.tsx` 支持渲染云端自定义头像，`/auth/me` 返回后自动同步个性化设置到 Store。
  - **前端**：`SettingsModal.tsx` 新增「个人资料 (Profile)」Tab（含头像上传圆形区域、用户名、注册时间显示），个性化 Tab 新增背景和看板娘的本地图片上传热区，保存按钮调用 `updateProfile` 持久化到服务器。

- 验证情况：
  - `uv run ruff check routes/auth_routes.py` — All checks passed ✅
  - `pnpm check` — 无新增 TS 错误（仅有预存无关报错）✅
  - `npx vitest run` — 46 文件 203 测试全部通过 ✅

### 2026-05-28 17:08 · 9aaa888 · feat(frontend): merge avatar settings inside unified personalization tab

- 用户提出的需求：
  - “看板娘应该也纳入个性化功能内”

- 本次完成的工作：
  - 重塑设置弹窗业务逻辑，将原本独立的“看板娘”标签页，作为子板块优雅合并入统一的“个性化 (Personalization)”大面板中。
  - 在右侧个性化内容区，通过一条精致的半透明分割线将“背景自定义”与“前景看板娘”两个子部分串联起来，保持逻辑聚合、交互统一。

- 验证情况：
  - 运行 `pnpm check` 验证通过。

### 2026-05-28 16:55 · 64ca5c5 · style(frontend): further enlarge SettingsModal layout to ultra-wide desktop dimensions

- 用户提出的需求：
  - “还是太小了”

- 本次完成的工作：
  - 进一步升级弹窗尺寸至桌面级超宽规格：整体宽度拓宽为 **`1160px`**，高度增加为 **`760px`**（支持高达 `88vh` 和 `96vw` 的响应式视图）。
  - 将左侧 Tab 导航侧边栏拓宽为 **`280px`**，从而为右侧配置面板流出多达 **`880px`** 的巨大空间，确保任何比例的预设卡片和滑块操作都能拥有极佳的开阔视界。

- 验证情况：
  - 运行 `pnpm check` 验证通过。

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
