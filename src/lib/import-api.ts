import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { todayKey } from '@/lib/dates';
import { SIGN_IN_FIRST } from '@/lib/server-api';
import type { PickedFile } from '@/lib/pick-schedule';
import type { ImportResponse } from '@/lib/schedule-format';
import { supabase } from '@/lib/supabase';

const DEV_PORT = 8787;

/** The local `npm run server` (same computer as the Expo dev server), for when Supabase isn't set up. */
function localServerUrl(): string {
  const host =
    Platform.OS === 'web'
      ? window.location.hostname
      : // The dev server's address as the phone sees it, e.g. "192.168.1.20:8081".
        (Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost');
  return `http://${host}:${DEV_PORT}`;
}

async function viaServer(url: string, file: PickedFile, deviceId: string, course: string | null): Promise<ImportResponse> {
  let response: Response;
  try {
    response = await fetch(`${url}/api/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': deviceId },
      body: JSON.stringify({ ...file, course, today: todayKey() }),
    });
  } catch {
    return { ok: false, error: 'Couldn’t reach the import server — start it with “npm run server”.' };
  }
  try {
    return (await response.json()) as ImportResponse;
  } catch {
    return { ok: false, error: `The import server answered oddly (HTTP ${response.status}).` };
  }
}

/**
 * Has Claude read the file. Normally that's the hosted `import-schedule` function in Supabase, which
 * works from anywhere for signed-in accounts; EXPO_PUBLIC_IMPORT_API_URL (e.g. the local
 * `npm run server`) overrides it while developing. Takes 30–120 seconds. `course` (from a class's page)
 * tells Claude the document is about that one class.
 */
export async function readScheduleOnServer(file: PickedFile, deviceId: string, course: string | null = null): Promise<ImportResponse> {
  if (process.env.EXPO_PUBLIC_IMPORT_API_URL) return viaServer(process.env.EXPO_PUBLIC_IMPORT_API_URL, file, deviceId, course);
  if (!supabase) return viaServer(localServerUrl(), file, deviceId, course);

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    return { ok: false, error: `${SIGN_IN_FIRST}: imports use your Daybook account.` };
  }
  const { data, error } = await supabase.functions.invoke<ImportResponse>('import-schedule', {
    body: { ...file, course, today: todayKey() },
  });
  if (!error && data) return data;
  if (error instanceof FunctionsHttpError) {
    // The function's own message ("Sign in…", "over 15 MB", "20 imports in a day"…).
    try {
      return (await error.context.json()) as ImportResponse;
    } catch {
      return { ok: false, error: `The import service answered oddly (HTTP ${error.context.status}).` };
    }
  }
  if (error instanceof FunctionsFetchError) {
    return { ok: false, error: 'Couldn’t reach the import service — check your connection and try again.' };
  }
  return { ok: false, error: 'Something went wrong reading that file — please try again.' };
}
