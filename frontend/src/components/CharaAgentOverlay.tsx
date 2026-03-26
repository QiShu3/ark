import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Send, ShieldAlert, Sparkles } from 'lucide-react';

import { AgentActionResponse, executeAgentAction, listAgentProfiles } from '../lib/agent';
import { apiSSE } from '../lib/api';

type OverlayStatus = 'idle' | 'streaming' | 'completed' | 'error';

type ChatStreamEvent =
  | { type: 'message_delta'; delta?: string }
  | { type: 'approval_required'; approval?: AgentActionResponse | null }
  | { type: 'done'; reply?: string; approval?: AgentActionResponse | null; suggestions?: string[] }
  | { type: 'error'; message?: string };

const FALLBACK_SUGGESTIONS = ['帮我拆成下一步', '换个角度再建议一次', '说得更具体一点'];

function resolveSuggestions(items: string[] | undefined): string[] {
  const cleaned = (items || []).map((item) => item.trim()).filter(Boolean);
  if (cleaned.length >= 3) return cleaned.slice(0, 3);
  const merged = [...cleaned];
  for (const item of FALLBACK_SUGGESTIONS) {
    if (!merged.includes(item)) merged.push(item);
    if (merged.length >= 3) break;
  }
  return merged.slice(0, 3);
}

function resolveDashboardProfileId(items: Awaited<ReturnType<typeof listAgentProfiles>>): string | null {
  const dashboardProfiles = items.filter((item) => item.primary_app_id === 'dashboard');
  if (!dashboardProfiles.length) return null;
  return dashboardProfiles.find((item) => item.is_default)?.id || dashboardProfiles[0]?.id || null;
}

const CharaAgentOverlay: React.FC = () => {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState('');
  const [status, setStatus] = useState<OverlayStatus>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [approval, setApproval] = useState<AgentActionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfiles() {
      try {
        const profiles = await listAgentProfiles();
        if (!active) return;
        const nextProfileId = resolveDashboardProfileId(profiles);
        setProfileId(nextProfileId);
        if (!nextProfileId) {
          setStatus('error');
          setError('还没有可用的 Dashboard Agent，请先去 Agent 页面创建或设置默认 dashboard profile。');
        }
      } catch (err) {
        if (!active) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : '加载 Dashboard Agent 失败');
      }
    }

    void loadProfiles();
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || !profileId || status === 'streaming') return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('streaming');
    setSubtitle('');
    setSuggestions([]);
    setApproval(null);
    setError(null);
    setInput('');

    try {
      await apiSSE(
        '/api/chat/stream',
        {
          profile_id: profileId,
          message: trimmed,
          history: [],
          scope: 'dashboard_chara',
        },
        (rawEvent) => {
          const event = rawEvent as ChatStreamEvent;
          if (event.type === 'message_delta' && typeof event.delta === 'string') {
            setSubtitle((prev) => `${prev}${event.delta}`);
            return;
          }
          if (event.type === 'approval_required') {
            setApproval(event.approval || null);
            return;
          }
          if (event.type === 'done') {
            setSubtitle((event.reply || '').trim());
            setApproval(event.approval || null);
            setSuggestions(resolveSuggestions(event.suggestions));
            setStatus('completed');
            return;
          }
          if (event.type === 'error') {
            setStatus('error');
            setError(event.message || '发送失败');
            setSubtitle(event.message || '这轮对话没有成功。');
          }
        },
        controller.signal,
        { 'X-Ark-Session-Id': sessionIdRef.current },
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setStatus('error');
      const message = err instanceof Error ? err.message : '发送失败';
      setError(message);
      setSubtitle(message);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setStatus((prev) => (prev === 'streaming' ? 'completed' : prev));
    }
  }

  async function handleApprovalConfirm() {
    if (!approval?.commit_action || approving) return;
    setApproving(true);
    setError(null);
    try {
      const payload = approval.data && typeof approval.data === 'object' ? approval.data : {};
      const result = await executeAgentAction(approval.commit_action, payload as Record<string, unknown>, {
        primaryAppId: 'dashboard',
        sessionId: sessionIdRef.current,
      });
      if (result.type === 'forbidden') {
        throw new Error(result.reason || '当前无法执行确认');
      }
      setApproval(null);
      setSubtitle('确认已收到，操作已经执行完成。');
      setSuggestions(resolveSuggestions([]));
      setStatus('completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : '确认失败';
      setStatus('error');
      setError(message);
      setSubtitle(message);
    } finally {
      setApproving(false);
    }
  }

  const canSend = Boolean(profileId) && status !== 'streaming' && !approving;
  const showSuggestions = status === 'completed' && !approval && suggestions.length > 0;
  const showInput = !approval;
  const showSubtitle = Boolean(subtitle.trim()) || status === 'streaming';

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {showSubtitle ? (
        <div className="absolute bottom-8 left-1/2 w-[min(640px,76%)] -translate-x-1/2 rounded-[28px] border border-white/18 bg-black/38 px-6 py-4 text-center text-sm leading-7 text-white shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-md md:text-base">
          <div className="inline-flex items-center gap-2 text-cyan-100/85">
            {status === 'streaming' ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
            <span>{subtitle || '让我想一想……'}</span>
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-[8.5rem] right-6 flex w-[min(320px,48%)] flex-col items-end gap-3">
        {approval ? (
          <div className="pointer-events-auto w-full rounded-[28px] border border-amber-300/25 bg-[#101822]/90 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-400/12 p-2 text-amber-100">
                <ShieldAlert size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{approval.title || '需要确认'}</div>
                <div className="mt-2 text-sm leading-6 text-white/72">{approval.message || '这一步需要你的确认。'}</div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApproval(null)}
                className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleApprovalConfirm()}
                disabled={approving}
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/12 px-4 py-2 text-sm text-cyan-50 transition hover:bg-cyan-400/18 disabled:opacity-70"
              >
                {approving ? <LoaderCircle size={15} className="animate-spin" /> : null}
                确认
              </button>
            </div>
          </div>
        ) : null}

        {showSuggestions
          ? suggestions.map((item, index) => (
              <button
                key={`${item}-${index}`}
                type="button"
                onClick={() => void sendMessage(item)}
                disabled={!canSend}
                className="pointer-events-auto w-full rounded-full border border-white/15 bg-[#0d1622]/82 px-4 py-3 text-left text-sm text-white/88 shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-md transition hover:border-cyan-300/24 hover:bg-[#111e2c]/92 disabled:opacity-70"
              >
                {item}
              </button>
            ))
          : null}

        {showInput ? (
          <form
            className="pointer-events-auto w-full"
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
          >
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#0d1622]/88 px-3 py-2 shadow-[0_18px_60px_rgba(0,0,0,0.3)] backdrop-blur-md">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={profileId ? '想让我现在帮你什么？' : '先配置 Dashboard Agent'}
                disabled={!canSend}
                className="min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-white/38"
              />
              <button
                type="submit"
                disabled={!canSend || !input.trim()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-cyan-400/18 text-cyan-50 transition hover:bg-cyan-400/24 disabled:opacity-40"
                aria-label="发送给 Dashboard Agent"
              >
                {status === 'streaming' ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </form>
        ) : null}

        {error && status === 'error' ? (
          <div className="pointer-events-auto w-full rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 backdrop-blur-md">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CharaAgentOverlay;
