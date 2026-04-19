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
    mockApiJson.mockResolvedValue(buildAppointment({ status: 'attended' }));

    render(
      <AppointmentEditModal
        open
        appointment={buildAppointment()}
        onClose={onClose}
        onChanged={onChanged}
      />,
    );

    expect(screen.getByRole('dialog', { name: '编辑日程' })).toBeInTheDocument();
    expect(screen.getByLabelText('标题')).toHaveValue('四级考试');
    expect(screen.getByLabelText('结束时间')).toHaveValue('2026-06-13T11:20');

    await user.selectOptions(screen.getByLabelText('状态'), 'attended');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mockApiJson).toHaveBeenCalledWith('/todo/appointments/appt-1', expect.objectContaining({
        method: 'PATCH',
      }));
    });
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
