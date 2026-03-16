import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import '@testing-library/jest-dom';
import Arxiv from '../Arxiv';
import { apiJson } from '../../lib/api';

// Mock API module
vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

// Mock child components
vi.mock('../../components/Navigation', () => ({
  default: () => <div data-testid="navigation">Navigation</div>,
}));
vi.mock('../../components/ChatBox', () => ({
  default: () => <div data-testid="chatbox">ChatBox</div>,
}));
vi.mock('../../components/AIAssistantShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('Arxiv Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/api/arxiv/daily/config') return { 
        keywords: 'test', 
        limit: 10,
        last_run_on: '2023-01-01' 
      };
      if (url === '/api/arxiv/daily/candidates') return [];
      if (url === '/api/arxiv/daily/summary') return { summary: 'summary' };
      if (url === '/api/arxiv/papers?limit=200') return [];
      return {};
    });
  });

  it('renders in collapsed state by default', async () => {
    render(<Arxiv />);
    expect(screen.getByText('每日配置更改')).toBeInTheDocument();
    expect(await screen.findByText(/最近刷新/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('关键词')).not.toBeInTheDocument();
  });

  it('expands configuration on button click', async () => {
    const user = userEvent.setup();
    render(<Arxiv />);
    
    await user.click(screen.getByText('每日配置更改'));
    
    expect(screen.getByPlaceholderText('关键词')).toBeInTheDocument();
    expect(screen.getByText('保存每日配置')).toBeInTheDocument();
  });

  it('collapses after saving configuration', async () => {
    const user = userEvent.setup();
    render(<Arxiv />);
    
    // Expand config
    await user.click(screen.getByText('每日配置更改'));
    
    // Check if expanded
    expect(screen.getByPlaceholderText('关键词')).toBeInTheDocument();
    
    // Save config
    const saveBtn = screen.getByText('保存每日配置');
    await user.click(saveBtn);
    
    // Should collapse after save completes
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('关键词')).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
