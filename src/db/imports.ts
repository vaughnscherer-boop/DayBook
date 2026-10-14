import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createEvent } from '@/db/events';
import { createGroup, type Group } from '@/db/groups';
import { findOrCreateTerm } from '@/db/terms';
import { createTask } from '@/db/tasks';
import { tokens } from '@/lib/grouping';
import type { ItemType } from '@/lib/item-type';
import type { ImportPlan } from '@/lib/import-schedule';

export type ImportRecord = { id: string; title: string; file_name: string | null; created_at: string };

export async function listImports(db: SQLiteDatabase): Promise<ImportRecord[]> {
  return db.getAllAsync<ImportRecord>('SELECT * FROM imports ORDER BY created_at DESC');
}

/** Shared words over all words: 1 for the same title, 0 for nothing in common. */
function similarity(a: string, b: string): number {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / (new Set([...left, ...right]).size || 1);
}

/**
 * The item already on the calendar that `title` is, among same-day candidates in the course's group.
 * Claude words titles a little differently each read ("Story, Ch. 8" / "Story for Ch. 8"), so this
 * matches on type and shared words rather than exact text.
 */
function sameItem(
  candidates: { id: string; title: string; item_type: ItemType | null }[],
  title: string,
  type: ItemType
): string | null {
  const sameType = candidates.filter((c) => c.item_type === null || c.item_type === type);
  let best: { id: string; score: number } | null = null;
  for (const candidate of sameType) {
    const score = similarity(candidate.title, title);
    if (!best || score > best.score) best = { id: candidate.id, score };
  }
  // Most words in common ("Story, Ch. 8" and "Story for Ch. 8" share 3 of 4).
  return best && best.score >= 0.34 ? best.id : null;
}

/**
 * Saves a reviewed import into `calendarId`: one group per course (reusing a group of the same
 * name already in that calendar), then its class events, dated events and tasks, all placed in
 * that group and tagged with the import so it can be undone. All-day events the calendar already
 * has (same name, same day) are skipped.
 *
 * Importing the same syllabus again doesn't duplicate anything: an item already in that course's
 * group with the same title and date just gets the new description (your ticks and edits stay).
 */
export async function saveImport(
  db: SQLiteDatabase,
  plan: ImportPlan,
  input: { title: string; fileName: string | null; calendarId: string }
): Promise<{ importId: string; added: number; updated: number }> {
  const importId = randomUUID();
  let added = 0;
  let updated = 0;
  const existing = await db.getAllAsync<Group>('SELECT * FROM groups WHERE calendar_id = ?', input.calendarId);
  // All-day days off already in this calendar (two syllabi both list Fall Break): add each once.
  const dayKey = (title: string, startsAt: string) => `${title.trim().toLowerCase()}|${startsAt}`;
  const allDay = await db.getAllAsync<{ title: string; starts_at: string }>(
    'SELECT title, starts_at FROM events WHERE calendar_id = ? AND all_day = 1 AND repeat IS NULL',
    input.calendarId
  );
  const haveAllDay = new Set(allDay.map((event) => dayKey(event.title, event.starts_at)));

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO imports (id, title, file_name, created_at) VALUES (?, ?, ?, ?)',
      importId,
      input.title,
      input.fileName,
      new Date().toISOString()
    );

    const termId = plan.term ? await findOrCreateTerm(db, plan.term, plan.term.breaks) : null;
    const groupIds = new Map<number, string>();
    for (const group of plan.groups) {
      const same = existing.find((g) => g.name.toLowerCase() === group.name.toLowerCase());
      if (same) {
        // Keep its color and items; learn the course's words and mark it a course.
        const keywords = [...new Set([...JSON.parse(same.keywords), ...group.keywords])];
        await db.runAsync(
          `UPDATE groups SET keywords = ?, source = 'import', term_id = COALESCE(?, term_id),
             location = COALESCE(location, ?), office_hours = COALESCE(office_hours, ?), updated_at = ? WHERE id = ?`,
          JSON.stringify(keywords),
          termId,
          group.location,
          group.office_hours,
          new Date().toISOString(),
          same.id
        );
        groupIds.set(group.course, same.id);
      } else {
        const id = await createGroup(db, {
          calendarId: input.calendarId,
          name: group.name,
          keywords: group.keywords,
          source: 'import',
        });
        await db.runAsync(
          'UPDATE groups SET import_id = ?, term_id = ?, location = ?, office_hours = ? WHERE id = ?',
          importId,
          termId,
          group.location,
          group.office_hours,
          id
        );
        groupIds.set(group.course, id);
      }
    }

    for (const event of plan.events) {
      const groupId = groupIds.get(event.course) ?? null;
      // Weekly classes match on start time; one-off events on their day.
      const candidates = groupId
        ? await db.getAllAsync<{ id: string; title: string; item_type: ItemType | null }>(
            event.repeat
              ? `SELECT id, title, item_type FROM events
                 WHERE group_id = ? AND import_id IS NOT ? AND repeat IS NOT NULL AND substr(starts_at, 12, 5) = ?`
              : `SELECT id, title, item_type FROM events
                 WHERE group_id = ? AND import_id IS NOT ? AND repeat IS NULL AND substr(starts_at, 1, 10) = ?`,
            groupId,
            importId,
            event.repeat ? event.starts_at.slice(11, 16) : event.starts_at.slice(0, 10)
          )
        : [];
      const sameId = sameItem(candidates, event.title, event.item_type);
      if (sameId) {
        if (event.details) {
          await db.runAsync('UPDATE events SET details = ?, updated_at = ? WHERE id = ?', event.details, new Date().toISOString(), sameId);
          updated++;
        }
        continue;
      }
      if (event.all_day && !event.repeat) {
        const key = dayKey(event.title, event.starts_at);
        if (haveAllDay.has(key)) continue;
        haveAllDay.add(key);
      }
      const id = await createEvent(db, {
        title: event.title,
        notes: event.notes,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        all_day: event.all_day,
        calendar_id: input.calendarId,
        repeat: event.repeat,
        repeat_until: event.repeat_until,
        item_type: event.item_type,
        group: { groupId },
      });
      await db.runAsync(
        'UPDATE events SET import_id = ?, exceptions = ?, details = ? WHERE id = ?',
        importId,
        JSON.stringify(event.exceptions),
        event.details,
        id
      );
      added++;
    }

    for (const task of plan.tasks) {
      const groupId = groupIds.get(task.course) ?? null;
      const candidates = groupId
        ? await db.getAllAsync<{ id: string; title: string; item_type: ItemType | null }>(
            'SELECT id, title, item_type FROM tasks WHERE group_id = ? AND import_id IS NOT ? AND date = ?',
            groupId,
            importId,
            task.date
          )
        : [];
      const sameId = sameItem(candidates, task.title, task.item_type);
      if (sameId) {
        if (task.details) {
          await db.runAsync('UPDATE tasks SET details = ?, updated_at = ? WHERE id = ?', task.details, new Date().toISOString(), sameId);
          updated++;
        }
        continue;
      }
      const id = await createTask(db, {
        title: task.title,
        notes: task.notes,
        date: task.date,
        time: task.time,
        calendar_id: input.calendarId,
        item_type: task.item_type,
        group: { groupId },
      });
      await db.runAsync('UPDATE tasks SET import_id = ?, details = ? WHERE id = ?', importId, task.details, id);
      added++;
    }
    // A re-import that only filled in descriptions has nothing of its own to undo.
    if (added === 0) await db.runAsync('DELETE FROM imports WHERE id = ?', importId);
  });
  return { importId, added, updated };
}

/** Removes everything an import added: its events, tasks, the groups it created, and the record. */
export async function undoImport(db: SQLiteDatabase, importId: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM task_completions WHERE task_id IN (SELECT id FROM tasks WHERE import_id = ?)',
      importId
    );
    await db.runAsync('DELETE FROM tasks WHERE import_id = ?', importId);
    await db.runAsync('DELETE FROM events WHERE import_id = ?', importId);
    // Anything you added to an imported group yourself stays, just without the group.
    await db.runAsync(
      'UPDATE events SET group_id = NULL, group_locked = 0 WHERE group_id IN (SELECT id FROM groups WHERE import_id = ?)',
      importId
    );
    await db.runAsync(
      'UPDATE tasks SET group_id = NULL, group_locked = 0 WHERE group_id IN (SELECT id FROM groups WHERE import_id = ?)',
      importId
    );
    await db.runAsync('DELETE FROM groups WHERE import_id = ?', importId);
    await db.runAsync('DELETE FROM imports WHERE id = ?', importId);
  });
}
