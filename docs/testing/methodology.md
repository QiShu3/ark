# 浏览器自动化测试方法论

## 概述

浏览器自动化测试是现代 Web 应用质量保证的核心环节。通过模拟真实用户在浏览器中的操作，自动化测试能够：

- **提高测试效率**：快速执行重复性测试用例，节省人力成本
- **保证测试一致性**：消除人工测试的主观差异，确保每次测试条件相同
- **支持持续集成**：与 CI/CD 流水线集成，实现代码提交后的自动验证
- **覆盖复杂场景**：模拟多步骤用户流程、跨页面交互等复杂场景
- **早期发现问题**：在开发阶段及时发现 UI 和功能缺陷

## 工具选择

### 推荐：Playwright MCP

**Playwright MCP** 是首选工具，具有以下优势：

- **集成度高**：直接在 OpenCode 中配置，无需额外安装
- **操作简便**：提供直观的 API，易于学习和使用
- **功能全面**：支持页面导航、元素交互、截图、网络请求监控等
- **实时反馈**：可即时查看测试执行结果和页面状态

### 备用：Playwright CLI

当 Playwright MCP 不可用或需要更精细控制时，可使用 **Playwright CLI**：

- **更可靠**：命令行方式执行，不受 IDE 集成限制
- **灵活性强**：支持更多高级配置和调试选项
- **独立运行**：可在无 IDE 环境下执行测试

## Playwright MCP 配置

### OpenCode 配置方式

Playwright MCP 已在 OpenCode 中预配置，配置文件位于：

```
~/.config/opencode/opencode.jsonc
```

配置示例：

```jsonc
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

### 可用工具列表

| 工具名称 | 功能描述 | 典型用途 |
|---------|---------|---------|
| `browser_navigate` | 导航到指定 URL | 打开测试页面 |
| `browser_snapshot` | 获取页面可访问性快照 | 验证页面结构和元素状态 |
| `browser_click` | 点击页面元素 | 模拟用户点击操作 |
| `browser_type` | 在输入框中输入文本 | 填写表单、搜索框等 |
| `browser_fill` | 填充表单字段 | 批量填写表单数据 |
| `browser_screenshot` | 截取页面截图 | 记录测试状态、生成报告 |

### 工具使用示例

```typescript
// 导航到测试页面
await browser_navigate({ url: "http://localhost:5173" });

// 获取页面快照，查看当前状态
const snapshot = await browser_snapshot();

// 点击登录按钮
await browser_click({ selector: "button:has-text('登录')" });

// 输入用户名
await browser_type({ selector: "input[name='username']", text: "testuser" });

// 输入密码
await browser_type({ selector: "input[name='password']", text: "password123" });

// 截图记录
await browser_screenshot({ name: "login-page.png" });
```

## Playwright CLI 备用

### 安装方式

```bash
# 使用 npm 安装
npm install -g @playwright/cli

# 或使用 pnpm
pnpm add -g @playwright/cli

# 安装浏览器
npx playwright install
```

### 基本命令

```bash
# 运行测试
npx playwright test

# 运行特定测试文件
npx playwright test tests/login.spec.ts

# 以 headed 模式运行（可见浏览器）
npx playwright test --headed

# 调试模式
npx playwright test --debug

# 生成测试报告
npx playwright show-report
```

### Playwright Skill 使用

OpenCode 中已集成 Playwright Skill，位于：

```
~/.agents/skills/playwright/
```

可通过 Skill 工具调用：

```typescript
// 使用 Playwright Skill 执行测试
await skill({ name: "playwright" });
```

## 测试流程

### 阶段一：准备阶段

1. **环境检查**
   - 确认测试环境（开发/预发布/生产）可访问
   - 验证测试账号和数据已准备就绪
   - 检查浏览器和驱动版本兼容性

2. **测试用例设计**
   - 明确测试目标和预期结果
   - 设计测试数据和前置条件
   - 规划测试步骤和验证点

3. **工具配置**
   - 确认 Playwright MCP 或 CLI 可用
   - 配置超时时间、重试策略等参数
   - 准备截图和日志存储路径

### 阶段二：执行阶段

1. **初始化测试**
   ```typescript
   // 导航到应用首页
   await browser_navigate({ url: "http://localhost:5173" });
   ```

2. **执行测试步骤**
   - 按照用例描述逐步执行操作
   - 每个关键步骤后添加验证点
   - 记录中间状态和截图

3. **异常处理**
   - 捕获并记录错误信息
   - 执行清理操作（如退出登录）
   - 保存现场截图用于问题排查

### 阶段三：验证阶段

1. **结果验证**
   - 检查页面元素状态是否符合预期
   - 验证数据变更是否正确保存
   - 确认业务流程是否完整执行

2. **截图对比**
   - 对比关键页面的截图
   - 检查 UI 布局和样式是否正确
   - 验证响应式设计在不同视口下的表现

3. **性能检查**
   - 监控页面加载时间
   - 检查网络请求是否合理
   - 验证动画和交互是否流畅

### 阶段四：报告阶段

1. **生成测试报告**
   - 汇总测试执行结果
   - 记录通过/失败的用例数量
   - 附上关键截图和日志

2. **问题分析**
   - 分析失败用例的根本原因
   - 分类问题类型（UI/功能/性能/兼容性）
   - 提供复现步骤和修复建议

3. **改进建议**
   - 总结测试过程中的经验教训
   - 优化测试用例和执行流程
   - 更新测试文档和规范

## 最佳实践

### 截图策略

1. **关键节点截图**
   - 登录成功后截图
   - 表单提交后截图
   - 错误发生时截图
   - 测试完成时截图

2. **截图命名规范**
   ```
   {测试场景}_{操作步骤}_{时间戳}.png
   示例: login_success_20240101_120000.png
   ```

3. **截图存储位置**
   - 本地测试：`./test-results/screenshots/`
   - CI/CD：上传到测试报告服务器

### 错误处理

1. **超时处理**
   ```typescript
   // 设置合理的超时时间
   await browser_click({ 
     selector: "button.submit",
     timeout: 10000 // 10秒超时
   });
   ```

2. **元素等待**
   ```typescript
   // 等待元素出现后再操作
   await browser_snapshot(); // 检查元素是否存在
   ```

3. **重试机制**
   - 对于不稳定的网络请求，配置自动重试
   - 记录重试次数和最终结果
   - 避免无限重试导致测试挂起

### 测试数据管理

1. **数据隔离**
   - 使用独立的测试数据库
   - 测试前清理历史数据
   - 测试后恢复初始状态

2. **数据准备**
   - 使用 fixtures 或 factories 生成测试数据
   - 避免硬编码测试数据
   - 支持参数化测试

3. **数据清理**
   - 测试完成后自动清理临时数据
   - 避免测试数据污染其他测试
   - 记录数据变更日志

### 代码组织

1. **页面对象模式 (Page Object Model)**
   ```typescript
   // pages/login.page.ts
   export class LoginPage {
     async navigate() {
       await browser_navigate({ url: "/login" });
     }
     
     async login(username: string, password: string) {
       await browser_type({ selector: "#username", text: username });
       await browser_type({ selector: "#password", text: password });
       await browser_click({ selector: "button[type='submit']" });
     }
   }
   ```

2. **测试工具函数**
   ```typescript
   // utils/test-helpers.ts
   export async function waitForPageLoad() {
     await browser_snapshot(); // 确保页面加载完成
   }
   
   export async function takeScreenshot(name: string) {
     await browser_screenshot({ name: `${name}.png` });
   }
   ```

3. **配置管理**
   ```typescript
   // playwright.config.ts
   export default {
     timeout: 30000,
     retries: 2,
     use: {
       baseURL: "http://localhost:5173",
       screenshot: "only-on-failure",
     },
   };
   ```

## 注意事项

1. **环境一致性**：确保测试环境与生产环境配置一致
2. **浏览器兼容性**：在主流浏览器（Chrome、Firefox、Safari）上验证
3. **网络条件**：模拟不同网络速度下的用户体验
4. **移动端适配**：测试响应式设计在移动设备上的表现
5. **无障碍访问**：验证页面的可访问性（a11y）合规性

## 参考资料

- [Playwright 官方文档](https://playwright.dev/)
- [Playwright MCP 安装指南](https://playwright.dev/mcp/installation)
- [OpenCode 配置文档](https://opencode.ai/docs)
- [测试最佳实践](https://playwright.dev/docs/best-practices)