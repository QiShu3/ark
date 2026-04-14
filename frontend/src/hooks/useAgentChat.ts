import { useState, useEffect, useRef, useCallback } from 'react';
import { apiJson } from '../lib/api';
import { useAuthStore } from '../lib/auth';

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

export function useAgentChat(profileKey: string = 'agent-console') {
  const token = useAuthStore((s) => s.token);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [socketState, setSocketState] = useState<'disconnected' | 'connecting' | 'open'>('disconnected');
  
  const socketRef = useRef<WebSocket | null>(null);
  const streamingRawTextRef = useRef('');
  const streamingTimerRef = useRef<number | null>(null);

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

  // 初始化 Session 和历史记录
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setError(null);
      try {
        const nextSession = await getOrCreatePageSession(profileKey);
        if (cancelled) return;
        setSession(nextSession);

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
        }
        return;
      }

      if (data.type === 'error') {
        setError(data.error);
        setIsGenerating(false);
        resetStreamingText();
        return;
      }

      if (data.type === 'message_event') {
        const eventType = data.event.event_type || data.event.role;
        if (eventType === 'content_delta') {
          const delta = data.event.content || '';
          if (!delta) return;
          streamingRawTextRef.current += delta;
          startStreamingPump();
          return;
        }

        if (eventType === 'assistant_message') {
          resetStreamingText();
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
        resetStreamingText();
        return;
      }

      if (data.type === 'run_completed' || data.type === 'run_failed' || data.type === 'run_cancelled') {
        setIsGenerating(false);
        setSession((current) => (current ? { ...current, status: data.type === 'run_completed' ? 'completed' : 'failed' } : current));
        if (data.type !== 'run_completed') resetStreamingText();
        return;
      }
    };

    socket.onerror = () => {
      setError('WebSocket 连接发生错误');
      setIsGenerating(false);
      resetStreamingText();
    };

    socket.onclose = () => {
      setSocketState('disconnected');
      setIsGenerating(false);
      resetStreamingText();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      resetStreamingText();
      socket.close();
    };
  }, [resetStreamingText, session?.id, startStreamingPump, token]);

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

  return {
    session,
    messages,
    isGenerating,
    streamingText,
    error,
    socketState,
    sendMessage,
  };
}
