import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { listCalendars } from '@/db/calendars';
import { listEvents } from '@/db/events';
import { getSettings, setSetting } from '@/db/settings';
import { listCompletions, listTasks } from '@/db/tasks';
import { buildItems, itemsOnDay, type CalendarItem } from '@/lib/calendar-items';
import { addDays, formatTime, shiftKey, toDateKey } from '@/lib/dates';
import { badgeCount, loadRange } from '@/lib/overview';
import { reminderDate, remindersFor, reminderText } from '@/lib/reminders';

// Morning summaries are one-off notifications with that day's events baked in,
// so we keep two weeks queued and refresh them whenever anything changes.
const MORNING_DAYS_AHEAD = 14;
/** iOS keeps at most 64 pending notifications; this leaves room for the morning and night ones. */
const MAX_ITEM_REMINDERS = 40;
export const TASK_CATEGORY = 'task';

/** What a task reminder carries, so its buttons know which task (and which date of a repeating one). */
export type ReminderData = { url: string; taskId?: string; date?: string; repeating?: boolean };

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Buttons on task reminders. They open the app (iOS only runs app code for a button when it's open)
  // and NotificationSync does the rest.
  Notifications.setNotificationCategoryAsync(TASK_CATEGORY, [
    { identifier: 'done', buttonTitle: 'Done', options: { opensAppToForeground: true } },
    { identifier: 'snooze', buttonTitle: 'Snooze 1 hour', options: { opensAppToForeground: true } },
    { identifier: 'tomorrow', buttonTitle: 'Tomorrow', options: { opensAppToForeground: true } },
  ]).catch(() => {});

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

function weekReviewContent(): Notifications.NotificationContentInput {
  return {
    title: 'Week review',
    body: 'See what you got done, move what slipped, and get ready for next week.',
    data: { url: '/tomorrow?review=1' },
  };
}

function nightContent(): Notifications.NotificationContentInput {
  return {
    title: 'New tasks coming up?',
    body: 'Tap to jot down what’s coming — tomorrow or later this week — and Daybook puts it on your calendar.',
    data: { url: '/tomorrow?focus=1' },
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
    data: { url: `/today?date=${day}` },
  };
}

/** Every event and task (repeats expanded, hidden calendars included) for the given dates. */
async function loadItems(db: SQLiteDatabase, start: string, end: string, includeHidden = true): Promise<CalendarItem[]> {
  const [events, tasks, completions, calendars] = await Promise.all([
    listEvents(db),
    listTasks(db),
    listCompletions(db),
    listCalendars(db),
  ]);
  return buildItems(events, tasks, completions, calendars, start, end, { includeHidden });
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

  // The app icon shows what's overdue or due today, counted like Home's lists (hidden calendars left out).
  const today = toDateKey(new Date());
  const [start] = loadRange(today, 1);
  const badgeItems = await loadItems(db, start, shiftKey(today, MORNING_DAYS_AHEAD), false);
  await Notifications.setBadgeCountAsync(badgeCount(badgeItems, today));

  if (settings.nightEnabled) {
    // One per weekday, so Sunday's can be the week review instead of the usual check-in.
    const [hour, minute] = settings.nightTime.split(':').map(Number);
    for (let weekday = 1; weekday <= 7; weekday++) {
      await Notifications.scheduleNotificationAsync({
        content: weekday === 1 ? weekReviewContent() : nightContent(),
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute },
      });
    }
  }

  // Reminders for each item over the next two weeks, soonest first, skipping ticked-off tasks.
  {
    const now = new Date();
    const upcoming: { date: Date; content: Notifications.NotificationContentInput }[] = [];
    for (const item of badgeItems) {
      if (item.startDay < today || (item.kind === 'task' && item.done)) continue;
      for (const token of remindersFor(item, item.reminders, settings.defaultReminders)) {
        const date = reminderDate(item, token);
        if (!date || date <= now) continue;
        const data: ReminderData = {
          url: item.kind === 'task' ? `/task/${item.id}?date=${item.occurrenceDate}` : `/event/${item.id}?date=${item.occurrenceDate}`,
          ...(item.kind === 'task' && { taskId: item.id, date: item.occurrenceDate, repeating: item.repeating }),
        };
        upcoming.push({
          date,
          content: {
            ...reminderText(item, token),
            data,
            ...(item.kind === 'task' && { categoryIdentifier: TASK_CATEGORY }),
          },
        });
      }
    }
    upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
    for (const { date, content } of upcoming.slice(0, MAX_ITEM_REMINDERS)) {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
      });
    }
  }

  // Snoozed reminders (from the notification's Snooze button) that haven't come due yet.
  const pending = settings.snoozed.filter((s) => new Date(s.at) > new Date());
  if (pending.length !== settings.snoozed.length) await setSetting(db, 'snoozed', pending);
  for (const snooze of pending) {
    await Notifications.scheduleNotificationAsync({
      content: { title: snooze.title, body: snooze.body, data: snooze.data, categoryIdentifier: TASK_CATEGORY },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(snooze.at) },
    });
  }

  // A running focus timer's "time's up".
  if (settings.focus && new Date(settings.focus.endsAt) > new Date()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time’s up',
        body: `${settings.focus.title} — take a 5-minute break, or keep going.`,
        data: { url: `/focus/${settings.focus.taskId}` },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(settings.focus.endsAt) },
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
        // Each morning's notification also brings the icon's number up to date for that day.
        content: { ...morningContent(day, itemsOnDay(items, day)), badge: badgeCount(badgeItems, day) },
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
