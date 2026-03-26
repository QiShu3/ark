import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Camera, CheckCircle2, LoaderCircle, Plus, Save, ShieldAlert, Sparkles, Square, Trash2, Wrench } from 'lucide-react';

import Navigation from '../components/Navigation';
import {
  AgentActionResponse,
  AgentApp,
  AgentProfile,
  AgentProfilePayload,
  createAgentProfile,
  deleteAgentProfile,
  executeAgentAction,
  listAgentApps,
  listAgentProfiles,
  removeAgentProfileAvatar,
  setDefaultAgentProfile,
  uploadAgentProfileAvatar,
  updateAgentProfile,
} from '../lib/agent';
import { apiJson, apiSSE } from '../lib/api';

type Skill = {
  name: string;
  app_id: string;
  description: string;
  parameters: Record<string, unknown>;
  intent_scope: string;
  side_effect: 'read' | 'write' | 'destructive';
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ToolTimelineItem = {
  id: string;
  label: string;
  kind: 'tool' | 'approval' | 'status';
};

type ChatStreamEvent =
  | { type: 'profile'; profile?: { id?: string; name?: string; primary_app_id?: string } }
  | { type: 'message_delta'; delta?: string }
  | { type: 'tool_call'; name?: string | null }
  | { type: 'approval_required'; approval?: AgentActionResponse | null }
  | { type: 'done'; reply?: string; approval?: AgentActionResponse | null }
  | { type: 'error'; message?: string };

type ProfileDraft = AgentProfilePayload;

const sideEffectStyles: Record<Skill['side_effect'], string> = {
  read: 'bg-emerald-500/15 text-emerald-100 border border-emerald-300/20',
  write: 'bg-blue-500/15 text-blue-100 border border-blue-300/20',
  destructive: 'bg-red-500/15 text-red-100 border border-red-300/20',
};

function profileAvatarSrc(profile: Pick<AgentProfile, 'avatar_url'> | null): string | null {
  return profile?.avatar_url || null;
}

function ProfileAvatar({
  profile,
  sizeClass,
  textClass = 'text-white/75',
}: {
  profile: Pick<AgentProfile, 'avatar_url' | 'name'> | null;
  sizeClass: string;
  textClass?: string;
}) {
  const src = profileAvatarSrc(profile);
  if (src) {
    return <img src={src} alt={profile?.name || 'Agent avatar'} className={`${sizeClass} rounded-2xl object-cover`} />;
  }
  return (
    <div className={`${sizeClass} rounded-2xl bg-white/8 flex items-center justify-center ${textClass}`}>
      <Bot size={20} />
    </div>
  );
}

function draftFromProfile(profile: AgentProfile): ProfileDraft {
  return {
    name: profile.name,
    description: profile.description,
    primary_app_id: profile.primary_app_id,
    context_prompt: profile.context_prompt,
    allowed_skills: profile.allowed_skills,
    temperature: profile.temperature,
    max_tool_loops: profile.max_tool_loops,
    is_default: profile.is_default,
  };
}

function getAppById(apps: AgentApp[], appId: string | null | undefined): AgentApp | null {
  return apps.find((app) => app.app_id === appId) || null;
}

function createNewDraft(apps: AgentApp[]): ProfileDraft {
  const fallbackApp = getAppById(apps, 'dashboard') || apps[0] || null;
  return {
    name: fallbackApp?.default_profile_name || 'New Agent',
    description: fallbackApp?.default_profile_description || '',
    primary_app_id: fallbackApp?.app_id || 'dashboard',
    context_prompt: fallbackApp?.default_context_prompt || '',
    allowed_skills: fallbackApp?.default_skills || [],
    temperature: 0.2,
    max_tool_loops: 4,
    is_default: false,
  };
}

function normalizeSkillsForApp(apps: AgentApp[], skills: Skill[], appId: string, selected: string[]): string[] {
  const app = getAppById(apps, appId);
  if (!app) return selected;
  const allowedSkillApps = new Set(app.allowed_skill_apps);
  const skillMap = new Map(skills.map((skill) => [skill.name, skill]));
  const filtered = selected.filter((name) => {
    const skill = skillMap.get(name);
    return skill ? allowedSkillApps.has(skill.app_id) : false;
  });
  return filtered.length ? filtered : [...app.default_skills];
}

const AgentDesk: React.FC = () => {
  const [apps, setApps] = useState<AgentApp[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [draftProfileId, setDraftProfileId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({
    name: 'Ark Agent',
    description: '',
    primary_app_id: 'dashboard',
    context_prompt: '',
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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [toolTimeline, setToolTimeline] = useState<ToolTimelineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) || null,
    [profiles, selectedProfileId],
  );
  const selectedSkillSet = useMemo(() => new Set(draft.allowed_skills), [draft.allowed_skills]);
  const appsById = useMemo(() => new Map(apps.map((app) => [app.app_id, app])), [apps]);
  const visibleSkillGroups = useMemo(() => {
    const app = appsById.get(draft.primary_app_id);
    const allowedApps = new Set(app?.allowed_skill_apps || []);
    const groups = new Map<string, Skill[]>();
    for (const skill of skills) {
      if (allowedApps.size && !allowedApps.has(skill.app_id)) continue;
      const list = groups.get(skill.app_id) || [];
      list.push(skill);
      groups.set(skill.app_id, list);
    }
    const primary = draft.primary_app_id;
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === primary) return -1;
      if (b === primary) return 1;
      return a.localeCompare(b);
    });
  }, [appsById, draft.primary_app_id, skills]);

  async function loadInitialData(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const [appItems, skillItems, profileItems] = await Promise.all([
        listAgentApps(),
        apiJson<Skill[]>('/api/agent/skills', { signal }),
        listAgentProfiles(),
      ]);
      if (signal?.aborted) return;
      setApps(appItems);
      setSkills(skillItems);
      setProfiles(profileItems);
      const current = profileItems.find((item) => item.is_default) || profileItems[0] || null;
      setSelectedProfileId(current?.id || null);
      if (current) {
        setDraftProfileId(current.id);
        setDraft(draftFromProfile(current));
        setMessages([{ role: 'assistant', content: `我是 ${current.name}。${current.description || '我会按当前配置来帮助你。'}` }]);
      } else {
        const nextDraft = createNewDraft(appItems);
        setDraft(nextDraft);
        setMessages([{ role: 'assistant', content: '当前还没有可用的 Agent Profile，请先创建一个。' }]);
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
    streamAbortRef.current?.abort();
    sessionIdRef.current = crypto.randomUUID();
    setSelectedProfileId(profile.id);
    setDraftProfileId(profile.id);
    setDraft(draftFromProfile(profile));
    setIsCreatingNew(false);
    setApproval(null);
    setToolTimeline([]);
    setStreamStatus(null);
    setMessages([{ role: 'assistant', content: `已切换到 ${profile.name}。${profile.description || '这个 Agent 已准备好开始工作。'}` }]);
  }

  function startCreateProfile() {
    streamAbortRef.current?.abort();
    sessionIdRef.current = crypto.randomUUID();
    const nextDraft = createNewDraft(apps);
    setDraft(nextDraft);
    setDraftProfileId(null);
    setIsCreatingNew(true);
    setApproval(null);
    setToolTimeline([]);
    setStreamStatus(null);
    setMessages([{ role: 'assistant', content: '新 Agent 草稿已创建。你可以先配置主应用、上下文和技能。' }]);
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

  function updatePrimaryApp(appId: string) {
    const app = appsById.get(appId);
    setDraft((prev) => ({
      ...prev,
      primary_app_id: appId,
      context_prompt: prev.context_prompt.trim() ? prev.context_prompt : app?.default_context_prompt || '',
      allowed_skills: normalizeSkillsForApp(apps, skills, appId, prev.allowed_skills),
    }));
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
        allowed_skills: normalizeSkillsForApp(apps, skills, draft.primary_app_id, draft.allowed_skills),
        max_tool_loops: draft.max_tool_loops ?? 4,
      };
      const saved = isCreatingNew || !draftProfileId
        ? await createAgentProfile(payload)
        : await updateAgentProfile(draftProfileId, payload);
      const current = await reloadProfiles(saved.id);
      if (current) {
        setMessages([{ role: 'assistant', content: `${current.name} 已保存。之后的聊天会按这个配置运行。` }]);
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
      setMessages([{ role: 'assistant', content: current ? `已删除原 Profile，当前切换到 ${current.name}。` : '已删除 Profile。' }]);
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
      setMessages([{ role: 'assistant', content: `${saved.name} 已设置为默认 Agent。` }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置默认 Profile 失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAvatarSelected(file: File | null) {
    if (!file || !selectedProfile) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      const saved = await uploadAgentProfileAvatar(selectedProfile.id, file);
      const current = await reloadProfiles(saved.id);
      if (current) {
        setMessages((prev) => [...prev, { role: 'assistant', content: `${current.name} 的头像已更新。` }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传头像失败');
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      setUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    if (!selectedProfile || uploadingAvatar) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      const saved = await removeAgentProfileAvatar(selectedProfile.id);
      const current = await reloadProfiles(saved.id);
      if (current) {
        setMessages((prev) => [...prev, { role: 'assistant', content: `${current.name} 已恢复默认头像。` }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除头像失败');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSend() {
    const content = draftMessage.trim();
    if (!content || sending || !selectedProfileId) return;
    const assistantPlaceholderIndex = messages.length + 1;
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setMessages((prev) => [...prev, { role: 'user', content }, { role: 'assistant', content: '' }]);
    setDraftMessage('');
    setSending(true);
    setError(null);
    setApproval(null);
    setStreamStatus('Agent 正在思考...');
    setToolTimeline([{ id: crypto.randomUUID(), label: '开始分析请求', kind: 'status' }]);
    try {
      await apiSSE(
        '/api/chat/stream',
        {
          profile_id: selectedProfileId,
          message: content,
          history: messages,
          scope: selectedProfile?.primary_app_id || 'dashboard',
        },
        (event) => {
          const item = event as ChatStreamEvent;
          if (item.type === 'profile') {
            const profileName = item.profile?.name;
            if (profileName) {
              setToolTimeline((prev) => [...prev, { id: crypto.randomUUID(), label: `当前 Agent：${profileName}`, kind: 'status' }]);
            }
            return;
          }
          if (item.type === 'message_delta' && typeof item.delta === 'string') {
            setMessages((prev) =>
              prev.map((message, index) =>
                index === assistantPlaceholderIndex && message.role === 'assistant'
                  ? { ...message, content: `${message.content}${item.delta}` }
                  : message,
              ),
            );
            setStreamStatus('Agent 正在回复...');
            return;
          }
          if (item.type === 'tool_call') {
            setStreamStatus(item.name ? `正在调用 ${item.name}` : '正在调用工具...');
            setToolTimeline((prev) => [...prev, { id: crypto.randomUUID(), label: item.name ? `调用技能 ${item.name}` : '调用工具', kind: 'tool' }]);
            return;
          }
          if (item.type === 'approval_required') {
            setApproval(item.approval || null);
            setStreamStatus('敏感操作需要你确认');
            setToolTimeline((prev) => [...prev, { id: crypto.randomUUID(), label: item.approval?.title || '触发敏感操作确认', kind: 'approval' }]);
            return;
          }
          if (item.type === 'done') {
            if (item.reply) {
              setMessages((prev) =>
                prev.map((message, index) =>
                  index === assistantPlaceholderIndex && message.role === 'assistant' && !message.content.trim()
                    ? { ...message, content: item.reply || '' }
                    : message,
                ),
              );
            }
            setApproval(item.approval || null);
            setToolTimeline((prev) => [...prev, { id: crypto.randomUUID(), label: '本轮响应完成', kind: 'status' }]);
            setStreamStatus(null);
            return;
          }
          if (item.type === 'error') {
            const msg = item.message || '发送失败';
            setError(msg);
            setToolTimeline((prev) => [...prev, { id: crypto.randomUUID(), label: `发生错误：${msg}`, kind: 'status' }]);
            setMessages((prev) =>
              prev.map((message, index) =>
                index === assistantPlaceholderIndex && message.role === 'assistant' && !message.content.trim()
                  ? { ...message, content: `我这次没能处理成功：${msg}` }
                  : message,
              ),
            );
            setStreamStatus(null);
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setToolTimeline((prev) => [...prev, { id: crypto.randomUUID(), label: '已手动停止本轮生成', kind: 'status' }]);
        setMessages((prev) =>
          prev.map((message, index) =>
            index === assistantPlaceholderIndex && message.role === 'assistant' && !message.content.trim()
              ? { ...message, content: '这轮生成已停止。' }
              : message,
          ),
        );
      } else {
        const msg = err instanceof Error ? err.message : '发送失败';
        setError(msg);
        setMessages((prev) =>
          prev.map((message, index) =>
            index === assistantPlaceholderIndex && message.role === 'assistant'
              ? { ...message, content: message.content || `我这次没能处理成功：${msg}` }
              : message,
          ),
        );
      }
    } finally {
      streamAbortRef.current = null;
      setStreamStatus(null);
      setSending(false);
    }
  }

  function handleStopStreaming() {
    streamAbortRef.current?.abort();
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
          primaryAppId: selectedProfile.primary_app_id,
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
    <div className="relative h-screen overflow-hidden bg-[#07111e] text-white supports-[height:100dvh]:h-[100dvh]">
      <div className="fixed inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/background.jpg`}
          alt="Background"
          className="h-full w-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(54,180,255,0.22),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(255,181,72,0.18),_transparent_30%),linear-gradient(160deg,_rgba(3,7,18,0.95),_rgba(8,20,37,0.9))]" />
      </div>

      <Navigation />

      <div className="relative z-10 flex h-full gap-4 overflow-hidden px-4 pb-6 pt-20 xl:px-8">
        <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col rounded-[28px] border border-white/10 bg-[#0c1726]/80 p-4 backdrop-blur-xl xl:flex">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-cyan-400/15 p-3 text-cyan-200">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="text-lg font-semibold">Agents</div>
              <div className="mt-1 text-sm text-white/55">创建、切换并管理不同工作区与能力组合的 Agent。</div>
            </div>
          </div>

          <button
            onClick={startCreateProfile}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100 transition hover:bg-cyan-400/15"
          >
            <Plus size={16} />
            新建 Agent
          </button>

          <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {profiles.map((profile) => {
              const profileApp = appsById.get(profile.primary_app_id);
              return (
                <button
                  key={profile.id}
                  onClick={() => selectExistingProfile(profile)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedProfileId === profile.id
                      ? 'border-cyan-300/30 bg-cyan-400/12'
                      : 'border-white/8 bg-black/20 hover:bg-white/8'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <ProfileAvatar profile={profile} sizeClass="h-11 w-11" />
                      <div>
                        <div className="font-medium text-white">{profile.name}</div>
                        <div className="mt-1 text-xs text-white/45">{profileApp?.display_name || profile.primary_app_id}</div>
                      </div>
                    </div>
                    {profile.is_default ? (
                      <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-100">默认</span>
                    ) : null}
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm leading-6 text-white/58">{profile.description || '未填写简介'}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-0 w-full flex-1 gap-4 overflow-hidden">
          <div className="flex h-full min-h-0 w-full flex-col rounded-[30px] border border-white/10 bg-[#09111d]/78 p-5 backdrop-blur-2xl xl:w-[430px]">
            <div className="flex items-center gap-3">
              <ProfileAvatar profile={selectedProfile} sizeClass="h-12 w-12" />
              <div>
                <div className="text-xl font-semibold">Profile Config</div>
                <div className="text-sm text-white/50">保存后，聊天会立刻切换到新的 Agent 配置。</div>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
            ) : null}

            <div className="scrollbar-hidden mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-4 pb-4">
                <div>
                  <div className="mb-3 text-sm text-white/60">头像</div>
                  <div className="flex items-center gap-4 rounded-2xl border border-white/8 bg-black/20 p-4">
                    <ProfileAvatar profile={selectedProfile} sizeClass="h-20 w-20" textClass="text-white/65" />
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => void handleAvatarSelected(e.target.files?.[0] || null)}
                        disabled={!selectedProfile || uploadingAvatar}
                      />
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={!selectedProfile || uploadingAvatar}
                        className="flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-400/15 disabled:opacity-60"
                      >
                        {uploadingAvatar ? <LoaderCircle size={15} className="animate-spin" /> : <Camera size={15} />}
                        {uploadingAvatar ? '上传中...' : '上传头像'}
                      </button>
                      <button
                        onClick={() => void handleRemoveAvatar()}
                        disabled={!selectedProfile?.avatar_url || uploadingAvatar}
                        className="flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-60"
                      >
                        <Trash2 size={15} />
                        移除头像
                      </button>
                    </div>
                  </div>
                </div>

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
                    className="min-h-[76px] w-full resize-none overflow-hidden rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/30"
                  />
                </div>

                <div>
                  <div className="mb-2 text-sm text-white/60">主应用 / 工作区</div>
                  <select
                    value={draft.primary_app_id}
                    onChange={(e) => updatePrimaryApp(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/30"
                  >
                    {apps.map((app) => (
                      <option key={app.app_id} value={app.app_id} className="bg-slate-900">
                        {app.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 text-sm text-white/60">上下文描述</div>
                  <textarea
                    value={draft.context_prompt}
                    onChange={(e) => updateDraft('context_prompt', e.target.value)}
                    className="min-h-[120px] w-full resize-none overflow-hidden rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/30"
                    placeholder="描述这个 agent 的职责、服务对象、工作场景和行为风格。"
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
                  <div className="space-y-4">
                    {visibleSkillGroups.map(([appId, items]) => {
                      const app = appsById.get(appId);
                      const isPrimary = appId === draft.primary_app_id;
                      return (
                        <div key={appId} className="rounded-2xl border border-white/8 bg-black/20 p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <div className="font-medium text-white">{app?.display_name || appId}</div>
                              <div className="text-xs text-white/45">{isPrimary ? '主应用技能组' : '跨应用技能组'}</div>
                            </div>
                            {isPrimary ? (
                              <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100">Primary</span>
                            ) : null}
                          </div>
                          <div className="space-y-3">
                            {items.map((skill) => (
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
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

            <div className="mt-4 border-t border-white/8 pt-4">
              <div className="flex flex-wrap gap-2">
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

          <main className="flex h-full min-h-0 flex-1 flex-col rounded-[30px] border border-white/10 bg-[#09111d]/78 backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
              <div className="flex items-center gap-3">
                <ProfileAvatar profile={selectedProfile} sizeClass="h-14 w-14" />
                <div>
                  <h1 className="text-xl font-semibold">{selectedProfile?.name || 'Ark Agent'}</h1>
                  <p className="text-sm text-white/50">{selectedProfile?.description || '选择或创建一个 Agent Profile 后开始对话。'}</p>
                </div>
              </div>
              <div className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
                {selectedProfile ? appsById.get(selectedProfile.primary_app_id)?.display_name || selectedProfile.primary_app_id : 'No Profile'}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                {toolTimeline.length ? (
                  <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white/78">
                      <Wrench size={16} />
                      执行轨迹
                    </div>
                    <div className="mt-3 space-y-2">
                      {toolTimeline.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 text-sm text-white/62">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              item.kind === 'approval'
                                ? 'bg-amber-300'
                                : item.kind === 'tool'
                                  ? 'bg-cyan-300'
                                  : 'bg-white/40'
                            }`}
                          />
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

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
                    {sending && message.role === 'assistant' && index === messages.length - 1 ? (
                      <span className="ml-1 inline-block h-5 w-2 animate-pulse rounded-full bg-cyan-200/80 align-middle" />
                    ) : null}
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
                    {streamStatus || 'Agent 正在按当前配置思考与调用工具'}
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
                    <div className="flex items-center gap-2">
                      {sending ? (
                        <button
                          onClick={handleStopStreaming}
                          className="flex items-center gap-2 rounded-full border border-red-300/20 bg-red-500/12 px-4 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/20"
                        >
                          <Square size={14} />
                          停止生成
                        </button>
                      ) : null}
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
            </div>
          </main>
        </section>
      </div>
    </div>
  );
};

export default AgentDesk;
