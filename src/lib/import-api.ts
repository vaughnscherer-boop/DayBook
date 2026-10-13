import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { todayKey } from '@/lib/dates';
import type { PickedFile } from '@/lib/pick-schedule';
import type { ImportResponse } from '@/lib/schedule-format';

const DEV_PORT = 8787;

/**
 * Where the import server is (`npm run server`). Set EXPO_PUBLIC_IMPORT_API_URL once it's deployed;
 * in development it's the same computer the Expo dev server runs on.
 */
function importServerUrl(): string {
  if (process.env.EXPO_PUBLIC_IMPORT_API_URL) return process.env.EXPO_PUBLIC_IMPORT_API_URL;
  const host =
    Platform.OS === 'web'
      ? window.location.hostname
      : // The dev server's address as the phone sees it, e.g. "192.168.1.20:8081".
        (Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost');
  return `http://${host}:${DEV_PORT}`;
}

/** Sends the file to the import server, which has Claude read it. Takes 10–90 seconds. */
export async function readScheduleOnServer(file: PickedFile, deviceId: string): Promise<ImportResponse> {
  let response: Response;
  try {
    response = await fetch(`${importServerUrl()}/api/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': deviceId },
      body: JSON.stringify({ ...file, today: todayKey() }),
    });
  } catch {
    return {
      ok: false,
      error: __DEV__
        ? 'Couldn’t reach the import server — start it with “npm run server”.'
        : 'Couldn’t reach the Daybook server — check your connection and try again.',
    };
  }
  try {
    return (await response.json()) as ImportResponse;
  } catch {
    return { ok: false, error: `The import server answered oddly (HTTP ${response.status}).` };
  }
}
