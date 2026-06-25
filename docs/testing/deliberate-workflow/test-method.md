# 刻意工作流功能测试规范

## 功能概述

刻意工作流是管理员专用的题库练习系统，支持选择题、闪卡、输入题三种题型。用户通过 4 步创建流程（选择类型 → 题库资产 → 工作参数 → 运行复盘）配置个性化练习方案，系统自动记录运行档案和存档快照。

**核心能力：**
- 三种题型：选择题（练习/复习模式）、闪卡、输入题
- 题库管理：上传 JSON 题库或选择已有题库
- 参数配置：目标数量、筛选条件、完成模式
- 数据追踪：运行档案、正确率趋势、掌握度统计

## 测试环境

| 项目 | 地址/配置 |
|------|-----------|
| 前端地址 | http://localhost:5173 |
| 后端地址 | http://localhost:8000 |
| 测试账号 | 用户名：`qishuadmin`，密码：`12345678` |
| 页面路径 | `/deliberate-workflow`（需从应用中心进入） |

## 测试场景

### P0 - 核心功能

#### 场景 1：创建选择题工作流

**优先级：** P0  
**前置条件：** 已登录，已进入刻意工作流页面，已有选择题题库

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_snapshot: 确认页面加载完成
3. browser_click: 点击「刻意工作流」入口进入功能页面
4. browser_snapshot: 确认进入刻意工作流页面，显示 4 步创建流程
5. browser_click: 点击「选择题」类型按钮（步骤 1）
6. browser_click: 点击「下一步」进入步骤 2
7. browser_snapshot: 确认进入「题库资产」步骤
8. browser_click: 选择「选择已有题库」模式
9. browser_snapshot: 确认题库下拉列表可用
10. browser_select_option: 从题库下拉框选择一个选择题题库
11. browser_click: 点击「下一步」进入步骤 3
12. browser_snapshot: 确认进入「工作参数」步骤
13. browser_fill: 填写配置名称（如「408 每日 20 题」）
14. browser_fill: 填写目标题数（如 20）
15. browser_click: 点击「保存配置」
16. browser_snapshot: 确认配置保存成功，进入步骤 4「运行复盘」
```

**预期结果：**
- 步骤 1 显示「选择题」类型已选中
- 步 2 显示所选题库名称和题目数量
- 步骤 3 显示工作参数配置表单
- 保存后自动进入步骤 4，显示运行档案区域

**验证方法：**
- 检查步骤 4 页面显示「开始专注」和「删除」按钮
- 检查工作流选择器中出现新创建的工作流名称

---

#### 场景 2：创建闪卡工作流

**优先级：** P0  
**前置条件：** 已登录，已进入刻意工作流页面，已有闪卡题库

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击「刻意工作流」入口
3. browser_click: 点击「闪卡」类型按钮（步骤 1）
4. browser_click: 点击「下一步」
5. browser_click: 选择「选择已有题库」模式
6. browser_select_option: 从题库下拉框选择一个闪卡题库
7. browser_click: 点击「下一步」
8. browser_fill: 填写配置名称（如「英语词汇每日练习」）
9. browser_fill: 填写目标词数（如 30）
10. browser_click: 点击「保存配置」
11. browser_snapshot: 确认保存成功
```

**预期结果：**
- 步骤 1 显示「闪卡」类型已选中
- 步骤 3 显示「目标词数」标签（非「目标题数」）
- 保存后配置出现在工作流列表中

**验证方法：**
- 检查步骤 3 的标签显示为「目标词数」
- 检查工作流选择器显示闪卡工作流名称

---

#### 场景 3：创建工作输入题工作流

**优先级：** P0  
**前置条件：** 已登录，已进入刻意工作流页面，已有输入题题库

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击「刻意工作流」入口
3. browser_click: 点击「输入题」类型按钮（步骤 1）
4. browser_click: 点击「下一步」
5. browser_click: 选择「选择已有题库」模式
6. browser_select_option: 从题库下拉框选择一个输入题题库
7. browser_click: 点击「下一步」
8. browser_fill: 填写配置名称（如「编程题每日训练」）
9. browser_fill: 填写目标题数（如 10）
10. browser_click: 点击「保存配置」
11. browser_snapshot: 确认保存成功
```

**预期结果：**
- 步骤 1 显示「输入题」类型已选中
- 步骤 3 不显示「完成条件」下拉框（输入题无此选项）
- 保存后配置出现在工作流列表中

**验证方法：**
- 检查步骤 3 没有「完成条件」字段
- 检查工作流选择器显示输入题工作流名称

---

#### 场景 4：启动工作流

**优先级：** P0  
**前置条件：** 已登录，已创建至少一个工作流

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击「刻意工作流」入口
3. browser_snapshot: 确认页面显示已保存的工作流
4. browser_select_option: 从工作流下拉框选择要启动的工作流
5. browser_snapshot: 确认选中的工作流信息显示正确
6. browser_click: 点击「开始专注」按钮
7. browser_snapshot: 确认页面跳转到首页，触发专注模式
```

**预期结果：**
- 点击后显示加载状态（「启动中」文字）
- 成功后触发 `ark:reload-focus` 事件
- 页面自动跳转到首页 `/`

**验证方法：**
- 检查页面 URL 变为 `/`
- 检查首页显示专注模式界面

---

#### 场景 5：删除工作流

**优先级：** P0  
**前置条件：** 已登录，已创建至少一个工作流

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击「刻意工作流」入口
3. browser_select_option: 从工作流下拉框选择要删除的工作流
4. browser_click: 点击「删除」按钮
5. browser_handle_dialog: 确认删除弹窗，点击「确定」
6. browser_snapshot: 确认工作流已从列表中移除
```

**预期结果：**
- 点击删除后弹出确认对话框，显示「删除配置「xxx」？」
- 确认后工作流从列表中移除
- 如果删除的是最后一个工作流，自动进入新建模式

**验证方法：**
- 检查工作流下拉框中不再显示已删除的工作流
- 检查页面显示「暂无已保存工作流」或进入步骤 1

---

### P1 - 交互功能

#### 场景 6：4 步创建流程切换

**优先级：** P1  
**前置条件：** 已登录，进入新建工作流模式

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击「刻意工作流」入口
3. browser_click: 点击「新建工作流」按钮
4. browser_snapshot: 确认进入步骤 1「选择类型」
5. browser_click: 点击步骤 2「题库资产」导航按钮
6. browser_snapshot: 确认步骤 2 内容显示，步骤 1 内容隐藏
7. browser_click: 点击步骤 1「选择类型」导航按钮
8. browser_snapshot: 确认回到步骤 1
9. browser_click: 选择「选择题」类型
10. browser_click: 点击「下一步」
11. browser_click: 点击「下一步」（步骤 2）
12. browser_snapshot: 确认步骤 3「工作参数」显示
13. browser_click: 点击步骤 3 导航按钮
14. browser_snapshot: 确认步骤 3 内容保持显示
```

**预期结果：**
- 步骤导航按钮可点击切换（步骤 4 除外，显示为锁定状态）
- 切换步骤时内容正确更新
- 当前步骤高亮显示

**验证方法：**
- 检查步骤 4 按钮显示为禁用状态（opacity-50）
- 检查当前步骤按钮有高亮边框（border-ark-accent）

---

#### 场景 7：题库上传

**优先级：** P1  
**前置条件：** 已登录，进入步骤 2「题库资产」

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击「刻意工作流」入口
3. browser_click: 选择题型后进入步骤 2
4. browser_click: 选择「上传新题库」模式
5. browser_snapshot: 确认显示上传表单
6. browser_fill: 填写题库名称（如「408 真题集」）
7. browser_upload_file: 选择 JSON 文件上传
8. browser_fill: 填写描述（可选）
9. browser_click: 点击「校验并上传」
10. browser_snapshot: 确认上传成功，显示题库信息
```

**预期结果：**
- 上传按钮显示加载状态（「校验中」文字）
- 上传成功后自动切换到「选择已有题库」模式
- 新上传的题库自动选中
- 步骤自动进入步骤 3

**验证方法：**
- 检查题库下拉框显示新上传的题库名称
- 检查步骤 3 的「工作参数」内容显示

---

#### 场景 8：配置切换

**优先级：** P1  
**前置条件：** 已登录，已创建多个工作流

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击「刻意工作流」入口
3. browser_snapshot: 确认显示工作流选择器
4. browser_select_option: 选择第一个工作流
5. browser_snapshot: 确认显示第一个工作流的运行档案
6. browser_select_option: 选择第二个工作流
7. browser_snapshot: 确认显示第二个工作流的运行档案
8. browser_select_option: 选择「正在新建工作流」
9. browser_snapshot: 确认进入新建工作流模式，显示步骤 1
```

**预期结果：**
- 切换工作流时运行档案和存档快照同步更新
- 选择「正在新建工作流」进入创建流程
- 工作流信息显示正确（名称、题库、目标数量）

**验证方法：**
- 检查运行档案区域显示所选工作流的历史记录
- 检查存档可视化区域显示正确率趋势图

---

#### 场景 9：错误处理

**优先级：** P1  
**前置条件：** 已登录，进入刻意工作流页面

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击「刻意工作流」入口
3. browser_click: 进入步骤 2「题库资产」
4. browser_click: 选择「上传新题库」模式
5. browser_click: 不填写任何内容，直接点击「校验并上传」
6. browser_snapshot: 确认显示错误提示「请填写题库名称并选择 JSON 文件」
7. browser_click: 进入步骤 3「工作参数」
8. browser_click: 不填写配置名称，直接点击「保存配置」
9. browser_snapshot: 确认「保存配置」按钮为禁用状态
```

**预期结果：**
- 上传时缺少必填项显示错误提示
- 保存配置时缺少必填项按钮禁用（disabled）
- 错误信息清晰可读

**验证方法：**
- 检查错误提示区域显示文本「请填写题库名称并选择 JSON 文件」
- 检查「保存配置」按钮的 disabled 属性为 true

---

### P2 - 边界条件

#### 场景 10：空配置处理

**优先级：** P2  
**前置条件：** 已登录，首次进入或清空所有工作流

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击「刻意工作流」入口
3. browser_snapshot: 确认页面显示「暂无已保存工作流」
4. browser_snapshot: 确认自动进入步骤 1「选择类型」
5. browser_snapshot: 确认步骤 4 显示为禁用状态
```

**预期结果：**
- 无工作流时显示「暂无已保存工作流」提示
- 自动进入新建模式，从步骤 1 开始
- 步骤 4「运行复盘」显示为锁定状态

**验证方法：**
- 检查页面显示「暂无已保存工作流」文本
- 检查步骤 4 按钮的 disabled 属性为 true

---

#### 场景 11：大文件上传

**优先级：** P2  
**前置条件：** 已登录，准备一个大型 JSON 题库文件（>10MB）

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击「刻意工作流」入口
3. browser_click: 进入步骤 2「题库资产」
4. browser_click: 选择「上传新题库」模式
5. browser_fill: 填写题库名称
6. browser_upload_file: 选择大型 JSON 文件（>10MB）
7. browser_click: 点击「校验并上传」
8. browser_snapshot: 确认显示加载状态
9. browser_snapshot: 等待上传完成或显示超时错误
```

**预期结果：**
- 上传过程中显示「校验中」加载状态
- 大文件可能触发超时或大小限制错误
- 错误信息提示文件大小限制

**验证方法：**
- 检查是否显示文件大小限制错误提示
- 检查上传按钮恢复可点击状态

---

#### 场景 12：网络错误处理

**优先级：** P2  
**前置条件：** 已登录，后端服务不可用或网络断开

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击「刻意工作流」入口
3. browser_snapshot: 确认页面显示错误提示
4. browser_snapshot: 检查错误信息是否包含网络相关描述
```

**预期结果：**
- 页面显示加载失败提示
- 错误信息包含「加载刻意工作流失败」或网络错误描述
- 页面不崩溃，可重试

**验证方法：**
- 检查页面显示错误提示区域
- 检查错误文本包含「失败」关键词

---

## MCP 工具使用说明

### 常用工具

| 工具 | 用途 | 示例 |
|------|------|------|
| `browser_navigate` | 导航到指定 URL | `browser_navigate: http://localhost:5173` |
| `browser_snapshot` | 获取页面快照（推荐） | `browser_snapshot:` 确认页面状态 |
| `browser_click` | 点击元素 | `browser_click: 点击「保存配置」` |
| `browser_type` | 输入文本 | `browser_type: 填写配置名称` |
| `browser_fill` | 填充表单字段 | `browser_fill: 填写目标题数` |
| `browser_screenshot` | 截图（调试用） | `browser_screenshot:` 保存截图 |
| `browser_select_option` | 选择下拉框选项 | `browser_select_option: 选择题库` |
| `browser_handle_dialog` | 处理弹窗 | `browser_handle_dialog: 确认删除` |
| `browser_upload_file` | 上传文件 | `browser_upload_file: 选择 JSON 文件` |

### 元素定位策略

- **按钮：** 使用按钮文字定位，如「保存配置」「下一步」「开始专注」
- **下拉框：** 使用 label 文字定位，如「题库」「当前工作流」
- **输入框：** 使用 placeholder 或 label 定位，如「配置名称」「目标词数」
- **步骤导航：** 使用步骤标题定位，如「选择类型」「题库资产」

### 快照检查点

每个操作步骤后建议使用 `browser_snapshot` 确认：
1. 页面标题和面包屑正确
2. 当前步骤高亮显示
3. 表单字段值正确
4. 按钮状态（启用/禁用/加载）
5. 错误提示显示/隐藏
