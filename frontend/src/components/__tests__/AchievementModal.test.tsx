import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import AchievementModal from '../AchievementModal';
import { apiJson } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

describe('AchievementModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps global achievements visible while switching events', async () => {
    const user = userEvent.setup();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events') {
        return [
          { id: 'event-1', name: '论文投稿', due_at: '2026-04-25T12:00:00Z', is_primary: true, user_id: 7, created_at: '', updated_at: '' },
          { id: 'event-2', name: '期末考试', due_at: '2026-05-01T12:00:00Z', is_primary: false, user_id: 7, created_at: '', updated_at: '' },
        ];
      }
      if (url === '/todo/achievements/summary?event_id=event-2') {
        return {
          active_event: { id: 'event-2', name: '期末考试', due_at: '2026-05-01T12:00:00Z', is_primary: false, user_id: 7, created_at: '', updated_at: '' },
          event_achievements: {
            title: '事件成就',
            summary_text: null,
            stats: { unlocked_count: 1, in_progress_count: 1, primary_metric_value: 3600, primary_metric_label: '事件专注秒数' },
            latest_unlocked: [{ id: 'x', title: '首次推进', description: '...', status: 'unlocked', current_value: 1, target_value: 1, progress_text: null }],
            upcoming: [],
          },
          global_achievements: {
            title: '全局成就',
            summary_text: null,
            stats: { unlocked_count: 2, in_progress_count: 1, primary_metric_value: 20000, primary_metric_label: '总专注秒数' },
            latest_unlocked: [],
            upcoming: [{ id: 'g', title: '总专注 50 小时', description: '...', status: 'in_progress', current_value: 20000, target_value: 180000, progress_text: '20000 / 180000' }],
          },
        };
      }
      return {
        active_event: { id: 'event-1', name: '论文投稿', due_at: '2026-04-25T12:00:00Z', is_primary: true, user_id: 7, created_at: '', updated_at: '' },
        event_achievements: {
          title: '事件成就',
          summary_text: null,
          stats: { unlocked_count: 3, in_progress_count: 1, primary_metric_value: 7200, primary_metric_label: '事件专注秒数' },
          latest_unlocked: [{ id: 'a', title: '连续推进 3 天', description: '...', status: 'unlocked', current_value: 3, target_value: 3, progress_text: null }],
          upcoming: [],
        },
        global_achievements: {
          title: '全局成就',
          summary_text: null,
          stats: { unlocked_count: 2, in_progress_count: 1, primary_metric_value: 20000, primary_metric_label: '总专注秒数' },
          latest_unlocked: [],
          upcoming: [{ id: 'g', title: '总专注 50 小时', description: '...', status: 'in_progress', current_value: 20000, target_value: 180000, progress_text: '20000 / 180000' }],
        },
      };
    });

    render(<AchievementModal isOpen={true} onClose={() => {}} initialSummary={null} />);

    await user.click(await screen.findByRole('button', { name: '期末考试' }));

    expect(await screen.findByText('首次推进')).toBeInTheDocument();
    expect(screen.getByText('总专注 50 小时')).toBeInTheDocument();
  });
});
