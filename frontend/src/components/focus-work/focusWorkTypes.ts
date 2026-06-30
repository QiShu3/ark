import type React from 'react';
import type { AppTaskId, AppTaskType } from '../taskTypes';
import type { WorkflowSnapshot } from '../workflowProgress';

export type FocusWorkType = 'vocab_today' | 'review' | 'practice' | 'task_focus' | 'input';
export type FocusWorkResult = 'completed' | 'interrupted' | 'abandoned';
export type FocusWorkDisplayState = 'fullscreen' | 'minimized' | 'closed';

export type FocusWorkStartDetail = {
  focusWorkType: FocusWorkType;
  bankId?: string;
};

export type FocusWorkRunStatus = 'running' | 'paused' | 'content_completed' | 'completed' | 'abandoned';
export type FocusPhaseRuntimeState =
  | 'running_run'
  | 'counted_run_completed_confirming'
  | 'extra_run_completed'
  | 'task_already_completed'
  | 'phase_time_expired_prompt'
  | 'pending_task_selection'
  | 'break_running'
  | 'workflow_settlement';

export type FocusWorkRunSummary = {
  id: string;
  workflow_id: string;
  phase_index: number;
  task_id?: string | null;
  focus_work_type: FocusWorkType;
  app_id?: AppTaskId | null;
  app_task_type?: AppTaskType | null;
  counts_for_task_completion: boolean;
  status: FocusWorkRunStatus;
  progress_snapshot?: Record<string, unknown> | null;
  config_snapshot?: Record<string, unknown> | null;
  completion_reason?: string | null;
  source_run_id?: string | null;
};

export type WorkflowSettlementPhase = {
  name: string;
  focus_work_type: FocusWorkType;
  answered_count: number;
  correct_count: number;
  accuracy: number | null;
  duration_seconds: number;
};

export type WorkflowSettlement = {
  workflow_name: string;
  phases: WorkflowSettlementPhase[];
  total_phases: number;
  total_answered: number;
  total_correct: number;
  total_accuracy: number | null;
  total_duration_seconds: number;
};

export type FocusWorkRendererProps = {
  run: FocusWorkRunSummary;
  disabled: boolean;
  onContentCompleted: (progressSnapshot?: Record<string, unknown>) => void;
};

export type FocusWorkDefinition = {
  type: FocusWorkType;
  title: string;
  subtitle: string;
  render: (props: FocusWorkRendererProps) => React.ReactNode;
};

export type FocusWorkSnapshot = WorkflowSnapshot & {
  phase_runtime_state?: FocusPhaseRuntimeState | null;
  phase_runtime_state_before_timeout_prompt?: FocusPhaseRuntimeState | null;
  active_run_id?: string | null;
  active_run?: FocusWorkRunSummary | null;
  workflow_settlement?: WorkflowSettlement | null;
};


export const START_FOCUS_WORK_EVENT = 'ark:start-focus-work';
