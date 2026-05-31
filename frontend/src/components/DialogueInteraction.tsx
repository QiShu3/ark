import React from 'react';
import { HelpCircle, MessageCircleQuestion, Send, Sparkles, SquarePen } from 'lucide-react';
import { cn } from '../lib/utils';
import MarkdownContent from './MarkdownContent';

const DEFAULT_DIALOGUE =
  '你好！我是莫宁。你可以从右侧的快捷选项中选择回复，或者直接在下方输入你的问题。';

const DEFAULT_SUGGESTIONS = [
  { label: '给我介绍一下这个系统', Icon: MessageCircleQuestion },
  { label: '你是谁？', Icon: HelpCircle },
  { label: '如何开始使用？', Icon: SquarePen },
];

/**
 * 对话框与交互框合并组件
 * 保留原有视觉结构，但静态展示，不再接入运行时会话。
 */
const DialogueInteraction: React.FC = () => {
  return (
    <div className="ark-dialogue pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 md:px-4 md:pb-4">
      <section className="ark-dialogue-card pointer-events-auto relative overflow-hidden rounded-[28px] px-5 pb-5 pt-6 backdrop-blur-2xl md:px-7 md:pb-7 md:pt-7">
        <div className="ark-dialogue-speaker mb-4 flex w-fit items-center gap-2 rounded-2xl px-4 py-2 backdrop-blur-md">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-semibold md:text-base">莫宁</span>
        </div>

        <div className="relative z-10 max-h-[92px] overflow-y-auto pr-2">
          <MarkdownContent
            content={DEFAULT_DIALOGUE}
            className="ark-dialogue-message text-sm font-medium leading-7 md:text-base"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {DEFAULT_SUGGESTIONS.map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              className={cn(
                'ark-dialogue-option ark-focus-ring flex h-11 min-w-0 items-center justify-center gap-2 rounded-full px-5 text-sm',
                'backdrop-blur-md transition-colors hover:border-[var(--ark-border-strong)]',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
        </div>

        <div className="ark-dialogue-input-wrap mt-7 flex h-16 items-center gap-3 rounded-full px-5 backdrop-blur-md">
            <input
              type="text"
              value=""
              readOnly
              placeholder="输入你的问题..."
              className={cn(
                'ark-dialogue-input min-w-0 flex-1 bg-transparent text-sm',
                'focus:outline-none',
              )}
            />
            <button
              type="button"
              className={cn(
                'ark-dialogue-send ark-focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95',
              )}
              aria-label="发送消息"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
            </button>
        </div>
      </section>
    </div>
  );
};

export default DialogueInteraction;
