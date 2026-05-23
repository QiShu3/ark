import { getEventWorkbench } from './api';
import { deleteEventArrangementTask } from './arrangementApi';
import { initializeVocabAppTask } from '../vocab/api';
import { initializeERCAppTask, initializeERCPracticeAppTask } from '../erc/api';

/**
 * Activates passive sub-app configuration tasks saved under a non-primary event
 * and synchronizes them to the user's active sub-app settings.
 */
export async function activateEventSubApps(eventId: string): Promise<void> {
  try {
    const workbench = await getEventWorkbench(eventId);
    const tempAppTasks = workbench.created_tasks.filter(
      (task) => task.tags && task.tags.includes('__app_task_config')
    );

    for (const task of tempAppTasks) {
      if (!task.content) continue;
      try {
        const config = JSON.parse(task.content);
        const appType = task.tags.find((tag) => tag !== '__app_task_config');

        if (appType === 'vocab_today') {
          await initializeVocabAppTask({
            deck_id: config.deckId,
            daily_target_count: config.dailyTargetCount,
            default_focus_duration: config.defaultFocusDuration,
            add_to_today_plan: config.addToTodayPlan,
            event_id: eventId,
          });
        } else if (appType === 'erc_practice') {
          await initializeERCPracticeAppTask({
            daily_article_target: config.dailyArticleTarget,
            default_focus_duration: config.defaultFocusDuration,
            add_to_today_plan: config.addToTodayPlan,
            event_id: eventId,
          });
        } else if (appType === 'erc_review') {
          await initializeERCAppTask({
            review_scope: config.reviewScope,
            daily_question_target: config.dailyQuestionTarget,
            default_focus_duration: config.defaultFocusDuration,
            add_to_today_plan: config.addToTodayPlan,
            event_id: eventId,
          });
        }

        // Clean up the temporary passive task from the database
        await deleteEventArrangementTask(task.id);
      } catch (err) {
        console.error('Failed to activate sub-app task', task.title, err);
      }
    }
  } catch (err) {
    console.error('Failed to activate event sub-apps', err);
  }
}
