import type { SQLiteDatabase } from 'expo-sqlite';

export type Settings = {
  morningTime: string; // 'HH:MM'
  nightTime: string; // 'HH:MM'
  morningEnabled: boolean;
  nightEnabled: boolean;
  lastCalendarId: string | null; // calendar picked in the add box last time
  deviceId: string | null; // random id sent with imports (the server's per-device daily limit)
  onboardingDone: boolean; // the first-launch intro was finished or skipped on this device
  /** After a task's due time passes: ask whether you did it (true), or clear it without asking. */
  askAboutPastDue: boolean;
  /** When your day starts and ends ('HH:MM'): free time and study sessions are found between these. */
  dayStart: string;
  dayEnd: string;
  /** Remind about items you haven't set reminders on (tests the evening before, homework before it's due). */
  defaultReminders: boolean;
  /** Reminders snoozed from a notification, re-queued each time reminders are rescheduled (this device only). */
  snoozed: { at: string; title: string; body: string; data: Record<string, unknown> }[];
  /** A running focus timer (this device only), so its "time's up" notification survives rescheduling. */
  focus: { taskId: string; title: string; startedAt: string; endsAt: string } | null;
  /** Class pairs ("idA|idB") you said aren't the same class, so Home stops offering to merge them. */
  separateClasses: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  morningTime: '07:30',
  nightTime: '21:00',
  morningEnabled: true,
  nightEnabled: true,
  lastCalendarId: null,
  deviceId: null,
  onboardingDone: false,
  askAboutPastDue: true,
  dayStart: '08:00',
  dayEnd: '21:00',
  defaultReminders: true,
  snoozed: [],
  focus: null,
  separateClasses: [],
};

/** Reminder, past-due and day-hours settings sync across devices (table `preferences`); the rest stay on this device. */
const SYNCED: readonly (keyof Settings)[] = [
  'morningTime',
  'nightTime',
  'morningEnabled',
  'nightEnabled',
  'askAboutPastDue',
  'dayStart',
  'dayEnd',
  'defaultReminders',
];

/** Reads all settings, filling in defaults for anything never saved. Values are stored as JSON. */
export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const [local, synced] = await Promise.all([
    db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings'),
    db.getAllAsync<{ key: string; value: string }>('SELECT name AS key, value FROM preferences'),
  ]);
  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of [...local.filter((row) => !SYNCED.includes(row.key as keyof Settings)), ...synced]) {
    if (key in settings) Object.assign(settings, { [key]: JSON.parse(value) });
  }
  return settings;
}

export async function setSetting<K extends keyof Settings>(
  db: SQLiteDatabase,
  key: K,
  value: Settings[K]
) {
  if (SYNCED.includes(key)) {
    await db.runAsync(
      `INSERT INTO preferences (name, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      JSON.stringify(value),
      new Date().toISOString()
    );
    return;
  }
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value)
  );
}
