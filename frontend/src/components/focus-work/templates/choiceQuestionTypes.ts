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
