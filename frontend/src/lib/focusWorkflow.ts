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
