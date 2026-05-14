import type React from 'react';

export type FocusWorkType = 'vocab_today' | 'erc_review';
export type FocusWorkResult = 'completed' | 'interrupted' | 'abandoned';
export type FocusWorkDisplayState = 'fullscreen' | 'minimized' | 'closed';

export type FocusWorkStartDetail = {
  focusWorkType: FocusWorkType;
};

export type FocusWorkRendererProps = {
  recordFocus: boolean;
  onComplete: (progressSnapshot?: Record<string, unknown>) => void;
  onInterrupt: (progressSnapshot?: Record<string, unknown>) => void;
  onAbandon: (progressSnapshot?: Record<string, unknown>) => void;
};

export type FocusWorkDefinition = {
  type: FocusWorkType;
  title: string;
  subtitle: string;
  render: (props: FocusWorkRendererProps) => React.ReactNode;
};

export type FocusWorkSnapshot = {
  state: 'normal' | 'focus' | 'break';
  active_focus_work_type?: FocusWorkType | null;
  focus_work_display_state?: FocusWorkDisplayState | null;
  record_focus?: boolean;
};

export const FOCUS_WORK_LABELS: Record<FocusWorkType, string> = {
  vocab_today: '背单词',
  erc_review: 'ERC 复习',
};

export const START_FOCUS_WORK_EVENT = 'ark:start-focus-work';
