import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

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
 * Keeps scheduled reminders in sync with the calendar (on launch and whenever the app
 * comes back to the foreground) and opens the right screen when a reminder is tapped.
 */
export function NotificationSync() {
  const db = useSQLiteContext();

  useEffect(() => {
    if (!notificationsSupported) return;

    ensurePermission().then(() => rescheduleAll(db));
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') rescheduleAll(db);
    });

    // A tap that launched the app from closed, then any taps while it's running.
    const launchResponse = Notifications.getLastNotificationResponse();
    if (launchResponse) {
      openFromNotification(launchResponse.notification);
      Notifications.clearLastNotificationResponse();
    }
    const taps = Notifications.addNotificationResponseReceivedListener((response) =>
      openFromNotification(response.notification)
    );

    return () => {
      appState.remove();
      taps.remove();
    };
  }, [db]);

  return null;
}
