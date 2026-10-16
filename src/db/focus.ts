import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type FocusSession = {
  id: string;
  task_id: string | null;
  group_id: string | null;
  item_type: string | null;
  started_at: string;
  minutes: number;
  created_at: string;
  updated_at: string;
};

/** Records time spent on a task with the focus timer. */
export async function logFocus(
  db: SQLiteDatabase,
  session: { taskId: string; groupId: string | null; itemType: string | null; startedAt: string; minutes: number }
) {
  if (session.minutes < 1) return;
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO focus_sessions (id, task_id, group_id, item_type, started_at, minutes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    session.taskId,
    session.groupId,
    session.itemType,
    session.startedAt,
    Math.round(session.minutes),
    now,
    now
  );
}

/** Minutes focused on one task so far. */
export async function focusedOn(db: SQLiteDatabase, taskId: string): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(minutes) AS total FROM focus_sessions WHERE task_id = ?',
    taskId
  );
  return row?.total ?? 0;
}

/**
 * How long tasks of this kind in this class really take you: the average total focus time per task,
 * once at least two have been timed. Null until then.
 */
export async function typicalMinutes(db: SQLiteDatabase, groupId: string, itemType: string | null) {
  const row = await db.getFirstAsync<{ tasks: number; average: number | null }>(
    `SELECT COUNT(*) AS tasks, AVG(total) AS average FROM (
       SELECT SUM(minutes) AS total FROM focus_sessions
       WHERE group_id = ? AND (item_type IS ? OR ? IS NULL) AND task_id IS NOT NULL
       GROUP BY task_id
     )`,
    groupId,
    itemType,
    itemType
  );
  return row && row.tasks >= 2 && row.average ? Math.round(row.average) : null;
}
