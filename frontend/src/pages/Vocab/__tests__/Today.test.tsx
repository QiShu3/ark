import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Today from '../Today';

const submit = vi.fn();
const continueBatchReview = vi.fn();
const sessionState = {
  currentItem: {
    id: 'word-1',
    deck_id: 'deck-1',
    word: 'abruptly',
    us_pronunciation: "ə'brʌptli",
    uk_pronunciation: "ə'brʌptlɪ",
    translations: [{ pos: 'adv', translation: '突然地' }],
    phrases: [],
    sentences: [],
    prompt_type: 'en_to_zh' as const,
    review_mode: 'review' as const,
    mastery_score: 0,
  },
  currentMode: 'review' as const,
  loading: false,
  error: null,
  submitting: false,
  lastResult: null,
  submit,
  learningRemaining: 2,
  reviewRemaining: 3,
  studyRemaining: 5,
  totalRemaining: 10,
  currentBatchNumber: 1,
  totalBatchCount: 3,
  memorizedCount: 24,
  isBatchReview: false,
  batchReviewCount: 0,
  batchReviewGroups: [],
  batchReviewActionLabel: '进入下一批',
  continueBatchReview,
};

vi.mock('../../../hooks/vocab/useVocabDeck', () => ({
  useVocabDeck: () => ({
    decks: [{ id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' }],
    activeDeck: { id: 'deck-1', key: 'cet4', name: 'CET4', description: '', word_count: 7508, created_at: '', updated_at: '' },
    setActiveDeck: vi.fn(),
  }),
}));

vi.mock('../../../hooks/vocab/useVocabTodaySession', () => ({
  useVocabTodaySession: () => sessionState,
}));

describe('Vocab today page', () => {
  beforeEach(() => {
    submit.mockReset();
    continueBatchReview.mockReset();
    Object.assign(sessionState, {
      currentItem: {
        id: 'word-1',
        deck_id: 'deck-1',
        word: 'abruptly',
        us_pronunciation: "ə'brʌptli",
        uk_pronunciation: "ə'brʌptlɪ",
        translations: [{ pos: 'adv', translation: '突然地' }],
        phrases: [],
        sentences: [],
        prompt_type: 'en_to_zh',
        review_mode: 'review',
        mastery_score: 0,
      },
      currentMode: 'review',
      loading: false,
      error: null,
      submitting: false,
      lastResult: null,
      submit,
      learningRemaining: 2,
      reviewRemaining: 3,
      studyRemaining: 5,
      totalRemaining: 10,
      currentBatchNumber: 1,
      totalBatchCount: 3,
      memorizedCount: 24,
      isBatchReview: false,
      batchReviewCount: 0,
      batchReviewGroups: [],
      batchReviewActionLabel: '进入下一批',
      continueBatchReview,
    });
  });

  it('renders a unified today flow and submits four-grade review actions', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Today />
      </MemoryRouter>,
    );

    expect(screen.getByText('今日单词')).toBeInTheDocument();
    expect(screen.getByText('先完成今日复习，再进入今天的新词。')).toBeInTheDocument();
    expect(screen.getByText('批次：当前处于第 1 批 / 共 3 批')).toBeInTheDocument();
    expect(screen.getByText('已记忆 24 个单词')).toBeInTheDocument();
    expect(screen.getByText('abruptly')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /很轻松/ }));

    expect(submit).toHaveBeenCalledWith('easy');
  });

  it('renders the batch review page grouped by mastery result', async () => {
    const user = userEvent.setup();
    Object.assign(sessionState, {
      currentItem: null,
      currentMode: null,
      isBatchReview: true,
      batchReviewCount: 10,
      batchReviewGroups: [
        {
          key: 'again',
          title: '没记住',
          items: [{ id: 'word-1', word: 'abruptly', translations: [{ pos: 'adv', translation: '突然地' }] }],
        },
        {
          key: 'hard',
          title: '有点难',
          items: [{ id: 'word-2', word: 'abandon', translations: [{ pos: 'v.', translation: '放弃' }] }],
        },
      ],
      batchReviewActionLabel: '进入下一批',
    });

    render(
      <MemoryRouter>
        <Today />
      </MemoryRouter>,
    );

    expect(screen.getByText('上一批回顾')).toBeInTheDocument();
    expect(screen.getByText(/本批完成 10 个单词/)).toBeInTheDocument();
    expect(screen.getByText('没记住')).toBeInTheDocument();
    expect(screen.getByText('有点难')).toBeInTheDocument();
    expect(screen.getByText('abruptly')).toBeInTheDocument();
    expect(screen.getByText(/突然地/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '进入下一批' }));

    expect(continueBatchReview).toHaveBeenCalledTimes(1);
  });
});
