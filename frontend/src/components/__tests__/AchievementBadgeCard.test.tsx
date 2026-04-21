import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AchievementBadgeCard from '../AchievementBadgeCard';

describe('AchievementBadgeCard', () => {
  it('renders a progress bar and formatted hours for focus achievements', () => {
    render(
      <AchievementBadgeCard
        item={{
          id: 'global-focus-50h',
          title: '总专注 50 小时',
          description: '跨所有事件累计专注 50 小时。',
          status: 'in_progress',
          current_value: 90_000,
          target_value: 180_000,
          progress_text: '90000 / 180000',
        }}
        tone="global"
      />,
    );

    expect(screen.getByText('已专注 25 小时')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '总专注 50 小时进度' })).toHaveAttribute('aria-valuenow', '50');
  });
});
