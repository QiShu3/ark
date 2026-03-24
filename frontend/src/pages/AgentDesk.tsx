import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, ChevronRight, LoaderCircle, ShieldAlert, Sparkles } from 'lucide-react';

import Navigation from '../components/Navigation';
import { AgentActionResponse, AgentRequestContext, executeAgentAction } from '../lib/agent';
import { apiJson } from '../lib/api';

type Skill = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  intent_scope: string;
  side_effect: 'read' | 'write' | 'destructive';
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatResponse = {
  reply: string;
  approval: AgentActionResponse | null;
};

const sideEffectStyles: Record<Skill['side_effect'], string> = {
  read: 'bg-emerald-500/15 text-emerald-100 border border-emerald-300/20',
  write: 'bg-blue-500/15 text-blue-100 border border-blue-300/20',
  destructive: 'bg-red-500/15 text-red-100 border border-red-300/20',
};

const AGENT_CTX: AgentRequestContext = {
  agentType: 'dashboard_agent',
};

const AgentDesk: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '我是 Ark 的 dashboard agent。我可以查看任务、更新任务，以及为敏感操作发起审批。',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [loadingSkills, setLoadingSkills] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approval, setApproval] = useState<AgentActionResponse | null>(null);
  const [approving, setApproving] = useState(false);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const listEndRef = useRef<HTMLDivElement | null>(null);

  async function loadSkills(signal?: AbortSignal) {
    setLoadingSkills(true);
    setError(null);
    try {
      const items = await apiJson<Skill[]>('/api/agent/skills', {
        signal,
        headers: {
          'X-Ark-Agent-Type': AGENT_CTX.agentType,
          'X-Ark-Session-Id': sessionIdRef.current,
        },
      });
      setSkills(items);
    } catch (err) {
      if (signal?.aborted) return;
      setSkills([]);
      setError(err instanceof Error ? err.message : '加载技能失败');
    } finally {
      if (!signal?.aborted) setLoadingSkills(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadSkills(controller.signal);
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, approval]);

  const skillCountText = useMemo(() => {
    if (loadingSkills) return '加载中...';
    if (error) return '加载失败';
    return `${skills.length} 个可调用功能`;
  }, [error, loadingSkills, skills.length]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending) return;
    const nextMessages = [...messages, { role: 'user' as const, content }];
    setMessages(nextMessages);
    setDraft('');
    setSending(true);
    setError(null);
    try {
      const res = await apiJson<ChatResponse>('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ark-Agent-Type': AGENT_CTX.agentType,
          'X-Ark-Session-Id': sessionIdRef.current,
        },
        body: JSON.stringify({
          message: content,
          history: messages,
          scope: 'dashboard',
        }),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      setApproval(res.approval);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发送失败';
      setError(msg);
      setMessages((prev) => [...prev, { role: 'assistant', content: `我这次没能处理成功：${msg}` }]);
    } finally {
      setSending(false);
    }
  }

  async function handleCommitApproval() {
    if (!approval?.approval_id || !approval.commit_action || approving) return;
    setApproving(true);
    setError(null);
    try {
      const result = await executeAgentAction(
        approval.commit_action,
        { approval_id: approval.approval_id },
        { ...AGENT_CTX, sessionId: sessionIdRef.current },
      );
      if (result.type === 'forbidden') {
        throw new Error(result.reason || '审批票据无效');
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '确认已收到，敏感操作已经执行完成。' },
      ]);
      setApproval(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '确认失败');
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07111e] text-white">
      <div className="fixed inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/background.jpg`}
          alt="Background"
          className="h-full w-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(54,180,255,0.22),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(255,181,72,0.18),_transparent_30%),linear-gradient(160deg,_rgba(3,7,18,0.95),_rgba(8,20,37,0.9))]" />
      </div>

      <Navigation />

      <div className="relative z-10 flex min-h-screen gap-6 px-5 pb-6 pt-20 md:px-8">
        <aside className="hidden w-[340px] shrink-0 flex-col rounded-[28px] border border-white/10 bg-[#0c1726]/80 p-5 backdrop-blur-xl lg:flex">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-cyan-400/15 p-3 text-cyan-200">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="text-lg font-semibold">Agent Console</div>
              <div className="mt-1 text-sm text-white/55">Dashboard agent 视角，所有敏感操作都会转成审批请求。</div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.28em] text-white/35">Skills</div>
            <div className="mt-2 text-base font-medium">{skillCountText}</div>
            {error ? (
              <div className="mt-3 rounded-xl border border-red-400/15 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
                技能请求失败：{error}
              </div>
            ) : null}
            {!loadingSkills && !error && skills.length === 0 ? (
              <div className="mt-3 rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-xs leading-5 text-white/55">
                后端返回了空技能列表。
              </div>
            ) : null}
            <button
              onClick={() => void loadSkills()}
              disabled={loadingSkills}
              className="mt-3 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/72 transition hover:bg-white/10 disabled:opacity-60"
            >
              {loadingSkills ? '刷新中...' : '重新加载技能'}
            </button>
          </div>

          <div className="mt-5 flex-1 space-y-3 overflow-y-auto pr-1">
            {skills.map((skill) => (
              <div key={skill.name} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-white">{skill.name}</div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${sideEffectStyles[skill.side_effect]}`}>
                    {skill.side_effect}
                  </span>
                </div>
                <div className="mt-2 text-sm leading-6 text-white/62">{skill.description}</div>
                <div className="mt-3 flex items-center gap-2 text-xs text-white/38">
                  <ChevronRight size={14} />
                  <span>{skill.intent_scope}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-6rem)] flex-1 flex-col rounded-[30px] border border-white/10 bg-[#09111d]/78 backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/8 p-3 text-white/90">
                <Bot size={22} />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Ark Agent</h1>
                <p className="text-sm text-white/50">任务调度、任务编辑与敏感操作审批助手</p>
              </div>
            </div>
            <div className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
              session {sessionIdRef.current.slice(0, 8)}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-7 shadow-lg ${
                    message.role === 'user'
                      ? 'ml-auto bg-cyan-500/20 text-cyan-50 border border-cyan-300/20'
                      : 'bg-white/8 text-white/85 border border-white/8'
                  }`}
                >
                  {message.content}
                </div>
              ))}

              {approval ? (
                <div className="rounded-3xl border border-amber-300/15 bg-amber-500/10 p-4 shadow-lg">
                  <div className="flex items-center gap-2 text-amber-100">
                    <ShieldAlert size={18} />
                    <span className="font-medium">{approval.title || '需要前端确认'}</span>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-amber-50/80">
                    {approval.message || '敏感操作已进入审批流程。'}
                  </div>
                  {approval.impact?.count ? (
                    <div className="mt-3 text-xs text-amber-50/65">预计影响对象数：{approval.impact.count}</div>
                  ) : null}
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={handleCommitApproval}
                      disabled={approving}
                      className="rounded-full bg-amber-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-amber-200 disabled:opacity-60"
                    >
                      {approving ? '确认中...' : '我已确认，执行操作'}
                    </button>
                    <button
                      onClick={() => setApproval(null)}
                      disabled={approving}
                      className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-white/75 transition hover:bg-white/10"
                    >
                      暂不执行
                    </button>
                  </div>
                </div>
              ) : null}

              {sending ? (
                <div className="flex max-w-[85%] items-center gap-3 rounded-3xl border border-white/8 bg-white/8 px-4 py-3 text-sm text-white/70">
                  <LoaderCircle size={18} className="animate-spin" />
                  Ark Agent 正在思考并决定是否调用工具
                </div>
              ) : null}
              <div ref={listEndRef} />
            </div>
          </div>

          <div className="border-t border-white/8 px-5 py-5 md:px-6">
            <div className="mx-auto max-w-4xl">
              {error ? (
                <div className="mb-3 flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  <ShieldAlert size={16} />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="rounded-[26px] border border-white/10 bg-black/25 p-3 shadow-inner">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="比如：帮我看一下今天还有哪些未完成任务；把优先级最高的任务标成 done；删除某个任务"
                  className="min-h-[112px] w-full resize-none bg-transparent px-3 py-2 text-sm leading-7 text-white outline-none placeholder:text-white/28"
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-white/35">
                    <CheckCircle2 size={14} />
                    <span>敏感操作会自动转换为审批请求</span>
                  </div>
                  <button
                    onClick={() => void handleSend()}
                    disabled={sending || !draft.trim()}
                    className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
                  >
                    {sending ? '发送中...' : '发送给 Agent'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AgentDesk;
