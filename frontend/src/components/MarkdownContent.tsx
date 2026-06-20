import React from 'react';
import rehypeKatex from 'rehype-katex';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Components } from 'react-markdown';
import 'katex/dist/katex.min.css';

type MarkdownContentProps = {
  content: string;
  className?: string;
  inline?: boolean;
};

function buildComponents(inline: boolean | undefined): Components {
  return {
    p({ children }) {
      if (inline) return <>{children}</>;
      return <p>{children}</p>;
    },

    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const isBlock = match || (typeof children === 'string' && children.includes('\n'));
      if (isBlock) {
        return (
          <pre className="md-code-block">
            <code className={className} {...props}>
              {children}
            </code>
          </pre>
        );
      }
      return (
        <code className="md-inline-code" {...props}>
          {children}
        </code>
      );
    },

    a({ children, ...props }) {
      return (
        <a target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    },

    table({ children, ...props }) {
      return (
        <div className="md-table-wrapper">
          <table {...props}>{children}</table>
        </div>
      );
    },
  };
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className, inline }) => {
  const components = React.useMemo(() => buildComponents(inline), [inline]);
  const Wrapper = inline ? 'span' : 'div';

  return (
    <Wrapper className={['markdown-body', className || ''].join(' ').trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </Wrapper>
  );
};

export default MarkdownContent;
