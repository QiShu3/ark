import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import AchievementCard from '../AchievementCard';
import { apiJson } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

describe('AchievementCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders event and global summaries together in card state', async () => {
    (apiJson as Mock).mockResolvedValue({
      active_event: { id: 'event-1', name: '论文投稿', due_at: '2026-04-25T12:00:00Z', is_primary: true, user_id: 7, created_at: '2026-04-20T00:00:00Z', updated_at: '2026-04-20T00:00:00Z' },
      event_achievements: {
        title: '事件成就',
        summary_text: '论文投稿 的当前进展',
        stats: { unlocked_count: 3, in_progress_count: 1, primary_metric_value: 7200, primary_metric_label: '事件专注秒数' },
        latest_unlocked: [{ id: 'a', title: '连续推进 3 天', description: '...', status: 'unlocked', current_value: 3, target_value: 3, progress_text: null }],
        upcoming: [{ id: 'b', title: '收尾干净', description: '...', status: 'in_progress', current_value: 4, target_value: 5, progress_text: '4 / 5' }],
      },
      global_achievements: {
        title: '全局成就',
        summary_text: '始终显示的长期累计进度',
        stats: { unlocked_count: 2, in_progress_count: 1, primary_metric_value: 151200, primary_metric_label: '总专注秒数' },
        latest_unlocked: [],
        upcoming: [{ id: 'g', title: '总专注 50 小时', description: '...', status: 'in_progress', current_value: 151200, target_value: 180000, progress_text: '151200 / 180000' }],
      },
    });

    render(<AchievementCard />);

    expect(await screen.findByText('论文投稿')).toBeInTheDocument();
    expect(screen.getByText(/事件已解锁 3 项/)).toBeInTheDocument();
    expect(screen.getByText(/全局：总专注 50 小时/)).toBeInTheDocument();
  });

  it('opens the modal when the card is clicked', async () => {
    const user = userEvent.setup();
    (apiJson as Mock)
      .mockResolvedValueOnce({
        active_event: null,
        event_achievements: null,
        global_achievements: {
          title: '全局成就',
          summary_text: null,
          stats: { unlocked_count: 0, in_progress_count: 0, primary_metric_value: 0, primary_metric_label: '总专注秒数' },
          latest_unlocked: [],
          upcoming: [],
        },
      })
      .mockResolvedValueOnce([]);

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
    const user = userEvent.setup();
    (apiJson as Mock)
      .mockResolvedValueOnce({
        active_event: null,
        event_achievements: null,
        global_achievements: {
          title: '全局成就',
          summary_text: null,
          stats: { unlocked_count: 0, in_progress_count: 0, primary_metric_value: 0, primary_metric_label: '总专注秒数' },
          latest_unlocked: [],
          upcoming: [],
        },
      })
      .mockResolvedValueOnce([]);

    render(<AchievementCard />);

    const trigger = await screen.findByRole('button', { name: '成就' });
    expect(trigger).not.toHaveFocus();

    await user.click(trigger);

    const closeButton = await screen.findByRole('button', { name: '关闭成就弹窗' });
    expect(closeButton).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '成就弹窗' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
