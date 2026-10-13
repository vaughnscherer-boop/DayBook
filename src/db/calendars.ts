import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Group } from '@/db/groups';
import { detectItemType, isCourseGroup, typeColor, type ItemType } from '@/lib/item-type';

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

/**
 * Deletes a calendar and its groups; its events and tasks move to the default calendar. The default
 * can't be deleted.
 */
export async function deleteCalendar(db: SQLiteDatabase, id: string) {
  const fallback = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM calendars WHERE is_default = 1 AND id != ?',
    id
  );
  if (!fallback) return;
  await db.withTransactionAsync(async () => {
    // Groups belong to one calendar; moved items get regrouped in their new calendar.
    await db.runAsync(
      'UPDATE events SET calendar_id = ?, group_id = NULL, group_locked = 0 WHERE calendar_id = ?',
      fallback.id,
      id
    );
    await db.runAsync(
      'UPDATE tasks SET calendar_id = ?, group_id = NULL, group_locked = 0 WHERE calendar_id = ?',
      fallback.id,
      id
    );
    await db.runAsync('DELETE FROM groups WHERE calendar_id = ?', id);
    await db.runAsync('DELETE FROM calendars WHERE id = ?', id);
  });
}

/** The item's type within its group: what you (or the import) set, else a guess from its title. */
export function itemTypeOf(
  item: { title: string; item_type: ItemType | null; repeat: string | null },
  kind: 'event' | 'task',
  group: Group | null | undefined
): ItemType {
  return item.item_type ?? detectItemType(item.title, kind, item.repeat !== null, !!group && isCourseGroup(group));
}

/**
 * An item's own color if it has one, otherwise its group's shade for the item's type (Latin quizzes
 * darker, Latin homework lighter...), otherwise its calendar's color.
 */
export function itemColor(
  item: {
    title: string;
    color: string | null;
    calendar_id: string | null;
    group_id: string | null;
    item_type: ItemType | null;
    repeat: string | null;
  },
  kind: 'event' | 'task',
  calendarsById: Record<string, Calendar>,
  groupsById: Record<string, Group> = {}
): string {
  const group = item.group_id ? groupsById[item.group_id] : undefined;
  return (
    item.color ??
    (group && typeColor(group, itemTypeOf(item, kind, group))) ??
    (item.calendar_id && calendarsById[item.calendar_id]?.color) ??
    '#8E8E93'
  );
}
