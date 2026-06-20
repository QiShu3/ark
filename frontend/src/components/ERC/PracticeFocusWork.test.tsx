import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PracticeFocusWork from './PracticeFocusWork';
import type { FocusWorkRunSummary } from '../focus-work/focusWorkTypes';

const { fetchChoiceItems, submitChoiceAnswer } = vi.hoisted(() => ({
  fetchChoiceItems: vi.fn(),
  submitChoiceAnswer: vi.fn(),
}));

vi.mock('../../lib/choice/api', () => ({
  fetchChoiceItems,
  submitChoiceAnswer,
}));

function mockChoiceItems(articleId = 'choice-article-1', stem = 'Question 26?') {
  return [
    {
      id: articleId,
      bank_id: 'set-1',
      title: '2025 数据结构 第1题',
      material_blocks: [],
      group_type: 'single',
      subject_area: '数据结构',
      tags: ['数据结构'],
      sort_order: 1,
      question_count: 1,
      questions: [
        {
          id: `${articleId}_q26`,
          question_no: 26,
          stem_blocks: [{ type: 'paragraph', text: stem }],
          options: [{ key: 'A', text: 'Option A' }, { key: 'B', text: 'Option B' }, { key: 'C', text: 'Option C' }, { key: 'D', text: 'Option D' }],
          answer: 'A',
          explanation_blocks: [],
          tags: [],
          sort_order: 1,
        },
      ],
    },
  ];
}

const practiceRun: FocusWorkRunSummary = {
  id: 'run-1',
  workflow_id: 'workflow-1',
  phase_index: 0,
  focus_work_type: 'practice',
  counts_for_task_completion: true,
  status: 'running',
  config_snapshot: {
    choice_scope: { bank_id: 'set-1', years: [2025], subjects: ['数据结构'] },
  },
};

describe('PracticeFocusWork', () => {
  beforeEach(() => {
    if (!HTMLDivElement.prototype.scrollTo) {
      HTMLDivElement.prototype.scrollTo = vi.fn();
    }
    fetchChoiceItems.mockReset();
    submitChoiceAnswer.mockReset();
  });

  it('loads choice items and displays the first question', async () => {
    fetchChoiceItems.mockResolvedValue(mockChoiceItems());

    render(
      <MemoryRouter>
        <PracticeFocusWork
          run={practiceRun}
          disabled={false}
          onContentCompleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Question 26?')).toBeInTheDocument();
  });

  it('emits content completion when no choice items are available', async () => {
    fetchChoiceItems.mockResolvedValue([]);

    const onContentCompleted = vi.fn();

    render(
      <MemoryRouter>
        <PracticeFocusWork
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

  it('records answers and completes at the configured question count', async () => {
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
        <PracticeFocusWork
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

    await user.click(screen.getByRole('button', { name: /Option A/ }));
    await user.click(screen.getByRole('button', { name: /提交答案/ }));

    await waitFor(() => {
      expect(submitChoiceAnswer).toHaveBeenCalledWith('choice-q1', 'A');
      expect(onContentCompleted).toHaveBeenCalledWith(expect.objectContaining({ question_count: 1 }));
    });
  });

  it('renders single choice stems in the upper material panel', async () => {
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
        <PracticeFocusWork
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

  it('shows error when bank_id is missing', async () => {
    render(
      <MemoryRouter>
        <PracticeFocusWork
          run={{ ...practiceRun, config_snapshot: {} }}
          disabled={false}
          onContentCompleted={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('未配置题库')).toBeInTheDocument();
  });
});
