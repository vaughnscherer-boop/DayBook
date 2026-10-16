import type { SQLiteDatabase } from 'expo-sqlite';

import { removeFutureBlocks } from '@/db/events';
import { setOccurrenceDone, setTaskDone } from '@/db/tasks';
import type { CalendarItem } from '@/lib/calendar-items';
import { notifyDataChanged } from '@/lib/data-events';
import { toDateTimeKey } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';
import { showToast } from '@/lib/toast';

/**
 * Ticks a task on or off (a repeating one just for this date), then runs `reload`. Ticking one
 * off shows "Done" with Undo, in case it was the wrong row.
 */
export async function toggleTask(db: SQLiteDatabase, item: CalendarItem, reload: () => Promise<void> | void) {
  const set = (done: boolean) =>
    item.repeating ? setOccurrenceDone(db, item.id, item.occurrenceDate, done) : setTaskDone(db, item.id, done);
  await set(!item.done);
  // Done: drop the work blocks you'd planned for it later on.
  if (!item.done && !item.repeating) await removeFutureBlocks(db, item.id, toDateTimeKey(new Date()));
  await reload();
  rescheduleAll(db);
  if (item.done) return;
  showToast(`Done: ${item.title}`, async () => {
    await set(false);
    notifyDataChanged();
    rescheduleAll(db);
  });
}
