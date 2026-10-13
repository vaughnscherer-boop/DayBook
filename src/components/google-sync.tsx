import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { onLocalChange } from '@/lib/data-events';
import { syncGoogle } from '@/lib/google';
import { supabase } from '@/lib/supabase';
import { syncNow } from '@/lib/sync';

/** Wait this long after a trigger, so a burst of edits makes one round trip. */
const SETTLE_MS = 3_000;
/** And at most one Google round trip this often. */
const MIN_GAP_MS = 20_000;

/**
 * Keeps linked Google calendars current: when the app opens or comes back into view, and shortly
 * after anything changes here. Each round sends this device's edits first, asks the server to mirror
 * Google both ways, then pulls whatever it changed. Without a Google connection the server answers
 * right away and nothing happens.
 */
export function GoogleSync() {
  const db = useSQLiteContext();

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;
    let running = false;

    const run = async () => {
      if (running || Date.now() - last < MIN_GAP_MS) return;
      const { data } = await client.auth.getSession();
      if (!data.session) return;
      running = true;
      last = Date.now();
      try {
        await syncNow(db);
        const result = await syncGoogle();
        if (result.ok && result.changed > 0) await syncNow(db);
      } finally {
        running = false;
      }
    };
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(run, SETTLE_MS);
    };

    soon();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') soon();
    });
    const stopLocal = onLocalChange(soon);
    const { data: auth } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') soon();
    });
    const onFocus = () => soon();
    if (Platform.OS === 'web') window.addEventListener('focus', onFocus);

    return () => {
      clearTimeout(timer);
      appState.remove();
      stopLocal();
      auth.subscription.unsubscribe();
      if (Platform.OS === 'web') window.removeEventListener('focus', onFocus);
    };
  }, [db]);

  return null;
}
