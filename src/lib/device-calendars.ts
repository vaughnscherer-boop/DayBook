import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Calendar from 'expo-calendar';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { EventColors } from '@/constants/theme';
import { createCalendar, type Calendar as DaybookCalendar } from '@/db/calendars';
import { createEvent, type CalendarEvent } from '@/db/events';
import { addDays, fromKey, toDateKey, toDateTimeKey } from '@/lib/dates';
import { parseRule, type RepeatRule } from '@/lib/recurrence';

/**
 * Two-way mirroring between Daybook calendars and the calendars on this iPhone (iCloud, Google and
 * anything else added in iPhone Settings). Each linked pair keeps the same events on both sides:
 * adding, editing or deleting on either side shows up on the other the next time a pass runs.
 *
 * - Phone events are matched by id + the occurrence's original start, so each occurrence of a phone
 *   repeat is its own one-off Daybook event (edit one in Daybook and only that occurrence changes).
 * - Daybook repeating events are written to the phone as a real repeating series.
 * - Changes are detected by a fingerprint of each side's content when they last agreed; when both
 *   sides changed, the more recent edit wins.
 *
 * Needs the custom phone build (Expo Go and the web have no calendar access).
 */

export const deviceCalendarsAvailable =
  Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

const WINDOW_BACK_DAYS = 30;
const WINDOW_AHEAD_DAYS = 365;

type CalendarLink = { calendar_id: string; device_calendar_id: string; origin: 'device' | 'daybook' };
type EventLink = { event_id: string; device_event_id: string; occurrence: string; device_calendar_id: string; fingerprint: string };
type Shape = { title: string; start: string; end: string; allDay: boolean; notes: string };

// ---- Permission and the phone's calendar list ------------------------------------------------

export async function hasCalendarAccess(ask: boolean): Promise<boolean> {
  if (!deviceCalendarsAvailable) return false;
  const current = await Calendar.getCalendarPermissions();
  if (current.granted || !ask || !current.canAskAgain) return current.granted;
  return (await Calendar.requestCalendarPermissions()).granted;
}

export type PhoneCalendar = {
  id: string;
  title: string;
  color: string;
  account: string;
  /** The Daybook calendar mirroring it, if any. */
  linkedCalendarId: string | null;
  /** True for the "Daybook · School" calendars Daybook made on the phone. */
  madeByDaybook: boolean;
};

export async function listPhoneCalendars(db: SQLiteDatabase): Promise<PhoneCalendar[]> {
  const [calendars, links] = await Promise.all([
    Calendar.getCalendars(Calendar.EntityTypes.EVENT),
    db.getAllAsync<CalendarLink>('SELECT * FROM device_calendar_links'),
  ]);
  return calendars
    .map((calendar) => {
      const link = links.find((l) => l.device_calendar_id === calendar.id);
      return {
        id: calendar.id,
        title: calendar.title,
        color: calendar.color ?? EventColors[0],
        account: calendar.source?.name ?? '',
        linkedCalendarId: link?.calendar_id ?? null,
        madeByDaybook: link?.origin === 'daybook',
      };
    })
    .sort((a, b) => a.account.localeCompare(b.account) || a.title.localeCompare(b.title));
}

export async function calendarLinks(db: SQLiteDatabase): Promise<CalendarLink[]> {
  return db.getAllAsync<CalendarLink>('SELECT * FROM device_calendar_links');
}

/** "#1badf8" or "rgb(27,173,248)" → "#1BADF8" (Daybook stores hex). */
function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  const rgb = color.match(/(\d+)\D+(\d+)\D+(\d+)/);
  if (!rgb) return EventColors[0];
  return `#${rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Shows a phone calendar in Daybook: makes a matching Daybook calendar and links the two. */
export async function linkPhoneCalendar(db: SQLiteDatabase, phone: PhoneCalendar) {
  const calendarId = await createCalendar(db, phone.title, toHex(phone.color));
  await db.runAsync(
    `INSERT INTO device_calendar_links (calendar_id, device_calendar_id, origin) VALUES (?, ?, 'device')`,
    calendarId,
    phone.id
  );
}

/** Copies a Daybook calendar to the phone as "Daybook · School" (in iCloud when you use it). */
export async function copyToPhone(db: SQLiteDatabase, calendar: DaybookCalendar) {
  const source = Calendar.getDefaultCalendarSync().source;
  const phone = await Calendar.createCalendar({
    title: `Daybook · ${calendar.name}`,
    color: calendar.color,
    entityType: Calendar.EntityTypes.EVENT,
    source,
    sourceId: source.id,
  });
  await db.runAsync(
    `INSERT INTO device_calendar_links (calendar_id, device_calendar_id, origin) VALUES (?, ?, 'daybook')`,
    calendar.id,
    phone.id
  );
}

/**
 * Stops mirroring a pair. The copy goes away: a phone calendar shown in Daybook is removed from
 * Daybook (it's still on the phone); a Daybook calendar copied to the phone is removed from the phone.
 */
export async function unlink(db: SQLiteDatabase, calendarId: string) {
  const link = await db.getFirstAsync<CalendarLink>('SELECT * FROM device_calendar_links WHERE calendar_id = ?', calendarId);
  if (!link) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM device_event_links WHERE device_calendar_id = ?', link.device_calendar_id);
    await db.runAsync('DELETE FROM device_calendar_links WHERE calendar_id = ?', calendarId);
    if (link.origin === 'device') {
      await db.runAsync('DELETE FROM events WHERE calendar_id = ?', calendarId);
      await db.runAsync('DELETE FROM groups WHERE calendar_id = ?', calendarId);
      await db.runAsync('DELETE FROM calendars WHERE id = ?', calendarId);
    }
  });
  if (link.origin === 'daybook') {
    try {
      const phone = await Calendar.ExpoCalendar.get(link.device_calendar_id);
      await phone.delete();
    } catch {
      // Already deleted on the phone.
    }
  }
}

// ---- Converting between the two sides ---------------------------------------------------------

const asDate = (value: string | Date) => (typeof value === 'string' ? new Date(value) : value);

function phoneShape(event: Calendar.ExpoCalendarEvent): Shape {
  const start = asDate(event.startDate);
  const end = asDate(event.endDate);
  if (event.allDay) {
    // The phone ends all-day events at the next midnight or at 23:59:59 on the last day.
    const lastDay = end.getHours() === 0 && end.getMinutes() === 0 && end > start ? addDays(end, -1) : end;
    return { title: event.title ?? '', start: `${toDateKey(start)}T00:00`, end: `${toDateKey(lastDay)}T23:59`, allDay: true, notes: event.notes ?? '' };
  }
  return { title: event.title ?? '', start: toDateTimeKey(start), end: toDateTimeKey(end), allDay: false, notes: event.notes ?? '' };
}

function localShape(event: CalendarEvent): Shape {
  return { title: event.title, start: event.starts_at, end: event.ends_at, allDay: event.all_day === 1, notes: event.notes ?? '' };
}

/** A repeating Daybook event's fingerprint also covers its rule, end and skipped dates. */
function localFingerprint(event: CalendarEvent): string {
  return JSON.stringify([localShape(event), event.repeat, event.repeat_until, event.exceptions]);
}
const fingerprint = (shape: Shape) => JSON.stringify([shape, null, null, '[]']);

function phoneDetails(shape: Shape) {
  const start = fromKey(shape.start);
  const end = fromKey(shape.end);
  return { title: shape.title, notes: shape.notes, allDay: shape.allDay, startDate: start, endDate: end };
}

function recurrenceFor(rule: RepeatRule, until: string | null): Calendar.RecurrenceRule {
  const frequency = {
    daily: Calendar.Frequency.DAILY,
    weekly: Calendar.Frequency.WEEKLY,
    monthly: Calendar.Frequency.MONTHLY,
    yearly: Calendar.Frequency.YEARLY,
  }[rule.freq as 'daily' | 'weekly' | 'monthly' | 'yearly'];
  return {
    frequency,
    interval: rule.interval,
    ...(rule.freq === 'weekly' && rule.weekdays?.length
      ? { daysOfTheWeek: rule.weekdays.map((day) => ({ dayOfTheWeek: (day + 1) as Calendar.DayOfTheWeek })) }
      : {}),
    ...(until ? { endDate: fromKey(`${until}T23:59`) } : {}),
  };
}

/** Writes a repeating Daybook event to the phone as a series, minus its skipped dates. */
async function createSeries(phone: Calendar.ExpoCalendar, event: CalendarEvent): Promise<string> {
  const rule = parseRule(event.repeat)!;
  const created = await phone.createEvent({
    ...phoneDetails(localShape(event)),
    recurrenceRule: recurrenceFor(rule, event.repeat_until),
  });
  const exceptions: string[] = JSON.parse(event.exceptions || '[]');
  for (const day of exceptions) {
    try {
      created.getOccurrenceSync({ instanceStartDate: fromKey(`${day}T${event.starts_at.slice(11, 16)}`) }).delete();
    } catch {
      // That date isn't an occurrence (e.g. outside the series).
    }
  }
  return created.id;
}

async function deleteSeries(id: string) {
  try {
    const first = await Calendar.ExpoCalendarEvent.get(id);
    await first.getOccurrenceSync({ instanceStartDate: first.startDate, futureEvents: true }).delete();
  } catch {
    // Already gone on the phone.
  }
}

async function seriesExists(id: string): Promise<boolean> {
  try {
    await Calendar.ExpoCalendarEvent.get(id);
    return true;
  } catch {
    return false;
  }
}

// ---- The mirror pass --------------------------------------------------------------------------

async function updateLocal(db: SQLiteDatabase, id: string, shape: Shape) {
  await db.runAsync(
    'UPDATE events SET title = ?, notes = ?, starts_at = ?, ends_at = ?, all_day = ?, updated_at = ? WHERE id = ?',
    shape.title,
    shape.notes || null,
    shape.start,
    shape.end,
    shape.allDay ? 1 : 0,
    new Date().toISOString(),
    id
  );
}

async function saveLink(db: SQLiteDatabase, link: EventLink) {
  await db.runAsync(
    `INSERT OR REPLACE INTO device_event_links (event_id, device_event_id, occurrence, device_calendar_id, fingerprint)
     VALUES (?, ?, ?, ?, ?)`,
    link.event_id,
    link.device_event_id,
    link.occurrence,
    link.device_calendar_id,
    link.fingerprint
  );
}
const dropLink = (db: SQLiteDatabase, link: EventLink) =>
  db.runAsync('DELETE FROM device_event_links WHERE device_event_id = ? AND occurrence = ?', link.device_event_id, link.occurrence);

/** Mirrors one linked pair. Returns how many Daybook events changed. */
async function mirrorPair(db: SQLiteDatabase, pair: CalendarLink, windowStart: Date, windowEnd: Date): Promise<number> {
  let phone: Calendar.ExpoCalendar;
  try {
    phone = await Calendar.ExpoCalendar.get(pair.device_calendar_id);
  } catch {
    return 0; // The phone calendar is gone (or its account was removed): leave Daybook as it is.
  }
  const writable = phone.allowsModifications;
  const startKey = toDateTimeKey(windowStart);
  const endKey = toDateTimeKey(windowEnd);
  const inWindow = (start: string) => start >= startKey && start <= endKey;

  const [occurrences, locals, links] = await Promise.all([
    phone.listEvents(windowStart, windowEnd),
    db.getAllAsync<CalendarEvent>('SELECT * FROM events WHERE calendar_id = ?', pair.calendar_id),
    db.getAllAsync<EventLink>('SELECT * FROM device_event_links WHERE device_calendar_id = ?', pair.device_calendar_id),
  ]);
  const localById = new Map(locals.map((event) => [event.id, event]));
  const seriesIds = new Set(links.filter((link) => link.occurrence === '').map((link) => link.device_event_id));
  // Phone occurrences by id + original start; occurrences of Daybook's own series are handled as a series.
  const phoneByKey = new Map<string, Calendar.ExpoCalendarEvent>();
  for (const occurrence of occurrences) {
    if (seriesIds.has(occurrence.id)) continue;
    const original = toDateTimeKey(asDate(occurrence.originalStartDate ?? occurrence.startDate));
    phoneByKey.set(`${occurrence.id}|${original}`, occurrence);
  }

  let changed = 0;
  const linkedLocal = new Set<string>();

  for (const link of links) {
    const local = localById.get(link.event_id) ?? null;
    if (local) linkedLocal.add(local.id);

    if (link.occurrence === '') {
      // A Daybook repeating event, written to the phone as a series.
      if (!local || !local.repeat) {
        if (writable) await deleteSeries(link.device_event_id);
        await dropLink(db, link);
        if (local) linkedLocal.delete(local.id); // No longer repeating: re-added below as a one-off.
        continue;
      }
      if (!(await seriesExists(link.device_event_id))) {
        // Deleted on the phone: delete it here too, unless it was edited here since.
        if (localFingerprint(local) === link.fingerprint) {
          await db.runAsync('DELETE FROM events WHERE id = ?', local.id);
          changed++;
          await dropLink(db, link);
          continue;
        }
      } else if (localFingerprint(local) === link.fingerprint) {
        continue;
      } else if (writable) {
        await deleteSeries(link.device_event_id);
      }
      if (!writable) continue;
      // Edited in Daybook (or deleted on the phone after an edit): write the series again.
      await dropLink(db, link);
      const id = await createSeries(phone, local);
      await saveLink(db, { ...link, device_event_id: id, fingerprint: localFingerprint(local) });
      continue;
    }

    const key = `${link.device_event_id}|${link.occurrence}`;
    const device = phoneByKey.get(key) ?? null;
    phoneByKey.delete(key);
    // Outside the window, a missing phone occurrence means nothing.
    if (!device && local && !inWindow(local.starts_at)) continue;
    if (!device && !local) {
      await dropLink(db, link);
      continue;
    }
    if (local?.repeat) {
      // Made repeating in Daybook: replace the single phone occurrence with a series (added below).
      if (device && writable) await device.delete();
      await dropLink(db, link);
      linkedLocal.delete(local.id);
      continue;
    }

    const localPrint = local ? fingerprint(localShape(local)) : null;
    const devicePrint = device ? fingerprint(phoneShape(device)) : null;

    if (local && device) {
      if (localPrint === devicePrint) {
        if (link.fingerprint !== localPrint) await saveLink(db, { ...link, fingerprint: localPrint! });
        continue;
      }
      const localChanged = localPrint !== link.fingerprint;
      const deviceChanged = devicePrint !== link.fingerprint;
      // Both changed: the more recent edit wins.
      const deviceWins =
        deviceChanged &&
        (!localChanged ||
          (device.lastModifiedDate ? asDate(device.lastModifiedDate).getTime() : 0) > Date.parse(local.updated_at));
      if (deviceWins || !writable) {
        await updateLocal(db, local.id, phoneShape(device));
        changed++;
        await saveLink(db, { ...link, fingerprint: devicePrint! });
      } else {
        await device.update(phoneDetails(localShape(local)));
        await saveLink(db, { ...link, fingerprint: localPrint! });
      }
    } else if (local) {
      // Gone from the phone.
      if (localPrint === link.fingerprint || !writable) {
        await db.runAsync('DELETE FROM events WHERE id = ?', local.id);
        changed++;
        await dropLink(db, link);
      } else {
        // Edited here after it was deleted there: put it back on the phone.
        await dropLink(db, link);
        linkedLocal.delete(local.id);
      }
    } else if (device) {
      // Gone from Daybook.
      if ((devicePrint === link.fingerprint && writable) || !writable) {
        if (writable) await device.delete();
        await dropLink(db, link);
      } else {
        // Edited on the phone after it was deleted here: bring it back.
        await dropLink(db, link);
        phoneByKey.set(key, device);
      }
    }
  }

  // New on the phone → new in Daybook.
  for (const [key, device] of phoneByKey) {
    const shape = phoneShape(device);
    const id = await createEvent(db, {
      title: shape.title || '(No title)',
      notes: shape.notes || null,
      starts_at: shape.start,
      ends_at: shape.end,
      all_day: shape.allDay,
      calendar_id: pair.calendar_id,
    });
    changed++;
    const [deviceId, occurrence] = [key.slice(0, key.lastIndexOf('|')), key.slice(key.lastIndexOf('|') + 1)];
    await saveLink(db, {
      event_id: id,
      device_event_id: deviceId,
      occurrence,
      device_calendar_id: pair.device_calendar_id,
      fingerprint: fingerprint(shape),
    });
  }

  // New in Daybook → new on the phone.
  if (writable) {
    for (const local of locals) {
      if (linkedLocal.has(local.id)) continue;
      if (local.repeat) {
        const id = await createSeries(phone, local);
        await saveLink(db, {
          event_id: local.id,
          device_event_id: id,
          occurrence: '',
          device_calendar_id: pair.device_calendar_id,
          fingerprint: localFingerprint(local),
        });
      } else if (inWindow(local.starts_at)) {
        const shape = localShape(local);
        const created = await phone.createEvent(phoneDetails(shape));
        await saveLink(db, {
          event_id: local.id,
          device_event_id: created.id,
          occurrence: shape.start,
          device_calendar_id: pair.device_calendar_id,
          fingerprint: fingerprint(shape),
        });
      }
    }
  }
  return changed;
}

let running: Promise<number> | null = null;

/** One mirror pass over every linked pair. Returns how many Daybook events changed. */
export function mirrorDeviceCalendars(db: SQLiteDatabase): Promise<number> {
  if (running) return running;
  running = (async () => {
    const pairs = await calendarLinks(db);
    if (pairs.length === 0 || !(await hasCalendarAccess(false))) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowStart = addDays(today, -WINDOW_BACK_DAYS);
    const windowEnd = addDays(today, WINDOW_AHEAD_DAYS);
    let changed = 0;
    for (const pair of pairs) {
      try {
        changed += await mirrorPair(db, pair, windowStart, windowEnd);
      } catch (error) {
        console.warn('Calendar mirror failed for', pair.calendar_id, error);
      }
    }
    return changed;
  })().finally(() => {
    running = null;
  });
  return running;
}
