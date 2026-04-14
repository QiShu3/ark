import React, { useState, useMemo } from 'react';
import { Send } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAgentChat } from '../hooks/useAgentChat';

/**
 * 提取 AI 回复中的 <suggestions> 标签内容
 * 示例: "你好<suggestions>['选项1', '选项2']</suggestions>"
 */
function parseSuggestions(text: string): { cleanText: string; extractedSuggestions: string[] } {
  const suggestionRegex = /<suggestions>([\s\S]*?)<\/suggestions>/;
  const match = text.match(suggestionRegex);
  
  let extractedSuggestions: string[] = [];
  const cleanText = text.replace(suggestionRegex, '').trim();

  if (match && match[1]) {
    try {
      // 尝试解析 JSON 数组
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        extractedSuggestions = parsed.filter(item => typeof item === 'string').slice(0, 3);
      }
    } catch {
      // 解析失败，忽略
    }
  }

  return { cleanText, extractedSuggestions };
}

/**
 * 对话框与交互框合并组件
 * 包含底部的字幕对话框和右下侧的快捷交互选项与自由输入框。
 * 该组件采用绝对定位，放置在父容器底部。
 */
const DialogueInteraction: React.FC = () => {
  const [inputValue, setInputValue] = useState('');

  // 接入真实的 WebSocket 会话
  const { messages, isGenerating, streamingText, sendMessage, socketState } = useAgentChat('MainAgent');

  // 获取最新的一条 AI 回复（或者正在流式输出的文本）
  const { latestAiMessage, latestSuggestions } = useMemo(() => {
    if (streamingText) {
      // 正在流式输出时
      const { cleanText, extractedSuggestions } = parseSuggestions(streamingText);
      return { latestAiMessage: cleanText, latestSuggestions: extractedSuggestions };
    } else {
      // 获取历史消息中最后一条 assistant 消息
      const assistantMessages = messages.filter(m => m.role === 'assistant_message' || m.role === 'assistant');
      if (assistantMessages.length > 0) {
        const lastMsg = assistantMessages[assistantMessages.length - 1];
        const { cleanText, extractedSuggestions } = parseSuggestions(lastMsg.content);
        return { latestAiMessage: cleanText, latestSuggestions: extractedSuggestions };
      }
    }
    
    // 如果没有任何建议选项，我们提供一些默认的 fallback
    return { 
      latestAiMessage: '你好！我是莫宁。你可以从右侧的快捷选项中选择回复，或者直接在下方输入你的问题。', 
      latestSuggestions: ['给我介绍一下这个系统', '你是谁？', '如何开始使用？'] 
    };
  }, [messages, streamingText]);

  // 直接将 latestAiMessage 用作显示内容，去除冗余的 useState，以符合 React 的纯函数渲染模式
  const typedContent = latestAiMessage;
  
  // 提供 fallback
  const suggestions = latestSuggestions.length > 0 ? latestSuggestions : ['给我介绍一下这个系统', '你是谁？', '如何开始使用？'];
  const dialogueContent = isGenerating && !streamingText ? '……' : typedContent;

  /**
   * 处理消息发送
   */
  const handleSend = (message: string) => {
    if (!message.trim() || isGenerating || socketState !== 'open') return;
    
    // 清空输入
    setInputValue('');
    // 发送至 WebSocket
    sendMessage(message);
  };

  return (
    <div className="absolute bottom-0 left-0 w-full z-10 flex flex-col justify-end pointer-events-none">
      {/* 底部整体渐变遮罩，不阻挡鼠标事件但提供视觉背景 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent pointer-events-none -z-10" />

      {/* 主体内容容器，恢复指针事件 */}
      <div className="w-full px-6 md:px-10 pb-6 md:pb-10 pointer-events-auto flex flex-col gap-6">
        
        {/* 右侧交互菜单：快捷选项 + 自由输入 */}
        <div className="self-end w-full max-w-[280px] flex flex-col gap-2">
          {/* 渲染快捷选项 */}
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              disabled={isGenerating}
              onClick={() => handleSend(suggestion)}
              className={cn(
                "group relative flex items-center justify-between w-full px-4 py-2.5",
                "bg-black/40 backdrop-blur-md border border-white/10 rounded-lg text-left",
                "transition-all duration-300 hover:-translate-x-2 hover:bg-black/60",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0"
              )}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="font-mono text-blue-400 text-xs tracking-wider opacity-70">
                  0{idx + 1}
                </span>
                <span className="text-white/90 truncate text-sm">{suggestion}</span>
              </div>
              {/* 右侧蓝紫渐变指示线 */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-2/3 bg-gradient-to-b from-blue-400 to-purple-600 rounded-l-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          ))}

          {/* 自由输入框 (第4个选项) */}
          <div className="relative w-full group">
            {/* 编号 */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-purple-400 text-xs tracking-wider opacity-70 z-10">
              0{suggestions.length + 1}
            </div>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputValue.trim()) {
                  handleSend(inputValue);
                }
              }}
              disabled={isGenerating}
              placeholder="Enter your message..."
              className={cn(
                "w-full pl-10 pr-10 py-2.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-lg text-sm",
                "text-white/90 placeholder:text-white/30 focus:outline-none focus:border-blue-500/50",
                "focus:ring-1 focus:ring-blue-500/30 transition-all duration-300",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            />
            {/* 发送按钮 */}
            <button
              disabled={isGenerating || !inputValue.trim()}
              onClick={() => handleSend(inputValue)}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md",
                "text-white/50 hover:text-white hover:bg-white/10 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 底部字幕对话框 */}
        <div className="relative w-full">
          {/* 专属名牌 - 高度中心对齐对话框上边缘 */}
          <div className="absolute top-0 -translate-y-1/2 left-4 px-6 py-2 bg-gradient-to-r from-slate-500/90 to-slate-700/90 rounded-xl backdrop-blur-md border border-white/10 shadow-[0_0_15px_rgba(100,116,139,0.4)] z-10">
            <span className="text-white font-bold tracking-wider text-sm md:text-base drop-shadow-md">
              莫宁
            </span>
          </div>
          
          {/* 对话内容容器 - 移除边框颜色，设为透明 */}
          <div className="bg-black/50 backdrop-blur-xl border border-transparent rounded-2xl p-6 md:p-8 min-h-[140px] shadow-2xl relative overflow-hidden">
            {/* 装饰性发光背景 */}
            <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full -translate-x-1/2 -translate-y-1/2" />
            
            <p className="text-white/95 text-lg md:text-2xl font-medium tracking-wide leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] relative z-10">
              {dialogueContent}
              {isGenerating && (
                <span className="inline-block w-3 md:w-4 h-6 md:h-8 ml-2 bg-blue-400 animate-pulse align-middle shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
              )}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DialogueInteraction;
