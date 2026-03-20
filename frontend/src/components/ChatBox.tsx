import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch, apiJson, apiSSE } from '../lib/api';

/**
 * 聊天框组件
 * 半透明，位于底部
 */
type ChatBoxProps = {
  apiPath?: string;
  scope?: 'general' | 'daily';
  className?: string;
  placeholder?: string;
  sendLabel?: string;
  quickReplies?: string[];
  initialAssistantMessage?: string;
  stream?: boolean;
};

const ChatBox: React.FC<ChatBoxProps> = ({
  apiPath = '/api/chat',
  scope = 'general',
  className,
  placeholder = 'Type a message...',
  sendLabel = 'Send',
  quickReplies: quickRepliesProp,
  initialAssistantMessage,
  stream = true,
}) => {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQuickChat, setShowQuickChat] = useState(true);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  type ChatAction = {
    title?: unknown;
    operation?: unknown;
    message?: unknown;
    request?: {
      method?: unknown;
      url?: unknown;
      body?: unknown;
    };
  };

  const [pendingActions, setPendingActions] = useState<ChatAction[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isExecutingAction, setIsExecutingAction] = useState(false);

  const quickReplies = quickRepliesProp || ['今天有什么安排？', '鼓励我一下', '休息一会儿'];

  const listRef = useRef<HTMLDivElement | null>(null);

  const history = useMemo(
    () => messages.map((m) => ({ role: m.role, content: m.content })),
    [messages]
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.content, toolStatus]);

  useEffect(() => {
    if (!initialAssistantMessage?.trim()) return;
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      return [{ role: 'assistant', content: initialAssistantMessage.trim() }];
    });
  }, [initialAssistantMessage]);

  const sendMessage = useCallback(async (customText?: string) => {
    const text = (customText || input).trim();
    if (!text || isSending) return;

    setError(null);
    setIsSending(true);
    setToolStatus(null);
    if (!customText) setInput('');

    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    if (stream) {
      // 流式模式：使用 SSE
      let assistantContent = '';
      let hasCreatedAssistantMsg = false;
      try {
        await apiSSE(
          `${apiPath}/stream`,
          { message: text, history, scope },
          (event) => {
            const eventType = event.type as string;
            if (eventType === 'delta') {
              const chunk = (event.content as string) || '';
              assistantContent += chunk;
              const currentContent = assistantContent;
              if (!hasCreatedAssistantMsg) {
                hasCreatedAssistantMsg = true;
                setMessages((prev) => [...prev, { role: 'assistant', content: currentContent }]);
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: currentContent };
                  return updated;
                });
              }
              setToolStatus(null);
            } else if (eventType === 'tool_call') {
              const toolName = (event.name as string) || '工具';
              setToolStatus(`正在调用：${toolName}`);
            } else if (eventType === 'actions') {
              const acts = event.actions as ChatAction[];
              if (Array.isArray(acts) && acts.length > 0) {
                setPendingActions(acts);
                setIsConfirming(true);
              }
            } else if (eventType === 'error') {
              setError((event.message as string) || '流式响应错误');
            }
            // 'done' 事件不需要特殊处理
          },
        );
        if (!assistantContent.trim()) {
          setError('AI 返回了空回复');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '发送失败');
      } finally {
        setIsSending(false);
        setToolStatus(null);
      }
    } else {
      // 非流式模式：保留原有逻辑
      try {
        const data = await apiJson<{ reply: string; actions?: ChatAction[] }>(apiPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history, scope }),
        });
        const reply = (data.reply || '').trim();
        if (!reply) throw new Error('空回复');

        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
        if (Array.isArray(data.actions) && data.actions.length > 0) {
          setPendingActions(data.actions);
          setIsConfirming(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '发送失败');
      } finally {
        setIsSending(false);
      }
    }
  }, [input, isSending, stream, apiPath, history, scope]);

  const currentAction = pendingActions.length > 0 ? pendingActions[0] : null;

  const closeConfirm = () => {
    setIsConfirming(false);
    setPendingActions([]);
    setIsExecutingAction(false);
  };

  const onCancelAction = () => {
    if (!currentAction) return closeConfirm();
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: `已取消：${String(currentAction.title || currentAction.operation || '操作')}` },
    ]);
    closeConfirm();
  };

  const onConfirmAction = async () => {
    if (!currentAction) return;
    const req = currentAction.request as { method?: string; url?: string; body?: unknown } | undefined;
    const method = (req?.method || 'POST').toUpperCase();
    const url = typeof req?.url === 'string' ? req.url : '';
    if (!url) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '确认失败：缺少请求地址' }]);
      closeConfirm();
      return;
    }
    setIsExecutingAction(true);
    try {
      const headers = new Headers();
      if (req?.body !== null && typeof req?.body !== 'undefined') {
        headers.set('Content-Type', 'application/json');
      }
      const res = await apiFetch(url, {
        method,
        headers,
        body: req?.body !== null && typeof req?.body !== 'undefined' ? JSON.stringify(req.body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const resultText = await res.text().catch(() => '');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `已确认并执行：${String(currentAction.title || currentAction.operation || '操作')}${
            resultText ? `\n\n${resultText}` : ''
          }`,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `执行失败：${e instanceof Error ? e.message : '未知错误'}` },
      ]);
    } finally {
      closeConfirm();
    }
  };

  const rootClassName = ['flex flex-col min-h-0 h-full', className || ''].join(' ').trim();

  return (
    <div className={rootClassName}>
      {isConfirming && currentAction ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 rounded-2xl">
          <div className="w-[92%] max-w-md bg-zinc-900/90 border border-white/10 rounded-2xl p-4 shadow-xl">
            <div className="text-white text-base font-medium mb-2">{String(currentAction.title || '需要确认')}</div>
            <div className="text-white/70 text-sm whitespace-pre-wrap mb-4">
              {String(currentAction.message || '即将执行敏感操作，是否确认？')}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onCancelAction}
                disabled={isExecutingAction}
                className="px-3 py-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={onConfirmAction}
                disabled={isExecutingAction}
                className="px-3 py-2 rounded-lg bg-blue-500/80 text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {isExecutingAction ? '执行中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto mb-4 space-y-2">
        {messages.map((m, idx) => (
          <div
            key={`${m.role}-${idx}`}
            className={[
              'text-white/80 p-2 rounded w-fit max-w-[80%]',
              m.role === 'user' ? 'ml-auto bg-white/10' : 'bg-white/5',
            ].join(' ')}
          >
            {m.content}
          </div>
        ))}

        {error ? (
          <div className="text-red-200 bg-red-500/10 p-2 rounded w-fit max-w-[80%]">
            {error}
          </div>
        ) : null}

        {toolStatus ? (
          <div className="text-blue-200 bg-blue-500/10 p-2 rounded w-fit max-w-[80%] animate-pulse text-sm">
            🔧 {toolStatus}
          </div>
        ) : null}
      </div>
      
      {showQuickChat ? (
        <div className="mb-3 bg-black/60 backdrop-blur-md rounded-xl p-2 border border-white/10 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex justify-between items-center px-1">
            <span className="text-xs text-white/50">快捷回复</span>
            <button
              onClick={() => setShowQuickChat(false)}
              className="text-xs text-white/50 hover:text-white transition-colors"
            >
              收回
            </button>
          </div>
          <div className="flex gap-2">
            {quickReplies.map((reply) => (
              <button
                key={reply}
                onClick={() => sendMessage(reply)}
                disabled={isSending}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white/80 text-sm py-1.5 px-3 rounded-lg transition-colors truncate disabled:opacity-50 text-left"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowQuickChat(true)}
          className="mb-2 self-start text-xs bg-black/40 backdrop-blur px-2 py-1 rounded-lg border border-white/10 text-white/50 hover:text-white transition-colors"
        >
          快捷回复
        </button>
      )}

      <div className="h-12 bg-white/10 rounded-full flex items-center px-4 border border-white/20">

        <input 
          type="text" 
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendMessage();
          }}
          disabled={isSending}
          className="bg-transparent border-none outline-none text-white flex-1 placeholder-white/50 disabled:opacity-70"
        />
        <button
          onClick={() => sendMessage()}
          disabled={isSending || !input.trim()}
          className="text-white/70 hover:text-white disabled:opacity-50"
        >
          {isSending ? '...' : sendLabel}
        </button>
      </div>
    </div>
  );
};

export default ChatBox;
