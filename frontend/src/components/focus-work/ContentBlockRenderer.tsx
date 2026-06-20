import React from 'react';

export type ContentBlockData = {
  type: 'paragraph' | 'table' | 'image' | 'math' | 'html';
  text?: string;
  content?: unknown;
  src?: string;
  alt?: string;
};

function parseHtmlToRows(html: string): string[][] {
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells: string[] = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function SafeTable({ content, html }: { content?: unknown; html?: string }) {
  let rows: string[][] = [];

  if (Array.isArray(content)) {
    rows = content.map((row) =>
      Array.isArray(row) ? row.map((cell) => String(cell)) : [],
    );
  } else if (html) {
    rows = parseHtmlToRows(html);
  }

  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="border border-[var(--focus-work-border)] px-3 py-1.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HtmlBlock({ text }: { text: string }) {
  if (/<table/i.test(text)) {
    return <SafeTable html={text} />;
  }
  const stripped = text.replace(/<[^>]+>/g, '').trim();
  return <p className="text-sm">{stripped || text}</p>;
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
            return <SafeTable key={i} content={block.content} html={block.text} />;
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
