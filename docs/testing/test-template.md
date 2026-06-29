# [功能模块名称] 测试方案

## 功能概述

[简要描述功能模块的核心能力和用途]

**核心能力：**
- [能力 1]
- [能力 2]
- [能力 3]

## 测试环境

| 项目 | 地址/配置 |
|------|-----------|
| 前端地址 | http://localhost:5173 |
| 后端地址 | http://localhost:8000 |
| 测试账号 | 用户名：`qishuadmin`，密码：`12345678` |
| 页面路径 | `/[模块路径]` |

## 测试场景

### P0 - 核心功能

#### 场景 1：[场景名称]

**优先级：** P0  
**前置条件：** [列出前置条件]

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_snapshot: 确认页面加载完成
3. browser_click: 点击[入口/按钮]
4. browser_snapshot: 确认进入[页面/状态]
5. [继续添加步骤...]
```

**预期结果：**
- [预期结果 1]
- [预期结果 2]
- [预期结果 3]

**验证方法：**
- [验证方法 1]
- [验证方法 2]

---

#### 场景 2：[场景名称]

**优先级：** P0  
**前置条件：** [列出前置条件]

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击[入口]
3. [继续添加步骤...]
```

**预期结果：**
- [预期结果 1]
- [预期结果 2]

**验证方法：**
- [验证方法 1]

---

### P1 - 交互功能

#### 场景 3：[场景名称]

**优先级：** P1  
**前置条件：** [列出前置条件]

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击[入口]
3. [继续添加步骤...]
```

**预期结果：**
- [预期结果 1]
- [预期结果 2]

**验证方法：**
- [验证方法 1]

---

### P2 - 边界条件

#### 场景 4：[场景名称]

**优先级：** P2  
**前置条件：** [列出前置条件]

**操作步骤：**

```
1. browser_navigate: 访问 http://localhost:5173
2. browser_click: 点击[入口]
3. [继续添加步骤...]
```

**预期结果：**
- [预期结果 1]
- [预期结果 2]

**验证方法：**
- [验证方法 1]

---

## MCP 工具使用说明

### 常用工具

| 工具 | 用途 | 示例 |
|------|------|------|
| `browser_navigate` | 导航到指定 URL | `browser_navigate: http://localhost:5173` |
| `browser_snapshot` | 获取页面快照（推荐） | `browser_snapshot:` 确认页面状态 |
| `browser_click` | 点击元素 | `browser_click: 点击「按钮名称」` |
| `browser_type` | 输入文本 | `browser_type: 输入文本内容` |
| `browser_fill` | 填充表单字段 | `browser_fill: 填写字段名称` |
| `browser_screenshot` | 截图（调试用） | `browser_screenshot:` 保存截图 |
| `browser_select_option` | 选择下拉框选项 | `browser_select_option: 选择选项` |
| `browser_handle_dialog` | 处理弹窗 | `browser_handle_dialog: 确认操作` |
| `browser_upload_file` | 上传文件 | `browser_upload_file: 选择文件` |

### 元素定位策略

- **按钮：** 使用按钮文字定位，如「保存」「下一步」「确认」
- **下拉框：** 使用 label 文字定位，如「选择类型」「当前状态」
- **输入框：** 使用 placeholder 或 label 定位，如「名称」「描述」
- **导航：** 使用菜单项或标签文字定位

### 快照检查点

每个操作步骤后建议使用 `browser_snapshot` 确认：
1. 页面标题和面包屑正确
2. 当前状态/步骤高亮显示
3. 表单字段值正确
4. 按钮状态（启用/禁用/加载）
5. 错误提示显示/隐藏