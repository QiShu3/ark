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
  const quickCreateButton = screen.queryByRole('button', { name: '快捷创建安排' })
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
      screen.getByPlaceholderText('请输入安排目标、截止时间、优先级等信息，助手会自动帮你判断任务或日程'),
      '各位同学：请预习课文，并拍摄朗读视频，下周提交。',
    );
    await user.click(screen.getByRole('button', { name: '快捷生成安排' }));

    expect(await screen.findByText('识别到 2 个安排草稿')).toBeInTheDocument();
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
      screen.getByPlaceholderText('请输入安排目标、截止时间、优先级等信息，助手会自动帮你判断任务或日程'),
      '请预习课文、拍摄朗读视频。',
    );
    await user.click(screen.getByRole('button', { name: '快捷生成安排' }));
    await user.click(await screen.findByRole('button', { name: '创建“预习课文”' }));

    expect(screen.getByRole('heading', { name: '创建安排' })).toBeInTheDocument();
    expect(screen.getByLabelText('标题')).toHaveValue('预习课文');
    expect(screen.getByLabelText('目标时长（分钟）')).toHaveValue(35);
    expect(screen.getByLabelText('截止日期')).toHaveValue('2026-04-20T10:00');
    expect(screen.getByLabelText('标签')).toHaveValue('语文');

    await waitFor(() => {
      expect(screen.queryByText('安排解析助手')).not.toBeInTheDocument();
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
      screen.getByPlaceholderText('请输入安排目标、截止时间、优先级等信息，助手会自动帮你判断任务或日程'),
      '明天下班前完成周报。',
    );
    await user.click(screen.getByRole('button', { name: '快捷生成安排' }));

    expect(screen.queryByText(/安排草稿/)).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '创建安排' })).toBeInTheDocument();
    expect(screen.getByLabelText('标题')).toHaveValue('完成周报');
    expect(screen.getByLabelText('目标时长（分钟）')).toHaveValue(45);
    expect(screen.getByLabelText('标签')).toHaveValue('工作');
  });

  it('opens the appointment create flow when assistant identifies a schedule item', async () => {
    const user = userEvent.setup();
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/api/chat') {
        return Promise.resolve({
          reply: JSON.stringify({
            kind: 'appointment',
            title: '参加站会',
            content: '周一晨会',
            startsAt: '2026-04-21T10:00:00+08:00',
            endsAt: '2026-04-21T10:30:00+08:00',
          }),
        });
      }
      return defaultApiResponse(path);
    });
    const { container } = renderTaskCard();

    await openTaskAssistant(user, container);
    await user.type(
      screen.getByPlaceholderText('请输入安排目标、截止时间、优先级等信息，助手会自动帮你判断任务或日程'),
      '周二上午十点开站会。',
    );
    await user.click(screen.getByRole('button', { name: '快捷生成安排' }));

    expect(await screen.findByRole('heading', { name: '创建安排' })).toBeInTheDocument();
    expect(screen.getByLabelText('安排类型')).toHaveValue('appointment');
    expect(screen.getByLabelText('标题')).toHaveValue('参加站会');
    expect(screen.getByLabelText('结束时间')).toHaveValue('2026-04-21T10:30');
  });

  it('defaults the custom create form to the current primary event for both tasks and appointments', async () => {
    const user = userEvent.setup();
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/todo/events') {
        return Promise.resolve([
          {
            id: 'event-primary',
            user_id: 7,
            name: '论文投稿',
            due_at: '2026-04-30T10:00:00Z',
            is_primary: true,
            created_at: '2026-04-20T00:00:00Z',
            updated_at: '2026-04-20T00:00:00Z',
          },
          {
            id: 'event-other',
            user_id: 7,
            name: '答辩',
            due_at: '2026-05-03T10:00:00Z',
            is_primary: false,
            created_at: '2026-04-20T00:00:00Z',
            updated_at: '2026-04-20T00:00:00Z',
          },
        ]);
      }
      return defaultApiResponse(path);
    });
    const { container } = renderTaskCard();

    await openTaskAssistant(user, container);
    await user.click(screen.getByRole('button', { name: '自定义安排' }));

    expect(await screen.findByRole('heading', { name: '创建安排' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('关联事件')).toHaveValue('event-primary');
    });

    await user.selectOptions(screen.getByLabelText('安排类型'), 'appointment');
    await waitFor(() => {
      expect(screen.getByLabelText('关联事件')).toHaveValue('event-primary');
    });
  });

  it('submits task creation with selected event binding and repeat completion settings', async () => {
    const user = userEvent.setup();
    const calls: Array<{ path: string; options?: RequestInit }> = [];
    mockApiJson.mockImplementation((path: string, options?: RequestInit) => {
      calls.push({ path, options });
      if (path === '/todo/events') {
        return Promise.resolve([
          {
            id: 'event-primary',
            user_id: 7,
            name: '论文投稿',
            due_at: '2026-04-30T10:00:00Z',
            is_primary: true,
            created_at: '2026-04-20T00:00:00Z',
            updated_at: '2026-04-20T00:00:00Z',
          },
        ]);
      }
      if (path === '/todo/tasks' && options?.body) {
        return Promise.resolve({});
      }
      return defaultApiResponse(path);
    });
    const { container } = renderTaskCard();

    await openTaskAssistant(user, container);
    await user.click(screen.getByRole('button', { name: '自定义安排' }));

    expect(await screen.findByRole('heading', { name: '创建安排' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('标题'), '完成初稿');
    await user.click(screen.getByRole('button', { name: '更多' }));
    await waitFor(() => {
      expect(screen.getByLabelText('关联事件')).toHaveValue('event-primary');
    });
    expect(screen.queryByText('循环周期')).not.toBeInTheDocument();
    expect(screen.queryByText('目的循环次数')).not.toBeInTheDocument();
    expect(screen.queryByText('自定义间隔（天）')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('完成周期'), 'weekly');
    await user.clear(screen.getByLabelText('单周期最多完成次数'));
    await user.type(screen.getByLabelText('单周期最多完成次数'), '3');
    await user.click(screen.getByLabelText('仅工作日可完成'));
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(calls.some(({ path }) => path === '/todo/tasks')).toBe(true);
    });

    const submitCall = [...calls].reverse().find(({ path }) => path === '/todo/tasks');
    expect(submitCall?.options?.body).toBeTruthy();
    const payload = JSON.parse(String(submitCall?.options?.body));
    expect(payload.event_id).toBe('event-primary');
    expect(payload.event).toBe('论文投稿');
    expect(payload.time_inherits_from_event).toBe(true);
    expect(payload.time_overridden).toBe(false);
    expect(payload.is_recurring).toBe(true);
    expect(payload.period_type).toBe('weekly');
    expect(payload.max_completions_per_period).toBe(3);
    expect(payload.weekday_only).toBe(true);
    expect(payload).not.toHaveProperty('target_cycle_count');
    expect(payload).not.toHaveProperty('cycle_period');
    expect(payload).not.toHaveProperty('cycle_every_days');
    expect(payload).not.toHaveProperty('event_ids');
  });

  it('shows arrangement kind and time metadata for mixed task and appointment drafts', async () => {
    const user = userEvent.setup();
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/api/chat') {
        return Promise.resolve({
          reply: JSON.stringify({
            mode: 'multiple',
            tasks: [
              {
                kind: 'appointment',
                title: '参加站会',
                content: '周会同步进度',
                endsAt: '2026-04-22T10:30:00+08:00',
              },
              {
                title: '整理周报',
                content: '汇总本周进展',
                targetMinutes: 45,
                dueDate: '2026-04-22T18:00:00+08:00',
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
      screen.getByPlaceholderText('请输入安排目标、截止时间、优先级等信息，助手会自动帮你判断任务或日程'),
      '周二上午十点半参加站会，晚上六点前整理周报。',
    );
    await user.click(screen.getByRole('button', { name: '快捷生成安排' }));

    expect(await screen.findByText('识别到 2 个安排草稿')).toBeInTheDocument();
    expect(screen.getByText('日程')).toBeInTheDocument();
    expect(screen.getByText('任务')).toBeInTheDocument();
    expect(screen.getByText('结束：2026-04-22 10:30')).toBeInTheDocument();
    expect(screen.getByText('截止：2026-04-22 18:00')).toBeInTheDocument();
  });
});
