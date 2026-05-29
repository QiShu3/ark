# AchievementCard 移除悬浮预览 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 AchievementCard 的悬浮预览，只保留点击打开弹窗

**Architecture:** 直接修改 AchievementCard.tsx，删除 hover 状态逻辑，始终渲染默认"成就"文字

**Tech Stack:** React + TypeScript

---

### Task 1: 移除悬浮预览逻辑

**Files:**
- Modify: `frontend/src/components/AchievementCard.tsx`

- [ ] **Step 1: 编辑 AchievementCard.tsx**

将整个文件替换为以下内容：

```tsx
import { useEffect, useRef, useState } from 'react';

import { apiJson } from '../lib/api';
import AchievementModal from './AchievementModal';
import type { AchievementSummary } from './achievementTypes';

export default function AchievementCard() {
  const [summary, setSummary] = useState<AchievementSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const nextSummary = await apiJson<AchievementSummary>('/todo/achievements/summary');
        setSummary(nextSummary);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '成就加载失败');
      }
    })();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="成就"
        onClick={() => setIsOpen(true)}
        className="flex h-full w-full flex-col justify-center rounded-lg border border-white/20 bg-white/10 p-3 text-left transition-colors hover:bg-white/15"
      >
        <span className="text-center text-white/80 font-medium">成就</span>
      </button>

      <AchievementModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialSummary={summary}
        returnFocusRef={triggerRef}
      />
    </>
  );
}
```

变更点：
- 移除 `isPreviewVisible` state
- 移除 `onMouseEnter` / `onMouseLeave` / `onFocus` / `onBlur`
- 移除 `latestEventItem` / `nextEventItem` / `nextGlobalItem` 派生变量
- 移除条件渲染，始终显示 "成就" 文字
- 保留 `useEffect` 数据加载、`onClick`、`AchievementModal`

- [ ] **Step 2: 运行现有测试确认无回归**

```bash
cd frontend && pnpm test -- --run
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/AchievementCard.tsx
git commit -m "refactor: remove hover preview from AchievementCard"
```

---

### Task 2: 更新测试

**Files:**
- Modify: `frontend/src/components/__tests__/AchievementCard.test.tsx`

- [ ] **Step 1: 读取当前测试文件**

```bash
cat frontend/src/components/__tests__/AchievementCard.test.tsx
```

- [ ] **Step 2: 删除 hover 相关测试用例**

删除名为 `'shows only the achievement label by default and reveals summaries on hover'` 的测试（该测试依赖 `isPreviewVisible` 行为）。保留其他测试（默认渲染、点击打开弹窗、焦点管理等）。

- [ ] **Step 3: 运行测试确认通过**

```bash
cd frontend && pnpm test -- --run
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/__tests__/AchievementCard.test.tsx
git commit -m "test: remove hover preview test for AchievementCard"
```
