import type React from 'react';
import type { AppTaskId, AppTaskType, TaskSourceType } from '../taskTypes';

export type FocusWorkType = 'vocab_today' | 'erc_review' | 'task_focus';
export type FocusWorkResult = 'completed' | 'interrupted' | 'abandoned';
export type FocusWorkDisplayState = 'fullscreen' | 'minimized' | 'closed';

export type FocusWorkStartDetail = {
  focusWorkType: FocusWorkType;
};

export type FocusWorkRendererProps = {
  workflow: FocusWorkSnapshot;
  recordFocus: boolean;
  onComplete: (progressSnapshot?: Record<string, unknown>) => void;
  onCompleteTaskAndFinish?: () => void;
  onPause?: () => void;
  onResume?: () => void;
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
  task_id?: string | null;
  task_title?: string | null;
  current_phase_index?: number | null;
  phases?: Array<Record<string, unknown>>;
  pending_confirmation?: boolean;
  pending_task_selection?: boolean;
  remaining_seconds?: number | null;
  elapsed_seconds?: number | null;
  active_focus_work_type?: FocusWorkType | null;
  focus_work_display_state?: FocusWorkDisplayState | null;
  is_paused?: boolean;
  record_focus?: boolean;
  active_task_source_type?: TaskSourceType | null;
  active_task_app_id?: AppTaskId | null;
  active_task_app_task_type?: AppTaskType | null;
  active_task_app_config_id?: string | null;
};

export const FOCUS_WORK_LABELS: Record<FocusWorkType, string> = {
  vocab_today: '背单词',
  erc_review: 'ERC 复习',
  task_focus: '任务专注',
};

export const START_FOCUS_WORK_EVENT = 'ark:start-focus-work';
