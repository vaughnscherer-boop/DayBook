/** Formats a Date as 'YYYY-MM-DD' using the phone's local time zone. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function tomorrowKey(): string {
  return toDateKey(addDays(new Date(), 1));
}

/** 'YYYY-MM-DD' -> e.g. 'Mon, Oct 13'. */
export function formatDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Formats a Date as 'YYYY-MM-DDTHH:MM' in local time. */
export function toDateTimeKey(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${toDateKey(date)}T${h}:${min}`;
}

/** 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' -> local Date. */
export function fromKey(key: string): Date {
  const [datePart, timePart = '00:00'] = key.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

/** 'YYYY-MM-DDTHH:MM' or Date -> e.g. '6:00 PM'. */
export function formatTime(value: string | Date): string {
  const date = typeof value === 'string' ? fromKey(value) : value;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** 'HH:MM' -> Date today at that time. */
export function timeToDate(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date;
}

/** Date -> 'HH:MM'. */
export function dateToTime(date: Date): string {
  return toDateTimeKey(date).slice(11);
}

export function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth() + months, 1);
  // Keep the day of month where possible (Jan 31 + 1 month -> Feb 28).
  const lastDay = new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate();
  copy.setDate(Math.min(date.getDate(), lastDay));
  return copy;
}

/** Sunday on or before the given date. */
export function startOfWeek(date: Date): Date {
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -date.getDay());
}

/** The 7 'YYYY-MM-DD' keys of the week (Sun–Sat) containing `date`. */
export function weekDays(date: Date): string[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => toDateKey(addDays(start, i)));
}

/** Weeks (rows of 7 day keys, Sun–Sat) covering the month that contains `date`. */
export function monthGrid(date: Date): string[][] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const weeks: string[][] = [];
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) {
    weeks.push(weekDays(start));
  }
  return weeks;
}

/** 'HH:MM' or 'YYYY-MM-DDTHH:MM' -> compact '6PM' / '6:30PM' for tight spaces. */
export function formatShortTime(value: string): string {
  const [h, m] = value.slice(-5).split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Whole days from one 'YYYY-MM-DD…' key to another (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromKey(to.slice(0, 10)).getTime() - fromKey(from.slice(0, 10)).getTime()) / (24 * 60 * 60 * 1000));
}

/** Moves a 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' key by whole days, keeping any time part. */
export function shiftKey(key: string, days: number): string {
  return `${toDateKey(addDays(fromKey(key.slice(0, 10)), days))}${key.slice(10)}`;
}

/** How long from start to end, e.g. '30 min', '1 hr', '1 hr 15 min', '2 days'; null when not after. */
export function formatDuration(start: Date, end: Date): string | null {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes <= 0) return null;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [
    days ? `${days} ${days === 1 ? 'day' : 'days'}` : '',
    hours ? `${hours} hr` : '',
    mins ? `${mins} min` : '',
  ];
  return parts.filter(Boolean).join(' ');
}
