import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';

import MarkdownContent from '../MarkdownContent';

describe('MarkdownContent', () => {
  it('renders bold text as <strong>', () => {
    render(<MarkdownContent content="这是 **加粗** 文字" />);
    const strong = screen.getByText('加粗');
    expect(strong.tagName).toBe('STRONG');
  });

  it('renders inline code with md-inline-code class', () => {
    render(<MarkdownContent content="使用 `console.log` 调试" />);
    const code = screen.getByText('console.log');
    expect(code).toHaveClass('md-inline-code');
    expect(code.tagName).toBe('CODE');
  });

  it('renders code blocks inside md-code-block container', () => {
    const md = '```js\nconst x = 1;\n```';
    render(<MarkdownContent content={md} />);
    const codeBlock = document.querySelector('.md-code-block');
    expect(codeBlock).toBeInTheDocument();
    expect(codeBlock?.tagName).toBe('PRE');
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
  });

  it('renders GFM tables with md-table-wrapper', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    render(<MarkdownContent content={md} />);
    const wrapper = document.querySelector('.md-table-wrapper');
    expect(wrapper).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders links with target="_blank"', () => {
    render(<MarkdownContent content="[Google](https://google.com)" />);
    const link = screen.getByText('Google');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders unordered lists', () => {
    const md = '- item A\n- item B\n- item C';
    render(<MarkdownContent content={md} />);
    expect(screen.getByText('item A')).toBeInTheDocument();
    expect(screen.getByText('item B')).toBeInTheDocument();
    const listItems = document.querySelectorAll('li');
    expect(listItems.length).toBe(3);
  });

  it('applies markdown-body class to wrapper', () => {
    const { container } = render(<MarkdownContent content="hello" />);
    expect(container.firstChild).toHaveClass('markdown-body');
  });

  it('appends custom className to wrapper', () => {
    const { container } = render(<MarkdownContent content="hello" className="extra" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('markdown-body');
    expect(wrapper).toHaveClass('extra');
  });

  it('renders GFM strikethrough', () => {
    render(<MarkdownContent content="~~deleted~~" />);
    const del = document.querySelector('del');
    expect(del).toBeInTheDocument();
    expect(del?.textContent).toBe('deleted');
  });
});
