import type { SQLiteDatabase } from 'expo-sqlite';

import { itemTypeOf } from '@/db/calendars';
import type { Group } from '@/db/groups';
import { deleteTask, setTaskDone, type Task } from '@/db/tasks';
import { toDateKey, toDateTimeKey } from '@/lib/dates';

/** A task whose due time has passed and that you haven't ticked or been asked about. */
export type PastDueTask = Task & { group_name: string | null };

/**
 * One-off tasks whose due time has passed: due on an earlier day, or earlier today at a set time.
 * Repeating tasks are left alone, and so are ones you've said you didn't do (they sit in Overdue).
 */
export async function listPastDue(db: SQLiteDatabase, now = new Date()): Promise<PastDueTask[]> {
  const today = toDateKey(now);
  const time = toDateTimeKey(now).slice(11, 16);
  return db.getAllAsync<PastDueTask>(
    `SELECT t.*, g.name AS group_name FROM tasks t LEFT JOIN groups g ON g.id = t.group_id
     WHERE t.done = 0 AND t.repeat IS NULL AND t.missed_at IS NULL
       AND (t.date < ? OR (t.date = ? AND t.time IS NOT NULL AND t.time <= ?))
     ORDER BY t.date, t.time`,
    today,
    today,
    time
  );
}

/**
 * Whether clearing a task should tick it rather than delete it: graded work (a score, or an
 * assignment or exam in a class with a grading scheme) stays on the grade card, and a school-site
 * feed would just add its items back.
 */
async function keepWhenCleared(db: SQLiteDatabase, task: Task): Promise<boolean> {
  if (task.score !== null || task.feed_id !== null) return true;
  if (!task.group_id) return false;
  const group = await db.getFirstAsync<Group>('SELECT * FROM groups WHERE id = ?', task.group_id);
  const type = itemTypeOf(task, 'task', group);
  if (type !== 'exam' && type !== 'assignment') return false;
  const graded = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM grade_categories WHERE group_id = ?', task.group_id);
  return (graded?.n ?? 0) > 0;
}

/** "I did it" (or cleared automatically): gone from your lists, deleted unless it's graded work. */
export async function clearPastDue(db: SQLiteDatabase, tasks: Task[]) {
  await db.withTransactionAsync(async () => {
    for (const task of tasks) {
      if (await keepWhenCleared(db, task)) await setTaskDone(db, task.id, true);
      else await deleteTask(db, task.id);
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
