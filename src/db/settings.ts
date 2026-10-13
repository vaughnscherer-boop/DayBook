import type { SQLiteDatabase } from 'expo-sqlite';

export type Settings = {
  morningTime: string; // 'HH:MM'
  nightTime: string; // 'HH:MM'
  morningEnabled: boolean;
  nightEnabled: boolean;
  lastCalendarId: string | null; // calendar picked in the add box last time
  deviceId: string | null; // random id sent with imports (the server's per-device daily limit)
  onboardingDone: boolean; // the first-launch intro was finished or skipped on this device
};

export const DEFAULT_SETTINGS: Settings = {
  morningTime: '07:30',
  nightTime: '21:00',
  morningEnabled: true,
  nightEnabled: true,
  lastCalendarId: null,
  deviceId: null,
  onboardingDone: false,
};

/** Reads all settings, filling in defaults for anything never saved. Values are stored as JSON. */
export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (key in settings) Object.assign(settings, { [key]: JSON.parse(value) });
  }
  return settings;
}

export async function setSetting<K extends keyof Settings>(
  db: SQLiteDatabase,
  key: K,
  value: Settings[K]
) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value)
  );
}
