import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CalendarWidget from '../CalendarWidget';
import { getCheckInStatus } from '../../lib/api';

const mockGetCheckInStatus = vi.mocked(getCheckInStatus);

describe('CalendarWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCheckInStatus.mockResolvedValue({
      is_checked_in_today: true,
      current_streak: 3,
      total_days: 8,
      checked_dates: ['2026-04-16'],
    });
  });

  it('opens the multi-week calendar when clicked', async () => {
    const user = userEvent.setup();

    render(<CalendarWidget />);

    await user.click(await screen.findByRole('button', { name: '打开多周任务日历' }));

    expect(await screen.findByRole('dialog', { name: '多周任务日历' })).toBeInTheDocument();
  });
});
