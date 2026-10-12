import { addDays, fromKey, toDateKey } from '@/lib/dates';

export type RepeatFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** How an event or task repeats. Weekly rules list weekdays (0 = Sunday … 6 = Saturday). */
export type RepeatRule = {
  freq: RepeatFreq;
  interval: number;
  weekdays?: number[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_STEPS = 2000;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const daysBetween = (from: string, to: string) => Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / DAY_MS);
const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

export function parseRule(json: string | null): RepeatRule | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as RepeatRule;
  } catch {
    return null;
  }
}

function weekdaysOf(rule: RepeatRule, startDay: string) {
  return rule.weekdays?.length ? [...rule.weekdays].sort() : [fromKey(startDay).getDay()];
}

/**
 * Dates ('YYYY-MM-DD') a series starting on `startDay` occurs between rangeStart and rangeEnd
 * (inclusive). `spanDays` is how many extra days each occurrence lasts (multi-day events), so an
 * occurrence that starts before the range but runs into it is included.
 */
export function occurrences(
  startDay: string,
  rule: RepeatRule,
  until: string | null,
  exceptions: string[],
  rangeStart: string,
  rangeEnd: string,
  spanDays = 0
): string[] {
  const last = until && until < rangeEnd ? until : rangeEnd;
  const skip = new Set(exceptions);
  const result: string[] = [];
  const consider = (day: string) => {
    if (day < startDay || day > last || skip.has(day)) return;
    if (daysBetween(day, rangeStart) <= spanDays) result.push(day);
  };

  const start = fromKey(startDay);
  const interval = Math.max(1, rule.interval);
  // Jump close to the range instead of walking from the series start.
  const gap = Math.max(0, daysBetween(startDay, rangeStart) - spanDays);

  if (rule.freq === 'daily') {
    for (let n = Math.floor(gap / interval), i = 0; i < MAX_STEPS; n++, i++) {
      const day = toDateKey(addDays(start, n * interval));
      if (day > last) break;
      consider(day);
    }
  } else if (rule.freq === 'weekly') {
    const weekdays = weekdaysOf(rule, startDay);
    const firstWeek = addDays(start, -start.getDay());
    for (let n = Math.floor(gap / (7 * interval)), i = 0; i < MAX_STEPS; n++, i++) {
      const weekStart = addDays(firstWeek, n * 7 * interval);
      if (toDateKey(weekStart) > last) break;
      for (const weekday of weekdays) consider(toDateKey(addDays(weekStart, weekday)));
    }
  } else if (rule.freq === 'monthly') {
    const dayOfMonth = start.getDate();
    for (let n = Math.max(0, Math.floor(gap / 31 / interval) - 1) * interval, i = 0; i < MAX_STEPS; n += interval, i++) {
      const year = start.getFullYear() + Math.floor((start.getMonth() + n) / 12);
      const month = (start.getMonth() + n) % 12;
      if (toDateKey(new Date(year, month, 1)) > last) break;
      if (dayOfMonth <= daysInMonth(year, month)) consider(toDateKey(new Date(year, month, dayOfMonth)));
    }
  } else {
    for (let n = Math.max(0, Math.floor(gap / 366 / interval) - 1) * interval, i = 0; i < MAX_STEPS; n += interval, i++) {
      const year = start.getFullYear() + n;
      if (toDateKey(new Date(year, 0, 1)) > last) break;
      // Feb 29 only exists in leap years.
      if (start.getDate() <= daysInMonth(year, start.getMonth())) {
        consider(toDateKey(new Date(year, start.getMonth(), start.getDate())));
      }
    }
  }
  return result;
}

/** First date on or after `fromDay` that matches the rule's weekdays (weekly) — otherwise `fromDay`. */
export function firstMatchingDay(rule: RepeatRule, fromDay: string): string {
  if (rule.freq !== 'weekly' || !rule.weekdays?.length) return fromDay;
  const from = fromKey(fromDay);
  for (let i = 0; i < 7; i++) {
    const day = addDays(from, i);
    if (rule.weekdays.includes(day.getDay())) return toDateKey(day);
  }
  return fromDay;
}

const ordinal = (n: number) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
};

/** "Every Monday", "Every weekday", "Every 2 weeks on Mon, Wed", "Monthly on the 1st"… */
export function describeRule(rule: RepeatRule, startDay: string): string {
  const start = fromKey(startDay);
  const every = rule.interval > 1;
  switch (rule.freq) {
    case 'daily':
      return every ? `Every ${rule.interval} days` : 'Every day';
    case 'weekly': {
      const weekdays = weekdaysOf(rule, startDay);
      if (!every && weekdays.join() === '1,2,3,4,5') return 'Every weekday';
      if (!every && weekdays.join() === '0,6') return 'Every weekend';
      const names = weekdays.map((d) => WEEKDAY_NAMES[d]);
      if (every) return `Every ${rule.interval} weeks on ${names.map((n) => n.slice(0, 3)).join(', ')}`;
      return weekdays.length === 1 ? `Every ${names[0]}` : `Every ${names.map((n) => n.slice(0, 3)).join(', ')}`;
    }
    case 'monthly':
      return `${every ? `Every ${rule.interval} months` : 'Monthly'} on the ${ordinal(start.getDate())}`;
    case 'yearly':
      return `${every ? `Every ${rule.interval} years` : 'Yearly'} on ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
}
