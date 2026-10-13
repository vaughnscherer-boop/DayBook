import type { SQLiteDatabase } from 'expo-sqlite';

import type { Calendar } from '@/db/calendars';
import { createEvent } from '@/db/events';
import { createTask } from '@/db/tasks';
import type { ParsedEvent } from '@/lib/parse-event';

export type EntryKind = 'event' | 'task';

const squash = (name: string) => name.replace(/\s+/g, '').toLowerCase();

/**
 * Which calendar typed text goes in: the one named with "#work", else the class's calendar for
 * "due next class" homework, else `fallbackId`. `unknownTag` is a "#name" no calendar matches.
 */
export function calendarFor(parsed: ParsedEvent, calendars: Calendar[], fallbackId: string | null) {
  const tagged = parsed.calendarTag
    ? calendars.find((calendar) => squash(calendar.name) === squash(parsed.calendarTag!))
    : undefined;
  const classRef = parsed.classRef;
  const classCalendar = classRef?.kind === 'found' ? calendars.find((c) => c.id === classRef.calendarId) : undefined;
  const calendar = tagged ?? classCalendar ?? calendars.find((c) => c.id === fallbackId) ?? calendars[0];
  return { calendar: calendar ?? null, unknownTag: parsed.calendarTag && !tagged ? parsed.calendarTag : null };
}

/** Saves typed text as an event or task (the add box and the night check-in both use this). */
export async function createFromParsed(db: SQLiteDatabase, kind: EntryKind, parsed: ParsedEvent, calendarId: string | null) {
  // "due next class" homework belongs to that class's group.
  const group = parsed.classRef?.kind === 'found' ? { groupId: parsed.classRef.groupId } : undefined;
  if (kind === 'event') {
    return createEvent(db, {
      title: parsed.title,
      starts_at: parsed.starts_at,
      ends_at: parsed.ends_at,
      all_day: parsed.allDay,
      calendar_id: calendarId,
      repeat: parsed.repeat,
      repeat_until: parsed.repeatUntil,
      group,
    });
  }
  return createTask(db, {
    title: parsed.title,
    date: parsed.starts_at.slice(0, 10),
    time: parsed.allDay ? null : parsed.starts_at.slice(11, 16),
    calendar_id: calendarId,
    repeat: parsed.repeat,
    repeat_until: parsed.repeatUntil,
    group,
  });
}
