import { beforeEach, describe, expect, it, vi } from 'vitest';

import { activateEventSubApps } from '../eventAppSync';

const {
  deleteEventArrangementTask,
  getEventWorkbench,
  initializeVocabAppTask,
  saveEventERCConfig,
} = vi.hoisted(() => ({
  deleteEventArrangementTask: vi.fn(),
  getEventWorkbench: vi.fn(),
  initializeVocabAppTask: vi.fn(),
  saveEventERCConfig: vi.fn(),
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
  saveEventERCConfig,
}));

describe('activateEventSubApps', () => {
  beforeEach(() => {
    getEventWorkbench.mockReset();
    deleteEventArrangementTask.mockReset();
    initializeVocabAppTask.mockReset();
    saveEventERCConfig.mockReset();
  });

  it('merges ERC passive app tasks into one event-bound ERC config', async () => {
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
          id: 'temp-practice',
          title: '真题练习 (应用)',
          content: JSON.stringify({
            dailyArticleTarget: 2,
            defaultFocusDuration: 1800,
            addToTodayPlan: false,
          }),
          app_task_type: 'erc_practice',
        },
        {
          id: 'temp-review',
          title: '错题复习 (应用)',
          content: JSON.stringify({
            reviewScope: 'all',
            dailyQuestionTarget: 12,
            defaultFocusDuration: 1200,
            addToTodayPlan: true,
          }),
          app_task_type: 'erc_review',
        },
      ],
      created_appointments: [],
    });

    await activateEventSubApps('event-1');

    expect(saveEventERCConfig).toHaveBeenCalledWith({
      eventId: 'event-1',
      practice: {
        daily_article_target: 2,
        default_focus_duration: 1800,
        add_to_today_plan: false,
      },
      review: {
        review_scope: 'all',
        daily_question_target: 12,
        default_focus_duration: 1200,
        add_to_today_plan: true,
      },
    });
    expect(deleteEventArrangementTask).toHaveBeenCalledWith('temp-practice');
    expect(deleteEventArrangementTask).toHaveBeenCalledWith('temp-review');
    expect(initializeVocabAppTask).not.toHaveBeenCalled();
  });
});
