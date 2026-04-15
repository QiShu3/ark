import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PlaceholderCard from '../PlaceholderCard';
import { apiJson } from '../../lib/api';

const mockApiJson = vi.mocked(apiJson);

function renderTaskCard() {
  const view = render(
    <MemoryRouter>
      <PlaceholderCard index={0} />
    </MemoryRouter>,
  );
  return view;
}

function defaultApiResponse(path: string) {
  if (path === '/todo/focus/current') {
    return Promise.reject(new Error('no focus'));
  }
  if (path === '/todo/focus/today') {
    return Promise.resolve({ minutes: 0 });
  }
  if (path === '/todo/focus/workflow/current') {
    return Promise.resolve({
      state: 'normal',
      task_id: null,
      task_title: null,
      pending_confirmation: false,
      remaining_seconds: null,
    });
  }
  if (path === '/todo/focus/workflows') {
    return Promise.resolve([]);
  }
  if (path === '/todo/tasks?limit=100') {
    return Promise.resolve([]);
  }
  return Promise.resolve({});
}

async function openTaskAssistant(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const quickCreateButton = screen.queryByRole('button', { name: '快捷创建任务' })
    ?? container.querySelector('button.absolute.bottom-2.right-2');
  expect(quickCreateButton).toBeInTheDocument();
  await user.click(quickCreateButton as HTMLButtonElement);
}

describe('PlaceholderCard task assistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiJson.mockImplementation((path: string) => defaultApiResponse(path));
  });

  it('shows multiple task drafts when assistant parses a long notice into independent tasks', async () => {
    const user = userEvent.setup();
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/api/chat') {
        return Promise.resolve({
          reply: JSON.stringify({
            mode: 'multiple',
            tasks: [
              {
                title: '预习课文',
                content: '阅读老师发来的课文材料，标记不理解的词句。',
                dueDate: '2026-04-20T10:00:00+08:00',
                tags: ['语文'],
              },
              {
                title: '拍摄视频',
                content: '按通知要求录制朗读视频。',
                dueDate: '2026-04-21T20:00:00+08:00',
                tags: ['作业'],
              },
            ],
          }),
        });
      }
      return defaultApiResponse(path);
    });
    const { container } = renderTaskCard();

    await openTaskAssistant(user, container);
    await user.type(
      screen.getByPlaceholderText('请输入任务目标、截止时间、优先级等信息，助手会自动帮你填充任务参数'),
      '各位同学：请预习课文，并拍摄朗读视频，下周提交。',
    );
    await user.click(screen.getByRole('button', { name: '快捷生成任务' }));

    expect(await screen.findByText('识别到 2 个任务草稿')).toBeInTheDocument();
    expect(screen.getByText('预习课文')).toBeInTheDocument();
    expect(screen.getByText('拍摄视频')).toBeInTheDocument();
    expect(screen.queryByText('AI 返回格式无法识别')).not.toBeInTheDocument();
  });

  it('opens the existing create-task form with the selected draft prefilled', async () => {
    const user = userEvent.setup();
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/api/chat') {
        return Promise.resolve({
          reply: JSON.stringify({
            mode: 'multiple',
            tasks: [
              {
                title: '预习课文',
                content: '阅读老师发来的课文材料，标记不理解的词句。',
                targetMinutes: 35,
                dueDate: '2026-04-20T10:00:00+08:00',
                tags: ['语文'],
              },
              {
                title: '拍摄视频',
                content: '按通知要求录制朗读视频。',
                dueDate: '2026-04-21T20:00:00+08:00',
                tags: ['作业'],
              },
            ],
          }),
        });
      }
      return defaultApiResponse(path);
    });
    const { container } = renderTaskCard();

    await openTaskAssistant(user, container);
    await user.type(
      screen.getByPlaceholderText('请输入任务目标、截止时间、优先级等信息，助手会自动帮你填充任务参数'),
      '请预习课文、拍摄朗读视频。',
    );
    await user.click(screen.getByRole('button', { name: '快捷生成任务' }));
    await user.click(await screen.findByRole('button', { name: '创建“预习课文”' }));

    expect(screen.getByRole('heading', { name: '创建任务' })).toBeInTheDocument();
    expect(screen.getByLabelText('标题')).toHaveValue('预习课文');
    expect(screen.getByLabelText('目标时长（分钟）')).toHaveValue(35);
    expect(screen.getByLabelText('截止日期')).toHaveValue('2026-04-20T10:00');
    expect(screen.getByLabelText('标签')).toHaveValue('语文');

    await waitFor(() => {
      expect(screen.queryByText('任务解析助手')).not.toBeInTheDocument();
    });
  });

  it('keeps the legacy single-task assistant response path working', async () => {
    const user = userEvent.setup();
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/api/chat') {
        return Promise.resolve({
          reply: JSON.stringify({
            title: '完成周报',
            content: '整理本周进展并提交。',
            targetMinutes: 45,
            tags: ['工作'],
          }),
        });
      }
      return defaultApiResponse(path);
    });
    const { container } = renderTaskCard();

    await openTaskAssistant(user, container);
    await user.type(
      screen.getByPlaceholderText('请输入任务目标、截止时间、优先级等信息，助手会自动帮你填充任务参数'),
      '明天下班前完成周报。',
    );
    await user.click(screen.getByRole('button', { name: '快捷生成任务' }));

    expect(screen.queryByText(/任务草稿/)).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '创建任务' })).toBeInTheDocument();
    expect(screen.getByLabelText('标题')).toHaveValue('完成周报');
    expect(screen.getByLabelText('目标时长（分钟）')).toHaveValue(45);
    expect(screen.getByLabelText('标签')).toHaveValue('工作');
  });
});
