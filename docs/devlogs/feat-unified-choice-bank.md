# feat/unified-choice-bank

## 提交记录

### 2026-06-20 14:53 · `a6f5954f` · feat(admin): add content bank import template validation

**用户提出的需求：**
在题库管理的“导入题库”入口添加题库 JSON 解析帮助：类型选择框右边加问号，点击显示可复制模板说明；上传 JSON 后、导入数据库前先做格式验证。

**本次完成的工作：**
- 在 `backend/web/admin/content-banks.html` 的导入弹窗中，将问号帮助按钮放到类型选择框右侧
- 新增题库 JSON 模板弹窗，按 `word` / `choice` 类型展示不同模板，并支持复制模板
- 新增导入文件校验提示区，选择 JSON 文件后即时展示通过、警告或错误状态
- 在提交导入前再次执行校验，格式不合法时阻止请求进入后端导入流程
- 选择题校验覆盖非空数组、`questions`、`question_text`、`options`、`correct_answer` 与答案选项匹配等核心字段

**验证情况：**
- `node` 内联脚本语法检查通过
- 用页面校验函数验证合法 choice、非法 choice、JSON 语法错误三组样例，结果符合预期
- in-app browser 实测：导入弹窗可打开，问号在类型选择框右侧，模板弹窗可打开，类型切换到 choice 后模板内容同步更新

### 2026-06-20 · `76571e2f` · feat: 统一选择题题库适配层与配置升级

**用户提出的需求：**
把当前"真题练习/选择题练习"从临时 content bank + ERC 映射，升级为统一选择题题库模型，支持年份、科目、标签、共享材料、动态范围和灵活完成条件。

**本次完成的工作：**
- 新增 `backend/routes/choice/` 模块：统一 DTO（ChoiceBank/ChoiceItem/ChoiceQuestion/ContentBlock）+ 适配器层，从 content_banks 和 erc_sets 读取并转换为统一格式
- 新增 `GET /api/choice/banks`、`GET /api/choice/filters`、`GET /api/choice/items`、`POST /api/choice/practice/start` 四个 API 端点
- 新增 `ContentBlockRenderer.tsx`：支持 paragraph/table/image/html 富文本渲染，table 不再以原始字符串显示
- `ChoiceQuestionFocusTemplate` 升级：支持 stemBlocks/materialBlocks/explanationBlocks 结构化内容
- `choiceQuestionTypes.ts` 升级：新增 ContentBlockData 类型引用，支持新字段
- `TestFocusWork` 配置页升级：ERC 类型题库支持年份/科目筛选、完成条件选择（做 N 道 vs 做完范围）
- `start-test-focus` 接口兼容：新增 scope/completion 可选参数，保持旧配置完全兼容

**验证情况：**
- backend pytest: 189 passed
- frontend vitest: 251 passed
- frontend tsc --noEmit: 通过
- eslint: 通过
- ruff: 通过

### 2026-06-20 · `ddce1ff3` · fix: 选择题渲染管线完整贯通 + 配置持久化 + 安全表格渲染

**用户提出的需求：**
start-test-focus 生成的 choice_scope/choice_completion 必须被 focus work renderer 消费。408 题应通过统一 Choice DTO 渲染，不要继续走 ERC article 的伪阅读结构。表格必须安全解析渲染。配置保存要包含 scope/completion。

**本次完成的工作：**
- `ERCPracticeFocusWork` 消费 `config_snapshot.choice_scope`/`choice_completion`，408 题通过 Choice API 统一渲染
- 单题/408：stem blocks 上方 + 选项下方；阅读：passage 上方 + 题目下方
- `ContentBlockRenderer` 安全解析 HTML table（`parseHtmlToRows`），不再裸 `dangerouslySetInnerHTML`
- `test_focus_configs` 表新增 `scope_json`/`completion_json` 列（含 ALTER TABLE 迁移）
- 配置保存包含 scope/completion，启动时从已保存配置读取
- 新增 `lib/choice/api.ts` + `types.ts` 前端 Choice API 客户端
- 新增 14 个 choice adapter 单元测试

**验证情况：**
- backend pytest: 203 passed
- frontend vitest: 251 passed
- frontend tsc --noEmit: 通过
- eslint: 通过
- ruff: 通过
