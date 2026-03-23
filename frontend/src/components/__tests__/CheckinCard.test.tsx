import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckinCard } from '../CheckinCard';
import * as api from '../../lib/api';
import confetti from 'canvas-confetti';

// Mock the API layer
vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
  apiFetch: vi.fn(),
}));

// Mock confetti
vi.mock('canvas-confetti', () => {
  return {
    default: vi.fn(),
  };
});

describe('CheckinCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockNotCheckedIn = {
    is_checked_in_today: false,
    current_streak: 5,
    total_days: 10,
  };

  const mockCheckedIn = {
    is_checked_in_today: true,
    current_streak: 6,
    total_days: 11,
  };

  it('displays loading state initially', async () => {
    // Return a promise that doesn't resolve immediately
    let resolveApi: (value: unknown) => void;
    vi.mocked(api.apiJson).mockImplementation(
      () => new Promise((resolve) => { resolveApi = resolve; })
    );

    const { container } = render(<CheckinCard />);
    
    // The loading spinner should be present
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();

    // Resolve the promise to cleanup
    resolveApi!(mockNotCheckedIn);
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
    });
  });

  it('renders "立即打卡" when not checked in', async () => {
    vi.mocked(api.apiJson).mockResolvedValue(mockNotCheckedIn);

    render(<CheckinCard />);

    await waitFor(() => {
      expect(screen.getByText('立即打卡')).toBeInTheDocument();
    });

    // Check streak and total days
    expect(screen.getByText('连续打卡 5 天')).toBeInTheDocument();
    expect(screen.getByText('累计打卡 10 天')).toBeInTheDocument();
  });

  it('renders "今日已打卡" when already checked in', async () => {
    vi.mocked(api.apiJson).mockResolvedValue(mockCheckedIn);

    render(<CheckinCard />);

    await waitFor(() => {
      expect(screen.getByText(/今日已打卡/)).toBeInTheDocument();
    });

    // The button should be disabled
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    
    // Check streak and total days
    expect(screen.getByText('连续打卡 6 天')).toBeInTheDocument();
    expect(screen.getByText('累计打卡 11 天')).toBeInTheDocument();
  });

  it('calls /api/checkin when button is clicked and triggers confetti', async () => {
    vi.mocked(api.apiJson)
      .mockResolvedValueOnce(mockNotCheckedIn) // Initial fetch
      .mockResolvedValueOnce(mockCheckedIn);   // Fetch after checkin

    vi.mocked(api.apiFetch).mockResolvedValue({ ok: true });

    render(<CheckinCard />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('立即打卡')).toBeInTheDocument();
    });

    // Click the button
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Verify apiFetch was called
    expect(api.apiFetch).toHaveBeenCalledWith('/api/checkin', { method: 'POST' });

    // Verify confetti was triggered
    await waitFor(() => {
      expect(confetti).toHaveBeenCalled();
    });

    // Verify state updated to checked-in
    await waitFor(() => {
      expect(screen.getByText(/今日已打卡/)).toBeInTheDocument();
    });
  });

  it('handles fetch errors gracefully without crashing', async () => {
    // First, let fetchStatus fail to log error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.apiJson).mockRejectedValue(new Error('Network error'));

    render(<CheckinCard />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch checkin status', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('handles checkin errors gracefully without crashing', async () => {
    vi.mocked(api.apiJson).mockResolvedValue(mockNotCheckedIn);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // apiFetch fails
    vi.mocked(api.apiFetch).mockRejectedValue(new Error('Checkin failed'));

    render(<CheckinCard />);

    await waitFor(() => {
      expect(screen.getByText('立即打卡')).toBeInTheDocument();
    });

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Checkin failed', expect.any(Error));
    });

    // Should not have triggered confetti
    expect(confetti).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
