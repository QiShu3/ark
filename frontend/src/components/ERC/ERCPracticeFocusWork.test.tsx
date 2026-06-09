import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ERCPracticeFocusWork from './ERCPracticeFocusWork';
import type { FocusWorkRunSummary } from '../focus-work/focusWorkTypes';

const {
  fetchERCArticles,
  fetchERCOverview,
  fetchERCArticle,
  fetchERCVocabularyPreheat,
  submitERCVocabularyPreheat,
  submitERCArticle,
} = vi.hoisted(() => ({
  fetchERCArticles: vi.fn(),
  fetchERCOverview: vi.fn(),
  fetchERCArticle: vi.fn(),
  fetchERCVocabularyPreheat: vi.fn(),
  submitERCVocabularyPreheat: vi.fn(),
  submitERCArticle: vi.fn(),
}));

vi.mock('../../lib/erc/api', () => ({
  fetchERCArticles,
  fetchERCOverview,
  fetchERCArticle,
  fetchERCVocabularyPreheat,
  submitERCVocabularyPreheat,
  submitERCArticle,
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

const practiceRun: FocusWorkRunSummary = {
  id: 'run-1',
  workflow_id: 'workflow-1',
  phase_index: 0,
  focus_work_type: 'erc_practice',
  counts_for_task_completion: true,
  status: 'running',
  config_snapshot: {},
};

describe('ERCPracticeFocusWork', () => {
  beforeEach(() => {
    if (!HTMLDivElement.prototype.scrollTo) {
      HTMLDivElement.prototype.scrollTo = vi.fn();
    }
    fetchERCArticles.mockReset();
    fetchERCOverview.mockReset();
    fetchERCArticle.mockReset();
    fetchERCVocabularyPreheat.mockReset();
    submitERCVocabularyPreheat.mockReset();
    submitERCArticle.mockReset();
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
          run={practiceRun}
          disabled={false}
          onContentCompleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('真题词汇预热')).toBeInTheDocument();
    expect(screen.getByText('benevolent')).toBeInTheDocument();
  });

  it('emits content completion when no recommended article is available', async () => {
    fetchERCOverview.mockResolvedValue({
      recommended_article: null,
    });

    const onContentCompleted = vi.fn();

    render(
      <MemoryRouter>
        <ERCPracticeFocusWork
          run={practiceRun}
          disabled={false}
          onContentCompleted={onContentCompleted}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith(expect.objectContaining({ article_count: 0, no_available_content: true }));
    });
  });

  it('loads library article content for an extra run even when no daily recommendation is available', async () => {
    fetchERCArticles.mockResolvedValue([
      {
        article_id: 'kaoyan2_2025_text2',
        set_id: 'set-1',
        year: 2025,
        text_no: 2,
        title: 'Passage Two',
        status: 'unstarted',
        question_count: 1,
        mistake_count: 0,
        last_attempt_at: null,
      },
    ]);
    fetchERCArticle.mockResolvedValue(mockArticleDetail());
    fetchERCVocabularyPreheat.mockResolvedValue([]);
    const onContentCompleted = vi.fn();

    render(
      <MemoryRouter>
        <ERCPracticeFocusWork
          run={{ ...practiceRun, counts_for_task_completion: false }}
          disabled={false}
          onContentCompleted={onContentCompleted}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Question 26?')).toBeInTheDocument();
    expect(fetchERCOverview).not.toHaveBeenCalled();
    expect(onContentCompleted).not.toHaveBeenCalled();
  });

  it('continues article content until the configured article target is reached', async () => {
    const user = userEvent.setup();
    fetchERCOverview.mockResolvedValue({
      recommended_article: { article_id: 'kaoyan2_2025_text2', year: 2025, text_no: 2, title: 'Passage Two' },
    });
    fetchERCArticle.mockResolvedValue(mockArticleDetail());
    fetchERCVocabularyPreheat.mockResolvedValue([]);
    submitERCArticle.mockResolvedValue({
      attempt_id: 'attempt-1',
      article_id: 'kaoyan2_2025_text2',
      correct_count: 1,
      question_count: 1,
      items: [
        {
          question_id: 'kaoyan2_2025_text2_q26',
          question_no: 26,
          chosen_option: 'A',
          correct_option: 'A',
          is_correct: true,
          rating: 'good',
          next_review_at: null,
          entered_mistakes: false,
        },
      ],
    });
    const onContentCompleted = vi.fn();

    render(
      <MemoryRouter>
        <ERCPracticeFocusWork
          run={{ ...practiceRun, config_snapshot: { daily_article_target: 2 } }}
          disabled={false}
          onContentCompleted={onContentCompleted}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Question 26?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'AOption A' }));
    await user.click(screen.getByRole('button', { name: '提交答案' }));

    expect(await screen.findByRole('button', { name: '继续下一篇' })).toBeInTheDocument();
    expect(onContentCompleted).not.toHaveBeenCalled();
  });
});
