import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import AppCenter from '../AppCenter';

vi.mock('../lib/api', () => ({
  apiJson: vi.fn().mockResolvedValue({
    is_checked_in_today: false,
    current_streak: 2,
    total_days: 5
  }),
  apiFetch: vi.fn(),
}));

// Mock canvas-confetti
vi.mock('canvas-confetti', () => {
  return {
    default: vi.fn(),
  };
});

describe('AppCenter', () => {
  it('renders AppCenter and CheckinCard', async () => {
    render(
      <MemoryRouter>
        <AppCenter />
      </MemoryRouter>
    );

    // Verify main heading
    expect(screen.getByRole('heading', { name: '应用中心' })).toBeInTheDocument();
    
    // Verify CheckinCard elements exist after loading
    expect(await screen.findByText('每日打卡')).toBeInTheDocument();
  });
});
