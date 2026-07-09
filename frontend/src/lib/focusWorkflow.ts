import { apiJson } from './api';
import type { WorkflowSettlement } from '../components/focus-work/focusWorkTypes';

let currentWorkflowRequest: Promise<unknown> | null = null;

export function fetchCurrentFocusWorkflow<T = unknown>(): Promise<T> {
  if (!currentWorkflowRequest) {
    currentWorkflowRequest = apiJson<T>('/todo/focus/workflow/current').finally(() => {
      currentWorkflowRequest = null;
    });
  }
  return currentWorkflowRequest as Promise<T>;
}

export function forkFocusWorkRun(params: {
  parent_run_id: string;
  child_config_id?: string;
  focus_work_type: string;
  bank_id?: string;
  scope?: Record<string, unknown>;
  completion?: Record<string, unknown>;
  pass_criteria?: Record<string, unknown>;
}) {
  return apiJson('/todo/focus/workflow/runs/fork', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export interface WorkflowRecordNode {
  id: string;
  run_id?: string;
  config_id?: string;
  name: string;
  focus_work_type?: string;
  status: string;
  accuracy?: number;
  children: WorkflowRecordNode[];
  created_at?: string;
}

export interface WorkflowRecord {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  nodes: WorkflowRecordNode[];
  status: 'running' | 'completed' | 'abandoned';
  started_at: string;
  completed_at?: string;
  created_at: string;
}

export function fetchWorkflowRecords(appId?: string | null): Promise<WorkflowRecord[]> {
  const qs = appId ? `?app_id=${encodeURIComponent(appId)}` : '';
  return apiJson<WorkflowRecord[]>(`/todo/focus/workflow/records${qs}`);
}

export function fetchWorkflowRecord(recordId: string): Promise<WorkflowRecord> {
  return apiJson<WorkflowRecord>(`/todo/focus/workflow/records/${recordId}`);
}

export function fetchWorkflowRecordSettlement(recordId: string): Promise<WorkflowSettlement> {
  return apiJson<WorkflowSettlement>(`/todo/focus/workflow/records/${recordId}/settlement`);
}

export function startMultiDeliberateWorkflow(configIds: string[]) {
  return apiJson('/todo/focus/workflow/start-multi-deliberate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config_ids: configIds }),
  });
}

export function returnToParentFocusWork(runId: string) {
  return apiJson(`/todo/focus/workflow/runs/${runId}/return-to-parent`, {
    method: 'POST',
  });
}

export function confirmWorkflowSettlement() {
  return apiJson('/todo/focus/workflow/confirm-settlement', {
    method: 'POST',
  });
}
