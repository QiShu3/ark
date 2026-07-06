import type React from 'react';

export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy';

export type FlashcardMeta = {
  label: string;
  tone?: 'default' | 'blue' | 'amber' | 'emerald';
  // FSRS 状态(可选,仅 FSRS 模式下提供)
  fsrsStage?: 'new' | 'learning' | 'review';
  dueLabel?: string;
};

export type FlashcardItem = {
  id: string;
  front: React.ReactNode;
  back: React.ReactNode;
  meta?: FlashcardMeta[];
};

export type FlashcardSubmitResult = {
  shouldRepeat?: boolean;
  progressSnapshot?: Record<string, unknown>;
  // ISO 字符串或 null;FSRS 模式下由后端返回新的 due_at
  nextDueAt?: string | null;
};

export type FlashcardFocusTemplateProps = {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  item: FlashcardItem | null;
  loading: boolean;
  error: string | null;
  emptyTitle: string;
  emptyDescription: string;
  completedCount: number;
  targetCount?: number | null;
  completeOnEmpty?: boolean;
  batchNumber?: number;
  totalBatches?: number;
  disabled: boolean;
  onSubmitRating: (item: FlashcardItem, rating: FlashcardRating) => Promise<FlashcardSubmitResult>;
  onLoadNext: () => Promise<FlashcardItem | null>;
  onContentCompleted: (progressSnapshot?: Record<string, unknown>) => void;
};
