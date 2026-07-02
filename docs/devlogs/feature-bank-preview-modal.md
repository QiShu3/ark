# 开发日志：feature/bank-preview-modal

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-07-02 13:55 · f6e9b0b · fix(focus-work): 修复统一专注工作 input 题型文章内容不显示问题

- 用户提出的需求：
  - "再测试一下长难句 专注工作 。验收要求：要完整通过专注工作，直到专注工作结束阶段"
  - "题目，参考答案都是空的，你和我说正常？"
  - "从整体上看，你觉得怎么修最好？是不是题库设计的有问题"

- 本次完成的工作：
  - 修复 InputQuestionAdapter 中 text=uuid 类型不匹配导致的 HTTP 500 错误（input_user_answers.question_id 是 text 类型，input_questions.id 是 uuid 类型）
  - InputQuestionAdapter 添加 article_pk/article_title/article_paragraphs 字段输出，与 ChoiceQuestionAdapter 对齐
  - InputQuestionAdapter 将 reference_answer 映射为 answer 字段，适配统一接口
  - ChoiceQuestionAdapter 同步添加文章字段输出
  - unified init 接口增加文章字段和 explanation 透传，新增 _parse_paragraphs 辅助函数处理 json/jsonb 数组
  - study_ledger 修复 fsrs_card_json 序列化（使用 json.dumps）和 vocab_review_logs 字段映射
  - 前端 UnifiedFocusWork input 分支增加文章段落展示（标题 + 段落），stem 非空时也显示题干
  - 前端 UnifiedFocusWork choice 分支改用 article_paragraphs 作为阅读材料，有文章时 stem 放在题目区
  - 前端 unifiedApi UnifiedQuestion 类型补充 article_pk/article_title/article_paragraphs/explanation 字段

- 验证情况：
  - 浏览器端完整跑通长难句专注工作：启动 → 显示题目（文章标题+段落）→ 输入答案 → 提交 → 答对了 → 完成 → 结束阶段 → 结算 → 结束工作流
  - 题目内容正常显示（"2012年 Part B - 大作文" + 英文写作题目描述）
  - 参考答案为空是题库数据本身为空（写作主观题无标准答案），非显示 bug
