import { apiJson } from '../api';

export type UnifiedPoolInitResult = {
  kind: string;
  total: number;
  matched: number;
  warning: string | null;
  first_question: UnifiedQuestion | null;
  target_count: number;
};

export type UnifiedQuestion = {
  index: number;
  id: string;
  question_id: string;
  stem: string;
  options_json: Record<string, string> | null;
  answer: string;
  answered: boolean;
  backflow_count: number;
  wrong_count: number;
  right_count: number;
};

export type UnifiedNextResult = {
  question: UnifiedQuestion | null;
  done: boolean;
  message?: string;
  index?: number;
  kind?: string;
  total?: number;
  answered_count?: number;
};

export type UnifiedSubmitResult = {
  is_correct: boolean;
  next_question: UnifiedQuestion | null;
  done: boolean;
  answered_count: number;
  correct_count: number;
  total: number;
  backflow_action: string | null;
  backflow_info: string | null;
  warning: string | null;
};

export function initUnifiedPool(runId: string) {
  return apiJson<UnifiedPoolInitResult>(`/api/focus-work/unified/${encodeURIComponent(runId)}/init`, {
    method: 'POST',
  });
}

export function getUnifiedNext(runId: string) {
  return apiJson<UnifiedNextResult>(`/api/focus-work/unified/${encodeURIComponent(runId)}/next`);
}

export function submitUnifiedAnswer(
  runId: string,
  payload: { question_id: string; is_correct: boolean; time_spent_ms?: number; user_input?: string }
) {
  return apiJson<UnifiedSubmitResult>(`/api/focus-work/unified/${encodeURIComponent(runId)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
