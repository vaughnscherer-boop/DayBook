import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { markSignedOut, syncNow } from '@/lib/sync';
import { pendingCount } from '@/lib/sync-engine';

// A local count query, so checking often is cheap; changes reach other devices within seconds.
const CHECK_EVERY_MS = 3_000;

/**
 * Keeps this device in sync with your account: on launch and sign-in, when the app comes back to
 * the foreground or back online, every few seconds while there are unsent changes, and right away
 * when another device changes something (Supabase Realtime).
 */
export function SyncProvider() {
  const db = useSQLiteContext();

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let channel: ReturnType<typeof client.channel> | null = null;
    let pullSoon: ReturnType<typeof setTimeout> | undefined;
    let signedIn = false;

    const listen = (userId: string | null) => {
      signedIn = userId !== null;
      if (channel) client.removeChannel(channel);
      channel = null;
      if (!userId) return;
      channel = client
        .channel(`records:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` }, () => {
          // A burst of changes (an import) arrives as many pings: sync once after it.
          clearTimeout(pullSoon);
          pullSoon = setTimeout(() => syncNow(db), 500);
        })
        .subscribe();
    };

    const { data: auth } = client.auth.onAuthStateChange((event, session) => {
      // Supabase asks not to await other calls inside this callback.
      setTimeout(() => {
        if (event === 'SIGNED_OUT' || !session) {
          listen(null);
          markSignedOut();
          return;
        }
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          listen(session.user.id);
          syncNow(db);
        }
      }, 0);
    });

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNow(db);
    });
    const timer = setInterval(async () => {
      if (signedIn && (await pendingCount(db)) > 0) syncNow(db);
    }, CHECK_EVERY_MS);
    const online = () => syncNow(db);
    if (Platform.OS === 'web') window.addEventListener('online', online);

    return () => {
      auth.subscription.unsubscribe();
      appState.remove();
      clearInterval(timer);
      clearTimeout(pullSoon);
      if (Platform.OS === 'web') window.removeEventListener('online', online);
      if (channel) client.removeChannel(channel);
    };
  }, [db]);

  return null;
}
