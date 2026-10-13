import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Two-way sync between this device's SQLite database and the account's rows in the cloud
 * (`records` in supabase/schema.sql). Kept free of Supabase and React Native so it can be tested
 * against a fake cloud; `src/lib/sync.ts` plugs in the real one.
 *
 * - Push: rows listed in `sync_outbox` (filled by triggers, see migration v8) are uploaded. The cloud
 *   keeps whichever version changed last; if it already had a newer one, that one is applied here.
 * - Pull: everything the cloud accepted since `sync_meta.cursor` is written locally, with
 *   `sync_meta.applying = 1` so the triggers don't send it straight back.
 */

export type SyncDb = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;
type Row = Record<string, unknown>;

export type OutgoingRecord = { tbl: string; id: string; data: Row | null; deleted: boolean; changed_at: string };
export type CloudRecord = OutgoingRecord & { rev: number; synced_at: string };

/** The cloud side, for one signed-in account. */
export type Remote = {
  /** Upserts; returns the keys the cloud accepted (older-than-stored writes are refused). */
  push(records: OutgoingRecord[]): Promise<{ tbl: string; id: string }[]>;
  /** The cloud's current versions of these rows. */
  fetch(keys: { tbl: string; id: string }[]): Promise<CloudRecord[]>;
  /** Up to `limit` rows written after `afterRev`, oldest first. */
  pull(afterRev: number, limit: number): Promise<CloudRecord[]>;
};

/** Runs `task` in one transaction, handing it the connection to use. */
export type RunTransaction = (task: (db: SyncDb) => Promise<void>) => Promise<void>;

/** Synced tables, their key columns (`task_id|date` for completions) and their "last changed" column. */
const TABLES: Record<string, { key: string[]; changedColumn: string }> = {
  calendars: { key: ['id'], changedColumn: 'updated_at' },
  groups: { key: ['id'], changedColumn: 'updated_at' },
  events: { key: ['id'], changedColumn: 'updated_at' },
  preferences: { key: ['name'], changedColumn: 'updated_at' },
  tasks: { key: ['id'], changedColumn: 'updated_at' },
  task_completions: { key: ['task_id', 'date'], changedColumn: 'completed_at' },
  imports: { key: ['id'], changedColumn: 'created_at' },
};

const PUSH_BATCH = 200;
const PULL_PAGE = 500;
/** Writes this close to the newest one seen may still be committing elsewhere: pull them again. */
const SETTLE_MS = 15_000;
const SETTLE_LOCAL_MS = 120_000;

const keyWhere = (tbl: string) => TABLES[tbl].key.map((column) => `${column} = ?`).join(' AND ');
const keyValues = (tbl: string, id: string) => (TABLES[tbl].key.length > 1 ? id.split('|') : [id]);

/** Puts every row on this device in the outbox: the first sync with an account merges it all in. */
export async function queueEverything(db: SyncDb) {
  for (const [tbl, { key, changedColumn }] of Object.entries(TABLES)) {
    const id = key.join(` || '|' || `);
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_outbox (tbl, id, changed_at)
       SELECT '${tbl}', ${id}, COALESCE(${changedColumn}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) FROM ${tbl}`
    );
  }
}

async function columnsOf(db: SyncDb): Promise<Record<string, Set<string>>> {
  const columns: Record<string, Set<string>> = {};
  for (const tbl of Object.keys(TABLES)) {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tbl})`);
    columns[tbl] = new Set(info.map((column) => column.name));
  }
  return columns;
}

/**
 * Writes cloud rows locally. Skips rows this device changed more recently (they're still waiting
 * to upload) and rows that are already identical. Returns how many rows actually changed.
 *
 * The outbox triggers note these writes like any other; each one's entry is removed right after, so
 * it isn't sent straight back. (This used to switch the triggers off for the whole database while
 * applying, which also silently dropped unrelated writes made meanwhile, such as the phone-calendar
 * mirror copying in Apple Calendar events, so those never reached other devices.)
 */
async function applyRecords(db: SyncDb, records: CloudRecord[], columns: Record<string, Set<string>>): Promise<number> {
  let changed = 0;
  const forget = (tbl: string, id: string) =>
    db.runAsync('DELETE FROM sync_outbox WHERE tbl = ? AND id = ?', tbl, id);
  for (const record of records) {
    const tbl = record.tbl;
    // A table from a newer app version: nothing to put it in yet.
    if (!TABLES[tbl]) continue;
    const pending = await db.getFirstAsync<{ changed_at: string }>(
      'SELECT changed_at FROM sync_outbox WHERE tbl = ? AND id = ?',
      tbl,
      record.id
    );
    if (pending && Date.parse(pending.changed_at) > Date.parse(record.changed_at)) continue;
    if (pending) await forget(tbl, record.id);

    const where = keyWhere(tbl);
    const values = keyValues(tbl, record.id);
    const local = await db.getFirstAsync<Row>(`SELECT * FROM ${tbl} WHERE ${where}`, ...values);
    if (record.deleted || !record.data) {
      if (local) {
        await db.runAsync(`DELETE FROM ${tbl} WHERE ${where}`, ...values);
        await forget(tbl, record.id);
        changed++;
      }
      continue;
    }
    // Only the columns this version of the app knows; newer ones wait for an app update.
    const data = record.data;
    const names = Object.keys(data).filter((name) => columns[tbl].has(name));
    if (local && names.every((name) => local[name] === data[name])) continue;
    await db.runAsync(
      `INSERT OR REPLACE INTO ${tbl} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
      ...names.map((name) => data[name] as string | number | null)
    );
    await forget(tbl, record.id);
    changed++;
  }
  return changed;
}

/** Uploads the outbox. Returns how many local rows changed because the cloud had newer versions. */
async function push(db: SyncDb, remote: Remote, transaction: RunTransaction, columns: Record<string, Set<string>>) {
  const outbox = await db.getAllAsync<{ tbl: string; id: string; changed_at: string }>(
    'SELECT tbl, id, changed_at FROM sync_outbox ORDER BY changed_at'
  );
  let changed = 0;
  for (let start = 0; start < outbox.length; start += PUSH_BATCH) {
    const batch = outbox.slice(start, start + PUSH_BATCH).filter((entry) => TABLES[entry.tbl]);
    const records: OutgoingRecord[] = [];
    for (const entry of batch) {
      const row = await db.getFirstAsync<Row>(
        `SELECT * FROM ${entry.tbl} WHERE ${keyWhere(entry.tbl)}`,
        ...keyValues(entry.tbl, entry.id)
      );
      records.push({ tbl: entry.tbl, id: entry.id, data: row, deleted: !row, changed_at: entry.changed_at });
    }
    const accepted = new Set((await remote.push(records)).map((key) => `${key.tbl}|${key.id}`));
    // Refused: another device changed the row more recently. Take its version instead.
    const refused = records.filter((record) => !accepted.has(`${record.tbl}|${record.id}`));
    const newer = refused.length ? await remote.fetch(refused) : [];

    await transaction(async (txn) => {
      // Done with these, unless the row changed again while uploading (then it goes next time).
      for (const record of records) {
        await txn.runAsync(
          'DELETE FROM sync_outbox WHERE tbl = ? AND id = ? AND changed_at = ?',
          record.tbl,
          record.id,
          record.changed_at
        );
      }
      changed += await applyRecords(txn, newer, columns);
    });
  }
  return changed;
}

/** Downloads and applies everything since the cursor. Returns how many local rows changed. */
async function pull(db: SyncDb, remote: Remote, transaction: RunTransaction, columns: Record<string, Set<string>>) {
  const meta = await db.getFirstAsync<{ cursor: number }>('SELECT cursor FROM sync_meta');
  const cursor = meta?.cursor ?? 0;
  const records: CloudRecord[] = [];
  for (let after = cursor; ; ) {
    const page = await remote.pull(after, PULL_PAGE);
    records.push(...page);
    if (page.length < PULL_PAGE) break;
    after = page[page.length - 1].rev;
  }
  if (records.length === 0) return 0;

  // Move the cursor only past writes that have surely finished committing everywhere, so a slower
  // write with a lower rev can't be skipped. Pulling a row twice is harmless.
  const newest = Math.max(...records.map((record) => Date.parse(record.synced_at)));
  const settled = records.filter(
    (record) =>
      Date.parse(record.synced_at) <= newest - SETTLE_MS || Date.parse(record.synced_at) <= Date.now() - SETTLE_LOCAL_MS
  );
  const nextCursor = Math.max(cursor, ...settled.map((record) => record.rev));

  let changed = 0;
  await transaction(async (txn) => {
    changed = await applyRecords(txn, records, columns);
    await txn.runAsync('UPDATE sync_meta SET cursor = ?', nextCursor);
  });
  return changed;
}

/**
 * One full sync for `userId`: push, then pull. The first sync with an account (or after switching
 * accounts) uploads everything on this device and pulls everything from the account.
 * Returns how many local rows changed.
 */
export async function syncWith(db: SyncDb, remote: Remote, userId: string, transaction: RunTransaction) {
  const meta = await db.getFirstAsync<{ user_id: string | null }>('SELECT user_id FROM sync_meta');
  if (meta?.user_id !== userId) {
    await queueEverything(db);
    await db.runAsync('UPDATE sync_meta SET user_id = ?, cursor = 0', userId);
  }
  const columns = await columnsOf(db);
  const changed = (await push(db, remote, transaction, columns)) + (await pull(db, remote, transaction, columns));
  await db.runAsync('UPDATE sync_meta SET last_synced_at = ?', new Date().toISOString());
  return changed;
}

/** How many local changes are waiting to upload. */
export async function pendingCount(db: SyncDb): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox');
  return row?.n ?? 0;
}
