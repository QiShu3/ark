# 统一取题方案 V1 端到端验收测试方案

## 元属性

| 属性 | 值 |
|------|-----|
| **方案ID** | TP-UQS-001 |
| **版本** | 1.0 |
| **作者** | Codex |
| **创建日期** | 2026-07-01 |
| **测试范围** | P0 + P1 |
| **预计耗时** | 30 分钟 |

---

## 1. 功能概述

验收统一取题方案 V1 的端到端流程：从创建/编辑专注工作配置（含 unified 字段），到运行时 UnifiedFocusWork 取题、作答、回流、统计的正确性。

**核心能力：**
- 创建专注工作配置时保存 `primary_filter` / `sort_order` / `use_fsrs` / `backflow_rule` 字段
- 运行时 UnifiedFocusWork 根据配置正确取题
- 作答后统计（answered_count / correct_count / accuracy）正确累计
- 暂停/禁用状态真正拦截作答
- 旧配置（无 unified 字段）仍走旧 renderer

## 2. 测试环境

| 项目 | 地址/配置 |
|------|-----------|
| 前端地址 | http://localhost:5173 |
| 后端地址 | http://localhost:8000 |
| 测试账号 | 用户名：`qishuadmin`，密码：`12345678` |
| 页面路径 | `/#/deliberate-workflow` |

## 3. 测试场景

### P0 - 核心功能

#### 场景 S01：启动已有选择配置并作答

**优先级：** P0
**前置条件：** 已登录，已有至少一个 choice 类型工作流配置（如 "408"）

**操作步骤：**
```
1. browser_navigate: 访问 http://localhost:5173/#/deliberate-workflow
2. browser_snapshot: 确认页面加载，存在工作流配置
3. browser_click: 点击「开始」按钮
4. browser_snapshot: 确认进入专注模式，UnifiedFocusWork 渲染
5. browser_snapshot: 确认显示题目（选择题选项）
6. browser_click: 点击一个选项作答
7. browser_snapshot: 确认提交结果（正确/错误高亮）
8. browser_click: 点击「下一题」
9. browser_snapshot: 确认进入下一题
10. 重复 6-9 直到答题完成
11. browser_snapshot: 确认显示完成提示，统计正确
```

**预期结果：**
- 点击「开始」后进入专注模式，显示选择题界面
- 选项可点击作答，提交后显示正确/错误
- 完成时显示「专注完成」和答题统计

**验证方法：**
- snapshot 检查 UnifiedFocusWork 组件渲染
- 检查统计数据：answered_count = 总答题数

---

#### 场景 S02：新建统一配置（选择题 + 主筛选）

**优先级：** P0
**前置条件：** 已登录，已进入刻意工作流页面

**操作步骤：**
```
1. browser_navigate: 访问 http://localhost:5173/#/deliberate-workflow
2. browser_click: 点击「新建专注工作」
3. browser_snapshot: 确认弹出创建弹窗
4. browser_fill: 填写名称（如 "UQS-选择-全量-顺序"）
5. browser_select_option: 选择题库为 "408选择题"
6. browser_fill: 填写目标题数（如 3）
7. browser_click: 尝试查找并设置 primary_filter 字段
8. browser_click: 尝试查找 sort_order 字段
9. browser_snapshot: 确认配置字段存在且可编辑
10. browser_click: 点击保存
11. browser_snapshot: 确认新配置出现在列表中
```

**预期结果：**
- 创建弹窗包含 unified 字段（primary_filter、sort_order、use_fsrs、backflow_rule）
- 保存后配置出现在专注工作管理列表

**验证方法：**
- snapshot 查看弹窗字段

---

#### 场景 S03：启动统一配置并验证运行时

**优先级：** P0
**前置条件：** 已有包含 unified 字段的配置

**操作步骤：**
```
1. browser_navigate: 访问 http://localhost:5173/#/deliberate-workflow
2. browser_select_option: 选择刚创建的 UQS 配置
3. browser_click: 点击「开始」
4. browser_snapshot: 确认进入专注模式，显示 UnifiedFocusWork
5. browser_snapshot: 确认显示题目
6. browser_click: 逐题作答
7. browser_snapshot: 全部答完后确认完成提示
8. browser_snapshot: 确认统计数据正确
```

**预期结果：**
- 统一配置启动 UnifiedFocusWork
- 答题统计：answered_count 和 correct_count 正确

**验证方法：**
- snapshot 确认 rendered 组件是 UnifiedFocusWork

---

#### 场景 S04：启动闪卡统一配置

**优先级：** P0
**前置条件：** 已登录，已有闪卡题库

**操作步骤：**
```
1. browser_navigate: 访问 http://localhost:5173/#/deliberate-workflow
2. browser_click: 点击「新建专注工作」
3. browser_click: 选择类型为「闪卡」
4. browser_select_option: 选择题库为考研英语单词
5. browser_fill: 填写名称和目标词数
6. browser_click: 点击保存
7. browser_click: 点击「开始」
8. browser_snapshot: 确认进入 UnifiedFocusWork，显示闪卡界面
9. browser_click: 点击「显示答案」
10. browser_snapshot: 确认显示答案和记住了/没记住按钮
11. browser_click: 点击「记住了」或「没记住」
12. browser_snapshot: 确认提交成功
```

**预期结果：**
- 闪卡显示正反面翻转
- 可提交记住了/没记住
- 统计数据正确

**验证方法：**
- snapshot 查看闪卡界面
- 验证统计

---

#### 场景 S05：验证暂停/禁用拦截

**优先级：** P0
**前置条件：** 正在专注模式，有题目显示

**操作步骤：**
```
1. browser_snapshot: 确认正在答题
2. browser_click: 点击「暂停专注」
3. browser_snapshot: 确认显示暂停状态，选项不可点击
4. browser_click: 点击「继续专注」
5. browser_snapshot: 确认可继续作答
```

**预期结果：**
- 暂停后界面显示"已暂停"，选项/按钮不可交互
- 继续后恢复正常

**验证方法：**
- snapshot 检查暂停界面

---

### P1 - 交互功能

#### 场景 S06：编辑统一配置

**优先级：** P1
**前置条件：** 已有统一配置

**操作步骤：**
```
1. browser_navigate: 访问 http://localhost:5173/#/deliberate-workflow
2. browser_click: 点击已存在配置的「编辑」按钮
3. browser_snapshot: 确认弹出编辑弹窗，unified 字段显示
4. browser_fill: 修改 primary_filter 或 target_count
5. browser_click: 点击保存
6. browser_snapshot: 确认配置已更新
```

**预期结果：**
- 编辑弹窗显示所有配置字段
- 修改后保存成功

**验证方法：**
- snapshot 检查弹窗字段

---

#### 场景 S07：题量不足严格模式

**优先级：** P1
**前置条件：** 已有题库

**操作步骤：**
```
1. browser_navigate: 访问 http://localhost:5173/#/deliberate-workflow
2. browser_click: 创建新配置，目标设为极大值（如 9999）
3. browser_click: 点击开始
4. browser_snapshot: 确认显示题量不足提示（warning）
5. browser_click: 点击「取消」或「开始」
```

**预期结果：**
- 题量不足时显示 warning 提示
- 可取消或按实际量开始

**验证方法：**
- snapshot 检查 warning 信息

---

#### 场景 S08：删除工作流配置

**优先级：** P1
**前置条件：** 已有至少一个配置

**操作步骤：**
```
1. browser_navigate: 访问 http://localhost:5173/#/deliberate-workflow
2. browser_click: 点击已存在配置的「删除」按钮
3. browser_handle_dialog: 确认删除
4. browser_snapshot: 确认配置已移除
```

**预期结果：**
- 删除后配置从列表中移除

**验证方法：**
- snapshot 检查列表

---

## 4. 准入/准出标准

**准入条件：**
- 后端服务已启动
- 测试账号可登录
- 已有选择题题库（408选择题 631题）
- 已有闪卡题库（考研英语单词 5528词）

**准出条件：**
- P0 场景 100% 通过
- P1 场景 ≥ 90% 通过
- 无阻塞性 Bug
