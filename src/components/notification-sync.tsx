import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { onDataChanged } from '@/lib/data-events';
import { handleReminderAction } from '@/lib/reminder-actions';
import {
  configureNotifications,
  ensurePermission,
  notificationsSupported,
  rescheduleAll,
} from '@/lib/notifications';

if (notificationsSupported) configureNotifications();

function openFromNotification(notification: Notifications.Notification) {
  const url = notification.request.content.data?.url;
  if (typeof url === 'string') router.navigate(url as Href);
}

/**
 * Keeps scheduled reminders in sync with the calendar (on launch, whenever the app comes back to
 * the foreground, and when sync brings in changes, such as reminder times set on the computer) and
 * opens the right screen when a reminder is tapped.
 */
export function NotificationSync() {
  const db = useSQLiteContext();

  useEffect(() => {
    if (!notificationsSupported) return;

    ensurePermission().then(() => rescheduleAll(db));
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') rescheduleAll(db);
    });
    const stopSync = onDataChanged(() => rescheduleAll(db));

    // Done / Snooze / Tomorrow act on the task; a plain tap opens it.
    const respond = async (response: Notifications.NotificationResponse) => {
      if (!(await handleReminderAction(db, response))) openFromNotification(response.notification);
    };
    // A tap that launched the app from closed, then any taps while it's running.
    const launchResponse = Notifications.getLastNotificationResponse();
    if (launchResponse) {
      respond(launchResponse);
      Notifications.clearLastNotificationResponse();
    }
    const taps = Notifications.addNotificationResponseReceivedListener(respond);

    return () => {
      appState.remove();
      stopSync();
      taps.remove();
    };
  }, [db]);

  return null;
}
