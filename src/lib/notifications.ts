import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { listCalendars } from '@/db/calendars';
import { listEvents } from '@/db/events';
import { getSettings } from '@/db/settings';
import { listCompletions, listTasks } from '@/db/tasks';
import { buildItems, itemsOnDay, type CalendarItem } from '@/lib/calendar-items';
import { addDays, formatTime, toDateKey } from '@/lib/dates';

// Morning summaries are one-off notifications with that day's events baked in,
// so we keep two weeks queued and refresh them whenever anything changes.
const MORNING_DAYS_AHEAD = 14;

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Daily reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

// Scheduled local notifications only exist on the phone.
export const notificationsSupported = Platform.OS !== 'web';

export async function hasPermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Asks for permission if it hasn't been decided yet. Returns whether notifications are allowed. */
export async function ensurePermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function nightContent(): Notifications.NotificationContentInput {
  return {
    title: "What's on for tomorrow?",
    body: 'Tap to add anything you need to do tomorrow.',
    data: { url: '/?add=tomorrow' },
  };
}

function morningContent(day: string, items: CalendarItem[]): Notifications.NotificationContentInput {
  const events = items.filter((item) => item.kind === 'event');
  const openTasks = items.filter((item) => item.kind === 'task' && !item.done);
  const lines = [
    ...events.map((event) =>
      event.allDay ? `All day · ${event.title}` : `${formatTime(event.startsAt!)} · ${event.title}`
    ),
    ...openTasks.map((task) =>
      task.time ? `☐ ${formatTime(`${day}T${task.time}`)} · ${task.title}` : `☐ ${task.title}`
    ),
  ];
  return {
    title:
      lines.length === 0
        ? 'Good morning'
        : `Good morning — ${lines.length} thing${lines.length === 1 ? '' : 's'} today`,
    body: lines.length > 0 ? lines.join('\n') : 'Nothing on the calendar today.',
    data: { url: `/?date=${day}` },
  };
}

/** Every event and task (repeats expanded, hidden calendars included) for the given dates. */
async function loadItems(db: SQLiteDatabase, start: string, end: string): Promise<CalendarItem[]> {
  const [events, tasks, completions, calendars] = await Promise.all([
    listEvents(db),
    listTasks(db),
    listCompletions(db),
    listCalendars(db),
  ]);
  return buildItems(events, tasks, completions, calendars, start, end, { includeHidden: true });
}

let queue = Promise.resolve();

/**
 * Cancels and re-creates every scheduled notification from the current settings and events.
 * Calls are queued so overlapping triggers (launch, foreground, edits) can't double-schedule.
 */
export function rescheduleAll(db: SQLiteDatabase): Promise<void> {
  queue = queue.then(() => rescheduleNow(db)).catch((error) => console.warn('Reschedule failed', error));
  return queue;
}

async function rescheduleNow(db: SQLiteDatabase) {
  if (!(await hasPermission())) return;

  await Notifications.cancelAllScheduledNotificationsAsync();
  const settings = await getSettings(db);

  if (settings.nightEnabled) {
    const [hour, minute] = settings.nightTime.split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
      content: nightContent(),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  }

  if (settings.morningEnabled) {
    const [hour, minute] = settings.morningTime.split(':').map(Number);
    const now = new Date();
    const items = await loadItems(db, toDateKey(now), toDateKey(addDays(now, MORNING_DAYS_AHEAD)));
    for (let i = 0; i <= MORNING_DAYS_AHEAD; i++) {
      const date = addDays(now, i);
      date.setHours(hour, minute, 0, 0);
      if (date <= now) continue;
      const day = toDateKey(date);
      await Notifications.scheduleNotificationAsync({
        content: morningContent(day, itemsOnDay(items, day)),
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
      });
    }
  }
}

/** Sends the morning or night notification 5 seconds from now, for trying it out. */
export async function sendTestNotification(db: SQLiteDatabase, kind: 'morning' | 'night') {
  if (!(await ensurePermission())) return false;
  const today = toDateKey(new Date());
  await Notifications.scheduleNotificationAsync({
    content:
      kind === 'night'
        ? nightContent()
        : morningContent(today, itemsOnDay(await loadItems(db, today, today), today)),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
  });
  return true;
}
