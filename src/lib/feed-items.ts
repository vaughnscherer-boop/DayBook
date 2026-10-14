import { toDateTimeKey } from '@/lib/dates';
import type { FeedItem } from '@/lib/feed-format';
import { detectItemType } from '@/lib/item-type';

/**
 * Turns an item from a school-site feed into what Daybook stores: a task to tick off (homework,
 * readings) or a calendar event (class meetings, exams), in the phone's local time. Pure.
 */

export type ItemDraft =
  | { kind: 'task'; date: string; time: string | null; title: string; details: string | null; hash: string }
  | { kind: 'event'; startsAt: string; endsAt: string; allDay: boolean; title: string; details: string | null; hash: string };

/** FNV-1a, run twice with different seeds: a short, stable id piece (not for security). */
export function hashText(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}

/** A feed time in local form: 'YYYY-MM-DD' (all day) or 'YYYY-MM-DDTHH:MM'. UTC times shift to this phone's zone. */
export function localKey(value: string): string {
  if (value.endsWith('Z')) return toDateTimeKey(new Date(value));
  return value.length > 10 ? value.slice(0, 16) : value;
}

const addHour = (key: string) => toDateTimeKey(new Date(new Date(`${key}:00`).getTime() + 3_600_000));

export function draftFor(item: FeedItem): ItemDraft {
  const start = localKey(item.start);
  const end = item.end ? localKey(item.end) : null;
  const type = detectItemType(item.title, 'event', false, true);
  const details = item.description;
  const hash = hashText([item.title, start, end ?? '', item.due, details ?? ''].join('|'));

  // Exams are things you go to; homework and readings are things you hand in or do.
  const asTask = type !== 'exam' && (item.due || type === 'assignment' || type === 'reading');
  if (asTask) {
    return { kind: 'task', date: start.slice(0, 10), time: item.allDay ? null : start.slice(11, 16), title: item.title, details, hash };
  }
  if (item.allDay) {
    const lastDay = end && end > start ? end.slice(0, 10) : start.slice(0, 10);
    return { kind: 'event', startsAt: `${start.slice(0, 10)}T00:00`, endsAt: `${lastDay}T23:59`, allDay: true, title: item.title, details, hash };
  }
  return {
    kind: 'event',
    startsAt: start,
    endsAt: end && end > start ? end : addHour(start),
    allDay: false,
    title: item.title,
    details,
    hash,
  };
}

/** The id for a feed's item, the same on every device so two devices adding it make one row. */
export const feedItemId = (feedId: string, uid: string) => `feed-${feedId.replace(/^feed-/, '')}-${hashText(uid)}`;

/** The id for a feed, derived from its link. */
export const feedIdFor = (url: string) => `feed-${hashText(url.trim().toLowerCase())}`;
