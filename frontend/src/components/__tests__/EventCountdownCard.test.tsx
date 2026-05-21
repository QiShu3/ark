import { render, screen, within } from '@testing-library/react';
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

  it('returns to the event overview after creating an event from the add-event editor', async () => {
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

    (apiJson as Mock).mockImplementation(async (url: string, options?: { body?: string; method?: string }) => {
      if (url === '/todo/events/primary') {
        const primary = createdEvents.find((event) => event.is_primary);
        if (!primary) throw new Error('主事件不存在');
        return primary;
      }
      if (url === '/todo/events' && !options) return [...createdEvents];
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
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.click(screen.getByRole('button', { name: '添加事件' }));
    await user.type(screen.getByLabelText('事件名称'), '高数期末');
    await user.type(screen.getByLabelText('开始日期'), '2026-05-20');
    await user.type(screen.getByLabelText('到期时间'), '2026-06-20T10:00');
    await user.click(screen.getByRole('button', { name: '创建事件' }));

    const overview = await screen.findByRole('dialog', { name: '事件总览' });
    expect(within(overview).getByText('高数期末')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '事件工作台' })).not.toBeInTheDocument();
    expect(apiJson).not.toHaveBeenCalledWith('/todo/events/event-2/plan-draft/apply-template', expect.anything());
  });

  it('does not show template controls in the add-event editor', async () => {
    const user = userEvent.setup();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/primary') throw new Error('主事件不存在');
      if (url === '/todo/events') return [];
      if (url === '/todo/event-plan-templates') return [];
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.click(screen.getByRole('button', { name: '添加事件' }));

    expect(screen.queryByLabelText('事件模板')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '进入模板工作台' })).not.toBeInTheDocument();
  });

  it('opens the event metadata editor only after clicking add event', async () => {
    const user = userEvent.setup();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/primary') throw new Error('主事件不存在');
      if (url === '/todo/events') return [];
      if (url === '/todo/event-plan-templates') return [];
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));

    expect(screen.queryByLabelText('事件名称')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('开始日期')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('到期时间')).not.toBeInTheDocument();
    expect(screen.queryByText('设为主事件')).not.toBeInTheDocument();
    expect(screen.queryByText('事件模板')).not.toBeInTheDocument();
    expect(screen.queryByText('套用模板')).not.toBeInTheDocument();
    expect(screen.queryByText('进入模板工作台')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '添加事件' }));

    expect(screen.getByLabelText('事件名称')).toBeInTheDocument();
    expect(screen.getByLabelText('开始日期')).toBeInTheDocument();
    expect(screen.getByLabelText('到期时间')).toBeInTheDocument();
    expect(screen.getByText('设为主事件')).toBeInTheDocument();
  });

  it('shows the event workbench shell in the add-event editor', async () => {
    const user = userEvent.setup();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/primary') throw new Error('主事件不存在');
      if (url === '/todo/events') return [];
      if (url === '/todo/event-plan-templates') return [];
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.click(screen.getByRole('button', { name: '添加事件' }));

    expect(screen.getByText('事件工作台')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加工作台内容' })).toBeInTheDocument();
    expect(screen.getByText('暂无工作台内容')).toBeInTheDocument();
  });

  it('creates blank workbench content without selecting an event template', async () => {
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
    (apiJson as Mock).mockImplementation(async (url: string, options?: { body?: string; method?: string }) => {
      if (url === '/todo/events/primary') {
        const primary = createdEvents.find((event) => event.is_primary);
        if (!primary) throw new Error('主事件不存在');
        return primary;
      }
      if (url === '/todo/events' && !options) return [...createdEvents];
      if (url === '/todo/event-plan-templates') return [];
      if (url === '/todo/events' && options?.method === 'POST') {
        const payload = JSON.parse(options.body || '{}');
        const created = {
          id: 'event-blank',
          user_id: 7,
          name: payload.name,
          start_date: payload.start_date,
          due_at: payload.due_at,
          is_primary: payload.is_primary,
          created_at: '2026-05-19T00:00:00Z',
          updated_at: '2026-05-19T00:00:00Z',
        };
        createdEvents.push(created);
        return created;
      }
      if (url === '/todo/events/event-blank/plan-draft/items' && options?.method === 'POST') {
        expect(JSON.parse(options.body || '{}')).toMatchObject({
          kind: 'task',
          title: '准备资料',
          content: '先整理清单',
          scheduled_for: expect.any(String),
          sort_order: 0,
        });
        return {};
      }
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.click(screen.getByRole('button', { name: '添加事件' }));
    await user.type(screen.getByLabelText('事件名称'), '空白事件');
    await user.type(screen.getByLabelText('开始日期'), '2026-05-21');
    await user.type(screen.getByLabelText('到期时间'), '2026-05-25T18:30');
    await user.click(screen.getByRole('button', { name: '添加工作台内容' }));
    await user.type(screen.getByLabelText('内容标题'), '准备资料');
    await user.type(screen.getByLabelText('内容备注'), '先整理清单');
    await user.click(screen.getByRole('button', { name: '创建事件' }));

    const overview = await screen.findByRole('dialog', { name: '事件总览' });
    expect(within(overview).getByText('空白事件')).toBeInTheDocument();
    expect(apiJson).toHaveBeenCalledWith(
      '/todo/events/event-blank/plan-draft/items',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('saves the add-event editor as a new event template', async () => {
    const user = userEvent.setup();
    (apiJson as Mock).mockImplementation(async (url: string, options?: { body?: string; method?: string }) => {
      if (url === '/todo/events/primary') throw new Error('主事件不存在');
      if (url === '/todo/events') return [];
      if (url === '/todo/event-plan-templates' && !options) return [];
      if (url === '/todo/event-plan-templates' && options?.method === 'POST') {
        expect(JSON.parse(options.body || '{}')).toMatchObject({
          name: '高数期末',
          schedule_mode: 'before_due',
          default_event_name: '高数期末',
          default_start_date: '2026-05-20',
          default_due_at: expect.any(String),
          default_is_primary: true,
          items: [
            {
              kind: 'task',
              title: '准备资料',
              content: '先整理清单',
              offset_days: 3,
              sort_order: 0,
            },
          ],
        });
        return {
          id: 'template-2',
          user_id: 7,
          name: '高数期末',
          description: null,
          schedule_mode: 'before_due',
          default_event_name: '高数期末',
          default_start_date: '2026-05-20',
          default_due_at: '2026-06-20T10:00:00.000Z',
          default_is_primary: true,
          items: [],
          created_at: '2026-05-19T00:00:00Z',
          updated_at: '2026-05-19T00:00:00Z',
        };
      }
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.click(screen.getByRole('button', { name: '添加事件' }));
    await user.type(screen.getByLabelText('事件名称'), '高数期末');
    await user.type(screen.getByLabelText('开始日期'), '2026-05-20');
    await user.type(screen.getByLabelText('到期时间'), '2026-06-20T10:00');
    await user.click(screen.getByRole('button', { name: '添加工作台内容' }));
    await user.type(screen.getByLabelText('内容标题'), '准备资料');
    await user.type(screen.getByLabelText('内容备注'), '先整理清单');
    await user.clear(screen.getByLabelText('相对天数'));
    await user.type(screen.getByLabelText('相对天数'), '3');
    await user.click(screen.getByRole('button', { name: '保存为模板' }));

    expect(await screen.findByText('已保存为模板')).toBeInTheDocument();
    expect(apiJson).toHaveBeenCalledWith(
      '/todo/event-plan-templates',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('asks before updating an existing template with the same name', async () => {
    const user = userEvent.setup();
    const existingTemplate = {
      id: 'template-1',
      user_id: 7,
      name: '高数期末',
      description: null,
      schedule_mode: 'before_due' as const,
      default_event_name: '旧名称',
      default_start_date: null,
      default_due_at: null,
      default_is_primary: false,
      items: [],
      created_at: '2026-05-18T00:00:00Z',
      updated_at: '2026-05-18T00:00:00Z',
    };
    (apiJson as Mock).mockImplementation(async (url: string, options?: { body?: string; method?: string }) => {
      if (url === '/todo/events/primary') throw new Error('主事件不存在');
      if (url === '/todo/events') return [];
      if (url === '/todo/event-plan-templates' && !options) return [existingTemplate];
      if (url === '/todo/event-plan-templates/template-1' && options?.method === 'PATCH') {
        expect(JSON.parse(options.body || '{}')).toMatchObject({
          name: '高数期末',
          default_event_name: '高数期末',
          default_start_date: '2026-05-20',
          items: [],
        });
        return { ...existingTemplate, default_event_name: '高数期末', default_start_date: '2026-05-20' };
      }
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.click(screen.getByRole('button', { name: '添加事件' }));
    await user.type(screen.getByLabelText('事件名称'), '高数期末');
    await user.type(screen.getByLabelText('开始日期'), '2026-05-20');
    await user.click(screen.getByRole('button', { name: '保存为模板' }));

    const conflictDialog = await screen.findByRole('dialog', { name: '同名模板已存在' });
    expect(within(conflictDialog).getByText('高数期末')).toBeInTheDocument();
    await user.click(within(conflictDialog).getByRole('button', { name: '更新模板' }));

    expect(await screen.findByText('已更新模板')).toBeInTheDocument();
    expect(apiJson).toHaveBeenCalledWith(
      '/todo/event-plan-templates/template-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('opens the overview first when clicking the primary event', async () => {
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
          {
            id: 'event-2',
            user_id: 7,
            name: '毕业设计',
            start_date: '2026-03-01',
            due_at: '2026-04-20T10:00:00Z',
            is_primary: false,
            created_at: '2026-03-19T00:00:00Z',
            updated_at: '2026-03-19T00:00:00Z',
          },
        ];
      }
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /论文投稿/i }));

    const overview = await screen.findByRole('dialog', { name: '事件总览' });
    expect(overview).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '事件工作台' })).not.toBeInTheDocument();
    expect(within(overview).getByText('论文投稿')).toBeInTheDocument();
    expect(within(overview).getByText('毕业设计')).toBeInTheDocument();
    expect(within(overview).getByRole('button', { name: '添加事件' })).toBeInTheDocument();
  });

  it('opens the selected event workbench from the overview list', async () => {
    const user = userEvent.setup();
    (apiJson as Mock).mockImplementation(async (url: string, options?: { body?: string }) => {
      if (url === '/todo/events/primary') {
        throw new Error('主事件不存在');
      }
      if (url === '/todo/events' && !options) {
        return [
          {
            id: 'event-2',
            user_id: 7,
            name: '毕业设计',
            start_date: '2026-03-01',
            due_at: '2026-04-20T10:00:00Z',
            is_primary: false,
            created_at: '2026-03-19T00:00:00Z',
            updated_at: '2026-03-19T00:00:00Z',
          },
        ];
      }
      if (url === '/todo/events/event-2/workbench') {
        return {
          event: {
            id: 'event-2',
            user_id: 7,
            name: '毕业设计',
            start_date: '2026-03-01',
            due_at: '2026-04-20T10:00:00Z',
            is_primary: false,
            created_at: '2026-03-19T00:00:00Z',
            updated_at: '2026-03-19T00:00:00Z',
          },
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
    await user.click(await screen.findByRole('button', { name: /毕业设计/ }));

    expect(await screen.findByRole('dialog', { name: '事件工作台' })).toBeInTheDocument();
    expect(screen.getByText('毕业设计')).toBeInTheDocument();
  });
});
