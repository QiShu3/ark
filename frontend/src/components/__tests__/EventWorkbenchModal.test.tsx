import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import '@testing-library/jest-dom';

import EventWorkbenchModal from '../events/EventWorkbenchModal';
import { apiJson } from '../../lib/api';
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

const eventTask: Task = {
  id: 'task-1',
  user_id: 7,
  title: '完成第一轮复习',
  content: '覆盖全部章节',
  status: 'todo',
  priority: 0,
  target_duration: 0,
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
  tags: [],
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
          plan_draft: null,
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

    expect(await screen.findByText('事件总览')).toBeInTheDocument();
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
          plan_draft: {
            id: 'legacy-draft',
            event_id: 'event-1',
            user_id: 7,
            source_template_id: 'template-1',
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
            items: [],
          },
          created_tasks: [eventTask],
          created_appointments: [eventAppointment],
        };
      }
      if (url === '/todo/achievements/summary?event_id=event-1') return emptyAchievementSummary;
      return {};
    });

    render(<EventWorkbenchModal event={event} onClose={vi.fn()} />);

    expect(await screen.findByText('安排内容')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '完成第一轮复习' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模拟考试' })).toBeInTheDocument();
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

  it('creates real task and schedule arrangements from the arrangement page', async () => {
    const user = userEvent.setup();
    const tasks: Task[] = [];
    const appointments: Appointment[] = [];

    (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
      if (url === '/todo/events/event-1/workbench') {
        return {
          event,
          plan_draft: null,
          created_tasks: tasks,
          created_appointments: appointments,
        };
      }
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
    await user.type(screen.getByLabelText('任务标题'), '精修错题');
    await user.type(screen.getByLabelText('任务备注'), '错题本');
    await user.type(screen.getByLabelText('任务时间'), '2026-06-07T10:30');
    await user.click(screen.getByRole('button', { name: '保存任务' }));

    await user.click(screen.getByRole('button', { name: '添加日程' }));
    await user.type(screen.getByLabelText('日程标题'), '模拟考试');
    await user.type(screen.getByLabelText('日程时间'), '2026-06-13T09:00');
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

  it('edits and deletes real event arrangements', async () => {
    const user = userEvent.setup();
    const tasks: Task[] = [{ ...eventTask }];
    const appointments: Appointment[] = [{ ...eventAppointment }];

    (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
      if (url === '/todo/events/event-1/workbench') {
        return {
          event,
          plan_draft: null,
          created_tasks: tasks,
          created_appointments: appointments,
        };
      }
      if (url === '/todo/achievements/summary?event_id=event-1') return emptyAchievementSummary;
      if (url === '/todo/tasks/task-1' && options?.method === 'PATCH') {
        const expectedDueDate = new Date('2026-06-07T10:30').toISOString();
        expect(JSON.parse(options.body || '{}')).toMatchObject({
          title: '精修错题',
          content: '错题本',
          due_date: expectedDueDate,
          event: '高数期末',
          event_id: 'event-1',
        });
        tasks[0] = {
          ...tasks[0],
          title: '精修错题',
          content: '错题本',
          due_date: expectedDueDate,
        };
        return tasks[0];
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
    await user.clear(screen.getByLabelText('任务标题'));
    await user.type(screen.getByLabelText('任务标题'), '精修错题');
    await user.clear(screen.getByLabelText('任务备注'));
    await user.type(screen.getByLabelText('任务备注'), '错题本');
    await user.clear(screen.getByLabelText('任务时间'));
    await user.type(screen.getByLabelText('任务时间'), '2026-06-07T10:30');
    await user.click(screen.getByRole('button', { name: '保存任务' }));

    expect(await screen.findByRole('button', { name: '精修错题' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '模拟考试' }));
    await user.click(screen.getByRole('button', { name: '删除日程' }));

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/appointments/appointment-1', { method: 'DELETE' });
    });
    expect(screen.queryByRole('button', { name: '模拟考试' })).not.toBeInTheDocument();
  });
});
