import { getEventWorkbench } from './api';
import { deleteEventArrangementTask } from './arrangementApi';
import { initializeVocabAppTask } from '../vocab/api';
import { saveEventChoiceConfig, type ChoiceConfigInput } from '../erc/configSync';
import { normalizeAppType } from './appConfigTypes';

/**
 * Activates passive app configuration tasks saved under a non-primary event
 * and synchronizes them to the user's active app settings.
 */
export async function activateEventApps(eventId: string): Promise<void> {
  try {
    const workbench = await getEventWorkbench(eventId);
    const tempAppTasks = workbench.created_tasks.filter(
      (task) => task.app_task_type
    );
    const ercConfigs: {
      choice?: ChoiceConfigInput;
      taskIds: string[];
    } = { taskIds: [] };

    for (const task of tempAppTasks) {
      if (!task.content) continue;
      try {
        const config = JSON.parse(task.content);
        const appType = normalizeAppType(task.app_task_type);

        if (appType === 'flash_card') {
          await initializeVocabAppTask({
            deck_id: config.deckId,
            daily_target_count: config.dailyTargetCount,
            default_focus_duration: config.defaultFocusDuration,
            add_to_today_plan: config.addToTodayPlan,
            event_id: eventId,
          });
        } else if (appType === 'choice') {
          ercConfigs.choice = {
            daily_article_target: config.dailyArticleTarget,
            default_focus_duration: config.defaultFocusDuration,
            add_to_today_plan: config.addToTodayPlan,
          };
          ercConfigs.taskIds.push(task.id);
          continue;
        }

        // Clean up the temporary passive task from the database
        await deleteEventArrangementTask(task.id);
      } catch (err) {
        console.error('Failed to activate app task', task.title, err);
      }
    }

    if (ercConfigs.choice) {
      try {
        await saveEventChoiceConfig({
          eventId,
          choice: ercConfigs.choice,
        });
        for (const taskId of ercConfigs.taskIds) {
          await deleteEventArrangementTask(taskId);
        }
      } catch (err) {
        console.error('Failed to activate choice app config', err);
      }
    }
  } catch (err) {
    console.error('Failed to activate event apps', err);
  }
}
