import type React from 'react';

import type { ContentBlockData } from '../ContentBlockRenderer';

export type InputQuestionMode = 'fill' | 'subjective';

export type InputParagraph = {
  id: string;
  label?: string;
  text: React.ReactNode;
};

export type InputArticleItem = {
  id: string;
  title: string;
  paragraphs: InputParagraph[];
  materialBlocks?: ContentBlockData[];
  questions: InputQuestionItem[];
};

export type InputQuestionItem = {
  id: string;
  numberLabel: string;
  stem: React.ReactNode;
  stemBlocks?: ContentBlockData[];
  inputConfig: {
    placeholder?: string;
    maxCharacters?: number;
    lines?: number;
  };
  mode: InputQuestionMode;
  acceptedAnswers?: string[];
  matchRule?: 'exact' | 'contains' | 'regex';
  caseSensitive?: boolean;
  rubric?: string;
  referenceAnswer?: string;
  explanationBlocks?: ContentBlockData[];
  meta?: { label: string; tone?: 'blue' | 'amber' | 'emerald' }[];
};

export type InputSubmitResult = {
  correct?: boolean;
  acceptedAnswers?: string[];
  score?: number;
  feedback?: string;
  feedbackBlocks?: ContentBlockData[];
  explanationBlocks?: ContentBlockData[];
  progressSnapshot?: Record<string, unknown>;
};

export type InputQuestionFocusTemplateProps = {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  article: InputArticleItem | null;
  currentQuestion: InputQuestionItem | null;
  loading: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  answeredCount: number;
  targetCount: number;
  disabled: boolean;
  onSubmitAnswer(question: InputQuestionItem, userInput: string): Promise<InputSubmitResult>;
  onLoadNext(): { article: InputArticleItem; question: InputQuestionItem } | null;
  onContentCompleted(progressSnapshot?: Record<string, unknown>): void;
};
