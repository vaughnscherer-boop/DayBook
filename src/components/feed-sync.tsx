import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { onDataChanged } from '@/lib/data-events';
import { refreshFeeds } from '@/lib/feed-sync';

/**
 * Keeps school-site feeds (Canvas, Moodle...) current: on launch, whenever the app comes back to the
 * foreground, and after sync brings in a feed from another device. Each feed refreshes at most every
 * few hours on its own.
 */
export function FeedSync() {
  const db = useSQLiteContext();

  useEffect(() => {
    // A moment after launch, so it doesn't compete with the first screen and sync.
    const first = setTimeout(() => refreshFeeds(db), 3000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshFeeds(db);
    });
    const stopSync = onDataChanged(() => refreshFeeds(db));
    return () => {
      clearTimeout(first);
      appState.remove();
      stopSync();
    };
  }, [db]);

  return null;
}
