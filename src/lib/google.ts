import { FunctionsHttpError, type Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * "Continue with Google": Supabase's Google sign-in, also asking for Google Calendar access so the
 * google-calendar Edge Function can mirror calendars. Google only hands out the long-lived calendar
 * token with access_type=offline + prompt=consent, and only in the session right after sign-in, so
 * it's passed to the function then (and kept there, not on the device).
 */
const SCOPES = 'https://www.googleapis.com/auth/calendar';
const QUERY = { access_type: 'offline', prompt: 'consent' };

export type GoogleResult = { ok: true } | { ok: false; error: string } | { ok: false; cancelled: true };

const redirectUrl = () =>
  Platform.OS === 'web' ? `${window.location.origin}/auth-callback` : Linking.createURL('auth-callback');

/** Signs in (or up) with Google. On the web the page goes to Google and comes back to /auth-callback. */
export async function signInWithGoogle(): Promise<GoogleResult> {
  if (!supabase) return { ok: false, error: 'Accounts aren’t set up in this build.' };
  const redirectTo = redirectUrl();

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, scopes: SCOPES, queryParams: QUERY },
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, scopes: SCOPES, queryParams: QUERY, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { ok: false, error: error?.message ?? 'Couldn’t start Google sign-in.' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return { ok: false, cancelled: true };
  return completeGoogleSignIn(result.url);
}

/** Finishes sign-in from the URL Google sent back to (…/auth-callback?code=…). */
export async function completeGoogleSignIn(url: string): Promise<GoogleResult> {
  if (!supabase) return { ok: false, error: 'Accounts aren’t set up in this build.' };
  const params = new URL(url).searchParams;
  const problem = params.get('error_description') ?? params.get('error');
  if (problem) return { ok: false, error: problem };
  const code = params.get('code');
  if (!code) return { ok: false, error: 'Google didn’t send a sign-in code. Please try again.' };

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return { ok: false, error: error.message };
  return connectCalendar(data.session);
}

/** Hands Google's calendar token to the server, so Google Calendar can be linked from Settings. */
async function connectCalendar(session: Session | null): Promise<GoogleResult> {
  const refreshToken = session?.provider_refresh_token;
  if (!refreshToken) return { ok: true }; // Signed in; calendar access can be granted again later.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const response = await callGoogle<{ ok: true }>('connect', { refreshToken, timeZone });
  return response.ok ? { ok: true } : { ok: false, error: response.error };
}

// ---- The google-calendar function -------------------------------------------------------------

export type GoogleCalendar = {
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
  readOnly: boolean;
  linkedCalendarId: string | null;
};
export type GoogleStatus = { connected: boolean; email: string | null; linked: { calendarId: string; googleCalendarId: string }[] };
type Failure = { ok: false; error: string; reconnect?: boolean };

/** Calls the google-calendar Edge Function with the signed-in user's token. */
export async function callGoogle<T extends object>(
  action: string,
  extra: Record<string, unknown> = {}
): Promise<({ ok: true } & T) | Failure> {
  if (!supabase) return { ok: false, error: 'Accounts aren’t set up in this build.' };
  const { data, error } = await supabase.functions.invoke('google-calendar', { body: { action, ...extra } });
  if (!error && data) return data;
  if (error instanceof FunctionsHttpError) {
    try {
      return (await error.context.json()) as Failure;
    } catch {
      return { ok: false, error: `Google Calendar answered oddly (HTTP ${error.context.status}).` };
    }
  }
  return { ok: false, error: 'Couldn’t reach Google Calendar sync. Check your connection and try again.' };
}

export const googleStatus = () => callGoogle<GoogleStatus>('status');
export const googleCalendars = () => callGoogle<{ calendars: GoogleCalendar[] }>('calendars');
export const linkGoogleCalendar = (googleCalendarId: string) => callGoogle<{ changed: number }>('link', { googleCalendarId });
export const unlinkGoogleCalendar = (calendarId: string) => callGoogle('unlink', { calendarId });
export const syncGoogle = () => callGoogle<{ changed: number; connected: boolean }>('sync');
export const disconnectGoogle = () => callGoogle('disconnect');
