import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import '@testing-library/jest-dom';

import EventWorkbenchModal from '../events/EventWorkbenchModal';
import { apiJson } from '../../lib/api';
import { formatEventDateTime } from '../../lib/events/dateTime';
import type { EventItem } from '../../lib/events/types';
import type { Appointment, Task } from '../taskTypes';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

const event: EventItem = {
  id: 'event-1',
  user_id: 7,
  name: '高数期末',
  start_date: '2026-05-20',
  due_at: '2026-06-20T09:00:00Z',
  is_primary: true,
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
};

const secondaryEvent: EventItem = {
  id: 'event-2',
  user_id: 7,
  name: '测试一',
  start_date: '2026-05-21',
  due_at: '2026-06-18T09:00:00Z',
  is_primary: false,
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
};

const eventTask: Task = {
  id: 'task-1',
  user_id: 7,
  title: '完成第一轮复习',
  content: '覆盖全部章节',
  status: 'todo',
  current_cycle_count: 0,
  target_cycle_count: 0,
  cycle_period: 'daily',
  cycle_every_days: null,
  event: '高数期末',
  event_ids: [],
  event_id: 'event-1',
  is_recurring: false,
  period_type: 'once',
  custom_period_days: null,
  max_completions_per_period: 1,
  weekday_only: false,
  time_inherits_from_event: false,
  time_overridden: true,
  manually_scheduled_for_today: false,
  task_type: 'focus',
  actual_duration: 0,
  start_date: null,
  due_date: '2026-06-06T09:00:00Z',
  is_deleted: false,
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
};

const eventAppointment: Appointment = {
  id: 'appointment-1',
  user_id: 7,
  title: '模拟考试',
  content: null,
  status: 'pending',
  starts_at: null,
  ends_at: '2026-06-13T09:00:00Z',
  repeat_rule: null,
  linked_task_id: null,
  event_id: 'event-1',
  is_recurring: false,
  period_type: 'once',
  custom_period_days: null,
  max_completions_per_period: 1,
  weekday_only: false,
  time_inherits_from_event: false,
  time_overridden: true,
  is_deleted: false,
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
};

const emptyAchievementSummary = {
  active_event: event,
  event_achievements: null,
  global_achievements: {
    title: '全局成就',
    summary_text: '始终显示的长期累计进度',
    stats: {
      unlocked_count: 0,
      in_progress_count: 0,
      primary_metric_value: 0,
      primary_metric_label: '总专注秒数',
    },
    latest_unlocked: [],
    upcoming: [],
  },
};

describe('EventWorkbenchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows event management actions and the event achievement summary', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const nonPrimaryEvent = { ...event, is_primary: false };

    (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
      if (url === '/todo/events/event-1/workbench') {
        return {
          event: nonPrimaryEvent,
          created_tasks: [],
          created_appointments: [],
        };
      }
      if (url === '/todo/event-plan-templates') return [];
      if (url === '/todo/achievements/summary?event_id=event-1') {
        return {
          active_event: nonPrimaryEvent,
          event_achievements: {
            title: '事件成就',
            summary_text: '高数期末 的当前进展',
            stats: {
              unlocked_count: 1,
              in_progress_count: 2,
              primary_metric_value: 3600,
              primary_metric_label: '事件专注秒数',
            },
            latest_unlocked: [
              {
                id: 'event-first-push',
                title: '首次推进',
                description: '第一次完成绑定到该事件的任务或日程。',
                status: 'unlocked',
                current_value: 1,
                target_value: 1,
                progress_text: '1 / 1',
              },
            ],
            upcoming: [
              {
                id: 'event-focus-2h',
                title: '进入状态',
                description: '围绕该事件累计专注 2 小时。',
                status: 'in_progress',
                current_value: 3600,
                target_value: 7200,
                progress_text: '1h / 2h',
              },
            ],
          },
          global_achievements: {
            title: '全局成就',
            summary_text: '始终显示的长期累计进度',
            stats: {
              unlocked_count: 0,
              in_progress_count: 1,
              primary_metric_value: 3600,
              primary_metric_label: '总专注秒数',
            },
            latest_unlocked: [],
            upcoming: [
              {
                id: 'global-focus-10h',
                title: '稳定专注',
                description: '累计专注 10 小时。',
                status: 'in_progress',
                current_value: 3600,
                target_value: 36000,
                progress_text: '1h / 10h',
              },
            ],
          },
        };
      }
      if (url === '/todo/events/event-1' && options?.method === 'PATCH') {
        expect(JSON.parse(options.body || '{}')).toEqual({ is_primary: true });
        return { ...nonPrimaryEvent, is_primary: true };
      }
      return {};
    });
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<EventWorkbenchModal event={nonPrimaryEvent} onClose={vi.fn()} onChanged={onChanged} />);

    expect(await screen.findByText('高数期末 的当前进展')).toBeInTheDocument();
    expect(screen.getByText('最近解锁：首次推进')).toBeInTheDocument();
    expect(screen.getByText('下一步：进入状态 · 1h / 2h')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '设为主事件' }));

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/events/event-1', expect.objectContaining({ method: 'PATCH' }));
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it('renders real event arrangements without template or generate controls', async () => {
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events/event-1/workbench') {
        return {
          event,
          created_tasks: [eventTask],
          created_appointments: [eventAppointment],
        };
      }
      if (url === '/todo/events') return [event, secondaryEvent];
      if (url === '/todo/achievements/summary?event_id=event-1') return emptyAchievementSummary;
      return {};
    });

    render(<EventWorkbenchModal event={event} onClose={vi.fn()} />);

    expect(await screen.findByText('安排内容')).toBeInTheDocument();
    const taskButton = screen.getByRole('button', { name: '完成第一轮复习' });
    const appointmentButton = screen.getByRole('button', { name: '模拟考试' });
    expect(taskButton).toBeInTheDocument();
    expect(appointmentButton).toBeInTheDocument();
    expect(within(taskButton).getByText(formatEventDateTime(eventTask.due_date))).toBeInTheDocument();
    expect(within(appointmentButton).getByText(formatEventDateTime(eventAppointment.ends_at))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加任务' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加日程' })).toBeInTheDocument();
    expect(screen.queryByText('选择事件模板')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '套用模板' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '模板工作台' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '另存为事件模板' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '回写源模板' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成正式安排' })).not.toBeInTheDocument();
    expect(screen.queryByText('已创建安排')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(apiJson).not.toHaveBeenCalledWith('/todo/event-plan-templates');
    });
  });

  it('warns that event deletion clears tasks schedules workflows and app configs', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onChanged = vi.fn();
    const confirmSpy = vi.fn(() => true);
    (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string }) => {
      if (url === '/todo/events/event-1/workbench') {
        return {
          event,
          created_tasks: [eventTask],
          created_appointments: [eventAppointment],
        };
      }
      if (url === '/todo/events') return [event];
      if (url === '/todo/events/event-1/workflows') return [];
      if (url === '/todo/achievements/summary?event_id=event-1') return emptyAchievementSummary;
      if (url === '/todo/events/event-1/delete-preview') {
        return {
          tasks_count: 1,
          appointments_count: 1,
          workflows_count: 1,
          app_configs_count: 1,
        };
      }
      if (url === '/todo/events/event-1' && options?.method === 'DELETE') return { ok: true };
      return {};
    });
    vi.stubGlobal('confirm', confirmSpy);

    render(<EventWorkbenchModal event={event} onClose={onClose} onChanged={onChanged} />);

    await screen.findByText('安排内容');
    await user.click(screen.getByRole('button', { name: '删除事件' }));

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/events/event-1/delete-preview');
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('1 个任务、1 个日程、1 个工作流、1 个应用配置'));
      expect(apiJson).toHaveBeenCalledWith('/todo/events/event-1', { method: 'DELETE' });
      expect(onChanged).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('creates real task and schedule arrangements from the arrangement page', async () => {
    const user = userEvent.setup();
    const tasks: Task[] = [];
    const appointments: Appointment[] = [];

    (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
      if (url === '/todo/events/event-1/workbench') {
        return {
          event,
          created_tasks: tasks,
          created_appointments: appointments,
        };
      }
      if (url === '/todo/events') return [event, secondaryEvent];
      if (url === '/todo/achievements/summary?event_id=event-1') return emptyAchievementSummary;
      if (url === '/todo/tasks' && options?.method === 'POST') {
        const payload = JSON.parse(options.body || '{}');
        expect(payload).toMatchObject({
          title: '精修错题',
          content: '错题本',
          event: '高数期末',
          event_id: 'event-1',
          period_type: 'once',
          task_type: 'focus',
        });
        const createdTask = {
          ...eventTask,
          id: 'task-created',
          title: payload.title,
          content: payload.content,
          due_date: payload.due_date,
        };
        tasks.push(createdTask);
        return createdTask;
      }
      if (url === '/todo/appointments' && options?.method === 'POST') {
        const payload = JSON.parse(options.body || '{}');
        expect(payload).toMatchObject({
          title: '模拟考试',
          content: null,
          event_id: 'event-1',
          period_type: 'once',
          status: 'pending',
        });
        const createdAppointment = {
          ...eventAppointment,
          id: 'appointment-created',
          title: payload.title,
          content: payload.content,
          ends_at: payload.ends_at,
        };
        appointments.push(createdAppointment);
        return createdAppointment;
      }
      return {};
    });

    render(<EventWorkbenchModal event={event} onClose={vi.fn()} />);

    expect(await screen.findByText('安排内容')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '添加任务' }));
    await user.type(screen.getByLabelText('标题'), '精修错题');
    await user.type(screen.getByLabelText('备注'), '错题本');
    await user.type(screen.getByLabelText('截止日期'), '2026-06-07T10:30');
    await user.click(screen.getByRole('button', { name: '保存任务' }));

    await user.click(screen.getByRole('button', { name: '添加日程' }));
    await user.type(screen.getByLabelText('标题'), '模拟考试');
    await user.type(screen.getByLabelText('结束时间'), '2026-06-13T09:00');
    await user.click(screen.getByRole('button', { name: '保存日程' }));

    expect(screen.getByRole('button', { name: '精修错题' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模拟考试' })).toBeInTheDocument();
    expect(apiJson).toHaveBeenCalledWith('/todo/tasks', expect.objectContaining({ method: 'POST' }));
    expect(apiJson).toHaveBeenCalledWith('/todo/appointments', expect.objectContaining({ method: 'POST' }));
    expect(apiJson).not.toHaveBeenCalledWith(
      '/todo/events/event-1/plan-draft/items',
      expect.anything(),
    );
  });

  it('manages event workflows inside the event page without default controls', async () => {
    const user = userEvent.setup();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const workflows: Array<Record<string, unknown>> = [];

    (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
      if (url === '/todo/events/event-1/workbench') {
        return {
          event,
          created_tasks: [eventTask],
          created_appointments: [],
        };
      }
      if (url === '/todo/events') return [event, secondaryEvent];
      if (url === '/todo/achievements/summary?event_id=event-1') return emptyAchievementSummary;
      if (url === '/todo/events/event-1/workflows' && !options?.method) return workflows;
      if (url === '/todo/events/event-1/workflows' && options?.method === 'POST') {
        const payload = JSON.parse(options.body || '{}');
        expect(payload).toMatchObject({
          name: '期末冲刺',
          focus_duration: 1500,
          break_duration: 300,
          default_focus_timer_mode: 'countdown',
          is_default: false,
        });
        expect(payload.phases[0]).toMatchObject({
          phase_type: 'focus',
          duration: 1500,
          timer_mode: 'countdown',
          task_id: 'task-1',
        });
        const createdWorkflow = {
          id: 'workflow-1',
          user_id: 7,
          event_id: 'event-1',
          name: payload.name,
          focus_duration: payload.focus_duration,
          break_duration: payload.break_duration,
          default_focus_timer_mode: payload.default_focus_timer_mode,
          phases: payload.phases,
          is_default: false,
          created_at: '2026-05-18T00:00:00Z',
          updated_at: '2026-05-18T00:00:00Z',
        };
        workflows.push(createdWorkflow);
        return createdWorkflow;
      }
      return {};
    });

    render(<EventWorkbenchModal event={event} onClose={vi.fn()} />);

    expect(await screen.findByRole('button', { name: '新建工作流' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建工作流' }));

    expect(await screen.findByRole('dialog', { name: '工作流' })).toBeInTheDocument();
    expect(screen.queryByText('设为默认工作流')).not.toBeInTheDocument();
    const taskSelect = screen.getByLabelText('阶段 1 绑定任务');
    expect(within(taskSelect).getByRole('option', { name: '完成第一轮复习' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('工作流名称'), '期末冲刺');
    await user.selectOptions(taskSelect, 'task-1');
    await user.click(screen.getByRole('button', { name: '创建工作流' }));

    try {
      await waitFor(() => {
        expect(screen.getAllByText('期末冲刺').length).toBeGreaterThan(0);
      });
      expect(apiJson).toHaveBeenCalledWith('/todo/events/event-1/workflows', expect.objectContaining({ method: 'POST' }));
      expect(apiJson).not.toHaveBeenCalledWith('/todo/focus/workflows', expect.objectContaining({ method: 'POST' }));
      expect(dispatchSpy.mock.calls.some(([event]) => event.type === 'ark:reload-focus')).toBe(true);
    } finally {
      dispatchSpy.mockRestore();
    }
  });

  it('copies and deletes event workflows from the workflow column', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);

    const workflows = [
      {
        id: 'workflow-1',
        user_id: 7,
        event_id: 'event-1',
        name: '期末冲刺',
        focus_duration: 1500,
        break_duration: 300,
        default_focus_timer_mode: 'countdown',
        phases: [
          { phase_type: 'focus', duration: 1500, timer_mode: 'countdown', task_id: 'task-1' },
          { phase_type: 'break', duration: 300, timer_mode: 'countdown', task_id: null },
        ],
        is_default: false,
        created_at: '2026-05-18T00:00:00Z',
        updated_at: '2026-05-18T00:00:00Z',
      },
    ];

    (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
      if (url === '/todo/events/event-1/workbench') {
        return {
          event,
          created_tasks: [eventTask],
          created_appointments: [],
        };
      }
      if (url === '/todo/events') return [event, secondaryEvent];
      if (url === '/todo/achievements/summary?event_id=event-1') return emptyAchievementSummary;
      if (url === '/todo/events/event-1/workflows') {
        if (options?.method === 'POST') {
          const payload = JSON.parse(options.body || '{}');
          const newWorkflow = { ...workflows[0], id: 'workflow-2', name: payload.name };
          workflows.push(newWorkflow);
          return newWorkflow;
        }
        return workflows;
      }
      if (url === '/todo/events/event-1/workflows/workflow-1' && options?.method === 'DELETE') {
        workflows.splice(0, workflows.length);
        return { ok: true };
      }
      return {};
    });

    render(<EventWorkbenchModal event={event} onClose={vi.fn()} />);

    // 1. Verify workflow column rendered with original workflow
    expect(await screen.findByText('工作流')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑工作流：期末冲刺' })).toBeInTheDocument();
    expect(screen.getByText('1个专注')).toBeInTheDocument();

    // 2. Click Copy (复制) button
    await user.click(screen.getByRole('button', { name: '复制' }));

    // Verify copy dialog opened with copy draft name
    expect(await screen.findByRole('dialog', { name: '工作流' })).toBeInTheDocument();
    const nameInput = screen.getByLabelText('工作流名称');
    expect(nameInput).toHaveValue('期末冲刺（副本）');

    // Click Create (创建工作流) to save copy
    await user.click(screen.getByRole('button', { name: '创建工作流' }));

    // Verify copy added to list
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '编辑工作流：期末冲刺（副本）' })).toBeInTheDocument();
    });
    expect(apiJson).toHaveBeenCalledWith('/todo/events/event-1/workflows', expect.objectContaining({ method: 'POST' }));

    // 3. Click Delete (删除) button on the first workflow
    await user.click(screen.getAllByRole('button', { name: '删除' })[0]);

    // Verify confirmation and delete API call
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('确认删除该工作流吗？');
      expect(apiJson).toHaveBeenCalledWith('/todo/events/event-1/workflows/workflow-1', { method: 'DELETE' });
    });

    // Verify first workflow is removed from view
    expect(screen.queryByRole('button', { name: '编辑工作流：期末冲刺' })).not.toBeInTheDocument();
  });

  it('edits and deletes real event arrangements', async () => {
    const user = userEvent.setup();
    const tasks: Task[] = [{ ...eventTask }];
    const appointments: Appointment[] = [{ ...eventAppointment }];

    (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
      if (url === '/todo/events/event-1/workbench') {
        return {
          event,
          created_tasks: tasks,
          created_appointments: appointments,
        };
      }
      if (url === '/todo/events') return [event, secondaryEvent];
      if (url === '/todo/achievements/summary?event_id=event-1') return emptyAchievementSummary;
      if (url === '/todo/tasks/task-1' && options?.method === 'PATCH') {
        const expectedStartDate = new Date('2026-06-01T08:00').toISOString();
        const expectedDueDate = new Date('2026-06-07T10:30').toISOString();
        expect(JSON.parse(options.body || '{}')).toMatchObject({
          title: '精修错题',
          content: '错题本',
          task_type: 'checkin',
          start_date: expectedStartDate,
          due_date: expectedDueDate,
          event: '测试一',
          event_id: 'event-2',
          is_recurring: true,
          period_type: 'weekly',
          max_completions_per_period: 2,
          weekday_only: true,
        });
        tasks[0] = {
          ...tasks[0],
          title: '精修错题',
          content: '错题本',
          task_type: 'checkin',
          start_date: expectedStartDate,
          due_date: expectedDueDate,
          event: '测试一',
          event_id: 'event-2',
          is_recurring: true,
          period_type: 'weekly',
          max_completions_per_period: 2,
          weekday_only: true,
        };
        return tasks[0];
      }
      if (url === '/todo/appointments/appointment-1' && options?.method === 'PATCH') {
        const expectedStartsAt = new Date('2026-06-12T09:00').toISOString();
        const expectedEndsAt = new Date('2026-06-12T11:00').toISOString();
        expect(JSON.parse(options.body || '{}')).toMatchObject({
          title: '模拟考试改期',
          content: '带准考证',
          status: 'attended',
          starts_at: expectedStartsAt,
          ends_at: expectedEndsAt,
          repeat_rule: 'weekly',
          event_id: 'event-2',
          is_recurring: true,
          period_type: 'monthly',
          max_completions_per_period: 2,
          weekday_only: true,
        });
        appointments[0] = {
          ...appointments[0],
          title: '模拟考试改期',
          content: '带准考证',
          status: 'attended',
          starts_at: expectedStartsAt,
          ends_at: expectedEndsAt,
          repeat_rule: 'weekly',
          event_id: 'event-2',
          is_recurring: true,
          period_type: 'monthly',
          max_completions_per_period: 2,
          weekday_only: true,
        };
        return appointments[0];
      }
      if (url === '/todo/appointments/appointment-1' && options?.method === 'DELETE') {
        appointments.splice(0, appointments.length);
        return { ok: true };
      }
      return {};
    });

    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<EventWorkbenchModal event={event} onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: '完成第一轮复习' }));
    expect(screen.getByLabelText('任务类型')).toBeInTheDocument();
    expect(screen.getByLabelText('开始日期')).toBeInTheDocument();
    expect(screen.getByLabelText('截止日期')).toBeInTheDocument();
    expect(screen.getByLabelText('关联事件')).toBeInTheDocument();
    expect(screen.getByLabelText('完成周期')).toBeInTheDocument();
    expect(screen.getByLabelText('单周期最多完成次数')).toBeInTheDocument();
    expect(screen.getByLabelText('仅工作日可完成')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('标题'));
    await user.type(screen.getByLabelText('标题'), '精修错题');
    await user.selectOptions(screen.getByLabelText('任务类型'), 'checkin');
    await user.clear(screen.getByLabelText('备注'));
    await user.type(screen.getByLabelText('备注'), '错题本');

    await user.clear(screen.getByLabelText('开始日期'));
    await user.type(screen.getByLabelText('开始日期'), '2026-06-01T08:00');
    await user.clear(screen.getByLabelText('截止日期'));
    await user.type(screen.getByLabelText('截止日期'), '2026-06-07T10:30');
    await user.selectOptions(screen.getByLabelText('关联事件'), 'event-2');
    await user.selectOptions(screen.getByLabelText('完成周期'), 'weekly');
    await user.clear(screen.getByLabelText('单周期最多完成次数'));
    await user.type(screen.getByLabelText('单周期最多完成次数'), '2');
    await user.click(screen.getByLabelText('仅工作日可完成'));

    await user.click(screen.getByRole('button', { name: '保存任务' }));

    expect(await screen.findByRole('button', { name: '精修错题' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '模拟考试' }));
    expect(screen.getByLabelText('状态')).toBeInTheDocument();
    expect(screen.getByLabelText('开始时间')).toBeInTheDocument();
    expect(screen.getByLabelText('结束时间')).toBeInTheDocument();
    expect(screen.getByLabelText('关联事件')).toBeInTheDocument();
    expect(screen.getByLabelText('重复规则')).toBeInTheDocument();
    expect(screen.getByLabelText('完成周期')).toBeInTheDocument();
    expect(screen.getByLabelText('单周期最多完成次数')).toBeInTheDocument();
    expect(screen.getByLabelText('仅工作日可完成')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('标题'));
    await user.type(screen.getByLabelText('标题'), '模拟考试改期');
    await user.selectOptions(screen.getByLabelText('状态'), 'attended');
    await user.clear(screen.getByLabelText('备注'));
    await user.type(screen.getByLabelText('备注'), '带准考证');
    await user.clear(screen.getByLabelText('开始时间'));
    await user.type(screen.getByLabelText('开始时间'), '2026-06-12T09:00');
    await user.clear(screen.getByLabelText('结束时间'));
    await user.type(screen.getByLabelText('结束时间'), '2026-06-12T11:00');
    await user.selectOptions(screen.getByLabelText('关联事件'), 'event-2');
    await user.clear(screen.getByLabelText('重复规则'));
    await user.type(screen.getByLabelText('重复规则'), 'weekly');
    await user.selectOptions(screen.getByLabelText('完成周期'), 'monthly');
    await user.clear(screen.getByLabelText('单周期最多完成次数'));
    await user.type(screen.getByLabelText('单周期最多完成次数'), '2');
    await user.click(screen.getByLabelText('仅工作日可完成'));
    await user.click(screen.getByRole('button', { name: '保存日程' }));

    expect(await screen.findByRole('button', { name: '模拟考试改期' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '模拟考试改期' }));
    await user.click(screen.getByRole('button', { name: '删除日程' }));

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/appointments/appointment-1', { method: 'DELETE' });
    });
    expect(screen.queryByRole('button', { name: '模拟考试改期' })).not.toBeInTheDocument();
  });
});
