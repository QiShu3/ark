import React, { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * 对话框与交互框合并组件
 * 包含底部的字幕对话框和右下侧的快捷交互选项与自由输入框。
 * 该组件采用绝对定位，放置在父容器底部。
 */
const DialogueInteraction: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [displayContent, setDisplayContent] = useState('');
  const [fullContent, setFullContent] = useState('你好！我是 AI 助手。你可以从右侧的快捷选项中选择回复，或者直接在下方输入你的问题。');
  const [suggestions, setSuggestions] = useState<string[]>([
    '给我介绍一下这个系统',
    '讲一个有趣的科幻故事',
    '如何开始使用？',
  ]);

  // 模拟打字机效果
  useEffect(() => {
    if (!fullContent) return;
    
    let currentIndex = 0;
    setIsGenerating(true);
    setDisplayContent('');

    const timer = setInterval(() => {
      setDisplayContent(fullContent.slice(0, currentIndex + 1));
      currentIndex++;

      if (currentIndex >= fullContent.length) {
        clearInterval(timer);
        setIsGenerating(false);
      }
    }, 50); // 每 50ms 打印一个字符

    return () => clearInterval(timer);
  }, [fullContent]);

  /**
   * 处理消息发送
   * @param message - 发送的消息内容
   */
  const handleSend = (message: string) => {
    if (!message.trim() || isGenerating) return;
    
    // 模拟发送并清空输入
    setInputValue('');
    setIsGenerating(true);
    
    // 模拟网络延迟后的回复
    setTimeout(() => {
      setFullContent(`这是我对“${message}”的模拟回复。目前还在开发阶段，后续将接入真实的后端 API。`);
      // 随机更新一些建议选项
      setSuggestions([
        '继续深入了解',
        '换个话题',
        '返回主菜单',
      ]);
    }, 600);
  };

  return (
    <div className="absolute bottom-0 left-0 w-full z-10 flex flex-col justify-end pointer-events-none">
      {/* 底部整体渐变遮罩，不阻挡鼠标事件但提供视觉背景 */}
      <div className="absolute bottom-0 left-0 w-full h-[50%] bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none -z-10" />

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
          {/* 专属名牌 */}
          <div className="absolute -top-10 left-4 px-6 py-2 bg-gradient-to-r from-slate-500/90 to-slate-700/90 rounded-t-xl rounded-br-xl backdrop-blur-md border border-white/10 shadow-[0_0_15px_rgba(100,116,139,0.4)] z-10">
            <span className="text-white font-bold tracking-wider text-sm md:text-base drop-shadow-md">
              莫宁
            </span>
          </div>
          
          {/* 对话内容容器 */}
          <div className="bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl rounded-tl-none p-6 md:p-8 min-h-[140px] shadow-2xl relative overflow-hidden">
            {/* 装饰性发光背景 */}
            <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full -translate-x-1/2 -translate-y-1/2" />
            
            <p className="text-white/95 text-lg md:text-2xl font-medium tracking-wide leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] relative z-10">
              {displayContent}
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
