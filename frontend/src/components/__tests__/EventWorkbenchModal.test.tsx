import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, type Mock } from 'vitest';
import '@testing-library/jest-dom';

import EventWorkbenchModal from '../events/EventWorkbenchModal';
import { apiJson } from '../../lib/api';
import type { EventItem } from '../../lib/events/types';

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

describe('EventWorkbenchModal', () => {
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

  it('applies a template and renders generated plan draft sections', async () => {
    const user = userEvent.setup();
    (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
      if (url === '/todo/events/event-1/workbench') {
        return {
          event,
          plan_draft: null,
          created_tasks: [],
          created_appointments: [],
        };
      }
      if (url === '/todo/event-plan-templates') {
        return [
          {
            id: 'template-1',
            user_id: 7,
            name: '考试复习',
            description: null,
            schedule_mode: 'before_due',
            items: [],
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
          },
        ];
      }
      if (url === '/todo/achievements/summary?event_id=event-1') {
        return {
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
      }
      if (url === '/todo/events/event-1/plan-draft/apply-template' && options?.method === 'POST') {
        expect(JSON.parse(options.body || '{}')).toEqual({ template_id: 'template-1' });
        return {
          event,
          plan_draft: {
            id: 'draft-1',
            event_id: 'event-1',
            user_id: 7,
            source_template_id: 'template-1',
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
            items: [
              {
                id: 'draft-item-1',
                draft_id: 'draft-1',
                kind: 'task',
                title: '完成第一轮复习',
                content: null,
                scheduled_for: '2026-06-06T09:00:00Z',
                starts_at: null,
                ends_at: null,
                payload: {},
                sort_order: 0,
                created_subject_id: null,
                created_at: '2026-05-18T00:00:00Z',
                updated_at: '2026-05-18T00:00:00Z',
              },
              {
                id: 'draft-item-2',
                draft_id: 'draft-1',
                kind: 'appointment',
                title: '模拟考试',
                content: null,
                scheduled_for: null,
                starts_at: null,
                ends_at: '2026-06-13T09:00:00Z',
                payload: {},
                sort_order: 1,
                created_subject_id: null,
                created_at: '2026-05-18T00:00:00Z',
                updated_at: '2026-05-18T00:00:00Z',
              },
            ],
          },
          created_tasks: [],
          created_appointments: [],
        };
      }
      return {};
    });

    render(<EventWorkbenchModal event={event} onClose={vi.fn()} />);

    await screen.findByText('事件总览');
    await user.selectOptions(await screen.findByLabelText('选择计划模板'), 'template-1');
    await user.click(screen.getByRole('button', { name: '套用模板' }));

    await waitFor(() => {
      expect(screen.getByText('完成第一轮复习')).toBeInTheDocument();
      expect(screen.getByText('模拟考试')).toBeInTheDocument();
    });
  });

  it('edits draft items and saves draft changes back to templates', async () => {
    const user = userEvent.setup();
    const workbenchWithDraft = {
      event,
      plan_draft: {
        id: 'draft-1',
        event_id: 'event-1',
        user_id: 7,
        source_template_id: 'template-1',
        created_at: '2026-05-18T00:00:00Z',
        updated_at: '2026-05-18T00:00:00Z',
        items: [
          {
            id: 'draft-item-1',
            draft_id: 'draft-1',
            kind: 'task',
            title: '完成第一轮复习',
            content: '覆盖全部章节',
            scheduled_for: '2026-06-06T09:00:00Z',
            starts_at: null,
            ends_at: null,
            payload: {},
            sort_order: 0,
            created_subject_id: null,
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
          },
          {
            id: 'draft-item-2',
            draft_id: 'draft-1',
            kind: 'appointment',
            title: '模拟考试',
            content: null,
            scheduled_for: null,
            starts_at: null,
            ends_at: '2026-06-13T09:00:00Z',
            payload: {},
            sort_order: 1,
            created_subject_id: null,
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
          },
        ],
      },
      created_tasks: [],
      created_appointments: [],
    };

    (apiJson as Mock).mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
      if (url === '/todo/events/event-1/workbench') return workbenchWithDraft;
      if (url === '/todo/event-plan-templates') {
        return [
          {
            id: 'template-1',
            user_id: 7,
            name: '考试复习',
            description: null,
            schedule_mode: 'before_due',
            items: [],
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
          },
        ];
      }
      if (url === '/todo/achievements/summary?event_id=event-1') {
        return {
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
      }
      if (url === '/todo/events/event-1/plan-draft/items/draft-item-1' && options?.method === 'PATCH') {
        const expectedScheduledFor = new Date('2026-06-07T10:30').toISOString();
        expect(JSON.parse(options.body || '{}')).toMatchObject({
          title: '精修错题',
          content: '错题本',
          scheduled_for: expectedScheduledFor,
        });
        return {
          ...workbenchWithDraft,
          plan_draft: {
            ...workbenchWithDraft.plan_draft,
            items: [
              {
                ...workbenchWithDraft.plan_draft.items[0],
                title: '精修错题',
                content: '错题本',
                scheduled_for: expectedScheduledFor,
              },
              workbenchWithDraft.plan_draft.items[1],
            ],
          },
        };
      }
      if (url === '/todo/events/event-1/plan-draft/items/draft-item-2' && options?.method === 'DELETE') {
        return {
          ...workbenchWithDraft,
          plan_draft: {
            ...workbenchWithDraft.plan_draft,
            items: [workbenchWithDraft.plan_draft.items[0]],
          },
        };
      }
      if (url === '/todo/events/event-1/plan-draft/save-as-template' && options?.method === 'POST') {
        expect(JSON.parse(options.body || '{}')).toMatchObject({
          name: '我的复习模板',
          description: '稳定复用',
          schedule_mode: 'before_due',
        });
        return {
          id: 'template-2',
          user_id: 7,
          name: '我的复习模板',
          description: '稳定复用',
          schedule_mode: 'before_due',
          items: [],
          created_at: '2026-05-18T00:00:00Z',
          updated_at: '2026-05-18T00:00:00Z',
        };
      }
      if (url === '/todo/events/event-1/plan-draft/update-source-template' && options?.method === 'POST') {
        return {
          id: 'template-1',
          user_id: 7,
          name: '考试复习',
          description: null,
          schedule_mode: 'before_due',
          items: [],
          created_at: '2026-05-18T00:00:00Z',
          updated_at: '2026-05-18T00:00:00Z',
        };
      }
      return {};
    });

    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<EventWorkbenchModal event={event} onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: '编辑草稿“完成第一轮复习”' }));
    await user.clear(screen.getByLabelText('草稿标题'));
    await user.type(screen.getByLabelText('草稿标题'), '精修错题');
    await user.clear(screen.getByLabelText('草稿备注'));
    await user.type(screen.getByLabelText('草稿备注'), '错题本');
    await user.clear(screen.getByLabelText('草稿时间'));
    await user.type(screen.getByLabelText('草稿时间'), '2026-06-07T10:30');
    await user.click(screen.getByRole('button', { name: '保存草稿项' }));

    expect(await screen.findByText('精修错题')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '删除草稿“模拟考试”' }));
    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/events/event-1/plan-draft/items/draft-item-2', { method: 'DELETE' });
    });

    await user.click(screen.getByRole('button', { name: '另存为模板' }));
    await user.type(screen.getByLabelText('新模板名称'), '我的复习模板');
    await user.type(screen.getByLabelText('新模板说明'), '稳定复用');
    await user.click(screen.getByRole('button', { name: '确认另存' }));

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/events/event-1/plan-draft/save-as-template', expect.any(Object));
    });

    await user.click(screen.getByRole('button', { name: '回写源模板' }));
    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/events/event-1/plan-draft/update-source-template', { method: 'POST' });
    });
  });
});
