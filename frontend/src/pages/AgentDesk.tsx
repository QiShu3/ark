import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, LoaderCircle, Plus, Save, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';

import Navigation from '../components/Navigation';
import {
  AgentActionResponse,
  AgentProfile,
  AgentProfilePayload,
  AgentType,
  createAgentProfile,
  deleteAgentProfile,
  executeAgentAction,
  listAgentProfiles,
  setDefaultAgentProfile,
  updateAgentProfile,
} from '../lib/agent';
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

type ProfileDraft = AgentProfilePayload;

const sideEffectStyles: Record<Skill['side_effect'], string> = {
  read: 'bg-emerald-500/15 text-emerald-100 border border-emerald-300/20',
  write: 'bg-blue-500/15 text-blue-100 border border-blue-300/20',
  destructive: 'bg-red-500/15 text-red-100 border border-red-300/20',
};

const AGENT_LABELS: Record<AgentType, string> = {
  dashboard_agent: 'Dashboard Agent',
  'app_agent:arxiv': 'ArXiv Agent',
  'app_agent:vocab': 'Vocab Agent',
};

function filterSkillsForAgent(agentType: AgentType, names: string[]): string[] {
  if (agentType === 'app_agent:arxiv') return names.filter((name) => name.startsWith('arxiv_'));
  if (agentType === 'app_agent:vocab') return names.filter((name) => !name.startsWith('arxiv_'));
  return names;
}

function draftFromProfile(profile: AgentProfile): ProfileDraft {
  return {
    name: profile.name,
    description: profile.description,
    agent_type: profile.agent_type,
    app_id: profile.app_id,
    persona_prompt: profile.persona_prompt,
    allowed_skills: profile.allowed_skills,
    temperature: profile.temperature,
    max_tool_loops: profile.max_tool_loops,
    is_default: profile.is_default,
  };
}

function createNewDraft(skills: Skill[]): ProfileDraft {
  return {
    name: 'New Agent',
    description: '',
    agent_type: 'dashboard_agent',
    app_id: null,
    persona_prompt: '',
    allowed_skills: skills.map((skill) => skill.name),
    temperature: 0.2,
    max_tool_loops: 4,
    is_default: false,
  };
}

const AgentDesk: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [draftProfileId, setDraftProfileId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({
    name: 'Ark Agent',
    description: '',
    agent_type: 'dashboard_agent',
    app_id: null,
    persona_prompt: '',
    allowed_skills: [],
    temperature: 0.2,
    max_tool_loops: 4,
    is_default: false,
  });
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [sending, setSending] = useState(false);
  const [approval, setApproval] = useState<AgentActionResponse | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) || null,
    [profiles, selectedProfileId],
  );
  const selectedSkillSet = useMemo(() => new Set(draft.allowed_skills), [draft.allowed_skills]);

  async function loadInitialData(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const [skillItems, profileItems] = await Promise.all([
        apiJson<Skill[]>('/api/agent/skills', {
          signal,
          headers: {
            'X-Ark-Agent-Type': 'dashboard_agent',
            'X-Ark-Session-Id': sessionIdRef.current,
          },
        }),
        listAgentProfiles(),
      ]);
      if (signal?.aborted) return;
      setSkills(skillItems);
      setProfiles(profileItems);
      const current = profileItems.find((item) => item.is_default) || profileItems[0] || null;
      setSelectedProfileId(current?.id || null);
      if (current) {
        setDraftProfileId(current.id);
        setDraft(draftFromProfile(current));
        setMessages([
          {
            role: 'assistant',
            content: `我是 ${current.name}。${current.description || '我会按当前 profile 的风格与技能集来帮助你。'}`,
          },
        ]);
      } else {
        setDraft(createNewDraft(skillItems));
        setMessages([
          { role: 'assistant', content: '当前还没有可用的 Agent Profile，请先创建一个。' },
        ]);
      }
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : '加载 Agent 数据失败');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadInitialData(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, approval]);

  function selectExistingProfile(profile: AgentProfile) {
    setSelectedProfileId(profile.id);
    setDraftProfileId(profile.id);
    setDraft(draftFromProfile(profile));
    setIsCreatingNew(false);
    setApproval(null);
    setMessages([
      {
        role: 'assistant',
        content: `已切换到 ${profile.name}。${profile.description || '这个 Agent 已准备好开始工作。'}`,
      },
    ]);
  }

  function startCreateProfile() {
    setDraft(createNewDraft(skills));
    setDraftProfileId(null);
    setIsCreatingNew(true);
    setApproval(null);
    setMessages([{ role: 'assistant', content: '新 Agent 草稿已创建。你可以先配置风格、技能和模型参数。' }]);
  }

  function toggleSkill(name: string) {
    setDraft((prev) => ({
      ...prev,
      allowed_skills: prev.allowed_skills.includes(name)
        ? prev.allowed_skills.filter((item) => item !== name)
        : [...prev.allowed_skills, name],
    }));
  }

  function updateDraft<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function reloadProfiles(nextSelectedId?: string | null) {
    const profileItems = await listAgentProfiles();
    setProfiles(profileItems);
    const current =
      (nextSelectedId ? profileItems.find((item) => item.id === nextSelectedId) : null)
      || profileItems.find((item) => item.is_default)
      || profileItems[0]
      || null;
    setSelectedProfileId(current?.id || null);
    if (current) {
      setDraftProfileId(current.id);
      setDraft(draftFromProfile(current));
      setIsCreatingNew(false);
    }
    return current;
  }

  async function saveProfile() {
    if (savingProfile) return;
    setSavingProfile(true);
    setError(null);
    try {
      const payload: AgentProfilePayload = {
        ...draft,
        app_id: draft.agent_type === 'dashboard_agent' ? null : draft.app_id,
        max_tool_loops: draft.max_tool_loops ?? 4,
      };
      const saved = isCreatingNew || !draftProfileId
        ? await createAgentProfile(payload)
        : await updateAgentProfile(draftProfileId, payload);
      const current = await reloadProfiles(saved.id);
      if (current) {
        setMessages([
          {
            role: 'assistant',
            content: `${current.name} 已保存。之后的聊天会按这个 profile 的风格和技能配置运行。`,
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存 Profile 失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleDeleteProfile() {
    if (!selectedProfile || savingProfile) return;
    if (!window.confirm(`确定删除 Agent「${selectedProfile.name}」吗？`)) return;
    setSavingProfile(true);
    setError(null);
    try {
      await deleteAgentProfile(selectedProfile.id);
      const current = await reloadProfiles(null);
      setMessages([
        {
          role: 'assistant',
          content: current
            ? `已删除原 Profile，当前切换到 ${current.name}。`
            : '已删除 Profile。',
        },
      ]);
      setApproval(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除 Profile 失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSetDefault() {
    if (!selectedProfile || savingProfile) return;
    setSavingProfile(true);
    setError(null);
    try {
      const saved = await setDefaultAgentProfile(selectedProfile.id);
      await reloadProfiles(saved.id);
      setMessages([
        {
          role: 'assistant',
          content: `${saved.name} 已设置为默认 Agent。`,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置默认 Profile 失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSend() {
    const content = draftMessage.trim();
    if (!content || sending || !selectedProfileId) return;
    setMessages((prev) => [...prev, { role: 'user', content }]);
    setDraftMessage('');
    setSending(true);
    setError(null);
    try {
      const res = await apiJson<ChatResponse>('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ark-Session-Id': sessionIdRef.current,
        },
        body: JSON.stringify({
          profile_id: selectedProfileId,
          message: content,
          history: messages,
          scope: selectedProfile?.agent_type || 'dashboard_agent',
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
    if (!approval?.approval_id || !approval.commit_action || approving || !selectedProfile) return;
    setApproving(true);
    setError(null);
    try {
      const result = await executeAgentAction(
        approval.commit_action,
        { approval_id: approval.approval_id },
        {
          agentType: selectedProfile.agent_type,
          appId: selectedProfile.app_id || undefined,
          sessionId: sessionIdRef.current,
        },
      );
      if (result.type === 'forbidden') {
        throw new Error(result.reason || '审批票据无效');
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: '确认已收到，敏感操作已经执行完成。' }]);
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

      <div className="relative z-10 flex min-h-screen gap-4 px-4 pb-6 pt-20 xl:px-8">
        <aside className="hidden w-[280px] shrink-0 rounded-[28px] border border-white/10 bg-[#0c1726]/80 p-4 backdrop-blur-xl xl:block">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-cyan-400/15 p-3 text-cyan-200">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="text-lg font-semibold">Agents</div>
              <div className="mt-1 text-sm text-white/55">创建、切换并管理不同风格与能力组合的 Agent。</div>
            </div>
          </div>

          <button
            onClick={startCreateProfile}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100 transition hover:bg-cyan-400/15"
          >
            <Plus size={16} />
            新建 Agent
          </button>

          <div className="mt-5 space-y-3">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => selectExistingProfile(profile)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  selectedProfileId === profile.id
                    ? 'border-cyan-300/30 bg-cyan-400/12'
                    : 'border-white/8 bg-black/20 hover:bg-white/8'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-white">{profile.name}</div>
                  {profile.is_default ? (
                    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-100">默认</span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-white/45">{AGENT_LABELS[profile.agent_type]}</div>
                <div className="mt-2 line-clamp-2 text-sm leading-6 text-white/58">{profile.description || '未填写简介'}</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex w-full min-h-[calc(100vh-6rem)] gap-4">
          <div className="w-full rounded-[30px] border border-white/10 bg-[#09111d]/78 p-5 backdrop-blur-2xl xl:w-[430px]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/8 p-3 text-white/90">
                <Bot size={20} />
              </div>
              <div>
                <div className="text-xl font-semibold">Profile Config</div>
                <div className="text-sm text-white/50">保存后，聊天会立刻切换到新的 Agent 配置。</div>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
            ) : null}

            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 text-sm text-white/60">名称</div>
                <input
                  value={draft.name}
                  onChange={(e) => updateDraft('name', e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/30"
                />
              </div>
              <div>
                <div className="mb-2 text-sm text-white/60">简介</div>
                <textarea
                  value={draft.description}
                  onChange={(e) => updateDraft('description', e.target.value)}
                  className="min-h-[76px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/30"
                />
              </div>
              <div>
                <div className="mb-2 text-sm text-white/60">Agent 类型</div>
                <select
                  value={draft.agent_type}
                  onChange={(e) => {
                    const nextType = e.target.value as AgentType;
                    setDraft((prev) => ({
                      ...prev,
                      agent_type: nextType,
                      app_id: nextType === 'dashboard_agent' ? null : nextType === 'app_agent:arxiv' ? 'arxiv' : 'vocab',
                      allowed_skills: filterSkillsForAgent(nextType, prev.allowed_skills),
                    }));
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/30"
                >
                  {Object.entries(AGENT_LABELS).map(([key, label]) => (
                    <option key={key} value={key} className="bg-slate-900">
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-2 text-sm text-white/60">Persona Prompt</div>
                <textarea
                  value={draft.persona_prompt}
                  onChange={(e) => updateDraft('persona_prompt', e.target.value)}
                  className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/30"
                  placeholder="定义这个 Agent 的说话风格、行为偏好和身份设定。"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-2 text-sm text-white/60">Temperature</div>
                  <input
                    type="number"
                    min="0"
                    max="1.2"
                    step="0.1"
                    value={draft.temperature}
                    onChange={(e) => updateDraft('temperature', Number(e.target.value))}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/30"
                  />
                </div>
                <div>
                  <div className="mb-2 text-sm text-white/60">Tool Loops</div>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={draft.max_tool_loops ?? 4}
                    onChange={(e) => updateDraft('max_tool_loops', Number(e.target.value))}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/30"
                  />
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm text-white/60">启用 Skills</div>
                  <div className="text-xs text-white/40">{draft.allowed_skills.length} / {skills.length}</div>
                </div>
                <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
                  {skills.map((skill) => (
                    <label key={skill.name} className="block rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedSkillSet.has(skill.name)}
                            onChange={() => toggleSkill(skill.name)}
                            className="h-4 w-4 rounded border-white/20 bg-transparent accent-cyan-300"
                          />
                          <div className="font-medium text-white">{skill.name}</div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${sideEffectStyles[skill.side_effect]}`}>
                          {skill.side_effect}
                        </span>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-white/58">{skill.description}</div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => void saveProfile()}
                  disabled={savingProfile || loading}
                  className="flex items-center gap-2 rounded-full bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
                >
                  <Save size={15} />
                  {savingProfile ? '保存中...' : '保存 Profile'}
                </button>
                {selectedProfile ? (
                  <button
                    onClick={() => void handleSetDefault()}
                    disabled={savingProfile || selectedProfile.is_default}
                    className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-60"
                  >
                    设为默认
                  </button>
                ) : null}
                {selectedProfile ? (
                  <button
                    onClick={() => void handleDeleteProfile()}
                    disabled={savingProfile}
                    className="flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm text-red-100 transition hover:bg-red-500/20 disabled:opacity-60"
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <main className="flex min-h-[calc(100vh-6rem)] flex-1 flex-col rounded-[30px] border border-white/10 bg-[#09111d]/78 backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/8 p-3 text-white/90">
                  <Bot size={22} />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">{selectedProfile?.name || 'Ark Agent'}</h1>
                  <p className="text-sm text-white/50">{selectedProfile?.description || '选择或创建一个 Agent Profile 后开始对话。'}</p>
                </div>
              </div>
              <div className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
                {selectedProfile ? AGENT_LABELS[selectedProfile.agent_type] : 'No Profile'}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-7 shadow-lg ${
                      message.role === 'user'
                        ? 'ml-auto border border-cyan-300/20 bg-cyan-500/20 text-cyan-50'
                        : 'border border-white/8 bg-white/8 text-white/85'
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
                    <div className="mt-2 text-sm leading-6 text-amber-50/80">{approval.message || '敏感操作已进入审批流程。'}</div>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => void handleCommitApproval()}
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
                    Agent 正在按当前 profile 思考与调用工具
                  </div>
                ) : null}
                <div ref={listEndRef} />
              </div>
            </div>

            <div className="border-t border-white/8 px-5 py-5 md:px-6">
              <div className="mx-auto max-w-4xl">
                <div className="mb-3 flex items-center gap-2 text-xs text-white/40">
                  <CheckCircle2 size={14} />
                  <span>聊天会绑定当前 Profile；切换 Profile 会重置会话上下文。</span>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-black/25 p-3 shadow-inner">
                  <textarea
                    value={draftMessage}
                    onChange={(e) => setDraftMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder={selectedProfile ? `向 ${selectedProfile.name} 发送消息...` : '请先选择或创建一个 Agent Profile'}
                    disabled={!selectedProfileId}
                    className="min-h-[112px] w-full resize-none bg-transparent px-3 py-2 text-sm leading-7 text-white outline-none placeholder:text-white/28 disabled:opacity-50"
                  />
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      onClick={() => void handleSend()}
                      disabled={sending || !draftMessage.trim() || !selectedProfileId}
                      className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
                    >
                      {sending ? '发送中...' : '发送给 Agent'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </section>
      </div>
    </div>
  );
};

export default AgentDesk;
