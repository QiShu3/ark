import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import '@testing-library/jest-dom';

import EventCountdownCard from '../EventCountdownCard';
import { apiJson } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

describe('EventCountdownCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('renders primary event name and countdown', async () => {
    const dueAt = new Date(Date.now() + (51 * 60 * 60 + 30) * 1000).toISOString();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/primary') {
        return {
          id: 'event-1',
          user_id: 7,
          name: '论文投稿',
          due_at: dueAt,
          is_primary: true,
          created_at: '2026-03-18T00:00:00Z',
          updated_at: '2026-03-18T00:00:00Z',
        };
      }
      if (url === '/todo/events') return [];
      return {};
    });

    render(<EventCountdownCard />);

    expect(await screen.findByText('论文投稿')).toBeInTheDocument();
    expect(screen.getByText('2d 03h')).toBeInTheDocument();
  });

  it('shows hour and minute when remaining time is within 24 hours', async () => {
    const dueAt = new Date(Date.now() + (5 * 60 * 60 + 7 * 60 + 10) * 1000).toISOString();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/primary') {
        return {
          id: 'event-1',
          user_id: 7,
          name: '论文投稿',
          due_at: dueAt,
          is_primary: true,
          created_at: '2026-03-18T00:00:00Z',
          updated_at: '2026-03-18T00:00:00Z',
        };
      }
      if (url === '/todo/events') return [];
      return {};
    });

    render(<EventCountdownCard />);

    expect(await screen.findByText('论文投稿')).toBeInTheDocument();
    expect(screen.getByText('5h 07m')).toBeInTheDocument();
  });

  it('shows minute and second when remaining time is within 1 hour', async () => {
    const dueAt = new Date(Date.now() + (42 * 60 + 9) * 1000).toISOString();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/primary') {
        return {
          id: 'event-1',
          user_id: 7,
          name: '论文投稿',
          due_at: dueAt,
          is_primary: true,
          created_at: '2026-03-18T00:00:00Z',
          updated_at: '2026-03-18T00:00:00Z',
        };
      }
      if (url === '/todo/events') return [];
      return {};
    });

    render(<EventCountdownCard />);

    expect(await screen.findByText('论文投稿')).toBeInTheDocument();
    expect(screen.getByText(/^42m 0[89]s$/)).toBeInTheDocument();
  });

  it('shows empty state when no primary event exists', async () => {
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/primary') {
        throw new Error('主事件不存在');
      }
      if (url === '/todo/events') return [];
      return {};
    });

    render(<EventCountdownCard />);

    expect(await screen.findByText('未设置主事件')).toBeInTheDocument();
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('creates an event with a selected template and opens the workbench with the draft', async () => {
    const user = userEvent.setup();
    const createdEvents: Array<{
      id: string;
      user_id: number;
      name: string;
      start_date: string;
      due_at: string;
      is_primary: boolean;
      created_at: string;
      updated_at: string;
    }> = [];
    const template = {
      id: 'template-1',
      user_id: 7,
      name: '考试复习',
      description: null,
      schedule_mode: 'before_due' as const,
      default_event_name: '高数期末',
      default_start_date: '2026-05-20',
      default_due_at: new Date('2026-06-20T10:00').toISOString(),
      default_is_primary: true,
      items: [
        {
          id: 'template-item-1',
          template_id: 'template-1',
          kind: 'task' as const,
          title: '第一轮复习',
          content: null,
          offset_days: 0,
          sort_order: 0,
          created_at: '2026-05-18T00:00:00Z',
          updated_at: '2026-05-18T00:00:00Z',
        },
      ],
      created_at: '2026-05-18T00:00:00Z',
      updated_at: '2026-05-18T00:00:00Z',
    };

    (apiJson as Mock).mockImplementation(async (url: string, options?: { body?: string; method?: string }) => {
      if (url === '/todo/events/primary') {
        const primary = createdEvents.find((event) => event.is_primary);
        if (!primary) throw new Error('主事件不存在');
        return primary;
      }
      if (url === '/todo/events' && !options) return [...createdEvents];
      if (url === '/todo/event-plan-templates') return [template];
      if (url === '/todo/events' && options?.method === 'POST') {
        const payload = JSON.parse(options.body || '{}');
        const created = {
          id: 'event-2',
          user_id: 7,
          name: payload.name,
          start_date: payload.start_date,
          due_at: payload.due_at,
          is_primary: payload.is_primary,
          created_at: '2026-05-19T00:00:00Z',
          updated_at: '2026-05-19T00:00:00Z',
        };
        createdEvents.push(created);
        if (payload.is_primary) {
          for (const event of createdEvents) {
            if (event.id !== created.id) event.is_primary = false;
          }
        }
        return created;
      }
      if (url === '/todo/events/event-2/plan-draft/apply-template' && options?.method === 'POST') {
        expect(JSON.parse(options.body || '{}')).toEqual({ template_id: 'template-1' });
        return {
          event: createdEvents[0],
          plan_draft: {
            id: 'draft-1',
            event_id: 'event-2',
            user_id: 7,
            source_template_id: 'template-1',
            created_at: '2026-05-19T00:00:00Z',
            updated_at: '2026-05-19T00:00:00Z',
            items: [
              {
                id: 'draft-item-1',
                draft_id: 'draft-1',
                kind: 'task',
                title: '第一轮复习',
                content: null,
                scheduled_for: '2026-06-08T10:00:00Z',
                starts_at: null,
                ends_at: null,
                payload: {},
                sort_order: 0,
                created_subject_id: null,
                created_at: '2026-05-19T00:00:00Z',
                updated_at: '2026-05-19T00:00:00Z',
              },
            ],
          },
          created_tasks: [],
          created_appointments: [],
        };
      }
      if (url === '/todo/events/event-2/workbench') {
        return {
          event: createdEvents[0],
          plan_draft: {
            id: 'draft-1',
            event_id: 'event-2',
            user_id: 7,
            source_template_id: 'template-1',
            created_at: '2026-05-19T00:00:00Z',
            updated_at: '2026-05-19T00:00:00Z',
            items: [
              {
                id: 'draft-item-1',
                draft_id: 'draft-1',
                kind: 'task',
                title: '第一轮复习',
                content: null,
                scheduled_for: '2026-06-08T10:00:00Z',
                starts_at: null,
                ends_at: null,
                payload: {},
                sort_order: 0,
                created_subject_id: null,
                created_at: '2026-05-19T00:00:00Z',
                updated_at: '2026-05-19T00:00:00Z',
              },
            ],
          },
          created_tasks: [],
          created_appointments: [],
        };
      }
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.selectOptions(screen.getByLabelText('事件模板'), 'template-1');
    await waitFor(() => {
      expect(screen.getByLabelText('事件名称')).toHaveValue('高数期末');
      expect(screen.getByLabelText('开始日期')).toHaveValue('2026-05-20');
      expect(screen.getByLabelText('到期时间')).toHaveValue('2026-06-20T10:00');
    });
    await user.click(screen.getByRole('button', { name: '套用模板' }));

    expect(await screen.findByRole('dialog', { name: '事件工作台' })).toBeInTheDocument();
    expect(screen.getByText('第一轮复习')).toBeInTheDocument();
  });

  it('opens the template workbench from the gear button in the event editor', async () => {
    const user = userEvent.setup();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/primary') throw new Error('主事件不存在');
      if (url === '/todo/events') return [];
      if (url === '/todo/event-plan-templates') return [];
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.click(screen.getByRole('button', { name: '进入模板工作台' }));

    expect(await screen.findByRole('dialog', { name: '模板工作台' })).toBeInTheDocument();
  });

  it('opens workbench modal for the primary event', async () => {
    const user = userEvent.setup();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/primary') {
        return {
          id: 'event-1',
          user_id: 7,
          name: '论文投稿',
          start_date: '2026-03-01',
          due_at: '2026-03-21T03:00:00Z',
          is_primary: true,
          created_at: '2026-03-18T00:00:00Z',
          updated_at: '2026-03-18T00:00:00Z',
        };
      }
      if (url === '/todo/events/event-1/workbench') {
        return {
          event: {
            id: 'event-1',
            user_id: 7,
            name: '论文投稿',
            start_date: '2026-03-01',
            due_at: '2026-03-21T03:00:00Z',
            is_primary: true,
            created_at: '2026-03-18T00:00:00Z',
            updated_at: '2026-03-18T00:00:00Z',
          },
          plan_draft: null,
          created_tasks: [],
          created_appointments: [],
        };
      }
      if (url === '/todo/events') {
        return [
          {
            id: 'event-1',
            user_id: 7,
            name: '论文投稿',
            start_date: '2026-03-01',
            due_at: '2026-03-21T03:00:00Z',
            is_primary: true,
            created_at: '2026-03-18T00:00:00Z',
            updated_at: '2026-03-18T00:00:00Z',
          },
        ];
      }
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /论文投稿/i }));

    expect(await screen.findByRole('dialog', { name: '事件工作台' })).toBeInTheDocument();
    expect(screen.getByText('事件总览')).toBeInTheDocument();
    expect(screen.getByText('开始日期 2026-03-01')).toBeInTheDocument();
  });

  it('creates a primary event from the empty state and opens its workbench', async () => {
    const user = userEvent.setup();
    const events: Array<{
      id: string;
      user_id: number;
      name: string;
      start_date: string;
      due_at: string;
      is_primary: boolean;
      created_at: string;
      updated_at: string;
    }> = [];

    (apiJson as Mock).mockImplementation(async (url: string, options?: { body?: string }) => {
      if (url === '/todo/events/primary') {
        const primary = events.find((event) => event.is_primary);
        if (!primary) throw new Error('主事件不存在');
        return primary;
      }
      if (url === '/todo/events' && !options) {
        return [...events];
      }
      if (url === '/todo/events' && options?.body) {
        const payload = JSON.parse(options.body);
        const created = {
          id: 'event-2',
          user_id: 7,
          name: payload.name,
          start_date: payload.start_date,
          due_at: payload.due_at,
          is_primary: payload.is_primary,
          created_at: '2026-03-19T00:00:00Z',
          updated_at: '2026-03-19T00:00:00Z',
        };
        events.push(created);
        if (payload.is_primary) {
          for (const event of events) {
            if (event.id !== 'event-2') event.is_primary = false;
          }
        }
        return created;
      }
      if (url === '/todo/events/event-2/workbench') {
        return {
          event: events[0],
          plan_draft: null,
          created_tasks: [],
          created_appointments: [],
        };
      }
      if (url === '/todo/event-plan-templates') return [];
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.type(screen.getByPlaceholderText('例如：论文投稿截止'), '答辩');
    await user.type(screen.getByLabelText('开始日期'), '2026-03-01');
    await user.type(screen.getByLabelText('到期时间'), '2026-03-22T10:00');
    await user.click(screen.getByRole('button', { name: '添加事件' }));

    await waitFor(() => {
      const createCall = (apiJson as Mock).mock.calls.find(([url, init]: [string, { body?: string }]) => {
        return url === '/todo/events' && Boolean(init?.body);
      });
      expect(createCall).toBeTruthy();
      expect(JSON.parse(createCall?.[1].body)).toMatchObject({
        name: '答辩',
        start_date: '2026-03-01',
        is_primary: true,
      });
    });
    expect(await screen.findByRole('dialog', { name: '事件工作台' })).toBeInTheDocument();
    expect(screen.getByText('事件总览')).toBeInTheDocument();
  });

  it('opens a workbench from the event list when no primary event is set', async () => {
    const user = userEvent.setup();
    const eventWithoutPrimary = {
      id: 'event-3',
      user_id: 7,
      name: '毕业设计',
      start_date: '2026-03-01',
      due_at: '2026-04-20T10:00:00Z',
      is_primary: false,
      created_at: '2026-03-19T00:00:00Z',
      updated_at: '2026-03-19T00:00:00Z',
    };

    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/primary') throw new Error('主事件不存在');
      if (url === '/todo/events') return [eventWithoutPrimary];
      if (url === '/todo/events/event-3/workbench') {
        return {
          event: eventWithoutPrimary,
          plan_draft: null,
          created_tasks: [],
          created_appointments: [],
        };
      }
      if (url === '/todo/event-plan-templates') return [];
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.click(await screen.findByRole('button', { name: '打开工作台：毕业设计' }));

    expect(await screen.findByRole('dialog', { name: '事件工作台' })).toBeInTheDocument();
    expect(screen.getByText('毕业设计')).toBeInTheDocument();
  });
});
