import type { SQLiteDatabase } from 'expo-sqlite';

import type { FeedSite } from '@/lib/feed-format';
import { feedIdFor } from '@/lib/feed-items';

export type Feed = {
  id: string;
  url: string;
  site: FeedSite;
  label: string;
  calendar_id: string | null;
  last_synced_at: string | null;
  updated_at: string;
};

export async function listFeeds(db: SQLiteDatabase): Promise<Feed[]> {
  return db.getAllAsync<Feed>('SELECT * FROM feeds ORDER BY label COLLATE NOCASE');
}

/** Adds a feed (the same link added twice is one feed). Returns its id. */
export async function addFeed(
  db: SQLiteDatabase,
  input: { url: string; site: FeedSite; label: string; calendarId: string | null }
): Promise<string> {
  const id = feedIdFor(input.url);
  await db.runAsync(
    `INSERT INTO feeds (id, url, site, label, calendar_id, last_synced_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(id) DO UPDATE SET site = excluded.site, label = excluded.label, calendar_id = excluded.calendar_id, updated_at = excluded.updated_at`,
    id,
    input.url.trim(),
    input.site,
    input.label.trim(),
    input.calendarId,
    new Date().toISOString()
  );
  return id;
}

export async function markFeedSynced(db: SQLiteDatabase, id: string) {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE feeds SET last_synced_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

/** Removes the feed and everything it added (ticks and edits on those items go with them). */
export async function removeFeed(db: SQLiteDatabase, id: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM task_completions WHERE task_id IN (SELECT id FROM tasks WHERE feed_id = ?)', id);
    await db.runAsync('DELETE FROM tasks WHERE feed_id = ?', id);
    await db.runAsync('DELETE FROM events WHERE feed_id = ?', id);
    await db.runAsync('DELETE FROM feeds WHERE id = ?', id);
  });
}

/** How many items a feed has added. */
export async function feedItemCount(db: SQLiteDatabase, id: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT (SELECT COUNT(*) FROM tasks WHERE feed_id = ?) + (SELECT COUNT(*) FROM events WHERE feed_id = ?) AS n',
    id,
    id
  );
  return row?.n ?? 0;
}
