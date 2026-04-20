import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

import AppointmentEditModal from '../AppointmentEditModal';
import { apiJson } from '../../lib/api';
import type { Appointment } from '../taskTypes';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

const mockApiJson = vi.mocked(apiJson);

function buildAppointment(patch: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    user_id: 7,
    title: '四级考试',
    content: '带身份证和准考证',
    status: 'needs_confirmation',
    starts_at: '2026-06-13T09:00:00+08:00',
    ends_at: '2026-06-13T11:20:00+08:00',
    repeat_rule: null,
    linked_task_id: null,
    is_deleted: false,
    created_at: '2026-04-19T09:00:00+08:00',
    updated_at: '2026-04-19T09:00:00+08:00',
    ...patch,
  };
}

describe('AppointmentEditModal', () => {
  it('renders appointment fields and submits confirmation status changes', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const onClose = vi.fn();
    mockApiJson.mockImplementation(async (path: string) => {
      if (path === '/todo/events') {
        return [
          {
            id: 'event-primary',
            user_id: 7,
            name: '四级考试',
            due_at: '2026-06-13T03:20:00Z',
            is_primary: true,
            created_at: '2026-04-19T09:00:00Z',
            updated_at: '2026-04-19T09:00:00Z',
          },
          {
            id: 'event-defense',
            user_id: 7,
            name: '答辩',
            due_at: '2026-06-20T07:00:00Z',
            is_primary: false,
            created_at: '2026-04-19T09:00:00Z',
            updated_at: '2026-04-19T09:00:00Z',
          },
        ];
      }
      return buildAppointment({ status: 'attended' });
    });

    render(
      <AppointmentEditModal
        open
        appointment={buildAppointment({
          event_id: 'event-primary',
          is_recurring: true,
          period_type: 'weekly',
          custom_period_days: null,
          max_completions_per_period: 2,
          weekday_only: false,
          time_inherits_from_event: true,
          time_overridden: false,
        })}
        onClose={onClose}
        onChanged={onChanged}
      />,
    );

    expect(screen.getByRole('dialog', { name: '编辑日程' })).toBeInTheDocument();
    expect(screen.getByLabelText('标题')).toHaveValue('四级考试');
    expect(screen.getByLabelText('结束时间')).toHaveValue('2026-06-13T11:20');
    await waitFor(() => {
      expect(screen.getByLabelText('关联事件')).toHaveValue('event-primary');
    });

    await user.selectOptions(screen.getByLabelText('状态'), 'attended');
    await user.selectOptions(screen.getByLabelText('关联事件'), 'event-defense');
    await user.selectOptions(screen.getByLabelText('完成周期'), 'custom_days');
    await user.clear(screen.getByLabelText('自定义完成周期（天）'));
    await user.type(screen.getByLabelText('自定义完成周期（天）'), '10');
    await user.clear(screen.getByLabelText('单周期最多完成次数'));
    await user.type(screen.getByLabelText('单周期最多完成次数'), '3');
    await user.click(screen.getByLabelText('仅工作日可完成'));
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith('/todo/appointments/appt-1', expect.objectContaining({
        method: 'PATCH',
      }));
    });
    const patchCall = mockApiJson.mock.calls.find(([path]) => path === '/todo/appointments/appt-1');
    expect(patchCall?.[1]?.body).toBeTruthy();
    const payload = JSON.parse(String(patchCall?.[1]?.body));
    expect(payload.event_id).toBe('event-defense');
    expect(payload.period_type).toBe('custom_days');
    expect(payload.custom_period_days).toBe(10);
    expect(payload.max_completions_per_period).toBe(3);
    expect(payload.weekday_only).toBe(true);
    expect(payload.time_inherits_from_event).toBe(true);
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
