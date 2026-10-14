import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { FeedResponse } from '@/lib/feed-format';
import { supabase } from '@/lib/supabase';

const DEV_PORT = 8787;

/** The local `npm run server` (same computer as the Expo dev server), for when Supabase isn't set up. */
function localServerUrl(): string {
  const host =
    Platform.OS === 'web' ? window.location.hostname : (Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost');
  return `http://${host}:${DEV_PORT}`;
}

async function viaServer(base: string, url: string): Promise<FeedResponse> {
  try {
    const response = await fetch(`${base}/api/feed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    return (await response.json()) as FeedResponse;
  } catch {
    return { ok: false, error: 'Couldn’t reach the server. Start it with “npm run server”.' };
  }
}

/**
 * Has the server download and read a school site's calendar link. Normally that's the hosted
 * `school-feed` function in Supabase (signed-in accounts only, works from anywhere);
 * EXPO_PUBLIC_IMPORT_API_URL (e.g. the local `npm run server`) overrides it while developing.
 */
export async function readFeedOnServer(url: string): Promise<FeedResponse> {
  if (process.env.EXPO_PUBLIC_IMPORT_API_URL) return viaServer(process.env.EXPO_PUBLIC_IMPORT_API_URL, url);
  if (!supabase) return viaServer(localServerUrl(), url);

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return { ok: false, error: 'Sign in first (Settings → Account): school sites use your Daybook account.' };
  const { data, error } = await supabase.functions.invoke<FeedResponse>('school-feed', { body: { url } });
  if (!error && data) return data;
  if (error instanceof FunctionsHttpError) {
    try {
      return (await error.context.json()) as FeedResponse;
    } catch {
      // Fall through to the generic message.
    }
  }
  if (error instanceof FunctionsFetchError) return { ok: false, error: 'Couldn’t reach Daybook’s server. Check the internet connection.' };
  return { ok: false, error: 'Couldn’t read that calendar. Please try again.' };
}
