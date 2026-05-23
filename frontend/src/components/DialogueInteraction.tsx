import React from 'react';
import { Send, VolumeX } from 'lucide-react';
import { cn } from '../lib/utils';
import MarkdownContent from './MarkdownContent';

const DEFAULT_DIALOGUE =
  '你好！我是莫宁。你可以从右侧的快捷选项中选择回复，或者直接在下方输入你的问题。';

const DEFAULT_SUGGESTIONS = ['给我介绍一下这个系统', '你是谁？', '如何开始使用？'];

/**
 * 对话框与交互框合并组件
 * 保留原有视觉结构，但静态展示，不再接入运行时会话。
 */
const DialogueInteraction: React.FC = () => {
  return (
    <div className="absolute bottom-0 left-0 w-full z-10 flex flex-col justify-end pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent pointer-events-none -z-10" />

      <div className="w-full px-6 md:px-10 pb-6 md:pb-10 pointer-events-auto flex flex-col gap-6">
        <div className="self-end w-full max-w-[280px] flex flex-col gap-2">
          {DEFAULT_SUGGESTIONS.map((suggestion, idx) => (
            <button
              key={suggestion}
              type="button"
              disabled
              className={cn(
                'group relative flex items-center justify-between w-full px-4 py-2.5',
                'bg-black/40 backdrop-blur-md border border-white/10 rounded-lg text-left',
                'transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0',
              )}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="font-mono text-blue-400 text-xs tracking-wider opacity-70">
                  0{idx + 1}
                </span>
                <span className="text-white/90 truncate text-sm">{suggestion}</span>
              </div>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-2/3 bg-gradient-to-b from-blue-400 to-purple-600 rounded-l-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          ))}

          <div className="relative w-full group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-purple-400 text-xs tracking-wider opacity-70 z-10">
              0{DEFAULT_SUGGESTIONS.length + 1}
            </div>
            <input
              type="text"
              value=""
              disabled
              placeholder="Enter your message..."
              className={cn(
                'w-full pl-10 pr-10 py-2.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-lg text-sm',
                'text-white/90 placeholder:text-white/30 focus:outline-none focus:border-blue-500/50',
                'focus:ring-1 focus:ring-blue-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            />
            <button
              type="button"
              disabled
              className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md',
                'text-white/50 hover:text-white hover:bg-white/10 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative w-full">
          <div className="absolute top-0 -translate-y-1/2 left-4 px-6 py-2 bg-gradient-to-r from-slate-500/90 to-slate-700/90 rounded-xl backdrop-blur-md border border-white/10 shadow-[0_0_15px_rgba(100,116,139,0.4)] z-10">
            <span className="text-white font-bold tracking-wider text-sm md:text-base drop-shadow-md">
              莫宁
            </span>
          </div>

          <div className="bg-black/50 backdrop-blur-xl border border-transparent rounded-2xl p-5 md:p-6 h-[160px] md:h-[190px] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full -translate-x-1/2 -translate-y-1/2" />

            <button
              type="button"
              disabled
              className={cn(
                'absolute top-4 right-4 z-20 p-2 rounded-full transition-colors pointer-events-auto',
                'bg-white/5 text-white/40 hover:bg-white/10 opacity-50 cursor-not-allowed',
              )}
            >
              <VolumeX className="w-4 h-4" />
            </button>

            <div className="relative z-10 h-full overflow-y-auto pr-2">
              <MarkdownContent
                content={DEFAULT_DIALOGUE}
                className="text-white/95 text-sm md:text-base font-medium tracking-wide leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DialogueInteraction;
