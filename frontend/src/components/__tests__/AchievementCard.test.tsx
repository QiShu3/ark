import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import AchievementCard from '../AchievementCard';
import { apiJson } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

describe('AchievementCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the achievement label', async () => {
    (apiJson as Mock).mockResolvedValue({
      active_event: null,
      event_achievements: null,
      global_achievements: {
        title: '全局成就',
        summary_text: null,
        stats: { unlocked_count: 0, in_progress_count: 0, primary_metric_value: 0, primary_metric_label: '总专注秒数' },
        latest_unlocked: [],
        upcoming: [],
      },
    });

    render(<AchievementCard />);

    expect(screen.getByText('成就')).toBeInTheDocument();
    await waitFor(() => expect(apiJson).toHaveBeenCalledWith('/todo/achievements/summary'));
  });

  it('opens the modal when the card is clicked', async () => {
    const user = userEvent.setup();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events') {
        return [];
      }
      return {
        active_event: null,
        event_achievements: null,
        global_achievements: {
          title: '全局成就',
          summary_text: null,
          stats: { unlocked_count: 0, in_progress_count: 0, primary_metric_value: 0, primary_metric_label: '总专注秒数' },
          latest_unlocked: [],
          upcoming: [],
        },
      };
    });

    render(
      <div data-testid="right-panel-shell" className="overflow-hidden">
        <AchievementCard />
      </div>,
    );

    await user.click(await screen.findByRole('button', { name: '成就' }));

    const dialog = await screen.findByRole('dialog', { name: '成就弹窗' });
    expect(dialog).toBeInTheDocument();
    expect(within(screen.getByTestId('right-panel-shell')).queryByRole('dialog', { name: '成就弹窗' })).not.toBeInTheDocument();
    expect(screen.getByText('全局成就')).toBeInTheDocument();
  });

  it('moves focus into the modal and restores it to the card after Escape closes the modal', async () => {
    vi.useFakeTimers();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events') {
        return [];
      }
      return {
        active_event: null,
        event_achievements: null,
        global_achievements: {
          title: '全局成就',
          summary_text: null,
          stats: { unlocked_count: 0, in_progress_count: 0, primary_metric_value: 0, primary_metric_label: '总专注秒数' },
          latest_unlocked: [],
          upcoming: [],
        },
      };
    });

    render(<AchievementCard />);

    const trigger = screen.getByRole('button', { name: '成就' });
    expect(trigger).not.toHaveFocus();

    await act(async () => {
      trigger.click();
    });

    const closeButton = screen.getByRole('button', { name: '关闭成就弹窗' });
    expect(closeButton).toHaveFocus();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(screen.getByRole('dialog', { name: '成就弹窗' })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByRole('dialog', { name: '成就弹窗' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
