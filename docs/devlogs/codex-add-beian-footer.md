# 开发日志：codex/add-beian-footer

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-04-26 11:51 · 0c5dc68 · feat(frontend): add ICP beian footer

- 用户提出的需求：
  - “OK，另起分支开发吧，不要在当前分支进行开发”
  - “你觉得呢 ？需求是怎么样的？”
  - “OK，开杠吧”

- 本次完成的工作：
  - 新增共享的备案页脚组件，在页面底部展示 `粤ICP备2026047635号`
  - 登录页与登录后鉴权布局统一接入备案页脚，覆盖站点主要访问路径
  - 备案号链接到工信部备案平台，当前仅展示已审核通过的 ICP 备案信息，不提前展示公安备案号
  - 补充前端回归测试，覆盖登录页和登录后首页都能看到备案链接

- 验证情况：
  - `pnpm test -- src/components/__tests__/HomeLayout.test.tsx src/pages/__tests__/Login.test.tsx`
  - `pnpm build`
