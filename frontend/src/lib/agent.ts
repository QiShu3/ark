import { apiJson } from './api';

export type AgentActionType = 'result' | 'approval_required' | 'forbidden';
export type AgentType = 'dashboard_agent' | 'app_agent:arxiv' | 'app_agent:vocab';

export type AgentActionResponse<T = unknown> = {
  type: AgentActionType;
  action_id: string;
  data?: T;
  approval_id?: string;
  title?: string;
  message?: string;
  impact?: {
    resource_type?: string;
    resource_ids?: string[];
    count?: number;
  };
  commit_action?: string;
  expires_at?: string;
  reason?: string;
};

export type AgentRequestContext = {
  agentType: AgentType;
  appId?: string;
  sessionId?: string;
  capabilities?: string[];
};

export type AgentProfile = {
  id: string;
  user_id: number;
  name: string;
  description: string;
  agent_type: AgentType;
  app_id: string | null;
  persona_prompt: string;
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
  agent_type: AgentType;
  app_id: string | null;
  persona_prompt: string;
  allowed_skills: string[];
  temperature: number;
  max_tool_loops: number | null;
  is_default: boolean;
};

function _headers(ctx: AgentRequestContext): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Ark-Agent-Type': ctx.agentType,
  };
  if (ctx.appId) headers['X-Ark-App-Id'] = ctx.appId;
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
