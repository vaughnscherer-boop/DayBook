import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSettings, setSetting } from '@/db/settings';
import { moveTask, setOccurrenceDone, setTaskDone } from '@/db/tasks';
import { notifyDataChanged } from '@/lib/data-events';
import { shiftKey } from '@/lib/dates';
import { rescheduleAll, type ReminderData } from '@/lib/notifications';
import { showToast } from '@/lib/toast';

const HOUR = 60 * 60 * 1000;

/**
 * Done, Snooze or Tomorrow on a task reminder. Returns false for anything else (a plain tap), which
 * just opens the task.
 */
export async function handleReminderAction(db: SQLiteDatabase, response: Notifications.NotificationResponse) {
  const { actionIdentifier: action, notification } = response;
  const content = notification.request.content;
  const data = content.data as Partial<ReminderData> | undefined;
  if (!data?.taskId || !data.date) return false;
  const { taskId, date, repeating } = data;
  const title = content.title ?? 'Task';

  const snooze = async (ms: number, label: string) => {
    const settings = await getSettings(db);
    const at = new Date(Date.now() + ms).toISOString();
    await setSetting(db, 'snoozed', [...settings.snoozed, { at, title, body: content.body ?? '', data: data as Record<string, unknown> }]);
    showToast(`Reminding you ${label}: ${title}`);
  };

  if (action === 'done') {
    const set = (done: boolean) => (repeating ? setOccurrenceDone(db, taskId, date, done) : setTaskDone(db, taskId, done));
    await set(true);
    showToast(`Done: ${title}`, async () => {
      await set(false);
      notifyDataChanged();
      rescheduleAll(db);
    });
  } else if (action === 'snooze') {
    await snooze(HOUR, 'in an hour');
  } else if (action === 'tomorrow') {
    // A repeating task can't move on its own without moving the series, so it's reminded again tomorrow.
    if (repeating) await snooze(24 * HOUR, 'tomorrow');
    else {
      await moveTask(db, taskId, shiftKey(date, 1));
      showToast(`Moved to tomorrow: ${title}`, async () => {
        await moveTask(db, taskId, date);
        notifyDataChanged();
        rescheduleAll(db);
      });
    }
  } else {
    return false;
  }
  notifyDataChanged();
  rescheduleAll(db);
  return true;
}
