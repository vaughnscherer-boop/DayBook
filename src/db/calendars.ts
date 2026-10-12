import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type Calendar = {
  id: string;
  name: string;
  color: string;
  visible: 0 | 1;
  is_default: 0 | 1;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function listCalendars(db: SQLiteDatabase): Promise<Calendar[]> {
  return db.getAllAsync<Calendar>('SELECT * FROM calendars ORDER BY sort_order, created_at');
}

export async function createCalendar(db: SQLiteDatabase, name: string, color: string): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const last = await db.getFirstAsync<{ max: number | null }>('SELECT MAX(sort_order) AS max FROM calendars');
  await db.runAsync(
    `INSERT INTO calendars (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    name.trim(),
    color,
    (last?.max ?? -1) + 1,
    now,
    now
  );
  return id;
}

export async function updateCalendar(
  db: SQLiteDatabase,
  id: string,
  changes: Partial<{ name: string; color: string; visible: boolean }>
) {
  const now = new Date().toISOString();
  if (changes.name !== undefined) {
    await db.runAsync('UPDATE calendars SET name = ?, updated_at = ? WHERE id = ?', changes.name.trim(), now, id);
  }
  if (changes.color !== undefined) {
    await db.runAsync('UPDATE calendars SET color = ?, updated_at = ? WHERE id = ?', changes.color, now, id);
  }
  if (changes.visible !== undefined) {
    await db.runAsync('UPDATE calendars SET visible = ?, updated_at = ? WHERE id = ?', changes.visible ? 1 : 0, now, id);
  }
}

export async function setDefaultCalendar(db: SQLiteDatabase, id: string) {
  await db.runAsync('UPDATE calendars SET is_default = (id = ?)', id);
}

/** Deletes a calendar; its events and tasks move to the default calendar. The default can't be deleted. */
export async function deleteCalendar(db: SQLiteDatabase, id: string) {
  const fallback = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM calendars WHERE is_default = 1 AND id != ?',
    id
  );
  if (!fallback) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE events SET calendar_id = ? WHERE calendar_id = ?', fallback.id, id);
    await db.runAsync('UPDATE tasks SET calendar_id = ? WHERE calendar_id = ?', fallback.id, id);
    await db.runAsync('DELETE FROM calendars WHERE id = ?', id);
  });
}

/** An item's own color if it has one, otherwise its calendar's. */
export function itemColor(
  item: { color: string | null; calendar_id: string | null },
  calendarsById: Record<string, Calendar>
): string {
  return item.color ?? (item.calendar_id && calendarsById[item.calendar_id]?.color) ?? '#8E8E93';
}
