import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import InputQuestionFocusTemplate from './InputQuestionFocusTemplate';
import type { InputQuestionItem } from './inputQuestionTypes';

const fillItem: InputQuestionItem = {
  id: 'q1',
  numberLabel: 'Q1',
  stem: '1+1=?',
  inputConfig: { placeholder: '请输入数字' },
  mode: 'fill',
  acceptedAnswers: ['2'],
  matchRule: 'exact',
  caseSensitive: false,
  meta: [{ label: '填空', tone: 'blue' }],
};

const subjectiveItem: InputQuestionItem = {
  id: 'q2',
  numberLabel: 'Q1',
  stem: '翻译：Hello world',
  inputConfig: { lines: 3, placeholder: '请输入翻译' },
  mode: 'subjective',
  rubric: '翻译准确',
  referenceAnswer: '你好世界',
  meta: [{ label: '主观', tone: 'amber' }],
};

describe('InputQuestionFocusTemplate', () => {
  it('renders empty state when no question', () => {
    render(
      <InputQuestionFocusTemplate
        title="测试"
        article={null}
        currentQuestion={null}
        loading={false}
        answeredCount={0}
        targetCount={10}
        disabled={false}
        onSubmitAnswer={vi.fn()}
        onLoadNext={vi.fn()}
        onContentCompleted={vi.fn()}
      />,
    );
    expect(screen.getByText('暂无题目')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(
      <InputQuestionFocusTemplate
        title="测试"
        article={null}
        currentQuestion={null}
        loading={true}
        answeredCount={0}
        targetCount={10}
        disabled={false}
        onSubmitAnswer={vi.fn()}
        onLoadNext={vi.fn()}
        onContentCompleted={vi.fn()}
      />,
    );
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('renders fill question with input', () => {
    render(
      <InputQuestionFocusTemplate
        title="测试"
        article={null}
        currentQuestion={fillItem}
        loading={false}
        answeredCount={0}
        targetCount={10}
        disabled={false}
        onSubmitAnswer={vi.fn()}
        onLoadNext={vi.fn()}
        onContentCompleted={vi.fn()}
      />,
    );
    expect(screen.getByText('1+1=?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请输入数字')).toBeInTheDocument();
    expect(screen.getByText('提交')).toBeInTheDocument();
  });

  it('renders subjective question with textarea', () => {
    render(
      <InputQuestionFocusTemplate
        title="测试"
        article={null}
        currentQuestion={subjectiveItem}
        loading={false}
        answeredCount={0}
        targetCount={10}
        disabled={false}
        onSubmitAnswer={vi.fn()}
        onLoadNext={vi.fn()}
        onContentCompleted={vi.fn()}
      />,
    );
    expect(screen.getByText('翻译：Hello world')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请输入翻译')).toBeInTheDocument();
  });

  it('submits answer and shows result', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ correct: true, acceptedAnswers: ['2'] });

    render(
      <InputQuestionFocusTemplate
        title="测试"
        article={null}
        currentQuestion={fillItem}
        loading={false}
        answeredCount={0}
        targetCount={10}
        disabled={false}
        onSubmitAnswer={onSubmit}
        onLoadNext={vi.fn()}
        onContentCompleted={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText('请输入数字'), '2');
    await user.click(screen.getByText('提交'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(fillItem, '2');
    });
    expect(screen.getByText('正确')).toBeInTheDocument();
  });

  it('disables input when disabled prop is true', () => {
    render(
      <InputQuestionFocusTemplate
        title="测试"
        article={null}
        currentQuestion={fillItem}
        loading={false}
        answeredCount={0}
        targetCount={10}
        disabled={true}
        onSubmitAnswer={vi.fn()}
        onLoadNext={vi.fn()}
        onContentCompleted={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('请输入数字')).toBeDisabled();
  });

  it('shows answered/target count', () => {
    render(
      <InputQuestionFocusTemplate
        title="测试"
        article={null}
        currentQuestion={fillItem}
        loading={false}
        answeredCount={3}
        targetCount={10}
        disabled={false}
        onSubmitAnswer={vi.fn()}
        onLoadNext={vi.fn()}
        onContentCompleted={vi.fn()}
      />,
    );
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });
});
