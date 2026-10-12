import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { RepeatRule } from '@/lib/recurrence';

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  date: string; // 'YYYY-MM-DD'
  time: string | null; // 'HH:MM'
  calendar_id: string | null;
  color: string | null;
  done: 0 | 1;
  completed_at: string | null;
  repeat: string | null; // JSON RepeatRule
  repeat_until: string | null;
  exceptions: string; // JSON array of skipped dates
  created_at: string;
  updated_at: string;
};

/** A date on which a repeating task was ticked off. */
export type TaskCompletion = { task_id: string; date: string; completed_at: string };

export type TaskInput = {
  title: string;
  notes?: string | null;
  date: string;
  time?: string | null;
  calendar_id: string | null;
  color?: string | null;
  repeat?: RepeatRule | null;
  repeat_until?: string | null;
};

const ORDER = 'ORDER BY date, time IS NOT NULL, time, created_at';

export async function listTasks(db: SQLiteDatabase): Promise<Task[]> {
  return db.getAllAsync<Task>(`SELECT * FROM tasks ${ORDER}`);
}

export async function getTask(db: SQLiteDatabase, id: string): Promise<Task | null> {
  return db.getFirstAsync<Task>('SELECT * FROM tasks WHERE id = ?', id);
}

export async function createTask(db: SQLiteDatabase, input: TaskInput): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO tasks (id, title, notes, date, time, calendar_id, color, repeat, repeat_until, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.title.trim(),
    input.notes ?? null,
    input.date,
    input.time ?? null,
    input.calendar_id,
    input.color ?? null,
    input.repeat ? JSON.stringify(input.repeat) : null,
    input.repeat_until ?? null,
    now,
    now
  );
  return id;
}

export async function updateTask(db: SQLiteDatabase, id: string, input: TaskInput) {
  await db.runAsync(
    `UPDATE tasks SET title = ?, notes = ?, date = ?, time = ?, calendar_id = ?, color = ?, repeat = ?,
       repeat_until = ?, updated_at = ?
     WHERE id = ?`,
    input.title.trim(),
    input.notes ?? null,
    input.date,
    input.time ?? null,
    input.calendar_id,
    input.color ?? null,
    input.repeat ? JSON.stringify(input.repeat) : null,
    input.repeat_until ?? null,
    new Date().toISOString(),
    id
  );
}

export async function setTaskDone(db: SQLiteDatabase, id: string, done: boolean) {
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE tasks SET done = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    done ? 1 : 0,
    done ? now : null,
    now,
    id
  );
}

export async function deleteTask(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM task_completions WHERE task_id = ?', id);
  await db.runAsync('DELETE FROM tasks WHERE id = ?', id);
}

export async function listCompletions(db: SQLiteDatabase): Promise<TaskCompletion[]> {
  return db.getAllAsync<TaskCompletion>('SELECT * FROM task_completions');
}

/** Ticks or unticks one date of a repeating task. */
export async function setOccurrenceDone(db: SQLiteDatabase, taskId: string, date: string, done: boolean) {
  if (done) {
    await db.runAsync(
      'INSERT OR REPLACE INTO task_completions (task_id, date, completed_at) VALUES (?, ?, ?)',
      taskId,
      date,
      new Date().toISOString()
    );
  } else {
    await db.runAsync('DELETE FROM task_completions WHERE task_id = ? AND date = ?', taskId, date);
  }
}

/** Skips one date of a repeating task (deleted, or split off into its own task). */
export async function addTaskException(db: SQLiteDatabase, id: string, date: string) {
  const task = await getTask(db, id);
  if (!task) return;
  const exceptions = [...new Set([...JSON.parse(task.exceptions), date])];
  await db.runAsync(
    'UPDATE tasks SET exceptions = ?, updated_at = ? WHERE id = ?',
    JSON.stringify(exceptions),
    new Date().toISOString(),
    id
  );
}
