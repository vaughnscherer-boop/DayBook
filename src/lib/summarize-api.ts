import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const DEV_PORT = 8787;
const FILLER = /^(i\s+(need|have|got|gotta|should|must|want)\s+to|need\s+to|have\s+to|gotta|remember\s+to|don'?t\s+forget\s+to)\b/i;

/** Short lines ("call mom") never hit the network; wordy ones ("I need to give back my…") do. */
export function needsShortening(title: string): boolean {
  return title.trim().split(/\s+/).length > 4 || FILLER.test(title.trim());
}

function localServerUrl(): string {
  const host =
    Platform.OS === 'web' ? window.location.hostname : (Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost');
  return `http://${host}:${DEV_PORT}`;
}

async function request(titles: string[]): Promise<string[] | null> {
  const base = process.env.EXPO_PUBLIC_IMPORT_API_URL ?? (supabase ? null : localServerUrl());
  if (base) {
    const response = await fetch(`${base}/api/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titles }),
    });
    const data = (await response.json()) as { ok: boolean; titles?: string[] };
    return data.ok && data.titles ? data.titles : null;
  }
  const { data: session } = await supabase!.auth.getSession();
  if (!session.session) return null;
  const { data, error } = await supabase!.functions.invoke<{ ok: boolean; titles?: string[] }>('summarize-titles', {
    body: { titles },
  });
  return !error && data?.ok && data.titles ? data.titles : null;
}

const cache = new Map<string, string>();

/**
 * Asks Claude for a short planner title for each wordy one. Anything that fails (signed out,
 * offline, server down) is silently skipped, so the title just stays as typed.
 */
export async function shortenTitles(titles: string[]): Promise<void> {
  const todo = [...new Set(titles)].filter((title) => !cache.has(title) && needsShortening(title));
  if (todo.length === 0) return;
  try {
    const short = await request(todo);
    if (short?.length === todo.length) todo.forEach((title, i) => cache.set(title, short[i]));
  } catch {
    // Offline or unreachable: keep the typed titles.
  }
}

/** The short version of a title if one has been fetched, else the title itself. */
export const shortTitle = (title: string): string => cache.get(title) ?? title;
