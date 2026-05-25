# 开发日志：codex/home-onboarding-preview-anchor

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

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
