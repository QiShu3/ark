# Choice Question Focus Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the ERC review choice-question UI into a reusable focus-work template and migrate `ERCReviewFocusWork` to use it without changing user-visible behavior.

**Architecture:** Add a template package under `frontend/src/components/focus-work/templates/` with narrow choice-question types and a self-contained `ChoiceQuestionFocusTemplate`. Keep ERC-specific fetching, fallback, submission, and config logic inside `ERCReviewFocusWork`, which becomes an adapter that maps ERC data into template items.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Tailwind classes backed by `--focus-work-*` CSS variables.

---

## File Structure

- Create `frontend/src/components/focus-work/templates/choiceQuestionTypes.ts`
  - Owns reusable choice-question data types and template props.
- Create `frontend/src/components/focus-work/templates/ChoiceQuestionFocusTemplate.tsx`
  - Owns generic choice-question layout, local selection/result state, loading/error/empty states, and target completion callback.
- Create `frontend/src/components/focus-work/templates/ChoiceQuestionFocusTemplate.test.tsx`
  - Covers template behavior independently from ERC.
- Modify `frontend/src/components/ERC/ERCReviewFocusWork.tsx`
  - Removes duplicated choice-question JSX and adapts ERC data to the template.
- Modify `frontend/src/components/ERC/ERCReviewFocusWork.test.tsx`
  - Keeps ERC-specific behavior coverage after the adapter refactor.
- Modify `frontend/src/pages/ERC/__tests__/Review.test.tsx`
  - Keep existing assertions unchanged unless the focused command in Task 3 Step 4 fails. If it fails because template extraction changes only the loading text timing or equivalent accessible names, update the affected assertion while preserving behavior coverage for empty state and reading surface.
- Modify `docs/frontend-ui-unification.md`
  - Registers the reusable choice-question focus template.

## Task 1: Add Choice Question Template Types

**Files:**
- Create: `frontend/src/components/focus-work/templates/choiceQuestionTypes.ts`

- [ ] **Step 1: Create the template directory**

Run:

```bash
mkdir -p frontend/src/components/focus-work/templates
```

Expected: directory exists.

- [ ] **Step 2: Add reusable choice-question types**

Create `frontend/src/components/focus-work/templates/choiceQuestionTypes.ts`:

```ts
import type React from 'react';

export type ChoiceQuestionOption = {
  key: string;
  text: string;
};

export type ChoiceQuestionMaterialParagraph = {
  id: string;
  label?: string;
  text: React.ReactNode;
};

export type ChoiceQuestionMetaTone = 'default' | 'blue' | 'amber' | 'emerald';

export type ChoiceQuestionMeta = {
  label: string;
  tone?: ChoiceQuestionMetaTone;
};

export type ChoiceQuestionItem = {
  id: string;
  numberLabel: string;
  stem: React.ReactNode;
  options: ChoiceQuestionOption[];
  material?: {
    title: string;
    paragraphs: ChoiceQuestionMaterialParagraph[];
  };
  meta?: ChoiceQuestionMeta[];
};

export type ChoiceQuestionSubmitResult = {
  correctOptionKey?: string;
  explanation?: React.ReactNode;
  progressSnapshot?: Record<string, unknown>;
};

export type ChoiceQuestionFocusTemplateProps = {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  item: ChoiceQuestionItem | null;
  loading: boolean;
  error: string | null;
  emptyTitle: string;
  emptyDescription: string;
  answeredCount: number;
  targetCount: number;
  disabled: boolean;
  onSubmitAnswer: (item: ChoiceQuestionItem, optionKey: string) => Promise<ChoiceQuestionSubmitResult>;
  onLoadNext: () => Promise<ChoiceQuestionItem | null>;
  onContentCompleted: (progressSnapshot?: Record<string, unknown>) => void;
};
```

- [ ] **Step 3: Run TypeScript check**

Run:

```bash
cd frontend && pnpm check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/focus-work/templates/choiceQuestionTypes.ts
git commit -m "feat(focus-work): add choice question template types"
```

## Task 2: Build the Choice Question Focus Template

**Files:**
- Create: `frontend/src/components/focus-work/templates/ChoiceQuestionFocusTemplate.test.tsx`
- Create: `frontend/src/components/focus-work/templates/ChoiceQuestionFocusTemplate.tsx`

- [ ] **Step 1: Write failing template tests**

Create `frontend/src/components/focus-work/templates/ChoiceQuestionFocusTemplate.test.tsx`:

```tsx
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import ChoiceQuestionFocusTemplate from './ChoiceQuestionFocusTemplate';
import type { ChoiceQuestionItem } from './choiceQuestionTypes';

function item(id = 'q1'): ChoiceQuestionItem {
  return {
    id,
    numberLabel: 'Q26',
    stem: 'Question 26?',
    material: {
      title: 'Reading Passage',
      paragraphs: [{ id: 'p1', label: '1', text: 'Context paragraph.' }],
    },
    meta: [{ label: '错题复习' }],
    options: [
      { key: 'A', text: 'A1' },
      { key: 'B', text: 'B1' },
      { key: 'C', text: 'C1' },
      { key: 'D', text: 'D1' },
    ],
  };
}

function renderTemplate(overrides: Partial<React.ComponentProps<typeof ChoiceQuestionFocusTemplate>> = {}) {
  const props: React.ComponentProps<typeof ChoiceQuestionFocusTemplate> = {
    title: 'ERC REVIEW',
    subtitle: '2025 年 Text 2 · Test Article',
    statusLabel: '复习题',
    item: item(),
    loading: false,
    error: null,
    emptyTitle: '暂无可复习内容',
    emptyDescription: '当前没有可用的 ERC 复习内容。',
    answeredCount: 0,
    targetCount: 10,
    disabled: false,
    onSubmitAnswer: vi.fn(async () => ({ correctOptionKey: 'A' })),
    onLoadNext: vi.fn(async () => item('q2')),
    onContentCompleted: vi.fn(),
    ...overrides,
  };
  render(<ChoiceQuestionFocusTemplate {...props} />);
  return props;
}

describe('ChoiceQuestionFocusTemplate', () => {
  it('renders material, question, options, and metadata', () => {
    renderTemplate();

    expect(screen.getByText('ERC REVIEW')).toBeInTheDocument();
    expect(screen.getByText('2025 年 Text 2 · Test Article')).toBeInTheDocument();
    expect(screen.getByText('错题复习')).toBeInTheDocument();
    expect(screen.getByLabelText('阅读原文')).toBeInTheDocument();
    expect(screen.getByText('Context paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Question 26?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AA1' })).toBeInTheDocument();
  });

  it('keeps submit disabled until an option is selected', async () => {
    const user = userEvent.setup();
    const props = renderTemplate();

    expect(screen.getByRole('button', { name: '提交答案' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'AA1' }));
    expect(screen.getByRole('button', { name: '提交答案' })).toBeEnabled();
    expect(props.onSubmitAnswer).not.toHaveBeenCalled();
  });

  it('submits the selected answer and marks result states', async () => {
    const user = userEvent.setup();
    const props = renderTemplate({
      onSubmitAnswer: vi.fn(async () => ({ correctOptionKey: 'B' })),
    });

    await user.click(screen.getByRole('button', { name: 'AA1' }));
    await user.click(screen.getByRole('button', { name: '提交答案' }));

    await waitFor(() => {
      expect(props.onSubmitAnswer).toHaveBeenCalledWith(item(), 'A');
    });
    expect(screen.getByRole('button', { name: 'AA1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'BB1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一题' })).toBeInTheDocument();
  });

  it('loads the next question and resets selection/result state', async () => {
    const user = userEvent.setup();
    renderTemplate({
      onSubmitAnswer: vi.fn(async () => ({ correctOptionKey: 'A' })),
      onLoadNext: vi.fn(async () => ({
        ...item('q2'),
        numberLabel: 'Q27',
        stem: 'Question 27?',
      })),
    });

    await user.click(screen.getByRole('button', { name: 'AA1' }));
    await user.click(screen.getByRole('button', { name: '提交答案' }));
    await screen.findByRole('button', { name: '下一题' });
    await user.click(screen.getByRole('button', { name: '下一题' }));

    expect(await screen.findByText('Question 27?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交答案' })).toBeDisabled();
  });

  it('emits content completion once when the target count is already reached', async () => {
    const onContentCompleted = vi.fn();
    renderTemplate({ answeredCount: 1, targetCount: 1, onContentCompleted });

    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith({ answered_count: 1, target_question_count: 1 });
    });
    expect(onContentCompleted).toHaveBeenCalledTimes(1);
  });

  it('emits empty content completion once when no item is available after loading', async () => {
    const onContentCompleted = vi.fn();
    renderTemplate({ item: null, loading: false, answeredCount: 0, onContentCompleted });

    expect(screen.getByText('暂无可复习内容')).toBeInTheDocument();
    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith({
        answered_count: 0,
        target_question_count: 10,
        no_available_content: true,
      });
    });
    expect(onContentCompleted).toHaveBeenCalledTimes(1);
  });

  it('disables interactions while paused', () => {
    renderTemplate({ disabled: true });

    expect(screen.getByRole('button', { name: 'AA1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '提交答案' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run template tests to verify failure**

Run:

```bash
cd frontend && pnpm test -- ChoiceQuestionFocusTemplate.test.tsx --maxWorkers=1
```

Expected: FAIL because `ChoiceQuestionFocusTemplate` does not exist.

- [ ] **Step 3: Implement the template**

Create `frontend/src/components/focus-work/templates/ChoiceQuestionFocusTemplate.tsx`:

```tsx
import React from 'react';
import { BarChart3, BookOpen, ChevronRight, Trophy } from 'lucide-react';

import type {
  ChoiceQuestionFocusTemplateProps,
  ChoiceQuestionItem,
  ChoiceQuestionSubmitResult,
} from './choiceQuestionTypes';

function metaClass(tone: string | undefined) {
  if (tone === 'blue') return 'border-[var(--focus-work-blue-border)] bg-[var(--focus-work-blue-bg)] text-[var(--focus-work-blue-text)]';
  if (tone === 'amber') return 'border-[var(--focus-work-amber-border)] bg-[var(--focus-work-amber-bg)] text-[var(--focus-work-amber-text)]';
  if (tone === 'emerald') return 'border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)]';
  return 'border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] text-[var(--focus-work-text)]';
}

function progressSnapshot(answeredCount: number, targetCount: number, noAvailableContent = false) {
  return {
    answered_count: answeredCount,
    target_question_count: targetCount,
    ...(noAvailableContent ? { no_available_content: answeredCount === 0 } : {}),
  };
}

export default function ChoiceQuestionFocusTemplate({
  title,
  subtitle,
  statusLabel,
  item,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  answeredCount,
  targetCount,
  disabled,
  onSubmitAnswer,
  onLoadNext,
  onContentCompleted,
}: ChoiceQuestionFocusTemplateProps) {
  const [currentItem, setCurrentItem] = React.useState<ChoiceQuestionItem | null>(item);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ChoiceQuestionSubmitResult | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [loadingNext, setLoadingNext] = React.useState(false);
  const completedRef = React.useRef(false);

  React.useEffect(() => {
    setCurrentItem(item);
    setSelected(null);
    setResult(null);
    setLocalError(null);
  }, [item?.id, item]);

  React.useEffect(() => {
    if (completedRef.current) return;
    if (answeredCount >= targetCount) {
      completedRef.current = true;
      onContentCompleted(progressSnapshot(answeredCount, targetCount));
    }
  }, [answeredCount, onContentCompleted, targetCount]);

  React.useEffect(() => {
    if (completedRef.current || loading || currentItem) return;
    completedRef.current = true;
    onContentCompleted(progressSnapshot(answeredCount, targetCount, true));
  }, [answeredCount, currentItem, loading, onContentCompleted, targetCount]);

  async function handleSubmit() {
    if (disabled || submitting || !currentItem || !selected || result) return;
    setSubmitting(true);
    try {
      const nextResult = await onSubmitAnswer(currentItem, selected);
      setResult(nextResult);
      setLocalError(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoadNext() {
    if (disabled || loadingNext) return;
    setLoadingNext(true);
    try {
      const nextItem = await onLoadNext();
      setCurrentItem(nextItem);
      setSelected(null);
      setResult(null);
      setLocalError(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '下一题加载失败');
    } finally {
      setLoadingNext(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-1 pb-2">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden">
        <div className="mb-4 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--focus-work-text)] lg:text-4xl">{title}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm text-[var(--focus-work-text-muted)]">
              {subtitle ? <span className="font-medium">{subtitle}</span> : null}
              {(currentItem?.meta ?? []).map((meta) => (
                <span key={meta.label} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${metaClass(meta.tone)}`}>
                  <BarChart3 className="h-3.5 w-3.5" />
                  {meta.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {error || localError ? <p className="mb-4 text-sm text-[var(--focus-work-rose-text)]">{error ?? localError}</p> : null}

        {loading ? <p className="text-sm text-[var(--focus-work-text-muted)]">复习题加载中...</p> : null}

        {!loading && !currentItem ? (
          <div className="flex h-full w-full items-center justify-center p-8">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)]">
                <Trophy className="h-8 w-8" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-[var(--focus-work-text)]">{emptyTitle}</h2>
              <p className="mt-2 text-sm text-[var(--focus-work-text-muted)]">{emptyDescription}</p>
            </div>
          </div>
        ) : null}

        {currentItem ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            {currentItem.material ? (
              <article aria-label="阅读原文" className="flex min-h-0 flex-1 flex-col rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-6 shadow-sm lg:p-8">
                <div className="mb-5 flex shrink-0 items-center justify-between gap-4 border-b border-[var(--focus-work-border)] pb-4">
                  <h2 className="flex items-center gap-2.5 text-xl font-bold text-[var(--focus-work-text)] font-serif lg:text-2xl">
                    <BookOpen className="h-5.5 w-5.5 text-[var(--focus-work-blue-text)]" />
                    {currentItem.material.title}
                  </h2>
                </div>
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-3">
                  {currentItem.material.paragraphs.map((paragraph) => (
                    <p key={paragraph.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-6 text-[1.02rem] leading-8 text-[var(--focus-work-text)] lg:text-[1.08rem] lg:leading-9">
                      <span className="select-none text-left text-base font-bold text-[var(--focus-work-text)]">{paragraph.label}</span>
                      <span className="font-serif tracking-normal">{paragraph.text}</span>
                    </p>
                  ))}
                </div>
              </article>
            ) : null}

            <section className="rounded-3xl border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-[var(--focus-work-text)] font-serif">Current Question</h2>
                      {statusLabel ? <div className="mt-1 text-xs text-[var(--focus-work-text-muted)] font-medium">{statusLabel}</div> : null}
                    </div>
                  </div>
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-soft)] px-4 py-1 text-sm font-semibold text-[var(--focus-work-text)]">
                    {currentItem.numberLabel}
                  </div>
                  <div className="z-10 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      disabled={disabled || submitting || !selected || !!result}
                      className="inline-flex rounded-lg bg-[var(--focus-work-blue-text)] px-4 py-1.5 text-xs font-semibold text-[var(--focus-work-primary-button-text)] shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? '提交中...' : '提交答案'}
                    </button>
                    {result ? (
                      <button
                        type="button"
                        disabled={disabled || loadingNext}
                        onClick={() => void handleLoadNext()}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] px-2.5 py-1.5 text-xs font-semibold text-[var(--focus-work-blue-text)] transition hover:bg-[var(--focus-work-blue-bg)] disabled:pointer-events-none disabled:opacity-30"
                      >
                        {loadingNext ? '加载中...' : '下一题'}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-base font-bold leading-6 text-[var(--focus-work-text)] lg:text-[1.05rem] lg:leading-7">{currentItem.stem}</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {currentItem.options.map((option) => {
                      const isSelected = selected === option.key;
                      const isCorrect = result?.correctOptionKey === option.key;
                      let btnStyle = 'border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)] text-[var(--focus-work-text)] hover:border-[var(--focus-work-blue-border)] hover:bg-[var(--focus-work-blue-bg)]';
                      let badgeStyle = 'bg-[var(--focus-work-blue-bg)] text-[var(--focus-work-blue-text)] border-[var(--focus-work-blue-border)]';
                      if (result) {
                        if (isCorrect) {
                          btnStyle = 'border-[var(--focus-work-emerald-border)] bg-[var(--focus-work-emerald-bg)] text-[var(--focus-work-emerald-text)] shadow-sm';
                          badgeStyle = 'bg-[var(--focus-work-emerald-text)] text-[var(--focus-work-primary-button-text)] border-transparent';
                        } else if (isSelected) {
                          btnStyle = 'border-[var(--focus-work-rose-border)] bg-[var(--focus-work-rose-bg)] text-[var(--focus-work-rose-text)] shadow-sm';
                          badgeStyle = 'bg-[var(--focus-work-rose-text)] text-[var(--focus-work-primary-button-text)] border-transparent';
                        } else {
                          btnStyle = 'border-[var(--focus-work-border)] bg-[var(--focus-work-surface-raised)]/40 text-[var(--focus-work-text-faint)] opacity-60';
                          badgeStyle = 'bg-[var(--focus-work-surface-soft)] text-[var(--focus-work-text-faint)] border-[var(--focus-work-border)]';
                        }
                      } else if (isSelected) {
                        btnStyle = 'border-[var(--focus-work-blue-border-hover)] bg-[var(--focus-work-blue-bg-hover)] text-[var(--focus-work-text)] shadow-sm';
                        badgeStyle = 'bg-[var(--focus-work-blue-text)] text-[var(--focus-work-primary-button-text)] border-transparent';
                      }
                      return (
                        <button
                          key={option.key}
                          type="button"
                          disabled={disabled || !!result}
                          onClick={() => setSelected(option.key)}
                          className={`flex min-h-[2.5rem] items-center gap-4 rounded-xl border px-4 py-1.5 text-left text-sm transition ${btnStyle}`}
                        >
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-sm font-semibold transition ${badgeStyle}`}>{option.key}</span>
                          <span className="font-medium">{option.text}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run template tests to verify pass**

Run:

```bash
cd frontend && pnpm test -- ChoiceQuestionFocusTemplate.test.tsx --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/focus-work/templates/ChoiceQuestionFocusTemplate.tsx frontend/src/components/focus-work/templates/ChoiceQuestionFocusTemplate.test.tsx
git commit -m "feat(focus-work): add choice question template"
```

## Task 3: Migrate ERC Review to the Template

**Files:**
- Modify: `frontend/src/components/ERC/ERCReviewFocusWork.tsx`
- Modify: `frontend/src/components/ERC/ERCReviewFocusWork.test.tsx`
- Modify: `frontend/src/pages/ERC/__tests__/Review.test.tsx`

- [ ] **Step 1: Update ERC Review tests for adapter responsibilities**

Edit `frontend/src/components/ERC/ERCReviewFocusWork.test.tsx` to keep existing tests and add this test:

```tsx
  it('submits through ERC API and shows the next-question action after feedback', async () => {
    const user = userEvent.setup();
    fetchERCReviewNext.mockResolvedValue(dueQuestion());
    submitERCReview.mockResolvedValue({
      question_id: 'kaoyan2_2025_text2_q26',
      chosen_option: 'A',
      correct_option: 'B',
      is_correct: false,
      rating: 'again',
      next_review_at: null,
    });

    render(
      <MemoryRouter>
        <ERCReviewFocusWork
          run={reviewRun}
          disabled={false}
          onContentCompleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Context paragraph.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'AA1' }));
    await user.click(screen.getByRole('button', { name: '提交答案' }));

    await waitFor(() => {
      expect(submitERCReview).toHaveBeenCalledWith('kaoyan2_2025_text2_q26', 'A');
    });
    expect(await screen.findByRole('button', { name: '下一题' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run ERC review tests to verify current failure after planned assertions**

Run:

```bash
cd frontend && pnpm test -- ERCReviewFocusWork.test.tsx --maxWorkers=1
```

Expected: PASS before migration or FAIL only if the new assertion exposes a behavior difference. Keep the result as baseline.

- [ ] **Step 3: Replace ERC Review UI with adapter mapping**

Modify `frontend/src/components/ERC/ERCReviewFocusWork.tsx` so the top imports and component body follow this structure:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchERCArticle, fetchERCArticles, fetchERCMistakes, fetchERCReviewNext, submitERCReview } from '../../lib/erc/api';
import type { ERCArticleDetail, ERCArticleListItem, ERCQuestion, ERCReviewNext } from '../../lib/erc/types';
import type { FocusWorkRendererProps } from '../focus-work/focusWorkTypes';
import ChoiceQuestionFocusTemplate from '../focus-work/templates/ChoiceQuestionFocusTemplate';
import type { ChoiceQuestionItem } from '../focus-work/templates/choiceQuestionTypes';

type OptionKey = 'A' | 'B' | 'C' | 'D';
type ERCReviewFocusWorkProps = FocusWorkRendererProps;

export default function ERCReviewFocusWork({
  run,
  disabled,
  onContentCompleted,
}: ERCReviewFocusWorkProps) {
  const targetQuestionCount = questionTargetCountFromRun(run);
  const [item, setItem] = useState<ChoiceQuestionItem | null>(null);
  const [subtitle, setSubtitle] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const answeredQuestionIdsRef = useRef<Set<string>>(new Set());
  const [answeredCount, setAnsweredCount] = useState(0);

  const loadNextReviewItem = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await resolveReviewItem(run, answeredQuestionIdsRef.current);
      const nextItem = reviewNextToChoiceQuestion(payload);
      setItem(nextItem);
      setSubtitle(reviewNextSubtitle(payload));
      setError(null);
      return nextItem;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '复习题加载失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void resolveReviewItem(run, answeredQuestionIdsRef.current)
      .then((payload) => {
        if (cancelled) return;
        setItem(reviewNextToChoiceQuestion(payload));
        setSubtitle(reviewNextSubtitle(payload));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '复习题加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [run]);

  return (
    <ChoiceQuestionFocusTemplate
      title="ERC REVIEW"
      subtitle={subtitle}
      statusLabel="复习题"
      item={item}
      loading={loading}
      error={error}
      emptyTitle="暂无可复习内容"
      emptyDescription="当前没有可用的 ERC 复习内容。"
      answeredCount={answeredCount}
      targetCount={targetQuestionCount}
      disabled={disabled}
      onLoadNext={loadNextReviewItem}
      onContentCompleted={onContentCompleted}
      onSubmitAnswer={async (choiceItem, optionKey) => {
        const result = await submitERCReview(choiceItem.id, optionKey as OptionKey);
        answeredQuestionIdsRef.current.add(choiceItem.id);
        setAnsweredCount((count) => count + 1);
        setError(null);
        return {
          correctOptionKey: result.correct_option,
          progressSnapshot: {
            answered_count: answeredCount + 1,
            target_question_count: targetQuestionCount,
          },
        };
      }}
    />
  );
}
```

Keep `questionTargetCountFromRun`, `resolveReviewItem`, `resolveExtraReviewItem`, `resolveMistakeReviewItem`, `sortReviewArticles`, `selectQuestion`, `reviewItemFromArticle`, `emptyReviewItem`, `articleFiltersFromRun`, and `stringConfig` below the component. Add this mapper near those helpers:

```tsx
function reviewNextToChoiceQuestion(payload: ERCReviewNext): ChoiceQuestionItem | null {
  if (!payload.has_item || !payload.question) return null;
  return {
    id: payload.question.question_id,
    numberLabel: `Q${payload.question.question_no}`,
    stem: payload.question.stem,
    options: (Object.keys(payload.question.options) as OptionKey[]).map((key) => ({
      key,
      text: payload.question?.options[key] ?? '',
    })),
    material: {
      title: 'Reading Passage',
      paragraphs: payload.paragraphs.map((paragraph) => ({
        id: String(paragraph.paragraph_no),
        label: String(paragraph.paragraph_no),
        text: paragraph.text,
      })),
    },
    meta: [
      { label: '预计用时：自适应' },
      { label: '错题复习' },
    ],
  };
}

function reviewNextSubtitle(payload: ERCReviewNext): string | undefined {
  if (!payload.article) return undefined;
  return `${payload.article.year} 年 Text ${payload.article.text_no} · ${payload.article.title || 'Untitled Article'}`;
}
```

- [ ] **Step 4: Run ERC review tests**

Run:

```bash
cd frontend && pnpm test -- ERCReviewFocusWork.test.tsx Review.test.tsx --maxWorkers=1
```

Expected: PASS. If `Review.test.tsx` fails because loading text or label placement changed, update only assertions tied to the extracted UI, keeping behavior checks intact.

- [ ] **Step 5: Run TypeScript check**

Run:

```bash
cd frontend && pnpm check
```

Expected: PASS. If TypeScript reports `React` type issues, import `type React` in `choiceQuestionTypes.ts` and verify `jsx` settings are unchanged.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ERC/ERCReviewFocusWork.tsx frontend/src/components/ERC/ERCReviewFocusWork.test.tsx frontend/src/pages/ERC/__tests__/Review.test.tsx
git commit -m "refactor(focus-work): migrate erc review to choice template"
```

## Task 4: Register Template Documentation and Run Full Frontend Verification

**Files:**
- Modify: `docs/frontend-ui-unification.md`

- [ ] **Step 1: Register the reusable template in UI unification docs**

Add a row to the Component Assets table in `docs/frontend-ui-unification.md`:

```markdown
| `ChoiceQuestionFocusTemplate` | `frontend/src/components/focus-work/templates/ChoiceQuestionFocusTemplate.tsx` | Sub-application focus-work surfaces that need a reading/material area plus one current choice question with submit/feedback/next flow. | Rebuilding A/B/C/D option state, submit locking, or focus-work question card styling inside each sub-app. |
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
cd frontend && pnpm test -- ChoiceQuestionFocusTemplate.test.tsx ERCReviewFocusWork.test.tsx Review.test.tsx --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 3: Run full frontend typecheck**

Run:

```bash
cd frontend && pnpm check
```

Expected: PASS.

- [ ] **Step 4: Run full frontend test suite**

Run:

```bash
cd frontend && pnpm test -- --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 5: Browser smoke test ERC review**

In the in-app browser, open:

```text
http://localhost:5173/#/erc/review
```

Verify:

- `ERC REVIEW` is visible.
- Reading passage is visible and labelled `阅读原文`.
- Current question card is visible.
- Choosing an option enables `提交答案`.
- Submitting shows `下一题`.
- The page does not show task business controls inside the content component.

- [ ] **Step 6: Commit docs and verification note**

```bash
git add docs/frontend-ui-unification.md
git commit -m "docs(frontend): register choice question focus template"
```

## Self-Review

Spec coverage:

- `ChoiceQuestionFocusTemplate` is created in Task 2.
- ERC Review migrates to adapter form in Task 3.
- Template remains content-only; `FocusWorkProvider` and backend run lifecycle are untouched.
- Tests cover rendering, submit disabled state, submission, result lock, next question reset, empty completion, paused interactions, and ERC adapter submission.
- UI unification docs are updated in Task 4.

Placeholder scan:

- No incomplete placeholders are intentionally left in this plan.

Type consistency:

- `ChoiceQuestionItem`, `ChoiceQuestionSubmitResult`, and `ChoiceQuestionFocusTemplateProps` names match across Task 1, Task 2, and Task 3.
- ERC mapper uses `ChoiceQuestionItem.id` as the ERC question id, which matches `submitERCReview(questionId, optionKey)`.
