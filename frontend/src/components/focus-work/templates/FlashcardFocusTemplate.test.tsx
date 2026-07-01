import { render, screen, waitFor } from '@testing-library/react';
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
});
