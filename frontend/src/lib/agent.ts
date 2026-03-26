import { apiFetch, apiJson } from './api';

export type AgentActionType = 'result' | 'approval_required' | 'forbidden';

export type AgentActionResponse<T = unknown> = {
  type: AgentActionType;
  action_id: string;
  data?: T;
  title?: string;
  message?: string;
  impact?: {
    resource_type?: string;
    resource_ids?: string[];
    count?: number;
  };
  commit_action?: string;
  reason?: string;
};

export type AgentRequestContext = {
  primaryAppId: string;
  sessionId?: string;
  capabilities?: string[];
};

export type AgentApp = {
  app_id: string;
  display_name: string;
  description: string;
  default_profile_name: string;
  default_profile_description: string;
  default_context_prompt: string;
  default_skills: string[];
  allowed_skill_apps: string[];
};

export type AgentProfile = {
  id: string;
  user_id: number;
  name: string;
  description: string;
  primary_app_id: string;
  avatar_url: string | null;
  context_prompt: string;
  allowed_skills: string[];
  temperature: number;
  max_tool_loops: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentProfilePayload = {
  name: string;
  description: string;
  primary_app_id: string;
  context_prompt: string;
  allowed_skills: string[];
  temperature: number;
  max_tool_loops: number | null;
  is_default: boolean;
};

function _headers(ctx: AgentRequestContext): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Ark-Primary-App-Id': ctx.primaryAppId,
  };
  if (ctx.sessionId) headers['X-Ark-Session-Id'] = ctx.sessionId;
  if (ctx.capabilities?.length) headers['X-Ark-Capabilities'] = ctx.capabilities.join(',');
  return headers;
}

export async function executeAgentAction<T = unknown>(
  actionId: string,
  payload: Record<string, unknown>,
  ctx: AgentRequestContext,
): Promise<AgentActionResponse<T>> {
  return apiJson<AgentActionResponse<T>>(`/api/agent/actions/${actionId}`, {
    method: 'POST',
    headers: _headers(ctx),
    body: JSON.stringify({ payload }),
  });
}

export async function listAgentApps(): Promise<AgentApp[]> {
  return apiJson<AgentApp[]>('/api/agent/apps');
}

export async function listAgentProfiles(): Promise<AgentProfile[]> {
  return apiJson<AgentProfile[]>('/api/agent/profiles');
}

export async function createAgentProfile(payload: AgentProfilePayload): Promise<AgentProfile> {
  return apiJson<AgentProfile>('/api/agent/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateAgentProfile(id: string, payload: Partial<AgentProfilePayload>): Promise<AgentProfile> {
  return apiJson<AgentProfile>(`/api/agent/profiles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteAgentProfile(id: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/api/agent/profiles/${id}`, { method: 'DELETE' });
}

export async function setDefaultAgentProfile(id: string): Promise<AgentProfile> {
  return apiJson<AgentProfile>(`/api/agent/profiles/${id}/default`, { method: 'POST' });
}

export async function uploadAgentProfileAvatar(id: string, file: File): Promise<AgentProfile> {
  const form = new FormData();
  form.append('avatar', file);
  const res = await apiFetch(`/api/agent/profiles/${id}/avatar`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && typeof data === 'object' && typeof (data as { detail?: unknown }).detail === 'string') {
        detail = (data as { detail: string }).detail;
      }
    } catch {
      // noop
    }
    throw new Error(detail);
  }
  return res.json() as Promise<AgentProfile>;
}

export async function removeAgentProfileAvatar(id: string): Promise<AgentProfile> {
  return apiJson<AgentProfile>(`/api/agent/profiles/${id}/avatar`, { method: 'DELETE' });
}
