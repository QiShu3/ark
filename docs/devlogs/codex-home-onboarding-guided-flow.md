# 开发日志：codex/home-onboarding-guided-flow

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-05-25 10:23 · 1c99658 · feat(frontend): add home onboarding guided flow for events

- 用户提出的需求：
  - “好，提交代码并合并到main分支上”

- 本次完成的工作：
  - 新增 `HomeOnboarding` 引导组件，支持用户在首次进入系统或未创建事件时进行交互式 onboarding 流程
  - 新增 `onboardingEvents` 模块，提供默认的考研英语等 onboarding 模版和流程逻辑
  - 升级 `Navigation` 导航栏，集成 onboarding 状态机，控制引导模式下的页面跳转与高亮锁定
  - 升级 `PlaceholderCard` 及工作流预设相关组件，支持在 onboarding 流程中自动引导至事件与任务关联
  - 升级 `EventCountdownCard` 倒计时卡片，在 onboarding 场景下进行特定提示和默认占位渲染
  - 补充全面的单元测试与集成测试，覆盖 onboarding 各阶段的前端交互及回归验证

- 验证情况：
  - 执行 `pnpm check` 进行前端类型检查，无任何报错
  - 执行 `pnpm test` 运行 Vitest 测试套件，46 个测试文件、202 个测试用例全部通过
