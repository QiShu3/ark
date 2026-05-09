import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Practice from '../Practice';

const { fetchERCArticle, fetchERCVocabularyPreheat, submitERCVocabularyPreheat, submitERCArticle } = vi.hoisted(() => ({
  fetchERCArticle: vi.fn(),
  fetchERCVocabularyPreheat: vi.fn(),
  submitERCVocabularyPreheat: vi.fn(),
  submitERCArticle: vi.fn(),
}));

vi.mock('../../../lib/erc/api', () => ({
  fetchERCArticle,
  fetchERCVocabularyPreheat,
  submitERCVocabularyPreheat,
  submitERCArticle,
}));

describe('ERC practice page', () => {
  beforeEach(() => {
    fetchERCArticle.mockReset();
    fetchERCVocabularyPreheat.mockReset();
    submitERCVocabularyPreheat.mockReset();
    submitERCArticle.mockReset();
  });

  it('blocks submit when not all questions are answered', async () => {
    fetchERCArticle.mockResolvedValue({
      article_id: 'kaoyan2_2025_text1',
      set_id: 'set-1',
      exam: '考研英语二',
      year: 2025,
      text_no: 1,
      title: '',
      paragraphs: [{ paragraph_no: 1, text: 'Paragraph one.' }],
      vocabulary_summary: {
        total_word_count: 3,
        mastered_count: 1,
        learning_count: 1,
        unstarted_count: 1,
        unknown_count: 0,
        unfamiliar_count: 2,
        mastery_rate: 1 / 3,
        preview_words: [
          { word: 'paradoxical', state: 'unstarted' },
          { word: 'detached', state: 'learning' },
        ],
      },
      questions: [
        {
          question_id: 'kaoyan2_2025_text1_q21',
          question_no: 21,
          stem: 'Question 21?',
          options: { A: 'A1', B: 'B1', C: 'C1', D: 'D1' },
        },
        {
          question_id: 'kaoyan2_2025_text1_q22',
          question_no: 22,
          stem: 'Question 22?',
          options: { A: 'A2', B: 'B2', C: 'C2', D: 'D2' },
        },
      ],
      last_attempt_at: null,
    });

    render(
      <MemoryRouter initialEntries={['/erc/articles/kaoyan2_2025_text1/practice']}>
        <Routes>
          <Route path="/erc/articles/:articleId/practice" element={<Practice />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Question 21/)).toBeInTheDocument();
    expect(screen.getByText('阅读前词汇预热')).toBeInTheDocument();
    expect(screen.getByText('预计生词 2 / 3')).toBeInTheDocument();
    expect(screen.getByText('paradoxical')).toBeInTheDocument();
    expect(screen.getByLabelText('阅读原文')).toHaveClass('backdrop-blur-2xl');
    await userEvent.click(screen.getByRole('radio', { name: 'A A1' }));
    await userEvent.click(screen.getByRole('button', { name: '提交整篇' }));

    expect(await screen.findByText('还有 1 道题未作答')).toBeInTheDocument();
    expect(submitERCArticle).not.toHaveBeenCalled();
  });

  it('runs a vocabulary preheat session before article practice', async () => {
    fetchERCArticle.mockResolvedValue({
      article_id: 'kaoyan2_2023_text4',
      set_id: 'set-1',
      exam: '考研英语二',
      year: 2023,
      text_no: 4,
      title: '',
      paragraphs: [{ paragraph_no: 1, text: 'Teenagers are paradoxical.' }],
      vocabulary_summary: {
        total_word_count: 2,
        mastered_count: 0,
        learning_count: 0,
        unstarted_count: 2,
        unknown_count: 0,
        unfamiliar_count: 2,
        mastery_rate: 0,
        preview_words: [{ word: 'paradoxical', state: 'unstarted' }],
      },
      questions: [
        {
          question_id: 'kaoyan2_2023_text4_q36',
          question_no: 36,
          stem: 'Question 36?',
          options: { A: 'A1', B: 'B1', C: 'C1', D: 'D1' },
        },
      ],
      last_attempt_at: null,
    });
    fetchERCVocabularyPreheat.mockResolvedValue([
      {
        id: 'word-1',
        deck_id: 'deck-1',
        word: 'paradoxical',
        us_pronunciation: null,
        uk_pronunciation: null,
        translations: [{ pos: 'adj.', translation: '矛盾的' }],
        phrases: [],
        sentences: [],
        prompt_type: 'en_to_zh',
        review_mode: 'erc_preheat',
        mastery_score: 0,
      },
    ]);
    submitERCVocabularyPreheat.mockResolvedValue({
      mastery_score: 2,
      next_review_at: '2026-05-10T00:00:00Z',
      wrong_count: 0,
      correct_count: 1,
      interval_days: 1,
      result: 'good',
      should_repeat_today: false,
    });

    render(
      <MemoryRouter initialEntries={['/erc/articles/kaoyan2_2023_text4/practice']}>
        <Routes>
          <Route path="/erc/articles/:articleId/practice" element={<Practice />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole('button', { name: '先预热单词' }));
    expect(fetchERCVocabularyPreheat).toHaveBeenCalledWith('kaoyan2_2023_text4');
    expect((await screen.findAllByText('paradoxical')).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /记住了/ }));

    expect(submitERCVocabularyPreheat).toHaveBeenCalledWith('kaoyan2_2023_text4', {
      deck_id: 'deck-1',
      word_id: 'word-1',
      result: 'good',
      prompt_type: 'en_to_zh',
    });
    expect(await screen.findByText('预热完成，可以开始做题。')).toBeInTheDocument();
  });
});
