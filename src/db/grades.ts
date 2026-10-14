import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { CalendarEvent } from '@/db/events';
import type { Group } from '@/db/groups';
import type { Task } from '@/db/tasks';
import { itemTypeOf } from '@/db/calendars';
import type { Category, GradeItem } from '@/lib/grades';

export type GradeCategory = Category & { group_id: string; sort_order: number; updated_at: string };

export async function listCategories(db: SQLiteDatabase): Promise<GradeCategory[]> {
  return db.getAllAsync<GradeCategory>('SELECT * FROM grade_categories ORDER BY group_id, sort_order, name COLLATE NOCASE');
}

export async function createCategory(
  db: SQLiteDatabase,
  input: { groupId: string; name: string; weight: number; dropLowest?: number }
): Promise<string> {
  const id = randomUUID();
  // A group with a grading scheme is yours: automatic grouping mustn't remove it when it's empty.
  await db.runAsync(`UPDATE groups SET source = 'user' WHERE id = ? AND source = 'auto'`, input.groupId);
  const last = await db.getFirstAsync<{ max: number | null }>(
    'SELECT MAX(sort_order) AS max FROM grade_categories WHERE group_id = ?',
    input.groupId
  );
  await db.runAsync(
    `INSERT INTO grade_categories (id, group_id, name, weight, drop_lowest, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.groupId,
    input.name.trim(),
    input.weight,
    input.dropLowest ?? 0,
    (last?.max ?? -1) + 1,
    new Date().toISOString()
  );
  return id;
}

export async function updateCategory(
  db: SQLiteDatabase,
  id: string,
  changes: Partial<{ name: string; weight: number; dropLowest: number }>
) {
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (changes.name !== undefined && changes.name.trim()) {
    sets.push('name = ?');
    values.push(changes.name.trim());
  }
  if (changes.weight !== undefined && Number.isFinite(changes.weight)) {
    sets.push('weight = ?');
    values.push(Math.max(0, changes.weight));
  }
  if (changes.dropLowest !== undefined && Number.isFinite(changes.dropLowest)) {
    sets.push('drop_lowest = ?');
    values.push(Math.max(0, Math.floor(changes.dropLowest)));
  }
  if (sets.length === 0) return;
  await db.runAsync(`UPDATE grade_categories SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...values, new Date().toISOString(), id);
}

/** Removes the category; items in it go back to being sorted by name and type. */
export async function deleteCategory(db: SQLiteDatabase, id: string) {
  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    await db.runAsync('UPDATE events SET category_id = NULL, updated_at = ? WHERE category_id = ?', now, id);
    await db.runAsync('UPDATE tasks SET category_id = NULL, updated_at = ? WHERE category_id = ?', now, id);
    await db.runAsync('DELETE FROM grade_categories WHERE id = ?', id);
  });
}

/** Sets (or clears) an item's score and category. `undefined` leaves a field alone. */
export async function setScore(
  db: SQLiteDatabase,
  table: 'events' | 'tasks',
  id: string,
  changes: Partial<{ score: number | null; maxScore: number | null; categoryId: string | null }>
) {
  const sets: string[] = [];
  const values: (number | string | null)[] = [];
  if (changes.score !== undefined) {
    sets.push('score = ?');
    values.push(changes.score);
  }
  if (changes.maxScore !== undefined) {
    sets.push('max_score = ?');
    values.push(changes.maxScore);
  }
  if (changes.categoryId !== undefined) {
    sets.push('category_id = ?');
    values.push(changes.categoryId);
  }
  if (sets.length === 0) return;
  await db.runAsync(`UPDATE ${table} SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...values, new Date().toISOString(), id);
}

/**
 * The exams, assignments and anything scored in one course, as grade inputs. Repeating items
 * (weekly classes) never count; an item you scored counts whatever its type.
 */
export function gradeItems(group: Group, events: CalendarEvent[], tasks: Task[]): GradeItem[] {
  const toItem = (kind: 'event' | 'task') => (row: CalendarEvent | Task): GradeItem[] => {
    if (row.group_id !== group.id || row.repeat !== null) return [];
    const itemType = itemTypeOf(row, kind, group);
    const scored = row.score !== null;
    if (!scored && itemType !== 'exam' && itemType !== 'assignment') return [];
    return [{ id: row.id, title: row.title, itemType, categoryId: row.category_id, score: row.score, max: row.max_score }];
  };
  return [...events.flatMap(toItem('event')), ...tasks.flatMap(toItem('task'))];
}
