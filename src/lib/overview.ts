import { itemsOnDay, type CalendarItem } from '@/lib/calendar-items';
import { shiftKey } from '@/lib/dates';

export type TaskFilter = 'open' | 'due' | 'tests' | 'overdue';
export type OverviewRange = 'week' | 'twoWeeks' | 'month';

export const RANGES: { value: OverviewRange; label: string; days: number }[] = [
  { value: 'week', label: 'This week', days: 7 },
  { value: 'twoWeeks', label: 'Next 2 weeks', days: 14 },
  { value: 'month', label: 'This month', days: 30 },
];

export const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'open', label: 'All open' },
  { value: 'due', label: 'Due soon' },
  { value: 'tests', label: 'Tests' },
  { value: 'overdue', label: 'Overdue' },
];

/** How far back an unfinished task still counts as open/overdue. */
const LOOKBACK_DAYS = 60;

export const rangeDays = (range: OverviewRange) => RANGES.find((r) => r.value === range)!.days;

/** First and last day to load so every filter has what it needs. */
export function loadRange(today: string, days: number): [string, string] {
  return [shiftKey(today, -LOOKBACK_DAYS), shiftKey(today, days - 1)];
}

/** The items a filter shows, soonest first. `days` is the look-ahead from today. */
export function filterItems(items: CalendarItem[], filter: TaskFilter, today: string, days: number): CalendarItem[] {
  const end = shiftKey(today, days - 1);
  const ahead = (item: CalendarItem) => item.startDay >= today && item.startDay <= end;
  const unfinishedTask = (item: CalendarItem) => item.kind === 'task' && !item.done;
  const picked = items.filter((item) => {
    switch (filter) {
      case 'open':
        return unfinishedTask(item) && item.startDay <= end;
      case 'due':
        return !item.done && ahead(item) && (item.kind === 'task' || item.itemType === 'assignment');
      case 'tests':
        return item.itemType === 'exam' && ahead(item);
      case 'overdue':
        return unfinishedTask(item) && item.startDay < today;
    }
  });
  return picked.sort(
    (a, b) => a.startDay.localeCompare(b.startDay) || (a.time ?? '').localeCompare(b.time ?? '')
  );
}

/** Everything on today's calendar. */
export const todayItems = (items: CalendarItem[], today: string) => itemsOnDay(items, today);

/** Seven bars for a sparkline: how many of `matches` fall in each slice of the next `days` days. */
export function sparkline(matches: CalendarItem[], today: string, days: number): number[] {
  const bars = Array.from({ length: 7 }, () => 0);
  for (const item of matches) {
    const offset = Math.round((Date.parse(item.startDay) - Date.parse(today)) / 86_400_000);
    if (offset < 0 || offset >= days) continue;
    bars[Math.min(6, Math.floor((offset / days) * 7))] += 1;
  }
  return bars;
}
