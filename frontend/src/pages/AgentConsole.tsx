import { useCallback, useEffect, useRef, useState } from 'react';

import { apiJson } from '../lib/api';
import { useAuthStore } from '../lib/auth';
import { useTts } from '../hooks/useTts';

const PROFILE_KEY = 'agent-console';

type SessionResponse = {
  id: string;
  user_id: number;
  profile_id: string;
  name: string | null;
  workspace_path: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type MessageResponse = {
  id: string | null;
  session_id: string;
  run_id?: string | null;
  role: string;
  content: string;
  event_type?: string | null;
  created_at: string;
};

type SocketPacket =
  | { type: 'connected'; session_id: string; status?: string }
  | { type: 'message_event'; session_id: string; event: MessageResponse }
  | { type: 'run_started' | 'run_completed' | 'run_failed' | 'run_cancelled'; session_id: string }
  | { type: 'error'; session_id: string; error: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { type: string; [key: string]: any }; // Catch all for TTS and other events

const visibleEventTypes = new Set(['user', 'assistant_message']);
const pageSessionRequests = new Map<string, Promise<SessionResponse>>();

function buildWebSocketUrl(sessionId: string, token: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/api/sessions/ws/${sessionId}?token=${encodeURIComponent(token)}`;
}

function getOrCreatePageSession(profileKey: string) {
  const pending = pageSessionRequests.get(profileKey);
  if (pending) {
    return pending;
  }

  const request = apiJson<SessionResponse>(`/api/pages/${profileKey}/session`, {
    method: 'POST',
  }).finally(() => {
    pageSessionRequests.delete(profileKey);
  });
  pageSessionRequests.set(profileKey, request);
  return request;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AgentConsole() {
  const token = useAuthStore((s) => s.token);

  const [session, setSession] = useState<SessionResponse | null>(null);
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [socketState, setSocketState] = useState<'disconnected' | 'connecting' | 'open'>('disconnected');
  const [streamingText, setStreamingText] = useState('');
  
  const {
    ttsState,
    ttsPlaybackEnabled,
    ttsPendingCount,
    toggleTtsPlayback,
    stopTtsPlayback,
    handleTtsMessage,
    resetTts,
  } = useTts();

  const socketRef = useRef<WebSocket | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, streamingText]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setBootError(null);
      setRunError(null);
      setStreamingText('');
      resetTts();

      try {
        const nextSession = await getOrCreatePageSession(PROFILE_KEY);
        if (cancelled) return;
        setSession(nextSession);

        const history = await apiJson<MessageResponse[]>(`/api/sessions/${nextSession.id}/messages`);
        if (cancelled) return;
        setMessages(history.filter((item) => visibleEventTypes.has(item.event_type || item.role)));
      } catch (error) {
        if (cancelled) return;
        setBootError(error instanceof Error ? error.message : '页面初始化失败');
        setSession(null);
        setMessages([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId || !token) {
      return;
    }

    setSocketState('connecting');
    const socket = new WebSocket(buildWebSocketUrl(sessionId, token));
    socketRef.current = socket;

    socket.onopen = () => {
      setSocketState('open');
      setRunError(null);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as SocketPacket;
      if (data.session_id !== sessionId) {
        return;
      }

      if (data.type === 'connected') {
        if (data.status) {
          setSession((current) => (current ? { ...current, status: data.status || current.status } : current));
        }
        return;
      }

      if (data.type.startsWith('tts_')) {
        handleTtsMessage(data);
        return;
      }

      if (data.type === 'error') {
        setRunError(data.error);
        return;
      }

      if (data.type === 'message_event') {
        const eventType = data.event.event_type || data.event.role;
        if (eventType === 'content_delta') {
          setStreamingText((current) => current + (data.event.content || ''));
          return;
        }

        if (eventType === 'assistant_message') {
          setStreamingText('');
        }

        if (visibleEventTypes.has(eventType)) {
          setMessages((current) => [...current, data.event]);
        }
        return;
      }

      if (data.type === 'run_started') {
        setSession((current) => (current ? { ...current, status: 'running' } : current));
        setRunError(null);
        return;
      }

      if (data.type === 'run_completed') {
        setSession((current) => (current ? { ...current, status: 'completed' } : current));
        return;
      }

      if (data.type === 'run_failed') {
        setSession((current) => (current ? { ...current, status: 'failed' } : current));
        setStreamingText('');
        return;
      }

      if (data.type === 'run_cancelled') {
        setSession((current) => (current ? { ...current, status: 'cancelled' } : current));
        setStreamingText('');
      }
    };

    socket.onerror = () => {
      setRunError('连接 Agent 会话时发生错误。');
    };

    socket.onclose = () => {
      setSocketState('disconnected');
      stopTtsPlayback('socket_closed');
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      stopTtsPlayback('socket_cleanup');
      socket.close();
    };
  }, [
    handleTtsMessage,
    sessionId,
    stopTtsPlayback,
    token,
  ]);

  const isRunning = session?.status === 'running';
  const canSend = socketState === 'open' && !isRunning && draft.trim().length > 0;
  const canUseTts = ttsState.enabled;
  const ttsBadgeLabel = canUseTts && ttsPlaybackEnabled ? `tts: ${ttsState.provider || 'on'}` : 'tts: off';
  const ttsToggleLabel = ttsPlaybackEnabled ? '关闭朗读' : '启用朗读';

  function sendMessage() {
    const content = draft.trim();
    const socket = socketRef.current;
    if (!content || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify({ type: 'run', content }));
    setDraft('');
    setRunError(null);
  }

  return (
    <div className="relative z-10 flex w-full h-full pt-16">
      <div className="mx-auto flex w-full max-w-[1600px] gap-6 p-6">
        <aside className="w-full overflow-y-auto lg:max-w-sm">
          <div className="rounded-[28px] border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-xl">
            <div className="mb-5 inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-cyan-100/80">
              Shared Profile Page
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Agent Console</h1>
            <p className="mt-3 text-sm leading-6 text-white/72">
              页面固定绑定共享 profile key <code className="rounded bg-white/10 px-1.5 py-0.5 text-white">{PROFILE_KEY}</code>，
              进入时会自动恢复你最近一次使用的会话。
            </p>

            <div className="mt-6 space-y-3 rounded-3xl border border-white/8 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/55">连接状态</span>
                <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-white/90">
                  {socketState}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/55">会话状态</span>
                <span className="text-white/92">{session?.status || '未初始化'}</span>
              </div>
              <div className="text-sm">
                <div className="text-white/55">Session ID</div>
                <div className="mt-1 break-all font-mono text-xs text-white/85">{session?.id || '暂无'}</div>
              </div>
              <div className="text-sm">
                <div className="text-white/55">工作目录</div>
                <div className="mt-1 break-all font-mono text-xs text-white/85">{session?.workspace_path || '暂无'}</div>
              </div>
              <div className="text-sm">
                <div className="text-white/55">最近更新时间</div>
                <div className="mt-1 text-white/85">{session ? formatTime(session.updated_at) : '暂无'}</div>
              </div>
            </div>

            <div className="mt-6 space-y-3 rounded-3xl border border-white/8 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-white/92">语音朗读</div>
                  <div className="mt-1 text-xs text-white/50">
                    {ttsState.voice ? `${ttsState.provider || 'tts'} · ${ttsState.voice}` : '当前共享 profile 的 TTS 状态'}
                  </div>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    ttsPlaybackEnabled
                      ? 'border-cyan-300/25 bg-cyan-400/15 text-cyan-50'
                      : 'border-white/10 bg-white/10 text-white/75'
                  }`}
                >
                  {ttsBadgeLabel}
                </span>
              </div>

              <div className="text-sm">
                <div className="text-white/55">模式</div>
                <div className="mt-1 text-white/85">
                  {ttsState.streamingMode === 'audio_stream' ? '音频流' : '缓冲音频'}
                </div>
              </div>

              {ttsState.error ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-50/90">
                  {ttsState.error}
                </div>
              ) : null}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={toggleTtsPlayback}
                  disabled={!canUseTts}
                  className="flex-1 rounded-2xl border border-cyan-300/18 bg-cyan-400/12 px-4 py-2.5 text-sm text-cyan-50 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {ttsToggleLabel}
                </button>
                <button
                  type="button"
                  onClick={() => stopTtsPlayback('manual_stop')}
                  disabled={!canUseTts || ttsPendingCount === 0}
                  className="rounded-2xl border border-white/12 bg-white/8 px-4 py-2.5 text-sm text-white/88 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  停止
                </button>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-amber-300/12 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50/88">
              如果这里显示 “Profile not found”，先去开发页 <code className="rounded bg-black/20 px-1.5 py-0.5">/web</code> 创建或编辑
              一个共享 profile，并把 key 设成 <code className="rounded bg-black/20 px-1.5 py-0.5">{PROFILE_KEY}</code>。
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-white/10 bg-black/35 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-white/8 px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-white/45">Conversation</div>
                <div className="mt-2 text-2xl font-semibold text-white">最近会话</div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/88">
                {messages.length} 条消息
              </div>
            </div>
          </div>

          <div ref={messagesContainerRef} className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
            {loading ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/72">
                正在恢复该页面对应的最近会话...
              </div>
            ) : null}

            {bootError ? (
              <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5 text-sm leading-6 text-red-50/92">
                {bootError}
              </div>
            ) : null}

            {!loading && !bootError && messages.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center text-sm text-white/60">
                这是这个页面的会话起点。输入一条消息后，系统会沿用当前页面绑定的共享 profile 继续运行。
              </div>
            ) : null}

            {messages.map((message, index) => {
              const isUser = (message.event_type || message.role) === 'user';
              return (
                <article
                  key={`${message.id || 'event'}-${index}`}
                  className={`max-w-3xl rounded-[28px] border px-5 py-4 ${
                    isUser
                      ? 'ml-auto border-cyan-300/18 bg-cyan-400/12 text-white'
                      : 'border-white/10 bg-white/[0.05] text-white/92'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-4 text-xs uppercase tracking-[0.22em] text-white/42">
                    <span>{isUser ? 'You' : 'Agent'}</span>
                    <span>{formatTime(message.created_at)}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-7">{message.content}</div>
                </article>
              );
            })}

            {streamingText ? (
              <article className="max-w-3xl rounded-[28px] border border-white/10 bg-white/[0.05] px-5 py-4 text-white/92">
                <div className="mb-2 flex items-center justify-between gap-4 text-xs uppercase tracking-[0.22em] text-white/42">
                  <span>Agent</span>
                  <span>正在回复</span>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-7">
                  {streamingText}
                  <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-full bg-cyan-200/80 align-middle" />
                </div>
              </article>
            ) : null}
          </div>

          <div className="border-t border-white/8 px-4 py-4 md:px-6">
            {runError ? (
              <div className="mb-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-50/90">
                {runError}
              </div>
            ) : null}
            <div className="flex flex-col gap-3 md:flex-row">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="给这个页面绑定的 Agent 发一条消息..."
                className="min-h-[120px] flex-1 rounded-[24px] border border-white/12 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/35"
                disabled={loading || Boolean(bootError) || socketState !== 'open' || isRunning}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!canSend}
                className="rounded-[24px] border border-cyan-300/25 bg-cyan-400/15 px-6 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/22 disabled:cursor-not-allowed disabled:opacity-45 md:self-end"
              >
                {isRunning ? '运行中...' : '发送'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
