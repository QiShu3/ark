# 成就卡片悬浮态精简

**日期**: 2026-05-24
**状态**: 已确认

## 问题

主页成就卡片（AchievementCard）在悬浮时高度发生剧烈变化（~40px → ~160px），在 flex 布局中挤压相邻卡片，造成不美观的布局跳动。

## 根因

悬浮态显示了过多内容（事件名、解锁进度、下一步提示、全局进度），共 5 行文字，远超默认态的单行"成就"文字。

## 方案

直接取消悬浮预览，保留点击打开弹窗的交互。

## 变更

### AchievementCard.tsx

- 移除 `isPreviewVisible` state
- 移除 `onMouseEnter` / `onMouseLeave` / `onFocus` / `onBlur` 事件
- 移除条件渲染，始终显示"成就"文字
- 保留 `onClick` → `AchievementModal` 的交互
- 保留 `useEffect` 数据加载（弹窗仍需要 summary）

### 测试更新

- 删除 `AchievementCard.test.tsx` 中 hover 相关测试用例

## 影响范围

- `frontend/src/components/AchievementCard.tsx`
- `frontend/src/components/__tests__/AchievementCard.test.tsx`
