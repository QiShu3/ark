import { X } from 'lucide-react';
import AppModalFrame from '../AppModalFrame';
import type { BankPreviewQuestion } from '../../lib/deliberate/api';

type Props = {
  question: BankPreviewQuestion | null;
  bankKind: string;
  onClose: () => void;
};

function normalizeOptions(options: unknown): Record<string, string> | null {
  if (!options) return null;
  if (typeof options === 'string') {
    try {
      const parsed = JSON.parse(options);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      // 解析失败，返回 null
    }
    return null;
  }
  if (typeof options === 'object' && !Array.isArray(options)) {
    return options as Record<string, string>;
  }
  return null;
}

function ContentBlockRenderer({ block }: { block: { type: string; text?: string; src?: string; alt?: string; content?: unknown } }) {
  if (block.type === 'image' && block.src) {
    return (
      <div className="my-2">
        <img
          src={block.src}
          alt={block.alt || '题目图片'}
          className="max-h-64 rounded-md border border-ark-border object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    );
  }
  if (block.type === 'paragraph' && block.text) {
    return <p className="text-sm text-ark-text leading-relaxed">{block.text}</p>;
  }
  if (block.type === 'table' && block.content) {
    return (
      <div className="my-2 overflow-x-auto">
        <pre className="rounded-md bg-ark-surface-subtle p-3 text-xs text-ark-text">
          {typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2)}
        </pre>
      </div>
    );
  }
  if (block.type === 'math' && block.text) {
    return <div className="my-2 font-mono text-sm text-ark-text">{block.text}</div>;
  }
  return null;
}

function renderStem(stem: string, evidenceJson?: Record<string, unknown>) {
  const stemBlocks = evidenceJson?.stem_blocks as Array<{ type: string; text?: string; src?: string; alt?: string; content?: unknown }> | undefined;

  if (stemBlocks && stemBlocks.length > 0) {
    return (
      <div className="space-y-1">
        {stemBlocks.map((block, i) => (
          <ContentBlockRenderer key={i} block={block} />
        ))}
      </div>
    );
  }

  return <p className="text-sm text-ark-text leading-relaxed whitespace-pre-wrap">{stem}</p>;
}

export default function QuestionDetailModal({ question, bankKind, onClose }: Props) {
  if (!question) return null;

  const evidenceJson = (question as Record<string, unknown>).evidence as Record<string, unknown> | undefined;
  const explanation = (question as Record<string, unknown>).explanation as string | undefined;
  const isChoice = bankKind === 'choice' || question.type === 'choice';

  return (
    <AppModalFrame open={Boolean(question)} onClose={onClose} ariaLabel="题目详情">
      <div className="w-[640px] max-w-[92vw] max-h-[85vh] overflow-y-auto rounded-xl border border-ark-border bg-ark-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between border-b border-ark-border pb-3">
          <div className="flex items-center gap-2">
            <span className="inline-block rounded bg-ark-accent/10 px-2 py-0.5 text-xs font-medium text-ark-accent">
              {isChoice ? '选择题' : question.type === 'fill' ? '填空题' : question.type === 'subjective' ? '主观题' : '单词'}
            </span>
            {question.subject && (
              <span className="text-xs text-ark-text-faint">{question.subject}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ark-text-muted hover:bg-ark-surface-subtle hover:text-ark-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium text-ark-text-muted">题目内容</div>
            {renderStem(question.stem, evidenceJson)}
          </div>

          {(() => {
            const opts = normalizeOptions(question.options);
            if (!isChoice || !opts) return null;
            return (
              <div>
                <div className="mb-2 text-xs font-medium text-ark-text-muted">选项</div>
                <div className="space-y-1.5">
                  {Object.entries(opts).map(([key, val]) => (
                    <div
                      key={key}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        key === question.answer
                          ? 'border-green-500/30 bg-green-500/5 text-green-600'
                          : 'border-ark-border bg-ark-surface-subtle text-ark-text'
                      }`}
                    >
                      <span className="font-medium">{key}.</span>{' '}
                      {String(val)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {question.answer && !isChoice && (
            <div>
              <div className="mb-2 text-xs font-medium text-ark-text-muted">
                {question.type === 'word' ? '发音' : '参考答案'}
              </div>
              <div className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm text-green-600">
                {question.answer}
              </div>
            </div>
          )}

          {isChoice && question.answer && (
            <div>
              <div className="mb-2 text-xs font-medium text-ark-text-muted">正确答案</div>
              <div className="inline-block rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm font-medium text-green-600">
                {question.answer}
              </div>
            </div>
          )}

          {explanation && (
            <div>
              <div className="mb-2 text-xs font-medium text-ark-text-muted">解析</div>
              <div className="rounded-md bg-ark-surface-subtle px-3 py-2 text-sm text-ark-text leading-relaxed whitespace-pre-wrap">
                {explanation}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppModalFrame>
  );
}
