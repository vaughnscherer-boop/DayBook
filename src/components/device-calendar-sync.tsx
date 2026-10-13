import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { notifyDataChanged, onLocalChange } from '@/lib/data-events';
import { deviceCalendarsAvailable, mirrorDeviceCalendars } from '@/lib/device-calendars';
import { rescheduleAll } from '@/lib/notifications';

const SETTLE_MS = 1500;

/**
 * Keeps linked iPhone calendars and Daybook in step: on launch, when the app comes back to the
 * foreground (you may have edited in Apple Calendar), and shortly after anything changes in Daybook.
 */
export function DeviceCalendarSync() {
  const db = useSQLiteContext();

  useEffect(() => {
    if (!deviceCalendarsAvailable) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const changed = await mirrorDeviceCalendars(db);
      if (changed > 0) {
        notifyDataChanged();
        rescheduleAll(db);
      }
    };
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(run, SETTLE_MS);
    };

    run();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') soon();
    });
    const stop = onLocalChange(soon);
    return () => {
      clearTimeout(timer);
      appState.remove();
      stop();
    };
  }, [db]);

  return null;
}
