import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

import FlashcardFocusTemplate from './FlashcardFocusTemplate';

function renderTemplate(overrides: Partial<React.ComponentProps<typeof FlashcardFocusTemplate>> = {}) {
  const props: React.ComponentProps<typeof FlashcardFocusTemplate> = {
    title: '背单词',
    item: null,
    loading: false,
    error: null,
    emptyTitle: '暂无可练习词卡',
    emptyDescription: '当前词库暂时没有可练习的词卡。',
    completedCount: 0,
    targetCount: 10,
    disabled: false,
    onSubmitRating: vi.fn(),
    onLoadNext: vi.fn(async () => null),
    onContentCompleted: vi.fn(),
    ...overrides,
  };
  render(<FlashcardFocusTemplate {...props} />);
  return props;
}

describe('FlashcardFocusTemplate', () => {
  it('shows empty state without completing when no card is available before any progress', () => {
    const props = renderTemplate();

    expect(screen.getByText('暂无可练习词卡')).toBeInTheDocument();
    expect(props.onContentCompleted).not.toHaveBeenCalled();
  });

  it('completes when cards are exhausted after progress exists', async () => {
    const onContentCompleted = vi.fn();
    renderTemplate({ completedCount: 1, onContentCompleted });

    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith({
        completed_count: 1,
        target_count: 10,
        no_available_content: false,
      });
    });
  });

  it('shows next review label briefly after a successful rating submit with nextDueAt', async () => {
    const tenDaysLater = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const item = {
      id: 'word-1',
      front: 'apple',
      back: '苹果',
      meta: [{ label: '新卡', tone: 'blue' as const }],
    };
    const onSubmitRating = vi.fn(async () => ({ nextDueAt: tenDaysLater }));
    const onLoadNext = vi.fn(async () => null);

    renderTemplate({ item, onSubmitRating, onLoadNext });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /记住了/ }));

    await waitFor(() => {
      expect(screen.getByText(/下次复习.*10 天后/)).toBeInTheDocument();
    });
  });
});
