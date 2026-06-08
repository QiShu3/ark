import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ERCPracticeFocusWork from './ERCPracticeFocusWork';

const {
  fetchERCOverview,
  fetchERCArticle,
  fetchERCVocabularyPreheat,
  submitERCVocabularyPreheat,
  submitERCArticle,
  fetchERCArticles,
  apiJson,
} = vi.hoisted(() => ({
  fetchERCOverview: vi.fn(),
  fetchERCArticle: vi.fn(),
  fetchERCVocabularyPreheat: vi.fn(),
  submitERCVocabularyPreheat: vi.fn(),
  submitERCArticle: vi.fn(),
  fetchERCArticles: vi.fn(),
  apiJson: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  apiJson,
}));

vi.mock('../../lib/erc/api', () => ({
  fetchERCOverview,
  fetchERCArticle,
  fetchERCVocabularyPreheat,
  submitERCVocabularyPreheat,
  submitERCArticle,
  fetchERCArticles,
}));

function mockArticleDetail() {
  return {
    article_id: 'kaoyan2_2025_text2',
    year: 2025,
    text_no: 2,
    title: 'Passage Two',
    paragraphs: [{ paragraph_no: 1, text: 'This is paragraph one.' }],
    questions: [
      {
        question_id: 'kaoyan2_2025_text2_q26',
        question_no: 26,
        stem: 'Question 26?',
        options: { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' },
      },
    ],
  };
}

describe('ERCPracticeFocusWork', () => {
  beforeEach(() => {
    if (!HTMLDivElement.prototype.scrollTo) {
      HTMLDivElement.prototype.scrollTo = vi.fn();
    }
    fetchERCOverview.mockReset();
    fetchERCArticle.mockReset();
    fetchERCVocabularyPreheat.mockReset();
    submitERCVocabularyPreheat.mockReset();
    submitERCArticle.mockReset();
    fetchERCArticles.mockReset();
    apiJson.mockReset();
  });

  it('renders preheat words first if any exist', async () => {
    fetchERCOverview.mockResolvedValue({
      recommended_article: { article_id: 'kaoyan2_2025_text2', year: 2025, text_no: 2, title: 'Passage Two' },
    });
    fetchERCArticle.mockResolvedValue(mockArticleDetail());
    fetchERCVocabularyPreheat.mockResolvedValue([
      {
        id: 'w1',
        deck_id: 'deck1',
        word: 'benevolent',
        translations: [{ pos: 'adj', translation: '仁慈的' }],
        sentences: [],
        phrases: [],
        prompt_type: 'en_to_zh',
      },
    ]);

    render(
      <MemoryRouter>
        <ERCPracticeFocusWork
          workflow={{
            state: 'focus',
            active_focus_work_type: 'erc_practice',
            focus_work_display_state: 'fullscreen',
          }}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('真题词汇预热')).toBeInTheDocument();
    expect(screen.getByText('benevolent')).toBeInTheDocument();
  });

  it('calls onFinished when recommended_article is null, and supports resetting for extra practice', async () => {
    fetchERCOverview.mockResolvedValue({
      recommended_article: null,
    });

    let resetFn: (() => void) | undefined;
    const registerResetCommandMock = vi.fn((fn) => {
      resetFn = fn;
    });
    const onFinishedMock = vi.fn();

    render(
      <MemoryRouter>
        <ERCPracticeFocusWork
          workflow={{
            state: 'focus',
            active_focus_work_type: 'erc_practice',
            focus_work_display_state: 'fullscreen',
          }}
          registerResetCommand={registerResetCommandMock}
          onFinished={onFinishedMock}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(onFinishedMock).toHaveBeenCalled();
    });
    expect(registerResetCommandMock).toHaveBeenCalled();
    expect(resetFn).toBeDefined();

    // Mock articles list and detail to check reset function
    fetchERCArticles.mockResolvedValue([
      { article_id: 'kaoyan2_2025_text2', title: 'Passage Two' }
    ]);
    fetchERCArticle.mockResolvedValue(mockArticleDetail());
    fetchERCVocabularyPreheat.mockResolvedValue([]);

    const { act } = await import('@testing-library/react');
    await act(async () => {
      resetFn!();
    });

    expect(fetchERCArticles).toHaveBeenCalledTimes(1);
    expect(fetchERCArticle).toHaveBeenCalledWith('kaoyan2_2025_text2');
    expect(await screen.findByText('Passage Two', { exact: false })).toBeInTheDocument();
  });
});
