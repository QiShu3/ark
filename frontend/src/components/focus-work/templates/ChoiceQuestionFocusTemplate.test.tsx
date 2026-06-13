import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import ChoiceQuestionFocusTemplate from './ChoiceQuestionFocusTemplate';
import type { ChoiceQuestionItem } from './choiceQuestionTypes';

function item(id = 'q1'): ChoiceQuestionItem {
  return {
    id,
    numberLabel: 'Q26',
    stem: 'Question 26?',
    material: {
      title: 'Reading Passage',
      paragraphs: [{ id: 'p1', label: '1', text: 'Context paragraph.' }],
    },
    meta: [{ label: '错题复习' }],
    options: [
      { key: 'A', text: 'A1' },
      { key: 'B', text: 'B1' },
      { key: 'C', text: 'C1' },
      { key: 'D', text: 'D1' },
    ],
  };
}

function renderTemplate(overrides: Partial<React.ComponentProps<typeof ChoiceQuestionFocusTemplate>> = {}) {
  const props: React.ComponentProps<typeof ChoiceQuestionFocusTemplate> = {
    title: 'ERC REVIEW',
    subtitle: '2025 年 Text 2 · Test Article',
    statusLabel: '复习题',
    item: item(),
    loading: false,
    error: null,
    emptyTitle: '暂无可复习内容',
    emptyDescription: '当前没有可用的 ERC 复习内容。',
    answeredCount: 0,
    targetCount: 10,
    disabled: false,
    onSubmitAnswer: vi.fn(async () => ({ correctOptionKey: 'A' })),
    onLoadNext: vi.fn(async () => item('q2')),
    onContentCompleted: vi.fn(),
    ...overrides,
  };
  render(<ChoiceQuestionFocusTemplate {...props} />);
  return props;
}

describe('ChoiceQuestionFocusTemplate', () => {
  it('renders material, question, options, and metadata', () => {
    renderTemplate();

    expect(screen.getByText('ERC REVIEW')).toBeInTheDocument();
    expect(screen.getByText('2025 年 Text 2 · Test Article')).toBeInTheDocument();
    expect(screen.getByText('错题复习')).toBeInTheDocument();
    expect(screen.getByLabelText('阅读原文')).toBeInTheDocument();
    expect(screen.getByText('Context paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Question 26?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AA1' })).toBeInTheDocument();
  });

  it('keeps submit disabled until an option is selected', async () => {
    const user = userEvent.setup();
    const props = renderTemplate();

    expect(screen.getByRole('button', { name: '提交答案' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'AA1' }));
    expect(screen.getByRole('button', { name: '提交答案' })).toBeEnabled();
    expect(props.onSubmitAnswer).not.toHaveBeenCalled();
  });

  it('submits the selected answer and marks result states', async () => {
    const user = userEvent.setup();
    const props = renderTemplate({
      onSubmitAnswer: vi.fn(async () => ({ correctOptionKey: 'B' })),
    });

    await user.click(screen.getByRole('button', { name: 'AA1' }));
    await user.click(screen.getByRole('button', { name: '提交答案' }));

    await waitFor(() => {
      expect(props.onSubmitAnswer).toHaveBeenCalledWith(item(), 'A');
    });
    expect(screen.getByRole('button', { name: 'AA1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'BB1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一题' })).toBeInTheDocument();
  });

  it('loads the next question and resets selection/result state', async () => {
    const user = userEvent.setup();
    renderTemplate({
      onSubmitAnswer: vi.fn(async () => ({ correctOptionKey: 'A' })),
      onLoadNext: vi.fn(async () => ({
        ...item('q2'),
        numberLabel: 'Q27',
        stem: 'Question 27?',
      })),
    });

    await user.click(screen.getByRole('button', { name: 'AA1' }));
    await user.click(screen.getByRole('button', { name: '提交答案' }));
    await screen.findByRole('button', { name: '下一题' });
    await user.click(screen.getByRole('button', { name: '下一题' }));

    expect(await screen.findByText('Question 27?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交答案' })).toBeDisabled();
  });

  it('emits content completion once when the target count is already reached', async () => {
    const onContentCompleted = vi.fn();
    renderTemplate({ answeredCount: 1, targetCount: 1, onContentCompleted });

    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith({ answered_count: 1, target_question_count: 1 });
    });
    expect(onContentCompleted).toHaveBeenCalledTimes(1);
  });

  it('emits empty content completion once when no item is available after loading', async () => {
    const onContentCompleted = vi.fn();
    renderTemplate({ item: null, loading: false, answeredCount: 0, onContentCompleted });

    expect(screen.getByText('暂无可复习内容')).toBeInTheDocument();
    await waitFor(() => {
      expect(onContentCompleted).toHaveBeenCalledWith({
        answered_count: 0,
        target_question_count: 10,
        no_available_content: true,
      });
    });
    expect(onContentCompleted).toHaveBeenCalledTimes(1);
  });

  it('disables interactions while paused', () => {
    renderTemplate({ disabled: true });

    expect(screen.getByRole('button', { name: 'AA1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '提交答案' })).toBeDisabled();
  });
});
