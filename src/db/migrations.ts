import type { SQLiteDatabase } from 'expo-sqlite';

const LATEST_VERSION = 20;

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
        ('personal', 'Personal', '#959BDB', 1, 0, '${now}', '${now}'),
        ('work', 'Work', '#E2583B', 0, 1, '${now}', '${now}');

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

  if (version < 5) {
    // Automatic groups inside each calendar (a class, a sport...). Items placed in a group by hand
    // are locked so the automatic rules never move them.
    await db.execAsync(`
      CREATE TABLE groups (
        id TEXT PRIMARY KEY NOT NULL,
        calendar_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        keywords TEXT NOT NULL DEFAULT '[]', -- JSON array of lowercase words/phrases that mean this group
        source TEXT NOT NULL DEFAULT 'auto',  -- 'auto' | 'user' (renamed/edited by you) | 'import'
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_groups_calendar ON groups (calendar_id);

      ALTER TABLE events ADD COLUMN group_id TEXT;
      ALTER TABLE events ADD COLUMN group_locked INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN group_id TEXT;
      ALTER TABLE tasks ADD COLUMN group_locked INTEGER NOT NULL DEFAULT 0;
    `);
    version = 5;
  }

  if (version < 6) {
    // Imported syllabi/schedules, so an import can be undone in one go.
    await db.execAsync(`
      CREATE TABLE imports (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        file_name TEXT,
        created_at TEXT NOT NULL
      );
      ALTER TABLE events ADD COLUMN import_id TEXT;
      ALTER TABLE tasks ADD COLUMN import_id TEXT;
      ALTER TABLE groups ADD COLUMN import_id TEXT; -- set only on groups the import created
    `);
    version = 6;
  }

  if (version < 7) {
    // Each item's type within its group (class, exam, assignment...), drawn as a shade of the
    // group's color. NULL = guess from the title. Groups can override the shade for each type.
    await db.execAsync(`
      ALTER TABLE events ADD COLUMN item_type TEXT;
      ALTER TABLE tasks ADD COLUMN item_type TEXT;
      ALTER TABLE groups ADD COLUMN type_shades TEXT NOT NULL DEFAULT '{}';
    `);
    version = 7;
  }

  if (version < 8) {
    // Sync across devices. Triggers note every change to a synced table in sync_outbox (to upload),
    // except changes that came from the cloud: those are applied with sync_meta.applying = 1.
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    const tables: [table: string, id: (row: string) => string][] = [
      ['calendars', (row) => `${row}.id`],
      ['groups', (row) => `${row}.id`],
      ['events', (row) => `${row}.id`],
      ['tasks', (row) => `${row}.id`],
      ['task_completions', (row) => `${row}.task_id || '|' || ${row}.date`],
      ['imports', (row) => `${row}.id`],
    ];
    const triggers = tables.map(([table, id]) => {
      const note = (row: 'NEW' | 'OLD') =>
        `INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('${table}', ${id(row)}, ${now});`;
      const when = 'WHEN (SELECT applying FROM sync_meta) = 0';
      return `
        CREATE TRIGGER sync_${table}_insert AFTER INSERT ON ${table} ${when} BEGIN ${note('NEW')} END;
        CREATE TRIGGER sync_${table}_update AFTER UPDATE ON ${table} ${when} BEGIN ${note('NEW')} END;
        CREATE TRIGGER sync_${table}_delete AFTER DELETE ON ${table} ${when} BEGIN ${note('OLD')} END;`;
    }).join('\n');
    await db.execAsync(`
      CREATE TABLE sync_outbox (
        tbl TEXT NOT NULL,
        id TEXT NOT NULL,
        changed_at TEXT NOT NULL,   -- ISO time of this device's latest change to the row
        PRIMARY KEY (tbl, id)
      );
      CREATE TABLE sync_meta (
        only_row INTEGER PRIMARY KEY CHECK (only_row = 1),
        applying INTEGER NOT NULL DEFAULT 0, -- 1 while writing rows that came from the cloud
        user_id TEXT,                        -- account this device last synced with
        cursor INTEGER NOT NULL DEFAULT 0,   -- pulled everything up to this server rev
        last_synced_at TEXT
      );
      INSERT INTO sync_meta (only_row) VALUES (1);
      ${triggers}
    `);
    version = 8;
  }

  if (version < 9) {
    // What an imported syllabus says about an item (what to do, what it covers, weight...). Kept
    // apart from your own notes; filled in by imports only.
    await db.execAsync(`
      ALTER TABLE events ADD COLUMN details TEXT;
      ALTER TABLE tasks ADD COLUMN details TEXT;
    `);
    version = 9;
  }

  if (version < 10) {
    // Links between Daybook and the phone's own calendars (iCloud, Google…), for two-way mirroring.
    // Only meaningful on this phone, so these tables have no sync triggers.
    await db.execAsync(`
      CREATE TABLE device_calendar_links (
        calendar_id TEXT PRIMARY KEY NOT NULL,  -- Daybook calendar
        device_calendar_id TEXT NOT NULL,       -- the phone calendar it mirrors
        origin TEXT NOT NULL                    -- 'device' (came from the phone) | 'daybook' (copied to the phone)
      );
      CREATE TABLE device_event_links (
        event_id TEXT NOT NULL,                 -- Daybook event
        device_event_id TEXT NOT NULL,          -- phone event (shared by every occurrence of a repeat)
        occurrence TEXT NOT NULL,               -- that occurrence's original start ('YYYY-MM-DDTHH:MM'); '' = whole series
        device_calendar_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,              -- both sides' content when last in agreement
        PRIMARY KEY (device_event_id, occurrence)
      );
      CREATE INDEX idx_device_event_links_event ON device_event_links (event_id);
    `);
    version = 10;
  }

  if (version < 11) {
    // Sync no longer pauses the outbox triggers while applying cloud rows (see applyRecords), but
    // while it did, phone-calendar events copied in at the same moment never got queued, so they
    // stayed on the phone. Make sure the triggers are on, and queue every linked phone calendar and
    // its events once. Each keeps its own updated_at, so a newer edit from another device still wins.
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    await db.execAsync(`
      UPDATE sync_meta SET applying = 0;
      INSERT OR IGNORE INTO sync_outbox (tbl, id, changed_at)
        SELECT 'calendars', c.id, COALESCE(c.updated_at, ${now})
        FROM calendars c JOIN device_calendar_links l ON l.calendar_id = c.id;
      INSERT OR IGNORE INTO sync_outbox (tbl, id, changed_at)
        SELECT 'events', e.id, COALESCE(e.updated_at, ${now})
        FROM events e JOIN device_calendar_links l ON l.calendar_id = e.calendar_id;
    `);
    version = 11;
  }

  if (version < 12) {
    // Reminder times and switches, synced so they can be changed from any device (the phone, which
    // sends the reminders, follows). Other settings stay per-device in `settings`. Anything already
    // chosen on this device moves over.
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    const note = (row: 'NEW' | 'OLD') =>
      `INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('preferences', ${row}.name, ${now});`;
    const when = 'WHEN (SELECT applying FROM sync_meta) = 0';
    await db.execAsync(`
      CREATE TABLE preferences (
        name TEXT PRIMARY KEY NOT NULL,   -- morningTime, nightTime, morningEnabled, nightEnabled
        value TEXT NOT NULL,              -- JSON
        updated_at TEXT NOT NULL
      );
      CREATE TRIGGER sync_preferences_insert AFTER INSERT ON preferences ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_preferences_update AFTER UPDATE ON preferences ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_preferences_delete AFTER DELETE ON preferences ${when} BEGIN ${note('OLD')} END;
      INSERT INTO preferences (name, value, updated_at)
        SELECT key, value, ${now} FROM settings
        WHERE key IN ('morningTime', 'nightTime', 'morningEnabled', 'nightEnabled');
    `);
    version = 12;
  }

  if (version < 13) {
    // School terms (with their breaks) and what a course group knows about itself: instructor, room,
    // office hours and links. Ended terms archive their courses (hidden from Home, items kept).
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    const note = (row: 'NEW' | 'OLD') =>
      `INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('terms', ${row}.id, ${now});`;
    const when = 'WHEN (SELECT applying FROM sync_meta) = 0';
    await db.execAsync(`
      CREATE TABLE terms (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        starts_on TEXT NOT NULL,      -- 'YYYY-MM-DD'
        ends_on TEXT NOT NULL,        -- 'YYYY-MM-DD'
        breaks TEXT NOT NULL DEFAULT '[]', -- JSON [{ name, from, to }] ('YYYY-MM-DD', inclusive)
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TRIGGER sync_terms_insert AFTER INSERT ON terms ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_terms_update AFTER UPDATE ON terms ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_terms_delete AFTER DELETE ON terms ${when} BEGIN ${note('OLD')} END;

      ALTER TABLE groups ADD COLUMN term_id TEXT;
      ALTER TABLE groups ADD COLUMN instructor TEXT;
      ALTER TABLE groups ADD COLUMN location TEXT;
      ALTER TABLE groups ADD COLUMN office_hours TEXT;
      ALTER TABLE groups ADD COLUMN links TEXT NOT NULL DEFAULT '[]'; -- JSON [{ label, url }]
      ALTER TABLE groups ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
    `);
    version = 13;
  }

  if (version < 14) {
    // Grades: weighted categories per course (Exams 40%, Homework 30%...) and a score on each
    // exam/assignment. A NULL category_id means "pick by name/type" (see src/lib/grades.ts).
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    const note = (row: 'NEW' | 'OLD') =>
      `INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('grade_categories', ${row}.id, ${now});`;
    const when = 'WHEN (SELECT applying FROM sync_meta) = 0';
    await db.execAsync(`
      CREATE TABLE grade_categories (
        id TEXT PRIMARY KEY NOT NULL,
        group_id TEXT NOT NULL,       -- the course
        name TEXT NOT NULL,
        weight REAL NOT NULL,         -- percent of the course grade
        drop_lowest INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_grade_categories_group ON grade_categories (group_id);
      CREATE TRIGGER sync_grade_categories_insert AFTER INSERT ON grade_categories ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_grade_categories_update AFTER UPDATE ON grade_categories ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_grade_categories_delete AFTER DELETE ON grade_categories ${when} BEGIN ${note('OLD')} END;

      ALTER TABLE events ADD COLUMN category_id TEXT;
      ALTER TABLE events ADD COLUMN score REAL;       -- points earned; NULL = not graded yet
      ALTER TABLE events ADD COLUMN max_score REAL;   -- points possible
      ALTER TABLE tasks ADD COLUMN category_id TEXT;
      ALTER TABLE tasks ADD COLUMN score REAL;
      ALTER TABLE tasks ADD COLUMN max_score REAL;
    `);
    version = 14;
  }

  if (version < 15) {
    // School-site calendar feeds (Canvas, Moodle...). Items a feed adds are tagged with their feed and
    // the site's own id (feed_uid), so a refresh updates them instead of adding copies. feed_hash is
    // the feed's version of the item when last applied: your own edits stay until the feed changes it.
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    const note = (row: 'NEW' | 'OLD') =>
      `INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('feeds', ${row}.id, ${now});`;
    const when = 'WHEN (SELECT applying FROM sync_meta) = 0';
    await db.execAsync(`
      CREATE TABLE feeds (
        id TEXT PRIMARY KEY NOT NULL,   -- derived from the link, so two devices adding it make one feed
        url TEXT NOT NULL,
        site TEXT NOT NULL,             -- 'canvas' | 'moodle' | 'blackboard' | 'brightspace' | 'schoology' | 'other'
        label TEXT NOT NULL,
        calendar_id TEXT,
        last_synced_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TRIGGER sync_feeds_insert AFTER INSERT ON feeds ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_feeds_update AFTER UPDATE ON feeds ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_feeds_delete AFTER DELETE ON feeds ${when} BEGIN ${note('OLD')} END;

      ALTER TABLE events ADD COLUMN feed_id TEXT;
      ALTER TABLE events ADD COLUMN feed_uid TEXT;
      ALTER TABLE events ADD COLUMN feed_hash TEXT;
      ALTER TABLE tasks ADD COLUMN feed_id TEXT;
      ALTER TABLE tasks ADD COLUMN feed_uid TEXT;
      ALTER TABLE tasks ADD COLUMN feed_hash TEXT;
      CREATE INDEX idx_events_feed ON events (feed_id);
      CREATE INDEX idx_tasks_feed ON tasks (feed_id);
    `);
    version = 15;
  }

  if (version < 16) {
    // What Claude read from each imported document (JSON: the schedule, and which group each course
    // went into), so "Fix mistakes" can switch you to another section without re-reading it.
    await db.execAsync(`ALTER TABLE imports ADD COLUMN schedule TEXT;`);
    version = 16;
  }

  if (version < 17) {
    // When you said you hadn't done a task after its due time passed: it stays, in Overdue, and
    // Daybook doesn't ask about it again.
    await db.execAsync(`ALTER TABLE tasks ADD COLUMN missed_at TEXT;`);
    version = 17;
  }

  if (version < 18) {
    // Reminders picked for an item (JSON array of tokens like "1h" or "eve-before"); null = the
    // defaults for its type, [] = none.
    await db.execAsync(`
      ALTER TABLE tasks ADD COLUMN reminders TEXT;
      ALTER TABLE events ADD COLUMN reminders TEXT;
    `);
    version = 18;
  }

  if (version < 19) {
    // Planning: how long a task should take (minutes), work blocks planned for a task ("Plan this"),
    // and focus-timer sessions, which sync so durations add up across devices.
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    const when = 'WHEN (SELECT applying FROM sync_meta) = 0';
    const note = (row: 'NEW' | 'OLD') =>
      `INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('focus_sessions', ${row}.id, ${now});`;
    await db.execAsync(`
      ALTER TABLE tasks ADD COLUMN minutes INTEGER;
      ALTER TABLE events ADD COLUMN task_id TEXT;
      CREATE TABLE focus_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT,
        group_id TEXT,              -- the task's class then, so a class's totals survive the task
        item_type TEXT,
        started_at TEXT NOT NULL,
        minutes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TRIGGER sync_focus_sessions_insert AFTER INSERT ON focus_sessions ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_focus_sessions_update AFTER UPDATE ON focus_sessions ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_focus_sessions_delete AFTER DELETE ON focus_sessions ${when} BEGIN ${note('OLD')} END;
    `);
    version = 19;
  }

  if (version < 20) {
    // Attendance: whether you went to each class meeting, and how many absences the class allows.
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    const when = 'WHEN (SELECT applying FROM sync_meta) = 0';
    const note = (row: 'NEW' | 'OLD') =>
      `INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('attendance', ${row}.id, ${now});`;
    await db.execAsync(`
      ALTER TABLE groups ADD COLUMN absence_limit INTEGER;
      CREATE TABLE attendance (
        id TEXT PRIMARY KEY NOT NULL,   -- <event id>|<date>
        event_id TEXT NOT NULL,
        group_id TEXT,
        day TEXT NOT NULL,              -- 'YYYY-MM-DD'
        status TEXT NOT NULL,           -- 'went' | 'skipped' | 'cancelled'
        updated_at TEXT NOT NULL
      );
      CREATE TRIGGER sync_attendance_insert AFTER INSERT ON attendance ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_attendance_update AFTER UPDATE ON attendance ${when} BEGIN ${note('NEW')} END;
      CREATE TRIGGER sync_attendance_delete AFTER DELETE ON attendance ${when} BEGIN ${note('OLD')} END;
    `);
    version = 20;
  }

  await db.execAsync(`PRAGMA user_version = ${version}`);
}
