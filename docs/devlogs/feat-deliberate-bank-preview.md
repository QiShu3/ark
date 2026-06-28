# 开发日志：feat/deliberate-bank-preview

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-28 10:31 · `154bf33` · fix(frontend): simplify dashboard and focus work labels

- 用户提出的需求：
  - "去掉这个"（首页日历中的"今日已打卡 · 连续 5 天"状态行）
  - "去掉'学习数据可视化'这种注释，同列的其他两个也是如此。"
  - "然后这里的第三行：'已完成x分钟  目标已达成' 也去掉"
  - "去掉这行"（输入练习/题型模板顶部重复题目标题）
  - "不对，是改变通用模板，他类型的也不需要。"

- 本次完成的工作：
  - 移除首页日历卡片的打卡状态文字行，保留日期打卡高亮和连续线视觉。
  - 移除首页今日进度卡片底部的完成分钟数和目标达成百分比说明。
  - 移除首页底部三个快捷入口卡片的副标题，只保留图标和主标题。
  - 在输入题和选择题通用 focus-work 模板中统一取消外层 `subtitle` 的渲染，避免输入练习、ERC 练习/复习等题型顶部显示重复说明。
  - 更新选择题模板测试，断言 subtitle 不再显示，同时材料卡片标题仍保留。

- 验证情况：
  - `cd frontend && pnpm test -- --run src/components/__tests__/HomeRightDashboard.test.tsx src/components/__tests__/CalendarWidget.test.tsx src/components/focus-work/templates/InputQuestionFocusTemplate.test.tsx src/components/focus-work/templates/ChoiceQuestionFocusTemplate.test.tsx`，4 files / 20 tests passed。
  - `cd frontend && pnpm check` 通过。
  - in-app browser 刷新 `http://localhost:5173/#/` 验证相关文案已隐藏，材料卡片标题仍保留。
