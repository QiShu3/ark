import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

type MarkdownContentProps = {
  content: string;
  className?: string;
};

const components: Components = {
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

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className }) => {
  return (
    <div className={['markdown-body', className || ''].join(' ').trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;
