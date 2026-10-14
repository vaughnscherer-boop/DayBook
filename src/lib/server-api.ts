import { FunctionsHttpError } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const DEV_PORT = 8787;

/** The local `npm run server` (same computer as the Expo dev server), for when Supabase isn't set up. */
function localServerUrl(): string {
  const host =
    Platform.OS === 'web' ? window.location.hostname : (Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost');
  return `http://${host}:${DEV_PORT}`;
}

type Failure = { ok: false; error: string };

/**
 * Calls one of Daybook's Claude features: the hosted Supabase function `fn` for signed-in accounts,
 * or `path` on EXPO_PUBLIC_IMPORT_API_URL / the local `npm run server` while developing.
 */
export async function callServer<T extends { ok: boolean }>(fn: string, path: string, body: unknown): Promise<T | Failure> {
  const base = process.env.EXPO_PUBLIC_IMPORT_API_URL ?? (supabase ? null : localServerUrl());
  if (base) {
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await response.json()) as T;
    } catch {
      return { ok: false, error: 'Couldn’t reach the server — start it with “npm run server”.' };
    }
  }
  const { data: session } = await supabase!.auth.getSession();
  if (!session.session) return { ok: false, error: 'Sign in first (side panel → Account): this uses your Daybook account.' };
  const { data, error } = await supabase!.functions.invoke<T>(fn, { body: body as Record<string, unknown> });
  if (!error && data) return data;
  if (error instanceof FunctionsHttpError) {
    // The function's own message ("Sign in…", "too long"…).
    try {
      return (await error.context.json()) as T;
    } catch {
      // Fall through to the generic message.
    }
  }
  return { ok: false, error: 'Couldn’t reach Daybook’s server — check the connection and try again.' };
}
