# 开发日志：codex/home-onboarding-preview-anchor

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-28 15:51 · e4625d9 · fix(frontend): remove redundant '安排' label from event details header

- 用户提出的需求：
  - 你看看左上角是不是有个文案叫 安排？这个文案不好，去掉这个文案吧

- 本次完成的工作：
  - 移除了主事件详情页/工作台弹窗（`EventWorkbenchModal.tsx`）左上角冗余的 “安排” 英文大小写文本，优化弹窗标题排版。
  - 将事件名称标题的 `mt-1` (margin-top) 移除，保证在无副标题状态下事件标题的垂直居中视觉表现更佳。

- 验证情况：
  - 运行 `pnpm test`，所有 205 个前端测试用例全部以 100% 绿灯通过（包括涉及事件工作台的各项功能和 Onboarding 流程）。
  - 使用内置浏览器智能体成功重新登录并截图验证，确认 “安排” 字样已彻底消失，头部标题更显 premium。

### 2026-05-28 15:43 · be712b4 · feat: allow editing/deleting event-attached workflows and setting them as global default

- 用户提出的需求：
  - 创建事件后，会附带生成工作流，但是这个附带生成的工作流不能在工作流预设中进行编辑。我希望 可以进行编辑，并且编辑结果也会同步到事件的工作预览中
  - 为什么隐藏 设为默认 按钮呢？

- 本次完成的工作：
  - 实现了事件附带生成工作流的全面编辑与删除功能：
    - 前端在 `PlaceholderCard.tsx` 的首页工作流设置面板入口移除 event-attached presets 的 read-only 限制（传入 `readOnlyPresetIds={[]}`），使它们可以直接点击载入表单进行编辑与删除。
    - 前端在 `PlaceholderCard.tsx` 中优化 `_submitWorkflowPreset` 和 `_deleteWorkflowPreset`，如果当前编辑的预设带有 `event_id`，自动将 API 请求分发至事件专属的子路由 `/todo/events/{event_id}/workflows/{id}`。
    - 前端在 `WorkflowPresetModal.tsx` 中为带 `event_id` 的预设增加“事件”标识徽章，保留其“设为默认”和“删除”按钮，确保用户能够一键将事件工作流置为全局默认或彻底移除。
    - 后端在 `db.py` 中移除针对 `event_id IS NULL` 的 unique 索引限制，升级全局唯一默认工作流索引，使得所有工作流预设（不论是全局还是事件相关）均在全局范围内遵循至多有一个 `is_default = TRUE` 的业务逻辑。
    - 后端在 `helpers.py` 和 `routes.py` 中去掉 `AND event_id IS NULL` 限制，确保在新建、更新、删除或设置默认时，都会全局统一将其他预设的 `is_default` 置为 `FALSE`，保持数据库约束一致性。
  - 重构了前端测试：
    - 将 `PlaceholderCard.workflow.test.tsx` 中的只读测试用例重构为 `shows current-event workflows in the home workflow preset panel and allows editing, setting default, and deleting them`，全面测试事件工作流载入、表单编辑保存、全局默认设置、删除联动等交互及 API 路由匹配情况。

- 验证情况：
  - 执行 `npx vitest run` 所有 205/205 个前端测试用例全部通过。
  - 执行 `uv run pytest` 所有 169/169 个后端测试用例全部通过。

### 2026-05-28 15:20 · 1479a01 · fix(frontend): block click events outside highlighted target during onboarding

- 用户提出的需求：
  - 看看教练标注部分，用户可以点击区域之外的部分，这会导致破坏引导

- 本次完成的工作：
  - 在 `HomeOnboarding` 中，将全屏遮罩 `bg-black/30` 替换为以当前 highlighted element 区域为中心掏空的 4-piece 阻断型遮罩
  - 4 个遮罩分片均设置 `pointer-events-auto`，以拦截用户在高亮目标区域之外的任何点击，防止用户通过乱点破坏引导流程；同时由于主容器为 `pointer-events-none`，高亮空心区域没有任何元素遮挡，其下方的目标元素依然能够被正常点击推进
  - 保持弹窗/对话框本身的类名与既有测试行为完美兼容

- 验证情况：
  - 运行 `pnpm test`，所有 205 个测试全部通过（包括 `does not let the guide bubble intercept clicks meant for the highlighted target` 等 onboard 相关测试）

### 2026-05-25 23:34 · 752f4bb · feat(frontend): add first guide greeting states

- 用户提出的需求：
  - “我希望有个打招呼的环节，不然直接开始教程就太生硬了，结尾最好也有个打招呼的环节，你觉得呢？”
  - “可以，整体称为 首次引导 吧，首次引导 的钩子应该是什么呢？”
  - “OK，就这样吧”

- 本次完成的工作：
  - 将首页引导语义收敛为“首次引导”，新增 `FIRST_GUIDE_*` 常量、事件和重启方法，并保留旧 onboarding 命名作为兼容别名
  - 为首次引导增加开场问候状态，用户点击“开始体验”后再进入原 15 步教练标注
  - 为首次引导增加结尾完成状态，用户点击“知道了”后才写入完成记录 `ark-first-guide-v1`
  - 调整导航栏书本入口使用新的 `restartFirstGuide` 钩子
  - 补充 `HomeOnboarding` 测试，覆盖开场、完整步骤推进、结尾完成和本地完成记录

- 验证情况：
  - 执行 `pnpm check` 进行前端类型检查，通过
  - 执行 `pnpm test -- --run src/components/__tests__/HomeOnboarding.test.tsx src/components/__tests__/Navigation.test.tsx src/components/__tests__/EventCountdownCard.test.tsx src/components/__tests__/PlaceholderCard.workflow.test.tsx src/components/__tests__/FocusWorkProvider.test.tsx`，5 个测试文件、58 个测试通过
  - 使用内置浏览器确认首页先显示“首次引导 / 欢迎来到 Ark”，点击“开始体验”后进入第 1 / 15 步

### 2026-05-25 15:27 · dfc11b7 · fix(frontend): align onboarding with template preview

- 用户提出的需求：
  - “不妙，事件商店的模板可以点击预览了，这会影响到教练标注的某个阶段”
  - “别着急提交代码，你再测试一遍”

- 本次完成的工作：
  - 让事件商店模板卡片点击进入模板内容预览，并将引导第 4 步文案调整为“查看考研英语模板”
  - 让第 5 步保存锚点优先落在模板内容预览弹窗内，避免底层事件商店保存按钮抢占教练标注
  - 处理同名模板冲突路径，让“更新模板”继续承接保存步骤的引导锚点
  - 提高同名模板冲突弹窗层级，避免被模板预览弹窗覆盖导致真实点击无法推进
  - 补充事件商店预览、保存锚点和同名模板冲突路径测试

- 验证情况：
  - 执行 `pnpm check` 进行前端类型检查，通过
  - 执行 `pnpm test -- --run src/components/__tests__/EventCountdownCard.test.tsx src/components/__tests__/HomeOnboarding.test.tsx`，2 个测试文件、27 个测试通过
  - 使用内置浏览器从第 1 步复测到第 5 步，确认预览弹窗保存锚点唯一；遇到同名模板后点击“更新模板”可推进到第 6 步

### 2026-05-25 23:29 · f332b5a · fix(frontend): remove trae solo badge

- 用户提出的需求：
  - “前端有个 跳转到 trae SOLO 的链接 的button，你找找”
  - “删掉它”
  - “提交本次工作的代码吧”

- 本次完成的工作：
  - 移除 `vite-plugin-trae-solo-badge` 的 Vite 插件导入和插件配置
  - 从 `frontend/package.json` 删除 `vite-plugin-trae-solo-badge` 依赖
  - 同步清理 `frontend/pnpm-lock.yaml` 中对应 importer、package 和 snapshot 条目

- 验证情况：
  - 执行 `pnpm build`，构建通过；仅出现当前 Node 版本与既有 chunk size 提示
  - 执行 `rg -i "trae|solo" frontend`，确认前端目录无残留匹配
