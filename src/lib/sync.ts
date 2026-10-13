import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { notifyDataChanged } from '@/lib/data-events';
import { rescheduleAll } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { syncWith, type CloudRecord, type Remote, type RunTransaction } from '@/lib/sync-engine';

export type SyncStatus =
  | { state: 'unconfigured' } // no Supabase keys in .env.local
  | { state: 'signedOut' }
  | { state: 'syncing'; email: string; lastSyncedAt: string | null }
  | { state: 'synced'; email: string; lastSyncedAt: string }
  | { state: 'error'; email: string; lastSyncedAt: string | null; message: string };

// ---- Status, for the Account section --------------------------------------------------------

let status: SyncStatus = supabase ? { state: 'signedOut' } : { state: 'unconfigured' };
const statusListeners = new Set<() => void>();

function setStatus(next: SyncStatus) {
  status = next;
  for (const listener of statusListeners) listener();
}
export const getSyncStatus = () => status;
export function subscribeSyncStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}
const lastSynced = () => ('lastSyncedAt' in status ? status.lastSyncedAt : null);

// ---- The cloud: the `records` table in supabase/schema.sql -----------------------------------

const FIELDS = 'tbl, id, data, deleted, changed_at, rev, synced_at';

function supabaseRemote(userId: string): Remote {
  const records = () => supabase!.from('records');
  return {
    async push(rows) {
      const { data, error } = await records()
        .upsert(rows.map((row) => ({ ...row, user_id: userId })), { onConflict: 'user_id,tbl,id' })
        .select('tbl, id');
      if (error) throw error;
      return data;
    },
    async fetch(keys) {
      const found: CloudRecord[] = [];
      const byTable = new Map<string, { tbl: string; id: string }[]>();
      for (const key of keys) byTable.set(key.tbl, [...(byTable.get(key.tbl) ?? []), key]);
      for (const [tbl, group] of byTable) {
        // Chunked so the id list fits in a URL.
        for (let i = 0; i < group.length; i += 100) {
          const ids = group.slice(i, i + 100).map((key) => key.id);
          const { data, error } = await records().select(FIELDS).eq('user_id', userId).eq('tbl', tbl).in('id', ids);
          if (error) throw error;
          found.push(...(data as CloudRecord[]));
        }
      }
      return found;
    },
    async pull(afterRev, limit) {
      const { data, error } = await records()
        .select(FIELDS)
        .eq('user_id', userId)
        .gt('rev', afterRev)
        .order('rev')
        .limit(limit);
      if (error) throw error;
      return data as CloudRecord[];
    },
  };
}

/** On the phone, a transaction that other queries can't slip into (so their changes still get noted). */
function transactionFor(db: SQLiteDatabase): RunTransaction {
  if (Platform.OS === 'web') return (task) => db.withTransactionAsync(() => task(db));
  return (task) => db.withExclusiveTransactionAsync((txn) => task(txn));
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
  if (/fetch|network|offline|load failed/i.test(message)) return 'Offline — will sync when you’re back online.';
  if (/JWT|token|session/i.test(message)) return 'Your sign-in expired — sign in again.';
  if (/relation .*records.* does not exist|schema cache/i.test(message)) {
    return 'The Supabase project isn’t set up yet — run supabase/schema.sql in its SQL editor.';
  }
  return `Couldn’t sync: ${message}`;
}

// ---- Syncing ----------------------------------------------------------------------------------

let running: Promise<void> | null = null;
let again = false;

/**
 * Syncs now if signed in. Calls made while a sync is running are folded into one more run after it,
 * so nothing is missed and two syncs never overlap.
 */
export function syncNow(db: SQLiteDatabase): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce(db);
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function syncOnce(db: SQLiteDatabase) {
  if (!supabase) return setStatus({ state: 'unconfigured' });
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return setStatus({ state: 'signedOut' });
  const email = user.email ?? 'your account';

  setStatus({ state: 'syncing', email, lastSyncedAt: lastSynced() });
  try {
    const changed = await syncWith(db, supabaseRemote(user.id), user.id, transactionFor(db));
    if (changed > 0) {
      notifyDataChanged();
      rescheduleAll(db);
    }
    setStatus({ state: 'synced', email, lastSyncedAt: new Date().toISOString() });
  } catch (error) {
    console.warn('Sync failed', error);
    setStatus({ state: 'error', email, lastSyncedAt: lastSynced(), message: friendlyError(error) });
  }
}

export function markSignedOut() {
  setStatus(supabase ? { state: 'signedOut' } : { state: 'unconfigured' });
}
