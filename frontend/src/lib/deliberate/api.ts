import { apiFetch, apiJson } from '../api';

export type DeliberateKind = 'flash_card' | 'choice' | 'input';
export type DeliberateFocusWorkType = 'flash_card' | 'choice' | 'input';
export type DeliberateRunStatus = 'started' | 'content_completed' | 'completed' | 'abandoned';
export type PrimaryFilter = 'all' | 'unstarted' | 'mistake' | 'last_wrong' | 'due_review';
export type SortOrder = 'sequential' | 'due' | 'mistake_first' | 'random';
export type BackflowRule = 'none' | 'wrong_to_end' | 'wrong_retry';

export type SchedulingMode = 'manual' | 'fsrs';

export interface FsrsConfig {
  desired_retention: number;
  max_interval_days: number;
  learning_steps?: number[] | null;
}

export type DeliberateBankSummary = {
  id: string;
  name: string;
  kind: DeliberateKind;
  item_count: number;
  question_count: number;
};

export type DeliberateBankOption = {
  id: string;
  name: string;
  kind: DeliberateKind;
  count: number;
  item_count: number;
  question_count: number;
};

export type DeliberateWorkflowRun = {
  id: string;
  config_id?: string | null;
  workflow_id?: string | null;
  focus_run_id?: string | null;
  focus_work_type: DeliberateFocusWorkType;
  bank_id?: string | null;
  snapshot_id?: string | null;
  snapshot_type?: 'choice_set' | 'vocab_deck' | 'input_set' | null;
  status: DeliberateRunStatus;
  progress_snapshot: Record<string, unknown>;
  config_snapshot?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};

export type DeliberateWorkflowConfig = {
  id: string;
  name: string;
  kind: DeliberateKind;
  focus_work_type: DeliberateFocusWorkType;
  bank_id?: string | null;
  task_id?: string | null;
  target_count: number;
  scope: Record<string, unknown>;
  completion: Record<string, unknown>;
  pass_criteria: Record<string, unknown>;
  children: DeliberateWorkflowChild[];
  primary_filter: PrimaryFilter;
  sort_order: SortOrder;
  use_fsrs: boolean;
  scheduling_mode: SchedulingMode;
  fsrs_config: FsrsConfig | null;
  backflow_rule: BackflowRule;
  bank_summary?: DeliberateBankSummary | null;
  latest_run?: DeliberateWorkflowRun | null;
  created_at: string;
  updated_at: string;
};

export type DeliberateWorkflowChild = {
  config_id: string;
  label: string;
  is_recommended: boolean;
};

export type DeliberateWorkflowPayload = {
  name: string;
  kind: DeliberateKind;
  focus_work_type: DeliberateFocusWorkType;
  bank_id?: string | null;
  task_id?: string | null;
  target_count: number;
  scope?: Record<string, unknown>;
  completion?: Record<string, unknown>;
  pass_criteria?: Record<string, unknown>;
  children?: DeliberateWorkflowChild[];
  primary_filter?: PrimaryFilter;
  sort_order?: SortOrder;
  use_fsrs?: boolean;
  scheduling_mode?: SchedulingMode;
  fsrs_config?: FsrsConfig;
  backflow_rule?: BackflowRule;
};

export type DeliberateWorkflowPatch = {
  name?: string;
  kind?: DeliberateKind;
  focus_work_type?: DeliberateFocusWorkType;
  bank_id?: string | null;
  task_id?: string | null;
  target_count?: number;
  scope?: Record<string, unknown>;
  completion?: Record<string, unknown>;
  pass_criteria?: Record<string, unknown>;
  children?: DeliberateWorkflowChild[];
  primary_filter?: PrimaryFilter;
  sort_order?: SortOrder;
  use_fsrs?: boolean;
  scheduling_mode?: SchedulingMode;
  fsrs_config?: FsrsConfig;
  backflow_rule?: BackflowRule;
};

export type DeliberateBankUploadResult = {
  bank_id: string;
  kind: DeliberateKind;
  name: string;
  item_count: number;
  question_count: number;
  validation_summary: Record<string, unknown>;
};

export type DeliberateUploadError = {
  message: string;
  errors: string[];
};

export function listDeliberateWorkflows() {
  return apiJson<DeliberateWorkflowConfig[]>('/api/deliberate-workflows');
}

export function listDeliberateBanks(kind: DeliberateKind) {
  return apiJson<DeliberateBankOption[]>(`/api/deliberate-workflows/banks?kind=${encodeURIComponent(kind)}`);
}

export function deleteDeliberateBank(bankId: string, kind: DeliberateKind) {
  return apiJson<{ detail: string }>(`/api/deliberate-workflows/banks/${encodeURIComponent(bankId)}?kind=${encodeURIComponent(kind)}`, {
    method: 'DELETE',
  });
}

export type BankPreviewQuestion = {
  id: string;
  question_id: string;
  stem: string;
  type: string;
  options: Record<string, string> | null;
  answer: string;
  subject: string;
};

export type BankPreviewData = {
  bank_id: string;
  name: string;
  kind: DeliberateKind;
  total_count: number;
  subjects: string[];
  questions: BankPreviewQuestion[];
};

export type BankQuestionsResponse = BankPreviewData & {
  page: number;
  limit: number;
};

export function fetchBankPreview(bankId: string) {
  return apiJson<BankPreviewData>(`/api/deliberate-workflows/banks/${encodeURIComponent(bankId)}/preview`);
}

export function fetchBankQuestions(bankId: string, params: { page?: number; limit?: number; search?: string } = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.search) searchParams.set('search', params.search);
  const qs = searchParams.toString();
  return apiJson<BankQuestionsResponse>(
    `/api/deliberate-workflows/banks/${encodeURIComponent(bankId)}/questions${qs ? `?${qs}` : ''}`
  );
}

export function createDeliberateWorkflow(payload: DeliberateWorkflowPayload) {
  return apiJson<DeliberateWorkflowConfig>('/api/deliberate-workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function patchDeliberateWorkflow(configId: string, payload: DeliberateWorkflowPatch) {
  return apiJson<DeliberateWorkflowConfig>(`/api/deliberate-workflows/${encodeURIComponent(configId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteDeliberateWorkflow(configId: string) {
  return apiJson<{ detail: string }>(`/api/deliberate-workflows/${encodeURIComponent(configId)}`, {
    method: 'DELETE',
  });
}

export function listDeliberateRuns(configId: string) {
  return apiJson<DeliberateWorkflowRun[]>(`/api/deliberate-workflows/${encodeURIComponent(configId)}/runs`);
}

export function startDeliberateWorkflow(configId: string) {
  return apiJson('/todo/focus/workflow/start-deliberate-workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config_id: configId }),
  });
}

export function getDeliberateRun(runId: string) {
  return apiJson<DeliberateWorkflowRun>(`/api/deliberate-runs/${encodeURIComponent(runId)}`);
}

export function forkFocusWorkRun(params: {
  parent_run_id: string;
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

export async function uploadDeliberateBank(params: {
  kind: DeliberateKind;
  name: string;
  description: string;
  file: File;
}): Promise<DeliberateBankUploadResult> {
  const form = new FormData();
  form.append('kind', params.kind);
  form.append('name', params.name);
  form.append('description', params.description);
  form.append('file', params.file);
  const res = await apiFetch('/api/deliberate-workflows/banks', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail = data && typeof data === 'object' ? (data as { detail?: unknown }).detail : null;
    if (detail && typeof detail === 'object') {
      const rich = detail as { message?: unknown; errors?: unknown };
      const uploadError: DeliberateUploadError = {
        message: typeof rich.message === 'string' ? rich.message : `HTTP ${res.status}`,
        errors: Array.isArray(rich.errors) ? rich.errors.map(String) : [],
      };
      throw uploadError;
    }
    const uploadError: DeliberateUploadError = {
      message: typeof detail === 'string' ? detail : `HTTP ${res.status}`,
      errors: [],
    };
    throw uploadError;
  }
  return res.json() as Promise<DeliberateBankUploadResult>;
}
