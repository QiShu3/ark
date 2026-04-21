import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import AchievementModal from '../AchievementModal';
import { apiJson } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

describe('AchievementModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('locks page scroll while open and restores previous styles after closing', async () => {
    vi.useFakeTimers();
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'clip';

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

    function ModalHarness() {
      const [open, setOpen] = useState(true);
      return <AchievementModal isOpen={open} onClose={() => setOpen(false)} initialSummary={null} />;
    }

    render(<ModalHarness />);

    expect(screen.getByRole('dialog', { name: '成就弹窗' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    await act(async () => {
      screen.getByRole('dialog', { name: '成就弹窗' }).click();
    });

    expect(screen.getByRole('dialog', { name: '成就弹窗' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByRole('dialog', { name: '成就弹窗' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.documentElement.style.overflow).toBe('clip');
  });

  it('applies entry animation classes to overlay and modal surface', async () => {
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

    render(<AchievementModal isOpen={true} onClose={() => {}} initialSummary={null} />);

    const overlay = await screen.findByRole('dialog', { name: '成就弹窗' });
    const surface = screen.getByRole('button', { name: '关闭成就弹窗' }).closest('div[class*="rounded-3xl"]');

    expect(overlay).toHaveClass('animate-in', 'fade-in', 'duration-200');
    expect(surface).toHaveClass('animate-in', 'zoom-in-95', 'duration-200');
  });

  it('keeps the modal mounted during exit animation before unmounting', async () => {
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

    function ModalHarness() {
      const [open, setOpen] = useState(true);
      return <AchievementModal isOpen={open} onClose={() => setOpen(false)} initialSummary={null} />;
    }

    render(<ModalHarness />);

    const closeButton = screen.getByRole('button', { name: '关闭成就弹窗' });

    await act(async () => {
      closeButton.click();
    });

    const overlay = screen.getByRole('dialog', { name: '成就弹窗' });
    const surface = screen.getByRole('button', { name: '关闭成就弹窗' }).closest('div[class*="rounded-3xl"]');

    expect(overlay).toHaveClass('achievement-modal-overlay-exit');
    expect(surface).toHaveClass('achievement-modal-surface-exit');

    await act(async () => {
      vi.advanceTimersByTime(199);
    });
    expect(screen.getByRole('dialog', { name: '成就弹窗' })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('dialog', { name: '成就弹窗' })).not.toBeInTheDocument();
  });
});
