import { apiJson } from './api';

export type AgentActionType = 'result' | 'approval_required' | 'forbidden';

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
  agentType: 'dashboard_agent' | 'app_agent:arxiv' | 'app_agent:vocab';
  appId?: string;
  sessionId?: string;
  capabilities?: string[];
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
