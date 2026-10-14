import { FunctionsHttpError } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { BreakdownRequest, BreakdownResponse } from '@/lib/breakdown-format';
import { supabase } from '@/lib/supabase';

const DEV_PORT = 8787;

function localServerUrl(): string {
  const host =
    Platform.OS === 'web' ? window.location.hostname : (Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost');
  return `http://${host}:${DEV_PORT}`;
}

/**
 * Has Claude split an assignment into dated steps. The hosted `break-down` function in Supabase
 * (signed-in accounts); EXPO_PUBLIC_IMPORT_API_URL, or the local `npm run server` when Supabase
 * isn't set up, stand in while developing.
 */
export async function breakDownOnServer(request: BreakdownRequest): Promise<BreakdownResponse> {
  const base = process.env.EXPO_PUBLIC_IMPORT_API_URL ?? (supabase ? null : localServerUrl());
  if (base) {
    try {
      const response = await fetch(`${base}/api/break-down`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      return (await response.json()) as BreakdownResponse;
    } catch {
      return { ok: false, error: 'Couldn’t reach the server — start it with “npm run server”.' };
    }
  }
  const { data: session } = await supabase!.auth.getSession();
  if (!session.session) return { ok: false, error: 'Sign in first (side panel → Account): this uses your Daybook account.' };
  const { data, error } = await supabase!.functions.invoke<BreakdownResponse>('break-down', { body: request });
  if (!error && data) return data;
  if (error instanceof FunctionsHttpError) {
    try {
      return (await error.context.json()) as BreakdownResponse;
    } catch {
      // Fall through to the generic message.
    }
  }
  return { ok: false, error: 'Couldn’t reach Daybook’s server — check the connection and try again.' };
}
