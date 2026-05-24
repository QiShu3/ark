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
    expect(screen.queryByRole('dialog', { name: '安排' })).not.toBeInTheDocument();
  });

  it('shows template apply controls without the template workbench gear in the add-event editor', async () => {
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

    expect(screen.getByLabelText('事件模板')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '套用模板' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '进入模板工作台' })).not.toBeInTheDocument();
  });

  it('applies an event template to the add-event editor', async () => {
    const user = userEvent.setup();
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
          content: '错题本',
          offset_days: 14,
          sort_order: 0,
          created_at: '2026-05-18T00:00:00Z',
          updated_at: '2026-05-18T00:00:00Z',
        },
      ],
      created_at: '2026-05-18T00:00:00Z',
      updated_at: '2026-05-18T00:00:00Z',
    };
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/primary') throw new Error('主事件不存在');
      if (url === '/todo/events') return [];
      if (url === '/todo/event-plan-templates') return [template];
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.click(screen.getByRole('button', { name: '添加事件' }));
    await user.selectOptions(screen.getByLabelText('事件模板'), 'template-1');
    await user.click(screen.getByRole('button', { name: '套用模板' }));

    expect(screen.getByLabelText('事件名称')).toHaveValue('高数期末');
    expect(screen.getByLabelText('开始日期')).toHaveValue('2026-05-20');
    expect(screen.getByLabelText('到期时间')).toHaveValue('2026-06-20T10:00');
    expect(screen.getByRole('checkbox', { name: '设为主事件' })).toBeChecked();
    expect(screen.getByRole('button', { name: '第一轮复习' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '第一轮复习' }));
    expect(screen.getByLabelText('任务标题')).toHaveValue('第一轮复习');
    expect(screen.getByLabelText('任务备注')).toHaveValue('错题本');
    expect(screen.getByLabelText('任务相对天数')).toHaveValue(14);
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
    expect(screen.queryByText('进入模板工作台')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '添加事件' }));

    expect(screen.getByLabelText('事件名称')).toBeInTheDocument();
    expect(screen.getByLabelText('开始日期')).toBeInTheDocument();
    expect(screen.getByLabelText('到期时间')).toBeInTheDocument();
    expect(screen.getByText('设为主事件')).toBeInTheDocument();
  });

  it('does not mark a new event as primary by default', async () => {
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

    expect(screen.getByRole('checkbox', { name: '设为主事件' })).not.toBeChecked();
  });

  it('shows the arrangement shell in the add-event editor', async () => {
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

    expect(screen.getByText('安排')).toBeInTheDocument();
    expect(screen.getByText('安排内容')).toBeInTheDocument();
    expect(screen.getByText('任务')).toBeInTheDocument();
    expect(screen.getByText('日程')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加任务' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加日程' })).toBeInTheDocument();
  });

  it('adds workflow drafts in the add-event editor and saves them after creating the event', async () => {
    const user = userEvent.setup();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
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
      if (url === '/todo/events/primary') throw new Error('主事件不存在');
      if (url === '/todo/events' && !options) return [...createdEvents];
      if (url === '/todo/event-plan-templates') return [];
      if (url === '/api/vocab/decks') return [];
      if (url === '/todo/events' && options?.method === 'POST') {
        const payload = JSON.parse(options.body || '{}');
        expect(payload.is_primary).toBe(true);
        const created = {
          id: 'event-workflow',
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
      if (url === '/todo/tasks' && options?.method === 'POST') {
        const payload = JSON.parse(options.body || '{}');
        expect(payload).toMatchObject({
          title: '准备资料',
          event_id: 'event-workflow',
        });
        return {
          id: 'task-created',
          user_id: 7,
          title: payload.title,
          content: payload.content,
          status: 'todo',
          current_cycle_count: 0,
          target_cycle_count: 0,
          cycle_period: 'daily',
          cycle_every_days: null,
          event: payload.event,
          event_ids: [],
          event_id: payload.event_id,
          task_type: 'focus',
          actual_duration: 0,
          start_date: payload.start_date,
          due_date: payload.due_date,
          is_deleted: false,
          created_at: '2026-05-19T00:00:00Z',
          updated_at: '2026-05-19T00:00:00Z',
        };
      }
      if (url === '/todo/events/event-workflow/workflows' && options?.method === 'POST') {
        expect(JSON.parse(options.body || '{}')).toMatchObject({
          name: '冲刺工作流',
          is_default: false,
          phases: [
            { phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: 'task-created' },
            { phase_type: 'break', duration: 300, timer_mode: 'countdown', task_id: null },
          ],
        });
        return {
          id: 'workflow-1',
          user_id: 7,
          event_id: 'event-workflow',
          name: '冲刺工作流',
          focus_duration: 1500,
          break_duration: 300,
          default_focus_timer_mode: 'countdown',
          phases: [],
          is_default: false,
          created_at: '2026-05-19T00:00:00Z',
          updated_at: '2026-05-19T00:00:00Z',
        };
      }
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.click(screen.getByRole('button', { name: '添加事件' }));

    const createDialog = screen.getByRole('dialog', { name: '添加事件' });
    expect(within(createDialog).getByRole('heading', { name: '工作流' })).toBeInTheDocument();
    expect(within(createDialog).getByText('暂无工作流')).toBeInTheDocument();

    await user.click(within(createDialog).getByRole('button', { name: '添加任务' }));
    await user.type(screen.getByLabelText('任务标题'), '准备资料');
    await user.click(screen.getByRole('button', { name: '保存任务' }));

    await user.click(within(createDialog).getByRole('button', { name: '新建工作流' }));
    const workflowDialog = await screen.findByRole('dialog', { name: '工作流' });
    await user.type(within(workflowDialog).getByLabelText('工作流名称'), '冲刺工作流');
    await user.selectOptions(
      within(workflowDialog).getByLabelText('阶段 1 绑定任务'),
      within(workflowDialog).getByRole('option', { name: '准备资料' }),
    );
    await user.click(within(workflowDialog).getByRole('button', { name: '创建工作流' }));

    expect(within(createDialog).getByRole('button', { name: /冲刺工作流/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText('事件名称'), '高数期末');
    await user.type(screen.getByLabelText('开始日期'), '2026-05-20');
    await user.type(screen.getByLabelText('到期时间'), '2026-06-20T10:00');
    await user.click(screen.getByRole('button', { name: '创建事件' }));

    try {
      const overview = await screen.findByRole('dialog', { name: '事件总览' });
      expect(within(overview).getByText('高数期末')).toBeInTheDocument();
      expect(apiJson).toHaveBeenCalledWith(
        '/todo/events/event-workflow/workflows',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(dispatchSpy.mock.calls.some(([event]) => event.type === 'ark:reload-focus')).toBe(true);
    } finally {
      dispatchSpy.mockRestore();
    }
  });

  it('lets workflow drafts bind to app-derived tasks in the add-event editor', async () => {
    const user = userEvent.setup();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
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
      if (url === '/todo/events/primary') throw new Error('主事件不存在');
      if (url === '/todo/events' && !options) return [...createdEvents];
      if (url === '/todo/event-plan-templates') return [];
      if (url === '/api/vocab/decks') return [];
      if (url === '/todo/events' && options?.method === 'POST') {
        const payload = JSON.parse(options.body || '{}');
        expect(payload.is_primary).toBe(true);
        const created = {
          id: 'event-app-workflow',
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
      if (url === '/todo/tasks' && options?.method === 'POST') {
        const payload = JSON.parse(options.body || '{}');
        expect(payload).toMatchObject({
          title: '真题练习 (应用)',
          app_task_type: 'erc_practice',
          event_id: 'event-app-workflow',
        });
        return {
          id: 'app-task-created',
          user_id: 7,
          title: payload.title,
          content: payload.content,
          status: 'todo',
          current_cycle_count: 0,
          target_cycle_count: 0,
          cycle_period: 'daily',
          cycle_every_days: null,
          event: payload.event,
          event_ids: [],
          event_id: payload.event_id,
          task_type: 'focus',
          app_task_type: payload.app_task_type,
          actual_duration: 0,
          start_date: payload.start_date,
          due_date: payload.due_date,
          is_deleted: false,
          created_at: '2026-05-19T00:00:00Z',
          updated_at: '2026-05-19T00:00:00Z',
        };
      }
      if (url === '/todo/events/event-app-workflow/workflows' && options?.method === 'POST') {
        expect(JSON.parse(options.body || '{}')).toMatchObject({
          name: '应用工作流',
          is_default: false,
          phases: [
            { phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: 'app-task-created' },
            { phase_type: 'break', duration: 300, timer_mode: 'countdown', task_id: null },
          ],
        });
        return {
          id: 'workflow-app-1',
          user_id: 7,
          event_id: 'event-app-workflow',
          name: '应用工作流',
          focus_duration: 1500,
          break_duration: 300,
          default_focus_timer_mode: 'countdown',
          phases: [],
          is_default: false,
          created_at: '2026-05-19T00:00:00Z',
          updated_at: '2026-05-19T00:00:00Z',
        };
      }
      return {};
    });

    render(<EventCountdownCard />);

    await user.click(await screen.findByRole('button', { name: /未设置主事件/i }));
    await user.click(screen.getByRole('button', { name: '添加事件' }));
    const createDialog = screen.getByRole('dialog', { name: '添加事件' });

    await user.click(within(createDialog).getByRole('button', { name: '添加应用' }));
    await user.selectOptions(screen.getByLabelText('选择应用'), 'erc_practice');
    await user.click(screen.getByRole('button', { name: '保存应用' }));
    expect(within(createDialog).getByRole('button', { name: /真题练习/ })).toBeInTheDocument();

    await user.click(within(createDialog).getByRole('button', { name: '新建工作流' }));
    const workflowDialog = await screen.findByRole('dialog', { name: '工作流' });
    expect(within(workflowDialog).getByRole('option', { name: '真题练习 (应用)' })).toBeInTheDocument();
    await user.type(within(workflowDialog).getByLabelText('工作流名称'), '应用工作流');
    await user.selectOptions(
      within(workflowDialog).getByLabelText('阶段 1 绑定任务'),
      within(workflowDialog).getByRole('option', { name: '真题练习 (应用)' }),
    );
    await user.click(within(workflowDialog).getByRole('button', { name: '创建工作流' }));

    await user.type(screen.getByLabelText('事件名称'), '应用事件');
    await user.type(screen.getByLabelText('开始日期'), '2026-05-20');
    await user.type(screen.getByLabelText('到期时间'), '2026-06-20T10:00');
    await user.click(screen.getByRole('button', { name: '创建事件' }));

    try {
      const overview = await screen.findByRole('dialog', { name: '事件总览' });
      expect(within(overview).getByText('应用事件')).toBeInTheDocument();
      expect(apiJson).toHaveBeenCalledWith(
        '/todo/events/event-app-workflow/workflows',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(dispatchSpy.mock.calls.some(([event]) => event.type === 'ark:reload-focus')).toBe(true);
    } finally {
      dispatchSpy.mockRestore();
    }
  });

  it('places add-event actions in the modal footer', async () => {
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

    const dialog = screen.getByRole('dialog', { name: '添加事件' });
    const actions = within(dialog).getByRole('group', { name: '添加事件操作' });

    expect(within(actions).getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: '保存为模板' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: '创建事件' })).toBeInTheDocument();
    expect(actions).toHaveClass('border-t');
  });

  it('adds and re-edits task and schedule arrangement content in the add-event editor', async () => {
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

    await user.click(screen.getByRole('button', { name: '添加任务' }));
    await user.type(screen.getByLabelText('任务标题'), '准备资料');
    await user.type(screen.getByLabelText('任务备注'), '先整理清单');
    await user.click(screen.getByRole('button', { name: '保存任务' }));

    await user.click(screen.getByRole('button', { name: '添加日程' }));
    await user.type(screen.getByLabelText('日程标题'), '模拟考试');
    await user.click(screen.getByRole('button', { name: '保存日程' }));

    expect(screen.getByRole('button', { name: '准备资料' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模拟考试' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '准备资料' }));
    await user.clear(screen.getByLabelText('任务标题'));
    await user.type(screen.getByLabelText('任务标题'), '准备资料清单');
    await user.click(screen.getByRole('button', { name: '保存任务' }));

    expect(screen.getByRole('button', { name: '准备资料清单' })).toBeInTheDocument();
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
      if (url === '/todo/tasks' && options?.method === 'POST') {
        expect(JSON.parse(options.body || '{}')).toMatchObject({
          title: '准备资料',
          content: '先整理清单',
          event: '空白事件',
          event_id: 'event-blank',
          task_type: 'focus',
          period_type: 'once',
          due_date: expect.any(String),
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
    await user.click(screen.getByRole('button', { name: '添加任务' }));
    await user.type(screen.getByLabelText('任务标题'), '准备资料');
    await user.type(screen.getByLabelText('任务备注'), '先整理清单');
    await user.click(screen.getByRole('button', { name: '保存任务' }));
    await user.click(screen.getByRole('button', { name: '创建事件' }));

    const overview = await screen.findByRole('dialog', { name: '事件总览' });
    expect(within(overview).getByText('空白事件')).toBeInTheDocument();
    expect(apiJson).toHaveBeenCalledWith(
      '/todo/tasks',
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
          default_is_primary: false,
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
    await user.click(screen.getByRole('button', { name: '添加任务' }));
    await user.type(screen.getByLabelText('任务标题'), '准备资料');
    await user.type(screen.getByLabelText('任务备注'), '先整理清单');
    await user.clear(screen.getByLabelText('任务相对天数'));
    await user.type(screen.getByLabelText('任务相对天数'), '3');
    await user.click(screen.getByRole('button', { name: '保存任务' }));
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
    expect(screen.queryByRole('dialog', { name: '安排' })).not.toBeInTheDocument();
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

    expect(await screen.findByRole('dialog', { name: '安排' })).toBeInTheDocument();
    expect(screen.getByText('毕业设计')).toBeInTheDocument();
  });
});
