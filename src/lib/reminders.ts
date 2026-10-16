import type { CalendarItem } from '@/lib/calendar-items';
import { formatShortTime, fromKey, shiftKey } from '@/lib/dates';

/**
 * When to be reminded about an item. Timed items count back from their start; all-day items (and
 * tasks without a time) use times of day around their date. Stored per item as a JSON array.
 */
export type ReminderToken = 'at' | '15m' | '1h' | '3h' | '1d' | 'morning' | 'evening' | 'eve-before';

export const TIMED_REMINDERS: { token: ReminderToken; label: string }[] = [
  { token: 'at', label: 'At the time' },
  { token: '15m', label: '15 min before' },
  { token: '1h', label: '1 hour before' },
  { token: '3h', label: '3 hours before' },
  { token: 'eve-before', label: 'Evening before' },
  { token: '1d', label: '1 day before' },
];

export const ALL_DAY_REMINDERS: { token: ReminderToken; label: string }[] = [
  { token: 'morning', label: 'Morning of' },
  { token: 'evening', label: 'Evening of' },
  { token: 'eve-before', label: 'Evening before' },
];

const MORNING = '09:00';
const EVENING = '20:00';
const MINUTES: Partial<Record<ReminderToken, number>> = { at: 0, '15m': 15, '1h': 60, '3h': 180, '1d': 1440 };

type Remindable = Pick<CalendarItem, 'kind' | 'itemType' | 'allDay' | 'startDay' | 'time'>;

/** What an item gets when you haven't picked: tests the evening before and shortly before, homework once. */
export function defaultReminders(item: Remindable): ReminderToken[] {
  if (item.itemType === 'exam') return item.allDay ? ['eve-before', 'morning'] : ['eve-before', '1h'];
  if (item.kind === 'task') return item.allDay ? ['evening'] : ['3h'];
  return [];
}

/** The stored choice: null = use the defaults (also for anything unreadable). */
export function parseReminders(json: string | null | undefined): ReminderToken[] | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((token): token is ReminderToken => typeof token === 'string') : null;
  } catch {
    return null;
  }
}

/** The reminders that apply to an item: its own, or the defaults when it has none and they're on. */
export function remindersFor(item: Remindable, stored: string | null | undefined, defaultsOn: boolean): ReminderToken[] {
  return parseReminders(stored) ?? (defaultsOn ? defaultReminders(item) : []);
}

/** When a reminder goes off, or null when it doesn't apply to this kind of item. */
export function reminderDate(item: Remindable, token: ReminderToken): Date | null {
  const at = (day: string, time: string) => fromKey(`${day}T${time}`);
  if (token === 'eve-before') return at(shiftKey(item.startDay, -1), EVENING);
  if (item.allDay || !item.time) {
    if (token === 'morning') return at(item.startDay, MORNING);
    if (token === 'evening') return at(item.startDay, EVENING);
    return null;
  }
  const minutes = MINUTES[token];
  if (minutes === undefined) return null;
  return new Date(at(item.startDay, item.time).getTime() - minutes * 60_000);
}

/** The notification's words: "Latin quiz in 1 hour", "Essay is due tonight"… */
export function reminderText(item: Pick<CalendarItem, 'kind' | 'itemType' | 'title' | 'time' | 'allDay'>, token: ReminderToken) {
  const verb = item.itemType === 'exam' ? 'Test' : item.kind === 'task' ? 'Due' : 'Starts';
  const when = item.time && !item.allDay ? formatShortTime(item.time) : null;
  const lead: Record<ReminderToken, string> = {
    at: 'now',
    '15m': 'in 15 minutes',
    '1h': 'in 1 hour',
    '3h': 'in 3 hours',
    '1d': 'tomorrow',
    morning: 'today',
    evening: item.kind === 'task' ? 'tonight — not ticked off yet' : 'tonight',
    'eve-before': 'tomorrow',
  };
  return { title: item.title, body: `${verb} ${lead[token]}${when && token !== 'at' ? ` · ${when}` : ''}` };
}
