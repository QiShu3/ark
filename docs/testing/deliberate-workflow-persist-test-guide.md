# 刻意工作流编排持久化 — 浏览器自动化测试方案

## 1. 测试环境

| 项目 | 地址/配置 |
|------|-----------|
| 前端地址 | http://localhost:5173 |
| 后端地址 | http://localhost:8000 |
| 测试账号 | 用户名：`qishuadmin`，密码：`12345678` |
| 页面路径 | `/deliberate-workflow`（需从应用中心进入或直接访问） |

## 2. 前置条件

| 序号 | 条件 | 验证方式 |
|------|------|----------|
| 1 | 前端 dev server 运行中（`pnpm dev`） | 访问 `http://localhost:5173` 返回页面 |
| 2 | 后端 API server 运行中（`uvicorn main:app --reload`） | 访问 `http://localhost:8000/docs` 返回 Swagger |
| 3 | 数据库连接正常 | 后端日志无报错 |
| 4 | 测试账号 `qishuadmin` 已存在且具有管理员权限 | 登录后可访问 `/deliberate-workflow` |
| 5 | 至少存在 **2 个以上**的专注工作配置（含不同题型） | 页面「专注工作管理」区域显示配置列表 |
| 6 | 至少存在 **1 个题库**（选择题或闪卡） | 页面「题库管理」区域显示题库 |
| 7 | 无残留编排数据（首次测试或已清理） | 「工作流编排」区域显示「暂无已保存的编排，请先保存」 |

---

## 3. 测试场景

### 场景 1：登录并进入刻意工作流页面

**优先级：** P0  
**前置条件：** 前后端服务已启动

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_snapshot: 确认登录页面加载完成
3. browser_fill: 在用户名输入框填写 qishuadmin
4. browser_fill: 在密码输入框填写 12345678
5. browser_click: 点击「登录」按钮
6. browser_snapshot: 确认登录成功，进入首页
7. browser_click: 点击应用中心「刻意工作流」入口
8. browser_snapshot: 确认进入 /deliberate-workflow 页面
```

**预期结果：**
- 登录后跳转至首页，显示应用中心入口
- 点击「刻意工作流」后进入 `/deliberate-workflow` 页面
- 页面显示四大区域：题库管理、专注工作管理、工作流编排、运行档案

**验证点：**
- [ ] URL 变为 `/deliberate-workflow`
- [ ] 页面标题包含「刻意工作流」或「刻意学习流」
- [ ] 「题库管理」区域可见
- [ ] 「专注工作管理」区域可见
- [ ] 「工作流编排」区域可见

---

### 场景 2：查看工作流编排区域

**优先级：** P0  
**前置条件：** 已进入刻意工作流页面，已有至少 2 个专注工作配置

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173/deliberate-workflow
2. browser_snapshot: 确认页面加载完成
3. browser_scroll: 滚动到「工作流编排」区域
4. browser_snapshot: 查看编排区域内容
```

**预期结果：**
- 编排区域标题显示「工作流编排」，带 Settings2 图标
- 右上角显示「启动组合工作流 (0)」按钮，初始状态为 disabled（灰色）
- 「已保存的编排」子区域显示「暂无已保存的编排，请先保存」占位文本
- 下方「选择专注工作（按顺序执行）」子区域列出所有可用配置
- 每个配置卡片显示：序号、配置名称、题型标签、绑定题库名称、目标题数
- 配置卡片右侧有复选框（圆形），初始为未选中状态

**验证点：**
- [ ] 「工作流编排」标题和图标正确显示
- [ ] 「启动组合工作流 (0)」按钮为 disabled 状态
- [ ] 已保存编排为空时显示占位提示
- [ ] 配置列表正确显示所有专注工作配置
- [ ] 每个配置卡片显示名称、题型、题库、目标数量

---

### 场景 3：选择配置并启动组合工作流

**优先级：** P0  
**前置条件：** 已进入编排区域，至少有 2 个配置可选

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173/deliberate-workflow
2. browser_scroll: 滚动到「工作流编排」区域
3. browser_snapshot: 确认配置列表显示
4. browser_click: 点击第一个配置卡片选中
5. browser_snapshot: 确认第一个配置被选中（高亮 + 勾选标记 + 序号显示为 1）
6. browser_click: 点击第二个配置卡片选中
7. browser_snapshot: 确认第二个配置被选中（高亮 + 勾选标记 + 序号显示为 2）
8. browser_snapshot: 确认「启动组合工作流」按钮变为 enabled，计数更新为 (2)
9. browser_click: 点击「启动组合工作流 (2)」按钮
10. browser_snapshot: 确认按钮显示「启动中」加载状态
11. browser_snapshot: 确认页面跳转到首页 /
```

**预期结果：**
- 选中配置时卡片边框变为高亮色（border-ark-accent），背景变为 ark-surface
- 已选中序号框显示 1、2 等排序编号
- 「启动组合工作流」按钮计数随选中数量变化
- 未选中任何配置时按钮为 disabled
- 点击启动后触发 `POST /todo/focus/workflow/start-multi-deliberate`
- 成功后触发 `ark:reload-focus` 事件，页面跳转至 `/`

**验证点：**
- [ ] 选中配置卡片高亮 + 勾选标记出现
- [ ] 已选序号按点击顺序编号
- [ ] 按钮计数准确反映选中数量
- [ ] 启动后页面 URL 变为 `/`
- [ ] 首页显示专注模式界面

---

### 场景 4：完成练习并返回

**优先级：** P1  
**前置条件：** 已启动组合工作流，当前在首页专注模式中

**操作步骤：**

```
1. browser_snapshot: 确认当前处于专注模式
2. browser_click: 完成当前练习题目（选择答案 / 翻转闪卡 / 提交输入）
3. browser_snapshot: 确认练习完成
4. browser_navigate: 返回 http://localhost:5173/deliberate-workflow
5. browser_snapshot: 确认页面加载完成
6. browser_scroll: 滚动到「运行档案」区域
7. browser_snapshot: 确认运行档案中显示新的组合工作流记录
```

**预期结果：**
- 练习完成后返回编排页面
- 「运行档案」区域显示 workflow_records 类型的记录
- 记录显示多节点结构（每个配置对应一个节点）

**验证点：**
- [ ] 返回编排页面无报错
- [ ] 运行档案列表中出现新的组合工作流记录
- [ ] 记录包含多个节点，对应所选配置

---

### 场景 5：保存编排

**优先级：** P0  
**前置条件：** 已进入编排区域，已选中至少 1 个配置

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173/deliberate-workflow
2. browser_scroll: 滚动到「工作流编排」区域
3. browser_click: 选中第一个配置
4. browser_click: 选中第三个配置
5. browser_snapshot: 确认选中 2 个配置
6. browser_fill: 在「编排名称」输入框填写 408每日综合练习
7. browser_snapshot: 确认「保存当前编排」按钮变为 enabled
8. browser_click: 点击「保存当前编排」按钮
9. browser_snapshot: 确认保存成功
10. browser_snapshot: 确认「已保存的编排」列表中出现新编排卡片
```

**预期结果：**
- 未填写编排名称时「保存当前编排」按钮为 disabled
- 未选中任何配置时「保存当前编排」按钮为 disabled
- 保存后「已保存的编排」列表中出现新卡片
- 卡片显示编排名称、配置数量、配置名称链（如「配置A → 配置B」）
- 卡片包含「启动」「加载」「编辑」「删除」四个操作按钮

**验证点：**
- [ ] 按钮 disabled 条件正确（名称为空 / 未选配置）
- [ ] 保存成功后列表刷新，新编排出现
- [ ] 编排卡片显示名称和配置链
- [ ] 卡片包含启动、加载、编辑、删除按钮
- [ ] 编排名称输入框清空
- [ ] `POST /todo/focus/workflows` 请求成功，phase_type 为 `deliberate_group`

---

### 场景 6：加载编排

**优先级：** P0  
**前置条件：** 已保存至少一个编排

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173/deliberate-workflow
2. browser_scroll: 滚动到「工作流编排」区域
3. browser_snapshot: 确认已保存编排列表中存在编排
4. browser_click: 先取消所有已选中的配置（如有）
5. browser_snapshot: 确认「启动组合工作流」按钮计数为 (0)
6. browser_click: 点击目标编排卡片上的「加载」按钮
7. browser_snapshot: 确认编排被加载
```

**预期结果：**
- 点击「加载」后，编排中保存的配置被自动选中
- 「启动组合工作流」按钮计数更新为编排中的配置数量
- 编排卡片高亮（border-ark-accent + bg-ark-surface）
- 配置列表中对应的配置卡片同步选中并高亮

**验证点：**
- [ ] 点击加载后配置被自动选中
- [ ] 按钮计数与编排中的配置数量一致
- [ ] 编排卡片高亮显示
- [ ] 配置列表中对应卡片同步选中

---

### 场景 7：编辑编排

**优先级：** P1  
**前置条件：** 已保存至少一个编排

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173/deliberate-workflow
2. browser_scroll: 滚动到「工作流编排」区域
3. browser_click: 点击目标编排卡片上的「编辑」按钮
4. browser_snapshot: 确认编排名称变为可编辑输入框
5. browser_fill: 清空原名称，填写 408每日综合练习（修改后）
6. browser_click: 点击「保存」按钮
7. browser_snapshot: 确认编辑保存成功
8. browser_snapshot: 确认编排名称已更新
```

**预期结果：**
- 点击「编辑」后，编排名称区域变为输入框，显示原名称
- 显示「保存」和「取消」按钮
- 点击「保存」后输入框消失，显示更新后的名称
- 点击「取消」后输入框消失，恢复原名称
- 「启动」「删除」按钮在编辑模式下隐藏

**验证点：**
- [ ] 编辑模式下名称变为输入框
- [ ] 显示保存和取消按钮
- [ ] 启动/删除按钮在编辑模式下隐藏
- [ ] 保存后名称更新成功
- [ ] 取消后恢复原名称
- [ ] `PATCH /todo/focus/workflows/{preset_id}` 请求成功

---

### 场景 8：删除编排

**优先级：** P0  
**前置条件：** 已保存至少一个编排

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173/deliberate-workflow
2. browser_scroll: 滚动到「工作流编排」区域
3. browser_snapshot: 记录当前编排数量
4. browser_click: 点击目标编排卡片上的「删除」按钮
5. browser_handle_dialog: 确认删除弹窗，点击「确定」
6. browser_snapshot: 确认编排从列表中移除
7. browser_snapshot: 确认编排数量减少 1
```

**预期结果：**
- 点击删除后弹出 `window.confirm` 确认对话框
- 确认后编排从列表中移除
- 如果删除的是当前选中的编排，选中状态清除
- `DELETE /todo/focus/workflows/{preset_id}` 请求成功
- 列表自动刷新

**验证点：**
- [ ] 删除前弹出确认对话框
- [ ] 确认后编排从列表消失
- [ ] 如果列表为空，显示「暂无已保存的编排，请先保存」
- [ ] `DELETE` 请求返回 200
- [ ] 编排数量正确更新

---

### 场景 9：从编排卡片启动工作流

**优先级：** P0  
**前置条件：** 已保存至少一个编排（含 2 个以上配置）

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173/deliberate-workflow
2. browser_scroll: 滚动到「工作流编排」区域
3. browser_snapshot: 确认已保存编排列表
4. browser_click: 点击目标编排卡片上的「启动」按钮
5. browser_snapshot: 确认页面跳转到首页 /
6. browser_snapshot: 确认首页显示专注模式界面（包含编排中的配置）
```

**预期结果：**
- 点击「启动」后，自动加载编排配置（`handleLoadPreset`）
- 立即调用 `startMultiDeliberateWorkflow` 启动工作流
- 成功后触发 `ark:reload-focus` 事件
- 页面自动跳转至首页 `/`
- 首页显示组合工作流的专注界面（含多阶段配置）

**验证点：**
- [ ] 点击启动后页面跳转至 `/`
- [ ] 首页显示专注模式
- [ ] `POST /todo/focus/workflow/start-multi-deliberate` 请求成功
- [ ] 请求 body 中包含编排中的 `config_ids`

---

## 4. 测试数据清理

### 测试前清理

在开始测试前，确保编排区域处于干净状态：

```
1. browser_navigate: 访问 http://localhost:5173/deliberate-workflow
2. browser_scroll: 滚动到「工作流编排」区域
3. browser_snapshot: 检查「已保存的编排」列表
```

如果存在残留编排，逐一删除：

```
4. browser_click: 点击编排卡片的「删除」按钮
5. browser_handle_dialog: 确认删除
6. browser_snapshot: 确认列表更新
7. 重复步骤 4-6 直到列表为空
```

### 测试后清理

每个测试场景执行完毕后，清理该场景产生的编排数据：

| 场景 | 产生的数据 | 清理方式 |
|------|-----------|----------|
| 场景 5（保存编排） | 新建的编排 preset | 点击「删除」按钮 → 确认 |
| 场景 7（编辑编排） | 修改后的编排 preset | 恢复原名称或删除 |
| 场景 8（删除编排） | 无需清理（已删除） | — |

> ⚠️ **注意：** 不要清理其他测试人员或自动化脚本正在使用的编排。建议每个测试场景使用独立的编排名称前缀（如 `TEST-场景5-xxx`）以便识别和清理。

---

## 5. 测试报告模板

### 元信息

- **测试日期：** YYYY-MM-DD
- **测试人员：** [姓名 / OpenCode AI Agent]
- **测试账号：** qishuadmin
- **前端版本：** [git commit hash]
- **后端版本：** [git commit hash]

---

### 测试结果汇总

| 场景 | 名称 | 优先级 | 结果 | 备注 |
|------|------|--------|------|------|
| 1 | 登录并进入刻意工作流页面 | P0 | ✅ / ❌ | |
| 2 | 查看工作流编排区域 | P0 | ✅ / ❌ | |
| 3 | 选择配置并启动组合工作流 | P0 | ✅ / ❌ | |
| 4 | 完成练习并返回 | P1 | ✅ / ❌ | |
| 5 | 保存编排 | P0 | ✅ / ❌ | |
| 6 | 加载编排 | P0 | ✅ / ❌ | |
| 7 | 编辑编排 | P1 | ✅ / ❌ | |
| 8 | 删除编排 | P0 | ✅ / ❌ | |
| 9 | 从编排卡片启动工作流 | P0 | ✅ / ❌ | |

**统计：** __ / 9 通过，__ / 9 失败

---

### 详细结果

#### 场景 [N]：[场景名称]

- **结果：** ✅ 通过 / ❌ 失败
- **执行时间：** [耗时]
- **发现的问题：** [如有]

| 验证点 | 预期 | 实际 | 结果 |
|--------|------|------|------|
| [验证点描述] | [预期值] | [实际值] | ✅ / ❌ |

---

### 测试环境信息

| 项目 | 值 |
|------|-----|
| 操作系统 | macOS |
| 浏览器 | Playwright Chromium |
| 前端地址 | http://localhost:5173 |
| 后端地址 | http://localhost:8000 |

---

### 测试总结

| 指标 | 值 |
|------|-----|
| 总场景数 | 9 |
| P0 场景 | 7 |
| P1 场景 | 2 |
| 通过率 | __% |

**问题列表：**

| # | 场景 | 严重级别 | 描述 | 状态 |
|---|------|----------|------|------|
| 1 | | | | 待修复 |

---

## 6. Playwright 自动化测试脚本参考

### 6.1 基础工具函数

```typescript
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:8000';
const USERNAME = 'qishuadmin';
const PASSWORD = '12345678';

/** 登录并导航到刻意工作流页面 */
async function loginAndNavigateToDeliberate(page: Page) {
  await page.goto(`${BASE_URL}/deliberate-workflow`);

  // 如果被重定向到登录页，先登录
  if (page.url().includes('/login')) {
    await page.fill('input[name="username"], input[placeholder*="用户名"]', USERNAME);
    await page.fill('input[name="password"], input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/');
    await page.goto(`${BASE_URL}/deliberate-workflow`);
  }

  await page.waitForLoadState('networkidle');
}

/** 滚动到编排区域 */
async function scrollToOrchestrationSection(page: Page) {
  const section = page.locator('text=工作流编排').first();
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
}

/** 获取已保存编排数量 */
async function getSavedPresetCount(page: Page): Promise<number> {
  const emptyMsg = page.locator('text=暂无已保存的编排，请先保存');
  if (await emptyMsg.isVisible()) return 0;
  // 编排卡片中的「启动」按钮数量即为编排数量
  return page.locator('text=已保存的编排').locator('..').locator('button:has-text("启动")').count();
}
```

### 6.2 场景 1：登录并进入刻意工作流页面

```typescript
test('场景1：登录并进入刻意工作流页面', async ({ page }) => {
  await loginAndNavigateToDeliberate(page);

  // 验证 URL
  expect(page.url()).toContain('/deliberate-workflow');

  // 验证四大区域
  await expect(page.locator('text=题库管理').first()).toBeVisible();
  await expect(page.locator('text=专注工作管理').first()).toBeVisible();
  await expect(page.locator('text=工作流编排').first()).toBeVisible();
  await expect(page.locator('text=运行档案').first()).toBeVisible();
});
```

### 6.3 场景 2：查看工作流编排区域

```typescript
test('场景2：查看工作流编排区域', async ({ page }) => {
  await loginAndNavigateToDeliberate(page);
  await scrollToOrchestrationSection(page);

  // 验证标题
  await expect(page.locator('h3:has-text("工作流编排")')).toBeVisible();

  // 验证启动按钮初始为 disabled
  const startBtn = page.locator('button:has-text("启动组合工作流")');
  await expect(startBtn).toBeDisabled();
  await expect(startBtn).toContainText('启动组合工作流 (0)');

  // 验证配置列表
  const configList = page.locator('text=选择专注工作（按顺序执行）').locator('..');
  const configCards = configList.locator('[class*="cursor-pointer"]');
  const count = await configCards.count();
  expect(count).toBeGreaterThanOrEqual(2);
});
```

### 6.4 场景 3：选择配置并启动组合工作流

```typescript
test('场景3：选择配置并启动组合工作流', async ({ page }) => {
  await loginAndNavigateToDeliberate(page);
  await scrollToOrchestrationSection(page);

  const startBtn = page.locator('button:has-text("启动组合工作流")');
  const configCards = page.locator('text=选择专注工作（按顺序执行）').locator('..').locator('[class*="cursor-pointer"]');

  // 选中第一个配置
  await configCards.nth(0).click();
  await expect(startBtn).toContainText('启动组合工作流 (1)');
  await expect(startBtn).toBeEnabled();

  // 选中第二个配置
  await configCards.nth(1).click();
  await expect(startBtn).toContainText('启动组合工作流 (2)');

  // 启动
  await startBtn.click();
  await expect(startBtn).toContainText('启动中');

  // 等待跳转
  await page.waitForURL('**/');
  expect(page.url()).toBe(`${BASE_URL}/`);
});
```

### 6.5 场景 5：保存编排

```typescript
test('场景5：保存编排', async ({ page }) => {
  await loginAndNavigateToDeliberate(page);
  await scrollToOrchestrationSection(page);

  const configCards = page.locator('text=选择专注工作（按顺序执行）').locator('..').locator('[class*="cursor-pointer"]');
  const presetNameInput = page.locator('input[placeholder="编排名称"]');
  const saveBtn = page.locator('button:has-text("保存当前编排")');

  // 初始状态验证
  await expect(saveBtn).toBeDisabled();

  // 选中配置
  await configCards.nth(0).click();
  await configCards.nth(1).click();

  // 仍应 disabled（名称为空）
  await expect(saveBtn).toBeDisabled();

  // 填写名称
  const presetName = `TEST-保存测试-${Date.now()}`;
  await presetNameInput.fill(presetName);
  await expect(saveBtn).toBeEnabled();

  // 保存
  await saveBtn.click();
  await page.waitForResponse(resp =>
    resp.url().includes('/todo/focus/workflows') && resp.request().method() === 'POST'
  );

  // 验证新编排出现在列表中
  await expect(page.locator(`text=${presetName}`)).toBeVisible();

  // 清理：删除该编排
  const presetCard = page.locator(`text=${presetName}`).locator('..');
  await presetCard.locator('button:has-text("删除")').click();
  page.on('dialog', dialog => dialog.accept());
  await expect(page.locator(`text=${presetName}`)).not.toBeVisible();
});
```

### 6.6 场景 6：加载编排

```typescript
test('场景6：加载编排', async ({ page }) => {
  await loginAndNavigateToDeliberate(page);
  await scrollToOrchestrationSection(page);

  const configCards = page.locator('text=选择专注工作（按顺序执行）').locator('..').locator('[class*="cursor-pointer"]');
  const presetNameInput = page.locator('input[placeholder="编排名称"]');
  const saveBtn = page.locator('button:has-text("保存当前编排")');
  const startBtn = page.locator('button:has-text("启动组合工作流")');

  // 创建一个测试编排
  await configCards.nth(0).click();
  const presetName = `TEST-加载测试-${Date.now()}`;
  await presetNameInput.fill(presetName);
  await saveBtn.click();
  await page.waitForResponse(resp =>
    resp.url().includes('/todo/focus/workflows') && resp.request().method() === 'POST'
  );
  await expect(page.locator(`text=${presetName}`)).toBeVisible();

  // 取消所有选中
  await configCards.nth(0).click(); // toggle off
  await expect(startBtn).toContainText('(0)');

  // 加载编排
  const presetCard = page.locator(`text=${presetName}`).locator('..');
  await presetCard.locator('button:has-text("加载")').click();

  // 验证配置被自动选中
  await expect(startBtn).toContainText('(1)');

  // 清理
  await presetCard.locator('button:has-text("删除")').click();
  page.on('dialog', dialog => dialog.accept());
});
```

### 6.7 场景 7：编辑编排

```typescript
test('场景7：编辑编排', async ({ page }) => {
  await loginAndNavigateToDeliberate(page);
  await scrollToOrchestrationSection(page);

  // 创建测试编排
  const configCards = page.locator('text=选择专注工作（按顺序执行）').locator('..').locator('[class*="cursor-pointer"]');
  await configCards.nth(0).click();
  const originalName = `TEST-编辑测试-${Date.now()}`;
  await page.locator('input[placeholder="编排名称"]').fill(originalName);
  await page.locator('button:has-text("保存当前编排")').click();
  await page.waitForResponse(resp =>
    resp.url().includes('/todo/focus/workflows') && resp.request().method() === 'POST'
  );

  // 编辑
  const presetCard = page.locator(`text=${originalName}`).locator('..');
  await presetCard.locator('button:has-text("编辑")').click();

  // 验证进入编辑模式
  const editInput = presetCard.locator('input[type="text"], input:not([placeholder])');
  await expect(editInput).toBeVisible();

  const newName = `${originalName}-已修改`;
  await editInput.fill(newName);
  await presetCard.locator('button:has-text("保存")').click();
  await page.waitForResponse(resp =>
    resp.url().includes('/todo/focus/workflows/') && resp.request().method() === 'PATCH'
  );

  // 验证名称更新
  await expect(page.locator(`text=${newName}`)).toBeVisible();

  // 清理
  const updatedCard = page.locator(`text=${newName}`).locator('..');
  await updatedCard.locator('button:has-text("删除")').click();
  page.on('dialog', dialog => dialog.accept());
});
```

### 6.8 场景 8：删除编排

```typescript
test('场景8：删除编排', async ({ page }) => {
  await loginAndNavigateToDeliberate(page);
  await scrollToOrchestrationSection(page);

  // 创建测试编排
  const configCards = page.locator('text=选择专注工作（按顺序执行）').locator('..').locator('[class*="cursor-pointer"]');
  await configCards.nth(0).click();
  const presetName = `TEST-删除测试-${Date.now()}`;
  await page.locator('input[placeholder="编排名称"]').fill(presetName);
  await page.locator('button:has-text("保存当前编排")').click();
  await page.waitForResponse(resp =>
    resp.url().includes('/todo/focus/workflows') && resp.request().method() === 'POST'
  );

  // 记录删除前数量
  const countBefore = await getSavedPresetCount(page);

  // 删除
  page.on('dialog', dialog => dialog.accept());
  const presetCard = page.locator(`text=${presetName}`).locator('..');
  await presetCard.locator('button:has-text("删除")').click();

  // 验证删除
  await expect(page.locator(`text=${presetName}`)).not.toBeVisible();
  const countAfter = await getSavedPresetCount(page);
  expect(countAfter).toBe(countBefore - 1);
});
```

### 6.9 场景 9：从编排卡片启动工作流

```typescript
test('场景9：从编排卡片启动工作流', async ({ page }) => {
  await loginAndNavigateToDeliberate(page);
  await scrollToOrchestrationSection(page);

  // 创建测试编排
  const configCards = page.locator('text=选择专注工作（按顺序执行）').locator('..').locator('[class*="cursor-pointer"]');
  await configCards.nth(0).click();
  if ((await configCards.count()) > 1) {
    await configCards.nth(1).click();
  }
  const presetName = `TEST-启动测试-${Date.now()}`;
  await page.locator('input[placeholder="编排名称"]').fill(presetName);
  await page.locator('button:has-text("保存当前编排")').click();
  await page.waitForResponse(resp =>
    resp.url().includes('/todo/focus/workflows') && resp.request().method() === 'POST'
  );

  // 从编排卡片启动
  const presetCard = page.locator(`text=${presetName}`).locator('..');
  await presetCard.locator('button:has-text("启动")').click();

  // 等待跳转
  await page.waitForURL('**/');
  expect(page.url()).toBe(`${BASE_URL}/`);

  // 清理：返回删除
  await page.goto(`${BASE_URL}/deliberate-workflow`);
  await scrollToOrchestrationSection(page);
  page.on('dialog', dialog => dialog.accept());
  const card = page.locator(`text=${presetName}`).locator('..');
  if (await card.isVisible()) {
    await card.locator('button:has-text("删除")').click();
  }
});
```

---

## 附录：MCP 工具使用说明

### 常用工具

| 工具 | 用途 | 示例 |
|------|------|------|
| `browser_navigate` | 导航到指定 URL | `browser_navigate: http://localhost:5173/deliberate-workflow` |
| `browser_snapshot` | 获取页面快照（推荐） | `browser_snapshot:` 确认页面状态 |
| `browser_click` | 点击元素 | `browser_click: 点击「启动组合工作流」` |
| `browser_type` | 输入文本 | `browser_type: 填写编排名称` |
| `browser_fill` | 填充表单字段 | `browser_fill: 填写编排名称` |
| `browser_screenshot` | 截图（调试用） | `browser_screenshot:` 保存截图 |
| `browser_handle_dialog` | 处理弹窗 | `browser_handle_dialog: 确认删除` |

### 元素定位策略

- **按钮：** 使用按钮文字定位，如「保存当前编排」「启动」「编辑」「删除」「加载」
- **输入框：** 使用 placeholder 定位，如 `input[placeholder="编排名称"]`
- **配置卡片：** 使用 `cursor-pointer` class 和父容器定位
- **编排卡片：** 使用编排名称文本定位，通过 `.locator('..')` 获取父容器

### 快照检查点

每个操作步骤后建议使用 `browser_snapshot` 确认：
1. 编排区域标题和图标正确
2. 「启动组合工作流」按钮状态和计数
3. 已保存编排列表内容
4. 配置选中状态（高亮、勾选标记、序号）
5. 操作结果反馈（保存成功、删除确认等）
