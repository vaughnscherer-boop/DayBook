import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { EventColors } from '@/constants/theme';
import { leadingWord, planGrouping, tokens, type GroupingGroup, type GroupingItem } from '@/lib/grouping';
import type { ItemType } from '@/lib/item-type';

export type Group = {
  id: string;
  calendar_id: string;
  name: string;
  color: string;
  keywords: string; // JSON array of lowercase words/phrases
  source: 'auto' | 'user' | 'import';
  type_shades: string; // JSON { [ItemType]: shade step }, over DEFAULT_SHADES
  term_id: string | null;
  instructor: string | null;
  location: string | null;
  office_hours: string | null;
  links: string; // JSON CourseLink[]
  archived: 0 | 1; // 1 = its term ended: hidden from Home, items kept
  created_at: string;
  updated_at: string;
};

export type CourseLink = { label: string; url: string };

export function parseLinks(json: string | null | undefined): CourseLink[] {
  try {
    const list = JSON.parse(json || '[]');
    return Array.isArray(list) ? list.filter((l) => l && typeof l.url === 'string') : [];
  } catch {
    return [];
  }
}

/** How an item's group was chosen: 'auto' lets the rules decide; a group id (or null = none) is a hand pick. */
export type GroupChoice = 'auto' | { groupId: string | null };

/** The `group_id` / `group_locked` column values for a create or update (null = leave unchanged). */
export function groupColumns(choice: GroupChoice | undefined): { group_id: string | null; group_locked: 0 | 1 } | null {
  if (choice === undefined) return null;
  if (choice === 'auto') return { group_id: null, group_locked: 0 };
  return { group_id: choice.groupId, group_locked: 1 };
}

/** Applies a hand-picked (or 'auto') group to an existing event or task; undefined leaves it alone. */
export async function setGroupColumns(
  db: SQLiteDatabase,
  table: 'events' | 'tasks',
  id: string,
  choice: GroupChoice | undefined
) {
  const columns = groupColumns(choice);
  if (!columns) return;
  if (choice === 'auto') {
    // Keep the current group until the next grouping pass decides.
    await db.runAsync(`UPDATE ${table} SET group_locked = 0 WHERE id = ?`, id);
  } else {
    await db.runAsync(`UPDATE ${table} SET group_id = ?, group_locked = 1 WHERE id = ?`, columns.group_id, id);
  }
}

export async function listGroups(db: SQLiteDatabase): Promise<Group[]> {
  return db.getAllAsync<Group>('SELECT * FROM groups ORDER BY calendar_id, name COLLATE NOCASE');
}

/** A color no other group in this calendar uses, and different from the calendar's own. */
async function freeColor(db: SQLiteDatabase, calendarId: string): Promise<string> {
  const rows = await db.getAllAsync<{ color: string }>(
    `SELECT color FROM groups WHERE calendar_id = ?
     UNION ALL SELECT color FROM calendars WHERE id = ?`,
    calendarId,
    calendarId
  );
  const used = rows.map((row) => row.color.toLowerCase());
  const unused = EventColors.find((color) => !used.includes(color.toLowerCase()));
  // Every color taken: reuse the one used least.
  return unused ?? [...EventColors].sort((a, b) => used.filter((c) => c === a.toLowerCase()).length - used.filter((c) => c === b.toLowerCase()).length)[0];
}

export async function createGroup(
  db: SQLiteDatabase,
  input: { calendarId: string; name: string; keywords: string[]; source: Group['source']; color?: string; id?: string }
): Promise<string> {
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO groups (id, calendar_id, name, color, keywords, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.calendarId,
    input.name.trim(),
    input.color ?? (await freeColor(db, input.calendarId)),
    JSON.stringify(input.keywords),
    input.source,
    now,
    now
  );
  return id;
}

/** Renaming or recoloring makes the group yours: it stays even when it has no items. */
export async function updateGroup(
  db: SQLiteDatabase,
  id: string,
  changes: Partial<{ name: string; color: string; typeShades: Record<ItemType, number> }>
) {
  const now = new Date().toISOString();
  if (changes.name !== undefined && changes.name.trim()) {
    const group = await db.getFirstAsync<Group>('SELECT * FROM groups WHERE id = ?', id);
    if (!group) return;
    // The new name means this group too ("Bio" renamed "Biology" still matches "biology lab").
    const keywords: string[] = JSON.parse(group.keywords);
    const name = changes.name.trim();
    const nameKeyword = tokens(name).join(' ');
    if (nameKeyword && !keywords.includes(nameKeyword)) keywords.push(nameKeyword);
    await db.runAsync(
      `UPDATE groups SET name = ?, keywords = ?, source = 'user', updated_at = ? WHERE id = ?`,
      name,
      JSON.stringify(keywords),
      now,
      id
    );
  }
  if (changes.color !== undefined) {
    await db.runAsync(`UPDATE groups SET color = ?, source = 'user', updated_at = ? WHERE id = ?`, changes.color, now, id);
  }
  if (changes.typeShades !== undefined) {
    await db.runAsync(
      `UPDATE groups SET type_shades = ?, source = CASE source WHEN 'auto' THEN 'user' ELSE source END, updated_at = ? WHERE id = ?`,
      JSON.stringify(changes.typeShades),
      now,
      id
    );
  }
}

/**
 * The course details shown on its page. Empty text clears a field. Writes only the fields given, in
 * one statement, so two quick edits (leaving a text box, then picking a term) can't undo each other.
 */
export async function updateCourseInfo(
  db: SQLiteDatabase,
  id: string,
  info: Partial<{ instructor: string; location: string; officeHours: string; links: CourseLink[]; termId: string | null }>
) {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  const set = (column: string, value: string | null) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if (info.instructor !== undefined) set('instructor', info.instructor.trim() || null);
  if (info.location !== undefined) set('location', info.location.trim() || null);
  if (info.officeHours !== undefined) set('office_hours', info.officeHours.trim() || null);
  if (info.links !== undefined) set('links', JSON.stringify(info.links.filter((l) => l.url.trim())));
  if (info.termId !== undefined) set('term_id', info.termId);
  if (sets.length === 0) return;
  await db.runAsync(`UPDATE groups SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...values, new Date().toISOString(), id);
}

/** Moves everything (items and keywords) from one group into another, then removes the first. */
export async function mergeGroups(db: SQLiteDatabase, fromId: string, intoId: string) {
  const [from, into] = await Promise.all([
    db.getFirstAsync<Group>('SELECT * FROM groups WHERE id = ?', fromId),
    db.getFirstAsync<Group>('SELECT * FROM groups WHERE id = ?', intoId),
  ]);
  if (!from || !into || from.id === into.id) return;
  const keywords = [...new Set([...JSON.parse(into.keywords), ...JSON.parse(from.keywords)])];
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE events SET group_id = ? WHERE group_id = ?', intoId, fromId);
    await db.runAsync('UPDATE tasks SET group_id = ? WHERE group_id = ?', intoId, fromId);
    // Its grade categories come along, unless the other class already has the same-named one.
    await db.runAsync(
      `UPDATE grade_categories SET group_id = ?, updated_at = ? WHERE group_id = ?
         AND lower(name) NOT IN (SELECT lower(name) FROM grade_categories WHERE group_id = ?)`,
      intoId,
      new Date().toISOString(),
      fromId,
      intoId
    );
    await db.runAsync('DELETE FROM grade_categories WHERE group_id = ?', fromId);
    await db.runAsync(
      `UPDATE groups SET keywords = ?, source = 'user', updated_at = ? WHERE id = ?`,
      JSON.stringify(keywords),
      new Date().toISOString(),
      intoId
    );
    await db.runAsync('DELETE FROM groups WHERE id = ?', fromId);
  });
}

/**
 * Deletes a group. Its items are kept but locked to "no group", so the automatic rules don't
 * simply make the same group again.
 */
export async function deleteGroup(db: SQLiteDatabase, id: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE events SET group_id = NULL, group_locked = 1 WHERE group_id = ?', id);
    await db.runAsync('UPDATE tasks SET group_id = NULL, group_locked = 1 WHERE group_id = ?', id);
    await db.runAsync('DELETE FROM grade_categories WHERE group_id = ?', id);
    await db.runAsync('DELETE FROM groups WHERE id = ?', id);
  });
}

/**
 * You put an item in a group by hand: its first meaningful word now means that group in this
 * calendar ("Piano lesson" moved to "Music" teaches "piano" -> Music), and no other group's. The
 * group becomes yours, so it's kept even if the automatic rules wouldn't have made it.
 */
export async function learnFromPlacement(db: SQLiteDatabase, groupId: string, title: string) {
  const word = leadingWord(title);
  const group = await db.getFirstAsync<Group>('SELECT * FROM groups WHERE id = ?', groupId);
  if (!word || !group) return;
  const now = new Date().toISOString();
  const siblings = await db.getAllAsync<Group>('SELECT * FROM groups WHERE calendar_id = ?', group.calendar_id);
  await db.withTransactionAsync(async () => {
    for (const sibling of siblings) {
      const keywords: string[] = JSON.parse(sibling.keywords);
      if (sibling.id === groupId) {
        // Placing something in a group by hand makes it yours, so it stays even if the rules wouldn't make it.
        const next = [...new Set([...keywords, word])];
        await db.runAsync(
          `UPDATE groups SET keywords = ?, source = 'user', updated_at = ? WHERE id = ?`,
          JSON.stringify(next),
          now,
          sibling.id
        );
      } else if (keywords.includes(word)) {
        const next = keywords.filter((k) => k !== word);
        await db.runAsync('UPDATE groups SET keywords = ?, updated_at = ? WHERE id = ?', JSON.stringify(next), now, sibling.id);
      }
    }
  });
}

/**
 * Brings every unlocked event and task into the group the rules say it belongs in, creating and
 * removing automatic groups as needed. Cheap and idempotent, so it runs on every reload.
 */
export async function autoGroup(db: SQLiteDatabase) {
  type Row = { id: string; title: string; calendar_id: string | null; group_id: string | null; group_locked: 0 | 1 };
  const [groups, events, tasks] = await Promise.all([
    listGroups(db),
    db.getAllAsync<Row>('SELECT id, title, calendar_id, group_id, group_locked FROM events'),
    db.getAllAsync<Row>('SELECT id, title, calendar_id, group_id, group_locked FROM tasks'),
  ]);
  const groupCalendar = new Map(groups.map((group) => [group.id, group.calendar_id]));
  const toItem = (kind: 'event' | 'task') => (row: Row): GroupingItem => {
    // A group belongs to one calendar; an item moved to another calendar starts over.
    const strayed = row.group_id !== null && groupCalendar.get(row.group_id) !== row.calendar_id;
    return {
      key: `${kind}:${row.id}`,
      title: row.title,
      calendarId: row.calendar_id,
      groupId: row.group_id,
      locked: row.group_locked === 1 && !strayed,
    };
  };
  const items = [...events.map(toItem('event')), ...tasks.map(toItem('task'))];
  const plan = planGrouping(
    groups.map((group): GroupingGroup => ({
      id: group.id,
      calendarId: group.calendar_id,
      keywords: JSON.parse(group.keywords),
      source: group.source,
    })),
    items
  );
  if (!plan.newGroups.length && !plan.moves.length && !plan.keywordUpdates.length && !plan.emptyGroupIds.length) return;

  const now = new Date().toISOString();
  const realIds = new Map<string, string>();
  for (const group of plan.newGroups) {
    // The same id on every device, so two devices grouping the same items make one group, not two.
    const id = `auto-${group.calendarId}-${tokens(group.keywords[0] ?? group.name).join('-')}`;
    const exists = await db.getFirstAsync('SELECT id FROM groups WHERE id = ?', id);
    realIds.set(group.tempId, exists ? id : await createGroup(db, { ...group, source: 'auto', id }));
  }
  await db.withTransactionAsync(async () => {
    for (const { key, groupId } of plan.moves) {
      const [kind, id] = key.split(':');
      const table = kind === 'event' ? 'events' : 'tasks';
      await db.runAsync(
        `UPDATE ${table} SET group_id = ?, group_locked = 0 WHERE id = ?`,
        groupId ? (realIds.get(groupId) ?? groupId) : null,
        id
      );
    }
    for (const { id, keywords } of plan.keywordUpdates) {
      await db.runAsync('UPDATE groups SET keywords = ?, updated_at = ? WHERE id = ?', JSON.stringify(keywords), now, id);
    }
    for (const id of plan.emptyGroupIds) {
      await db.runAsync('DELETE FROM groups WHERE id = ?', id);
    }
  });
}
