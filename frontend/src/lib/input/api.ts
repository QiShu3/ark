import { apiFetch, apiJson } from '../api';

export type InputBankOption = {
  id: string;
  name: string;
  count: number;
};

export type InputParagraphDTO = {
  id: string;
  paragraph_no: number;
  text: string;
};

export type InputArticleDTO = {
  id: string;
  article_id: string;
  title: string;
  paragraphs: InputParagraphDTO[];
  questions: InputQuestionDTO[];
};

export type InputQuestionDTO = {
  id: string;
  question_id: string;
  question_no: number;
  stem: string;
  mode: 'fill' | 'subjective';
  input_config: Record<string, unknown>;
  accepted_answers: string[];
  match_rule: string;
  case_sensitive: boolean;
  rubric: string;
  reference_answer: string;
  explanation: string;
  sort_order: number;
};

export type InputNextDTO = {
  has_item: boolean;
  article: InputArticleDTO | null;
  current_question_index: number;
};

export type InputSubmitDTO = {
  question_id: string;
  correct?: boolean | null;
  accepted_answers?: string[];
  score?: number | null;
  feedback?: string;
  explanation?: string;
};

export type InputBankUploadResult = {
  bank_id: string;
  name: string;
  question_count: number;
  validation_summary: Record<string, unknown>;
};

export function listInputBanks() {
  return apiJson<InputBankOption[]>('/api/input/banks');
}

export function fetchInputNext(bankId: string) {
  return apiJson<InputNextDTO>(`/api/input/next?bank_id=${encodeURIComponent(bankId)}`);
}

export function submitInputAnswer(body: {
  question_id: string;
  user_input: string;
  time_spent_ms?: number;
}) {
  return apiJson<InputSubmitDTO>('/api/input/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function uploadInputBank(params: {
  name: string;
  description: string;
  file: File;
}): Promise<InputBankUploadResult> {
  const form = new FormData();
  form.append('name', params.name);
  form.append('description', params.description);
  form.append('file', params.file);
  const res = await apiFetch('/api/input/banks', { method: 'POST', body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<InputBankUploadResult>;
}
