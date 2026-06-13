import type React from 'react';

export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy';

export type FlashcardItem = {
  id: string;
  front: React.ReactNode;
  back: React.ReactNode;
  meta?: Array<{ label: string; tone?: 'default' | 'blue' | 'amber' | 'emerald' }>;
};

export type FlashcardSubmitResult = {
  shouldRepeat?: boolean;
  progressSnapshot?: Record<string, unknown>;
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
  targetCount: number;
  batchNumber?: number;
  totalBatches?: number;
  disabled: boolean;
  onSubmitRating: (item: FlashcardItem, rating: FlashcardRating) => Promise<FlashcardSubmitResult>;
  onLoadNext: () => Promise<FlashcardItem | null>;
  onContentCompleted: (progressSnapshot?: Record<string, unknown>) => void;
};
