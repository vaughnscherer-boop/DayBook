import type { CalendarItem } from '@/lib/calendar-items';
import { freeGapsOn } from '@/lib/day-brief';
import { shiftKey, toDateTimeKey } from '@/lib/dates';

/** What a task without an estimate is counted as. */
export const DEFAULT_TASK_MINUTES = 30;

export type DayLoad = { day: string; dueMinutes: number; freeMinutes: number; tasks: number; overloaded: boolean };

const span = (start: string, end: string) =>
  Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5)) - (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)));

/**
 * The next `days` days: minutes of open work due each day (estimates, or a default) against the free
 * time in your day's hours. A day is overloaded when the work doesn't fit. Pure, like day-brief.ts.
 */
export function weekLoad(items: CalendarItem[], today: string, now = new Date(), days = 7): DayLoad[] {
  const nowTime = toDateTimeKey(now).slice(11, 16);
  return Array.from({ length: days }, (_, i) => {
    const day = shiftKey(today, i);
    // Today also carries what's overdue (not work imported after it was due).
    const due = items.filter(
      (item) =>
        item.kind === 'task' &&
        !item.done &&
        (item.startDay === day || (i === 0 && item.startDay < day && item.createdDay <= item.startDay))
    );
    const dueMinutes = due.reduce((sum, item) => sum + (item.minutes ?? DEFAULT_TASK_MINUTES), 0);
    const freeMinutes = freeGapsOn(items, day, i === 0 ? nowTime : undefined, 15).reduce(
      (sum, gap) => sum + span(gap.start, gap.end),
      0
    );
    return { day, dueMinutes, freeMinutes, tasks: due.length, overloaded: dueMinutes > 0 && dueMinutes > freeMinutes };
  });
}
