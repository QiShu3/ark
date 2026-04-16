import { useState, useEffect, useRef, useCallback } from 'react';
import { apiJson } from '../lib/api';
import { useAuthStore } from '../lib/auth';
import { useTts } from './useTts';

export type MessageResponse = {
  id: string | null;
  session_id: string;
  run_id?: string | null;
  role: string;
  content: string;
  event_type?: string | null;
  created_at: string;
};

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

type SocketPacket =
  | { type: 'connected'; session_id: string; status?: string }
  | { type: 'message_event'; session_id: string; event: MessageResponse }
  | { type: 'run_started' | 'run_completed' | 'run_failed' | 'run_cancelled'; session_id: string }
  | { type: 'error'; session_id: string; error: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { type: string; [key: string]: any }; // Catch all for TTS and other events

const visibleEventTypes = new Set(['user', 'assistant_message']);
const pageSessionRequests = new Map<string, Promise<SessionResponse>>();
const AUTO_OPEN_COOLDOWN_MS = 60 * 60 * 1000;
const AUTO_OPEN_STORAGE_KEY = 'ark:auto-open:MainAgent:last-run-started-at';
const HOME_AUTO_OPEN_SOURCE = 'home_auto_open';

type AutoOpenPhase = 'idle' | 'blocked' | 'ready' | 'sending' | 'confirmed' | 'done';

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

function currentHashPath() {
  if (typeof window === 'undefined') {
    return '/';
  }

  const hash = window.location.hash || '#/';
  const route = hash.startsWith('#') ? hash.slice(1) : hash;
  const [path] = route.split('?');
  return path || '/';
}

function isHomeMainAgentScope(profileKey: string) {
  return profileKey === 'MainAgent' && currentHashPath() === '/';
}

function buildAutoOpenPrompt() {
  return [
    `来源：${HOME_AUTO_OPEN_SOURCE}`,
    '场景：用户刚进入或刷新 Ark 首页，当前页面绑定 MainAgent，会话可能已有历史消息。',
    '角色：你是首页助手“莫宁”。',
    '任务：发起一段简短的延续型开场。',
    '',
    '要求：',
    '1. 不要把这次开场说成第一次见面。',
    '2. 不要长篇自我介绍。',
    '3. 用 1-2 句话说明你已在首页待命，可以继续帮助用户。',
    '4. 结合首页场景给出 2-3 个自然的下一步建议。',
    '5. 建议项必须放在 <suggestions>JSON数组</suggestions> 中。',
  ].join('\n');
}

function isAutoOpenCooldownExpired() {
  if (typeof window === 'undefined') {
    return true;
  }

  const persisted = window.localStorage.getItem(AUTO_OPEN_STORAGE_KEY);
  if (!persisted) {
    return true;
  }

  try {
    const parsed = JSON.parse(persisted) as { timestamp?: string };
    if (!parsed.timestamp) {
      return true;
    }

    const lastStartedAt = new Date(parsed.timestamp).getTime();
    if (!Number.isFinite(lastStartedAt)) {
      return true;
    }

    return Date.now() - lastStartedAt >= AUTO_OPEN_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function persistAutoOpenCooldown() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    AUTO_OPEN_STORAGE_KEY,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: HOME_AUTO_OPEN_SOURCE,
      profileKey: 'MainAgent',
    }),
  );
}

function canAttemptAutoOpen({
  profileKey,
  session,
  socketState,
  isGenerating,
  hasAttempted,
  awaitingAck,
}: {
  profileKey: string;
  session: SessionResponse | null;
  socketState: 'disconnected' | 'connecting' | 'open';
  isGenerating: boolean;
  hasAttempted: boolean;
  awaitingAck: boolean;
}) {
  return (
    isHomeMainAgentScope(profileKey)
    && Boolean(session)
    && socketState === 'open'
    && !isGenerating
    && !hasAttempted
    && !awaitingAck
    && isAutoOpenCooldownExpired()
  );
}

export function useAgentChat(profileKey: string = 'agent-console') {
  const token = useAuthStore((s) => s.token);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [socketState, setSocketState] = useState<'disconnected' | 'connecting' | 'open'>('disconnected');
  const [autoOpenPhase, setAutoOpenPhase] = useState<AutoOpenPhase>('idle');

  const tts = useTts();

  const socketRef = useRef<WebSocket | null>(null);
  const streamingRawTextRef = useRef('');
  const streamingTimerRef = useRef<number | null>(null);
  const hasAutoOpenAttemptedRef = useRef(false);
  const autoOpenAwaitingAckRef = useRef(false);

  const stopStreamingTimer = useCallback(() => {
    if (streamingTimerRef.current !== null) {
      window.clearTimeout(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }
  }, []);

  const resetStreamingText = useCallback(() => {
    streamingRawTextRef.current = '';
    stopStreamingTimer();
    setStreamingText('');
  }, [stopStreamingTimer]);

  const startStreamingPump = useCallback(() => {
    if (streamingTimerRef.current !== null) return;
    const tick = () => {
      streamingTimerRef.current = null;
      const raw = streamingRawTextRef.current;
      setStreamingText((current) => {
        if (current.length >= raw.length) return current;
        const nextLen = Math.min(raw.length, current.length + 1);
        const next = raw.slice(0, nextLen);
        if (nextLen < raw.length) {
          streamingTimerRef.current = window.setTimeout(tick, 12);
        }
        return next;
      });
    };
    tick();
  }, []);

  const resetStreamingTextRef = useRef(resetStreamingText);
  const startStreamingPumpRef = useRef(startStreamingPump);
  const resetTtsRef = useRef(tts.resetTts);
  const handleTtsMessageRef = useRef(tts.handleTtsMessage);

  useEffect(() => {
    resetStreamingTextRef.current = resetStreamingText;
    startStreamingPumpRef.current = startStreamingPump;
    resetTtsRef.current = tts.resetTts;
    handleTtsMessageRef.current = tts.handleTtsMessage;
  }, [resetStreamingText, startStreamingPump, tts.resetTts, tts.handleTtsMessage]);

  useEffect(() => {
    hasAutoOpenAttemptedRef.current = false;
    autoOpenAwaitingAckRef.current = false;
    setAutoOpenPhase(isHomeMainAgentScope(profileKey) ? 'idle' : 'done');
  }, [profileKey]);

  // 初始化 Session 和历史记录 
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setError(null);
      resetTtsRef.current();
      try {
        const nextSession = await getOrCreatePageSession(profileKey);
        if (cancelled) return;
        setSession(nextSession);
        setIsGenerating(nextSession.status === 'running');

        const history = await apiJson<MessageResponse[]>(`/api/sessions/${nextSession.id}/messages`);
        if (cancelled) return;
        setMessages(history.filter((item) => visibleEventTypes.has(item.event_type || item.role)));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '会话初始化失败');
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [profileKey]);



  // 管理 WebSocket 连接
  useEffect(() => {
    const sessionId = session?.id;
    if (!sessionId || !token) {
      return;
    }

    if (socketRef.current) {
      socketRef.current.close();
    }
    
    let cancelled = false;

    setTimeout(() => {
      if (cancelled) return;
      setSocketState('connecting');
    }, 0);
    const socket = new WebSocket(buildWebSocketUrl(sessionId, token));
    socketRef.current = socket;

    socket.onopen = () => {
      setSocketState('open');
      setError(null);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as SocketPacket;
      if (data.session_id !== sessionId) return;

      if (data.type === 'connected') {
        if (data.status) {
          setSession((current) => (current ? { ...current, status: data.status || current.status } : current));
          setIsGenerating(data.status === 'running');
        }
        return;
      }

      if (data.type.startsWith('tts_')) {
        handleTtsMessageRef.current(data);
        return;
      }

      if (data.type === 'error') {
        setError(data.error);
        setIsGenerating(false);
        resetStreamingTextRef.current();
        return;
      }

      if (data.type === 'message_event') {
        const eventType = data.event.event_type || data.event.role;
        if (eventType === 'content_delta') {
          const delta = data.event.content || '';
          if (!delta) return;
          streamingRawTextRef.current += delta;
          startStreamingPumpRef.current();
          return;
        }

        if (eventType === 'assistant_message') {
          resetStreamingTextRef.current();
        }

        if (visibleEventTypes.has(eventType)) {
          setMessages((current) => [...current, data.event]);
        }
        return;
      }

      if (data.type === 'run_started') {
        setIsGenerating(true);
        setSession((current) => (current ? { ...current, status: 'running' } : current));
        setError(null);
        resetStreamingTextRef.current();
        if (autoOpenAwaitingAckRef.current) {
          setAutoOpenPhase('confirmed');
        }
        return;
      }

      if (data.type === 'run_completed' || data.type === 'run_failed' || data.type === 'run_cancelled') {
        setIsGenerating(false);
        setSession((current) => (current ? { ...current, status: data.type === 'run_completed' ? 'completed' : 'failed' } : current));
        if (data.type !== 'run_completed') resetStreamingTextRef.current();
        return;
      }
    };

    socket.onerror = () => {
      setError('WebSocket 连接发生错误');
      setIsGenerating(false);
      resetStreamingTextRef.current();
    };

    socket.onclose = () => {
      setSocketState('disconnected');
      setIsGenerating(false);
      resetStreamingTextRef.current();
      resetTtsRef.current();
      if (autoOpenAwaitingAckRef.current) {
        autoOpenAwaitingAckRef.current = false;
        setAutoOpenPhase('done');
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };

    return () => {
      cancelled = true;
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      resetStreamingTextRef.current();
      resetTtsRef.current();
      socket.close();
    };
  }, [session?.id, token]);

  const sendMessage = useCallback((content: string) => {
    const socket = socketRef.current;
    if (!content.trim() || !socket || socket.readyState !== WebSocket.OPEN || isGenerating) {
      return false;
    }
    
    socket.send(JSON.stringify({ type: 'run', content: content.trim() }));
    setIsGenerating(true);
    resetStreamingText();
    setError(null);
    return true;
  }, [isGenerating, resetStreamingText]);

  useEffect(() => {
    if (!isHomeMainAgentScope(profileKey)) {
      return;
    }

    if (autoOpenPhase === 'done' || autoOpenPhase === 'sending' || autoOpenPhase === 'confirmed') {
      return;
    }

    const eligible = canAttemptAutoOpen({
      profileKey,
      session,
      socketState,
      isGenerating,
      hasAttempted: hasAutoOpenAttemptedRef.current,
      awaitingAck: autoOpenAwaitingAckRef.current,
    });

    if (!eligible) {
      setAutoOpenPhase((current) => (current === 'idle' || current === 'ready' ? 'blocked' : current));
      return;
    }

    setAutoOpenPhase('ready');
    tts.ensureAutoPlayReady?.();
    const sent = sendMessage(buildAutoOpenPrompt());
    if (!sent) {
      setAutoOpenPhase('blocked');
      return;
    }

    hasAutoOpenAttemptedRef.current = true;
    autoOpenAwaitingAckRef.current = true;
    setAutoOpenPhase('sending');
  }, [autoOpenPhase, isGenerating, profileKey, sendMessage, session, socketState, tts]);

  useEffect(() => {
    if (autoOpenPhase !== 'confirmed') {
      return;
    }

    persistAutoOpenCooldown();
    autoOpenAwaitingAckRef.current = false;
    setAutoOpenPhase('done');
  }, [autoOpenPhase]);

  return {
    session,
    messages,
    isGenerating,
    streamingText,
    error,
    socketState,
    sendMessage,
    tts,
  };
}
