import React from 'react';

export type ContentBlockData = {
  type: 'paragraph' | 'table' | 'image' | 'math' | 'html';
  text?: string;
  content?: unknown;
  src?: string;
  alt?: string;
};

function TableBlock({ content }: { content: unknown }) {
  if (typeof content === 'string') {
    return <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: content }} />;
  }
  if (Array.isArray(content)) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {content.map((row, ri) => (
              <tr key={ri}>
                {Array.isArray(row)
                  ? row.map((cell, ci) => (
                      <td key={ci} className="border border-[var(--focus-work-border)] px-3 py-1.5">
                        {String(cell)}
                      </td>
                    ))
                  : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

function HtmlBlock({ text }: { text: string }) {
  if (/<table/i.test(text)) {
    return <TableBlock content={text} />;
  }
  return (
    <div
      className="prose prose-sm max-w-none text-[var(--focus-work-text)]"
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}

export default function ContentBlockRenderer({ blocks }: { blocks: ContentBlockData[] }) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <p key={i} className="text-[1.02rem] leading-8 text-[var(--focus-work-text)] lg:text-[1.08rem] lg:leading-9">
                {block.text}
              </p>
            );
          case 'table':
            return <TableBlock key={i} content={block.content ?? block.text} />;
          case 'html':
            return <HtmlBlock key={i} text={block.text || ''} />;
          case 'image':
            return (
              <div key={i} className="my-2">
                {block.src ? (
                  <img
                    src={block.src}
                    alt={block.alt || '题目图片'}
                    className="max-h-64 rounded-lg border border-[var(--focus-work-border)]"
                  />
                ) : null}
              </div>
            );
          case 'math':
            return (
              <span key={i} className="font-mono text-sm">
                {block.text}
              </span>
            );
          default:
            return (
              <p key={i} className="text-sm text-[var(--focus-work-text-muted)]">
                {block.text}
              </p>
            );
        }
      })}
    </>
  );
}
