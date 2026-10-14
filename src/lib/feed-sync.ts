import type { SQLiteDatabase } from 'expo-sqlite';

import { createEvent } from '@/db/events';
import { listFeeds, markFeedSynced, type Feed } from '@/db/feeds';
import { createGroup, listGroups, type Group } from '@/db/groups';
import { createTask } from '@/db/tasks';
import { listCalendars } from '@/db/calendars';
import { todayKey } from '@/lib/dates';
import { readFeedOnServer } from '@/lib/feed-api';
import type { FeedItem } from '@/lib/feed-format';
import { draftFor, feedItemId } from '@/lib/feed-items';
import { bestGroup, courseCode, tokens } from '@/lib/grouping';
import { notifyDataChanged } from '@/lib/data-events';
import { rescheduleAll } from '@/lib/notifications';

/**
 * Keeps the items a school-site feed adds up to date. Each item is found again by the site's own
 * id, so a refresh never adds copies, never touches your ticks, and only overwrites an edit of yours
 * when the school site itself changed that item.
 */

/** A feed refreshes at most this often on its own (the Refresh button always goes). */
const REFRESH_EVERY_MS = 6 * 60 * 60 * 1000;

type Row = { id: string; feed_uid: string; feed_hash: string | null; done?: number; date?: string; starts_at?: string };

export type FeedResult = { added: number; updated: number; removed: number };

/** The group an item's course belongs to in `calendarId`: a matching one, or a new course group. */
async function groupForCourse(
  db: SQLiteDatabase,
  course: string | null,
  calendarId: string,
  groups: Group[]
): Promise<string | null> {
  if (!course) return null;
  const code = courseCode(course);
  const mine = groups.filter((g) => g.calendar_id === calendarId);
  const found =
    (code && mine.find((g) => (JSON.parse(g.keywords) as string[]).includes(code.keyword))) ||
    (() => {
      const hit = bestGroup(
        course,
        mine.map((g) => ({ id: g.id, calendarId: g.calendar_id, keywords: JSON.parse(g.keywords) as string[], source: g.source }))
      );
      return hit ? mine.find((g) => g.id === hit.id) : undefined;
    })();
  if (found) return found.id;

  const name = code?.name ?? course.trim().slice(0, 40);
  const keywords = code ? [code.keyword] : [tokens(course).join(' ')].filter(Boolean);
  if (keywords.length === 0) return null;
  // The same id on every device, so two devices reading one feed make one course, not two.
  const id = `course-${calendarId}-${tokens(name).join('-')}`;
  const existing = groups.find((g) => g.id === id) ?? (await db.getFirstAsync<Group>('SELECT * FROM groups WHERE id = ?', id));
  if (!existing) await createGroup(db, { id, calendarId, name, keywords, source: 'import' });
  const created = existing ?? (await db.getFirstAsync<Group>('SELECT * FROM groups WHERE id = ?', id));
  if (created && !groups.some((g) => g.id === created.id)) groups.push(created);
  return id;
}

/** Writes a feed's items into the database. */
export async function applyFeedItems(db: SQLiteDatabase, feed: Feed, items: FeedItem[]): Promise<FeedResult> {
  const result: FeedResult = { added: 0, updated: 0, removed: 0 };
  const calendars = await listCalendars(db);
  const calendarId = calendars.find((c) => c.id === feed.calendar_id)?.id ?? calendars.find((c) => c.is_default)?.id ?? calendars[0]?.id;
  if (!calendarId) return result;
  const groups = await listGroups(db);
  const today = todayKey();

  const [tasks, events] = await Promise.all([
    db.getAllAsync<Row>('SELECT id, feed_uid, feed_hash, done, date FROM tasks WHERE feed_id = ?', feed.id),
    db.getAllAsync<Row>('SELECT id, feed_uid, feed_hash, starts_at FROM events WHERE feed_id = ?', feed.id),
  ]);
  const taskByUid = new Map(tasks.map((r) => [r.feed_uid, r]));
  const eventByUid = new Map(events.map((r) => [r.feed_uid, r]));
  const seen = new Set<string>();
  const now = () => new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const item of items) {
      if (seen.has(item.uid)) continue;
      seen.add(item.uid);
      const draft = draftFor(item);
      const id = feedItemId(feed.id, item.uid);
      const sameKind = draft.kind === 'task' ? taskByUid.get(item.uid) : eventByUid.get(item.uid);
      const otherKind = draft.kind === 'task' ? eventByUid.get(item.uid) : taskByUid.get(item.uid);
      // The site turned a task into an event (or back): replace it.
      if (otherKind) {
        await db.runAsync(`DELETE FROM ${draft.kind === 'task' ? 'events' : 'tasks'} WHERE id = ?`, otherKind.id);
        if (draft.kind === 'event') await db.runAsync('DELETE FROM task_completions WHERE task_id = ?', otherKind.id);
      }

      if (sameKind) {
        if (sameKind.feed_hash === draft.hash) continue;
        if (draft.kind === 'task') {
          await db.runAsync(
            'UPDATE tasks SET title = ?, date = ?, time = ?, details = ?, feed_hash = ?, updated_at = ? WHERE id = ?',
            draft.title, draft.date, draft.time, draft.details, draft.hash, now(), sameKind.id
          );
        } else {
          await db.runAsync(
            'UPDATE events SET title = ?, starts_at = ?, ends_at = ?, all_day = ?, details = ?, feed_hash = ?, updated_at = ? WHERE id = ?',
            draft.title, draft.startsAt, draft.endsAt, draft.allDay ? 1 : 0, draft.details, draft.hash, now(), sameKind.id
          );
        }
        result.updated++;
        continue;
      }

      const groupId = await groupForCourse(db, item.course, calendarId, groups);
      const group = groupId ? { groupId } : undefined;
      if (draft.kind === 'task') {
        await createTask(db, { id, title: draft.title, date: draft.date, time: draft.time, calendar_id: calendarId, group });
        await db.runAsync('UPDATE tasks SET details = ?, feed_id = ?, feed_uid = ?, feed_hash = ? WHERE id = ?', draft.details, feed.id, item.uid, draft.hash, id);
      } else {
        await createEvent(db, {
          id, title: draft.title, starts_at: draft.startsAt, ends_at: draft.endsAt, all_day: draft.allDay, calendar_id: calendarId, group,
        });
        await db.runAsync('UPDATE events SET details = ?, feed_id = ?, feed_uid = ?, feed_hash = ? WHERE id = ?', draft.details, feed.id, item.uid, draft.hash, id);
      }
      result.added++;
    }

    // Upcoming, unticked items the site no longer lists were removed there (a deleted assignment).
    // Only when the feed actually returned something, so an empty answer never wipes anything.
    if (items.length > 0) {
      for (const row of tasks) {
        if (!seen.has(row.feed_uid) && !row.done && row.date! >= today) {
          await db.runAsync('DELETE FROM tasks WHERE id = ?', row.id);
          result.removed++;
        }
      }
      for (const row of events) {
        if (!seen.has(row.feed_uid) && row.starts_at!.slice(0, 10) >= today) {
          await db.runAsync('DELETE FROM events WHERE id = ?', row.id);
          result.removed++;
        }
      }
    }
    await markFeedSynced(db, feed.id);
  });
  return result;
}

// ---- Refreshing, with a status the settings screen can show ----

export type FeedStatus = Record<string, { state: 'syncing' } | { state: 'ok'; result: FeedResult } | { state: 'error'; message: string }>;

let status: FeedStatus = {};
const listeners = new Set<() => void>();
const setStatus = (id: string, value: FeedStatus[string]) => {
  status = { ...status, [id]: value };
  listeners.forEach((listener) => listener());
};
export const getFeedStatus = () => status;
export function subscribeFeedStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let running: Promise<void> | null = null;

/** Reads one feed and applies it. Never throws: problems end up in the status. */
export async function refreshFeed(db: SQLiteDatabase, feed: Feed): Promise<void> {
  setStatus(feed.id, { state: 'syncing' });
  try {
    const response = await readFeedOnServer(feed.url);
    if (!response.ok) return setStatus(feed.id, { state: 'error', message: response.error });
    const result = await applyFeedItems(db, feed, response.items);
    setStatus(feed.id, { state: 'ok', result });
    if (result.added + result.updated + result.removed > 0) {
      notifyDataChanged();
      rescheduleAll(db);
    }
  } catch {
    setStatus(feed.id, { state: 'error', message: 'Something went wrong saving that calendar.' });
  }
}

/** Refreshes the feeds that are due (all of them with `force`). One run at a time. */
export function refreshFeeds(db: SQLiteDatabase, options: { force?: boolean; only?: string } = {}): Promise<void> {
  if (running) return running;
  running = (async () => {
    const feeds = await listFeeds(db);
    for (const feed of feeds) {
      if (options.only && feed.id !== options.only) continue;
      const age = feed.last_synced_at ? Date.now() - Date.parse(feed.last_synced_at) : Infinity;
      if (!options.force && !options.only && age < REFRESH_EVERY_MS) continue;
      await refreshFeed(db, feed);
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
