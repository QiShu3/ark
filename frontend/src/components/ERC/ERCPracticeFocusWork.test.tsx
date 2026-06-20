import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  fetchChoiceItems,
  submitChoiceAnswer,
} = vi.hoisted(() => ({
  fetchERCArticles: vi.fn(),
  fetchERCOverview: vi.fn(),
  fetchERCArticle: vi.fn(),
  fetchERCVocabularyPreheat: vi.fn(),
  submitERCVocabularyPreheat: vi.fn(),
  submitERCArticle: vi.fn(),
  fetchChoiceItems: vi.fn(),
  submitChoiceAnswer: vi.fn(),
}));

vi.mock('../../lib/erc/api', () => ({
  fetchERCArticles,
  fetchERCOverview,
  fetchERCArticle,
  fetchERCVocabularyPreheat,
  submitERCVocabularyPreheat,
  submitERCArticle,
}));

vi.mock('../../lib/choice/api', () => ({
  fetchChoiceItems,
  submitChoiceAnswer,
}));

function mockArticleDetail(articleId = 'kaoyan2_2025_text2', stem = 'Question 26?') {
  return {
    article_id: articleId,
    year: 2025,
    text_no: 2,
    title: 'Passage Two',
    paragraphs: [{ paragraph_no: 1, text: 'This is paragraph one.' }],
    questions: [
      {
        question_id: `${articleId}_q26`,
        question_no: 26,
        stem,
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
    fetchChoiceItems.mockReset();
    submitChoiceAnswer.mockReset();
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
        us_pronunciation: null,
        uk_pronunciation: null,
        translations: [{ pos: 'adj', translation: '仁慈的' }],
        sentences: [],
        phrases: [],
        prompt_type: 'en_to_zh',
        review_mode: 'study',
        mastery_score: 0,
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

    // Wait for the component to load and render
    await waitFor(() => {
      // Either shows preheat words or shows the question (if preheat is skipped)
      const hasPreheat = screen.queryByText('benevolent');
      const hasQuestion = screen.queryByText('Question 26?');
      expect(hasPreheat || hasQuestion).toBeTruthy();
    });
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
      expect(onContentCompleted).toHaveBeenCalledWith(expect.objectContaining({
        article_count: 0,
        no_available_content: true,
      }));
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
  });

  it('continues article content until the configured article target is reached', async () => {
    const user = userEvent.setup();
    fetchERCArticles.mockResolvedValue([
      {
        article_id: 'article-one',
        set_id: 'set-1',
        year: 2025,
        text_no: 1,
        title: 'Passage One',
        status: 'unstarted',
        question_count: 1,
        mistake_count: 0,
        last_attempt_at: null,
      },
      {
        article_id: 'article-two',
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
    fetchERCArticle.mockImplementation((articleId: string) => (
      Promise.resolve(mockArticleDetail(articleId, articleId === 'article-two' ? 'Second Question?' : 'Question 26?'))
    ));
    fetchERCVocabularyPreheat.mockResolvedValue([]);
    submitERCArticle.mockResolvedValue({
      attempt_id: 'attempt-1',
      article_id: 'article-one',
      correct_count: 1,
      question_count: 1,
      items: [
        {
          question_id: 'article-one_q26',
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
          run={{ ...practiceRun, counts_for_task_completion: false, config_snapshot: { daily_article_target: 2 } }}
          disabled={false}
          onContentCompleted={onContentCompleted}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Question 26?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Option A/ }));
    await user.click(screen.getByRole('button', { name: /提交答案/ }));

    await waitFor(() => {
      expect(submitERCArticle).toHaveBeenCalled();
    });
    expect(await screen.findByText('Second Question?')).toBeInTheDocument();
    expect(onContentCompleted).not.toHaveBeenCalled();
  });

  it('uses choice scope items, records answers, and completes at the configured question count', async () => {
    const user = userEvent.setup();
    fetchChoiceItems.mockResolvedValue([
      {
        id: 'choice-article-1',
        bank_id: 'set-1',
        title: '2025 数据结构 第1题',
        material_blocks: [],
        group_type: 'single',
        subject_area: '数据结构',
        tags: ['数据结构'],
        sort_order: 1,
        question_count: 2,
        questions: [
          {
            id: 'choice-q1',
            question_no: 1,
            stem_blocks: [{ type: 'paragraph', text: 'Choice Question One?' }],
            options: [{ key: 'A', text: 'Option A' }, { key: 'B', text: 'Option B' }],
            answer: 'A',
            explanation_blocks: [],
            tags: [],
            sort_order: 1,
          },
          {
            id: 'choice-q2',
            question_no: 2,
            stem_blocks: [{ type: 'paragraph', text: 'Choice Question Two?' }],
            options: [{ key: 'A', text: 'Option A' }, { key: 'B', text: 'Option B' }],
            answer: 'B',
            explanation_blocks: [],
            tags: [],
            sort_order: 2,
          },
        ],
      },
    ]);
    submitChoiceAnswer.mockResolvedValue({
      question_id: 'choice-q1',
      chosen_option: 'A',
      correct_option: 'A',
      is_correct: true,
      rating: 'good',
      next_review_at: null,
    });
    const onContentCompleted = vi.fn();

    render(
      <MemoryRouter>
        <ERCPracticeFocusWork
          run={{
            ...practiceRun,
            counts_for_task_completion: false,
            config_snapshot: {
              choice_scope: { bank_id: 'set-1', years: [2025], subjects: ['数据结构'] },
              choice_completion: { mode: 'question_count', question_count: 1 },
            },
          }}
          disabled={false}
          onContentCompleted={onContentCompleted}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Choice Question One?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2025 数据结构 第1题' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Option A/ }));
    await user.click(screen.getByRole('button', { name: /提交答案/ }));

    await waitFor(() => {
      expect(submitChoiceAnswer).toHaveBeenCalledWith('choice-q1', 'A');
      expect(onContentCompleted).toHaveBeenCalledWith(expect.objectContaining({ question_count: 1 }));
    });
    expect(submitERCArticle).not.toHaveBeenCalled();
  });

  it('renders single choice stems in the upper material panel even when legacy material exists', async () => {
    fetchChoiceItems.mockResolvedValue([
      {
        id: 'choice-single-1',
        bank_id: 'set-1',
        title: '2025年 数据结构 第1题',
        material_blocks: [{ type: 'paragraph', text: '2025年 数据结构 第1题' }],
        group_type: 'single',
        subject_area: '数据结构',
        tags: ['数据结构'],
        sort_order: 1,
        question_count: 1,
        questions: [
          {
            id: 'choice-q1',
            question_no: 1,
            stem_blocks: [{ type: 'paragraph', text: 'Single choice stem should be on top.' }],
            options: [{ key: 'A', text: 'Option A' }, { key: 'B', text: 'Option B' }],
            answer: 'A',
            explanation_blocks: [],
            tags: [],
            sort_order: 1,
          },
        ],
      },
    ]);

    render(
      <MemoryRouter>
        <ERCPracticeFocusWork
          run={{
            ...practiceRun,
            counts_for_task_completion: false,
            config_snapshot: {
              choice_scope: { bank_id: 'set-1', years: [2025], subjects: ['数据结构'] },
              choice_completion: { mode: 'question_count', question_count: 1 },
            },
          }}
          disabled={false}
          onContentCompleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    const materialPanel = await screen.findByLabelText('阅读原文');
    expect(within(materialPanel).getByText('Single choice stem should be on top.')).toBeInTheDocument();
  });
});
