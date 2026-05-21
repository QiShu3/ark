import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, type Mock } from 'vitest';
import '@testing-library/jest-dom';

import EventTemplateManagerModal from '../events/EventTemplateManagerModal';
import { apiJson } from '../../lib/api';
import type { EventPlanTemplate } from '../../lib/events/types';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

const templates: EventPlanTemplate[] = [
  {
    id: 'template-1',
    user_id: 7,
    name: '考试复习',
    description: '原说明',
    schedule_mode: 'before_due',
    default_event_name: '高数期末',
    default_start_date: '2026-05-20',
    default_due_at: new Date('2026-06-20T09:00').toISOString(),
    default_is_primary: true,
    items: [
      {
        id: 'item-1',
        template_id: 'template-1',
        kind: 'task',
        title: '完成第一轮复习',
        content: '覆盖全部章节',
        offset_days: 14,
        sort_order: 0,
        created_at: '2026-05-18T00:00:00Z',
        updated_at: '2026-05-18T00:00:00Z',
      },
    ],
    created_at: '2026-05-18T00:00:00Z',
    updated_at: '2026-05-18T00:00:00Z',
  },
];

describe('EventTemplateManagerModal', () => {
  it('edits an existing event template with workbench defaults', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    (apiJson as Mock).mockResolvedValue({
      ...templates[0],
      name: '考试冲刺',
      items: [{ ...templates[0].items[0], title: '精修错题', offset_days: 10 }],
    });

    render(<EventTemplateManagerModal templates={templates} onClose={vi.fn()} onChanged={onChanged} />);

    await user.click(screen.getByRole('button', { name: '编辑“考试复习”' }));
    await user.clear(screen.getByLabelText('编辑模板名称'));
    await user.type(screen.getByLabelText('编辑模板名称'), '考试冲刺');
    await user.clear(screen.getByLabelText('编辑默认事件名称'));
    await user.type(screen.getByLabelText('编辑默认事件名称'), '线代期末');
    await user.clear(screen.getByLabelText('编辑默认开始日期'));
    await user.type(screen.getByLabelText('编辑默认开始日期'), '2026-05-25');
    await user.clear(screen.getByLabelText('编辑默认到期时间'));
    await user.type(screen.getByLabelText('编辑默认到期时间'), '2026-06-25T10:00');
    await user.click(screen.getByLabelText('编辑默认设为主事件'));
    await user.clear(screen.getByLabelText('编辑安排内容标题'));
    await user.type(screen.getByLabelText('编辑安排内容标题'), '精修错题');
    await user.clear(screen.getByLabelText('编辑相对天数'));
    await user.type(screen.getByLabelText('编辑相对天数'), '10');
    await user.click(screen.getByRole('button', { name: '保存事件模板' }));

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/todo/event-plan-templates/template-1', expect.objectContaining({
        method: 'PATCH',
      }));
      const [, options] = (apiJson as Mock).mock.calls[0];
      expect(JSON.parse(options.body)).toMatchObject({
        name: '考试冲刺',
        default_event_name: '线代期末',
        default_start_date: '2026-05-25',
        default_due_at: new Date('2026-06-25T10:00').toISOString(),
        default_is_primary: false,
        items: [{ title: '精修错题', offset_days: 10 }],
      });
      expect(onChanged).toHaveBeenCalled();
    });
  });
});
