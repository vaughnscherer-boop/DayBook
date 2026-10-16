import type { SQLiteDatabase } from 'expo-sqlite';

import { setTaskDone, type Task } from '@/db/tasks';
import { toDateKey, toDateTimeKey } from '@/lib/dates';

/** A task whose due time has passed and that you haven't ticked or been asked about. */
export type PastDueTask = Task & { group_name: string | null };

/**
 * One-off tasks whose due time has passed: due on an earlier day, or earlier today at a set time.
 * Repeating tasks are left alone, and so are ones you've said you didn't do (they sit in Overdue).
 * So is anything added after it was due, like last month's homework in a syllabus imported mid-term.
 */
export async function listPastDue(db: SQLiteDatabase, now = new Date()): Promise<PastDueTask[]> {
  const today = toDateKey(now);
  const time = toDateTimeKey(now).slice(11, 16);
  return db.getAllAsync<PastDueTask>(
    `SELECT t.*, g.name AS group_name FROM tasks t LEFT JOIN groups g ON g.id = t.group_id
     WHERE t.done = 0 AND t.repeat IS NULL AND t.missed_at IS NULL
       AND date(t.created_at, 'localtime') <= t.date
       AND (t.date < ? OR (t.date = ? AND t.time IS NOT NULL AND t.time <= ?))
     ORDER BY t.date, t.time`,
    today,
    today,
    time
  );
}

/**
 * "I did it" (or cleared automatically): ticked off, so it leaves your lists but stays in your
 * history (and on the grade card). Undo with `reopenPastDue`.
 */
export async function clearPastDue(db: SQLiteDatabase, tasks: Task[]) {
  await db.withTransactionAsync(async () => {
    for (const task of tasks) await setTaskDone(db, task.id, true);
  });
}

/** Undoes `clearPastDue` or `markMissed`: open again, and asked about again. */
export async function reopenPastDue(db: SQLiteDatabase, tasks: Task[]) {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const task of tasks) {
      await db.runAsync('UPDATE tasks SET done = 0, completed_at = NULL, missed_at = NULL, updated_at = ? WHERE id = ?', now, task.id);
    }
  });
}

/** "I didn't do it": it stays as overdue, and isn't asked about again. */
export async function markMissed(db: SQLiteDatabase, tasks: Task[]) {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const task of tasks) {
      await db.runAsync('UPDATE tasks SET missed_at = ?, updated_at = ? WHERE id = ?', now, now, task.id);
    }
  });
}
