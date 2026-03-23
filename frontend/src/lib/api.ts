import { useAuthStore } from './auth';

async function _parseErrorDetail(res: Response): Promise<string | null> {
  const data: unknown = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') return null;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    if (first && typeof first === 'object') {
      const firstObj = first as { type?: unknown; loc?: unknown; ctx?: unknown; msg?: unknown };
      const type = typeof firstObj.type === 'string' ? firstObj.type : null;
      const loc = Array.isArray(firstObj.loc) ? firstObj.loc : [];
      const field = typeof loc[loc.length - 1] === 'string' ? (loc[loc.length - 1] as string) : null;
      const ctx = firstObj.ctx && typeof firstObj.ctx === 'object' ? (firstObj.ctx as { min_length?: unknown }) : null;
      const minLen = ctx && typeof ctx.min_length === 'number' ? ctx.min_length : null;
      if (type === 'string_too_short' && typeof minLen === 'number' && field) {
        if (field === 'username') return `用户名至少 ${minLen} 位`;
        if (field === 'password') return `密码至少 ${minLen} 位`;
      }
      if (typeof firstObj.msg === 'string') return firstObj.msg;
    }
  }
  return null;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (res.status === 401) {
    useAuthStore.getState().clear();
    if (!window.location.hash.startsWith('#/login')) window.location.hash = '#/login';
  }
  if (!res.ok) {
    const detail = await _parseErrorDetail(res);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * SSE 流式请求辅助函数。
 * 使用 fetch + ReadableStream 消费 SSE data: 行，每解析一个 JSON 对象调用一次 onEvent。
 */
export async function apiSSE(
  path: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 401) {
    useAuthStore.getState().clear();
    if (!window.location.hash.startsWith('#/login')) window.location.hash = '#/login';
    throw new Error('未登录');
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('无法读取 SSE 流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed.startsWith('data:')) {
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const parsed = JSON.parse(jsonStr);
          onEvent(parsed);
        } catch {
          // ignore malformed JSON
        }
      }
    }
  }
}

export interface CheckInStatus {
  is_checked_in_today: boolean;
  current_streak: number;
  total_days: number;
  checked_dates: string[];
}

export async function checkIn(): Promise<void> {
  await apiJson('/api/checkin', { method: 'POST' });
}

export async function getCheckInStatus(): Promise<CheckInStatus> {
  return apiJson<CheckInStatus>('/api/checkin/status');
}
