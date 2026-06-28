import { apiJson } from './api';

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
  focus_work_type: string;
  bank_id?: string;
  scope?: Record<string, unknown>;
}) {
  return apiJson('/todo/focus/workflow/runs/fork', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}
