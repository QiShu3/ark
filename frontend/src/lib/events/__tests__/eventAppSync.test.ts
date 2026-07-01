import { beforeEach, describe, expect, it, vi } from 'vitest';

import { activateEventApps } from '../eventAppSync';

const {
  deleteEventArrangementTask,
  getEventWorkbench,
  initializeVocabAppTask,
  saveEventChoiceConfig,
} = vi.hoisted(() => ({
  deleteEventArrangementTask: vi.fn(),
  getEventWorkbench: vi.fn(),
  initializeVocabAppTask: vi.fn(),
  saveEventChoiceConfig: vi.fn(),
}));

vi.mock('../api', () => ({
  getEventWorkbench,
}));

vi.mock('../arrangementApi', () => ({
  deleteEventArrangementTask,
}));

vi.mock('../../vocab/api', () => ({
  initializeVocabAppTask,
}));

vi.mock('../../erc/configSync', () => ({
  saveEventChoiceConfig,
}));

describe('activateEventApps', () => {
  beforeEach(() => {
    getEventWorkbench.mockReset();
    deleteEventArrangementTask.mockReset();
    initializeVocabAppTask.mockReset();
    saveEventChoiceConfig.mockReset();
  });

  it('merges ERC passive app tasks into one event-bound choice config', async () => {
    getEventWorkbench.mockResolvedValue({
      event: {
        id: 'event-1',
        user_id: 7,
        name: '考研英语',
        start_date: '2026-05-20',
        due_at: '2026-06-20T09:00:00Z',
        is_primary: true,
        created_at: '2026-05-18T00:00:00Z',
        updated_at: '2026-05-18T00:00:00Z',
      },
      created_tasks: [
        {
          id: 'temp-choice',
          title: '选择练习 (应用)',
          content: JSON.stringify({
            dailyArticleTarget: 2,
            defaultFocusDuration: 1800,
            addToTodayPlan: false,
          }),
          app_task_type: 'practice',
        },
      ],
      created_appointments: [],
    });

    await activateEventApps('event-1');

    expect(saveEventChoiceConfig).toHaveBeenCalledWith({
      eventId: 'event-1',
      choice: {
        daily_article_target: 2,
        default_focus_duration: 1800,
        add_to_today_plan: false,
      },
    });
    expect(deleteEventArrangementTask).toHaveBeenCalledWith('temp-choice');
    expect(initializeVocabAppTask).not.toHaveBeenCalled();
  });
});
