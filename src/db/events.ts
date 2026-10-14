import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { groupColumns, setGroupColumns, type GroupChoice } from '@/db/groups';
import type { ItemType } from '@/lib/item-type';
import type { RepeatRule } from '@/lib/recurrence';

export type CalendarEvent = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string; // 'YYYY-MM-DDTHH:MM'
  ends_at: string; // 'YYYY-MM-DDTHH:MM'
  all_day: 0 | 1;
  external_id: string | null;
  calendar_id: string | null;
  color: string | null; // overrides the calendar's color
  repeat: string | null; // JSON RepeatRule
  repeat_until: string | null;
  exceptions: string; // JSON array of skipped dates
  group_id: string | null;
  group_locked: 0 | 1; // 1 = placed by hand; automatic grouping leaves it alone
  item_type: ItemType | null; // null = guessed from the title
  details: string | null; // from an imported syllabus; read-only in the app
  category_id: string | null; // grade category; null = picked by name/type
  score: number | null; // points earned; null = not graded yet
  max_score: number | null; // points possible
  created_at: string;
  updated_at: string;
};

export type EventInput = {
  title: string;
  notes?: string | null;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
  calendar_id: string | null;
  color?: string | null;
  repeat?: RepeatRule | null;
  repeat_until?: string | null;
  /** Set when the group was picked by hand (or "no group"); leave out to keep the current one. */
  group?: GroupChoice;
  /** Class, exam, assignment...; null = guess from the title. Leave out to keep the current one. */
  item_type?: ItemType | null;
};

export async function listEvents(db: SQLiteDatabase): Promise<CalendarEvent[]> {
  return db.getAllAsync<CalendarEvent>('SELECT * FROM events ORDER BY all_day DESC, starts_at');
}

export async function getEvent(db: SQLiteDatabase, id: string): Promise<CalendarEvent | null> {
  return db.getFirstAsync<CalendarEvent>('SELECT * FROM events WHERE id = ?', id);
}

export async function createEvent(db: SQLiteDatabase, input: EventInput): Promise<string> {
  const id = randomUUID();
  const group = groupColumns(input.group);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO events (id, title, notes, starts_at, ends_at, all_day, calendar_id, color, repeat, repeat_until,
       group_id, group_locked, item_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.title.trim(),
    input.notes ?? null,
    input.starts_at,
    input.ends_at,
    input.all_day ? 1 : 0,
    input.calendar_id,
    input.color ?? null,
    input.repeat ? JSON.stringify(input.repeat) : null,
    input.repeat_until ?? null,
    group?.group_id ?? null,
    group?.group_locked ?? 0,
    input.item_type ?? null,
    now,
    now
  );
  return id;
}

export async function updateEvent(db: SQLiteDatabase, id: string, input: EventInput) {
  await db.runAsync(
    `UPDATE events SET title = ?, notes = ?, starts_at = ?, ends_at = ?, all_day = ?, calendar_id = ?, color = ?,
       repeat = ?, repeat_until = ?, updated_at = ?
     WHERE id = ?`,
    input.title.trim(),
    input.notes ?? null,
    input.starts_at,
    input.ends_at,
    input.all_day ? 1 : 0,
    input.calendar_id,
    input.color ?? null,
    input.repeat ? JSON.stringify(input.repeat) : null,
    input.repeat_until ?? null,
    new Date().toISOString(),
    id
  );
  await setGroupColumns(db, 'events', id, input.group);
  if (input.item_type !== undefined) {
    await db.runAsync('UPDATE events SET item_type = ? WHERE id = ?', input.item_type, id);
  }
}

export async function deleteEvent(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM events WHERE id = ?', id);
}

/** Skips one date of a repeating event (deleted, or split off into its own event). */
export async function addEventException(db: SQLiteDatabase, id: string, date: string) {
  const event = await getEvent(db, id);
  if (!event) return;
  const exceptions = [...new Set([...JSON.parse(event.exceptions), date])];
  await db.runAsync(
    'UPDATE events SET exceptions = ?, updated_at = ? WHERE id = ?',
    JSON.stringify(exceptions),
    new Date().toISOString(),
    id
  );
}
