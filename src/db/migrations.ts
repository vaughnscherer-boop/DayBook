import type { SQLiteDatabase } from 'expo-sqlite';

const LATEST_VERSION = 4;

/**
 * Creates/upgrades the database schema. Each time the schema changes, add a new
 * `if (version < N)` block and bump LATEST_VERSION — never edit an old block.
 */
export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = result?.user_version ?? 0;
  if (version >= LATEST_VERSION) return;

  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        notes TEXT,
        due_date TEXT,              -- 'YYYY-MM-DD' in local time, or NULL
        due_time TEXT,              -- 'HH:MM', or NULL
        priority INTEGER NOT NULL DEFAULT 2, -- 1 high, 2 medium, 3 low
        estimate_min INTEGER,
        status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'done' | 'dropped'
        completed_at TEXT,
        rolled_over_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_tasks_due ON tasks (status, due_date);

      CREATE TABLE daily_logs (
        date TEXT PRIMARY KEY NOT NULL, -- 'YYYY-MM-DD'
        brief_seen_at TEXT,
        wrapup_done_at TEXT,
        top_priorities TEXT,            -- JSON array of task ids
        reflection TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    version = 1;
  }

  if (version < 2) {
    // The app became a calendar: tasks are replaced by timed/all-day events.
    await db.execAsync(`
      DROP TABLE IF EXISTS tasks;
      DROP TABLE IF EXISTS daily_logs;

      CREATE TABLE events (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        notes TEXT,
        starts_at TEXT NOT NULL,    -- 'YYYY-MM-DDTHH:MM' local time
        ends_at TEXT NOT NULL,      -- 'YYYY-MM-DDTHH:MM' local time
        all_day INTEGER NOT NULL DEFAULT 0,
        external_id TEXT,           -- id in the phone calendar, once sync exists
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_events_start ON events (starts_at);
    `);
    version = 2;
  }

  if (version < 3) {
    // Colored calendars, per-event color overrides, and checkable tasks.
    const now = new Date().toISOString();
    await db.execAsync(`
      CREATE TABLE calendars (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,          -- hex, one of EventColors
        visible INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO calendars (id, name, color, is_default, sort_order, created_at, updated_at) VALUES
        ('personal', 'Personal', '#1A8CFF', 1, 0, '${now}', '${now}'),
        ('work', 'Work', '#FF9500', 0, 1, '${now}', '${now}');

      ALTER TABLE events ADD COLUMN calendar_id TEXT;
      ALTER TABLE events ADD COLUMN color TEXT;  -- NULL = use the calendar's color
      UPDATE events SET calendar_id = 'personal';

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        notes TEXT,
        date TEXT NOT NULL,           -- 'YYYY-MM-DD' local time
        time TEXT,                    -- 'HH:MM', or NULL
        calendar_id TEXT,
        color TEXT,
        done INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_tasks_date ON tasks (date);
    `);
    version = 3;
  }

  if (version < 4) {
    // Repeating events and tasks. A repeating task is ticked off per date in task_completions.
    await db.execAsync(`
      ALTER TABLE events ADD COLUMN repeat TEXT;          -- JSON RepeatRule, NULL = one-off
      ALTER TABLE events ADD COLUMN repeat_until TEXT;    -- 'YYYY-MM-DD', NULL = forever
      ALTER TABLE events ADD COLUMN exceptions TEXT NOT NULL DEFAULT '[]'; -- skipped dates (JSON)
      ALTER TABLE tasks ADD COLUMN repeat TEXT;
      ALTER TABLE tasks ADD COLUMN repeat_until TEXT;
      ALTER TABLE tasks ADD COLUMN exceptions TEXT NOT NULL DEFAULT '[]';

      CREATE TABLE task_completions (
        task_id TEXT NOT NULL,
        date TEXT NOT NULL,           -- occurrence date 'YYYY-MM-DD'
        completed_at TEXT NOT NULL,
        PRIMARY KEY (task_id, date)
      );
    `);
    version = 4;
  }

  await db.execAsync(`PRAGMA user_version = ${version}`);
}
