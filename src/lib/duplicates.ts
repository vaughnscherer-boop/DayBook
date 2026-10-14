import type { CalendarItem } from '@/lib/calendar-items';

/** "Lab Report 3" and "lab report 3." read the same. */
const normalized = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * The redundant copies in a list: items with the same title on the same day in the same class
 * (two imports, or an import and a school-site feed, both adding "Homework 3"). One of each set
 * stays: the finished one, else the one with a description or score, else the first.
 */
export function redundantItems(items: CalendarItem[]): CalendarItem[] {
  const sets = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = `${item.kind}|${item.groupId ?? ''}|${item.startDay}|${normalized(item.title)}`;
    sets.set(key, [...(sets.get(key) ?? []), item]);
  }
  const worth = (item: CalendarItem) => (item.done ? 2 : 0) + (item.details ? 1 : 0);
  return [...sets.values()].flatMap((set) => {
    if (set.length < 2) return [];
    const keep = set.reduce((best, item) => (worth(item) > worth(best) ? item : best));
    return set.filter((item) => item !== keep);
  });
}
