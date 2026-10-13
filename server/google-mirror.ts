// Two-way mirror between a Daybook calendar and a Google calendar. Runs in the google-calendar Edge
// Function (Deno); kept here, free of Supabase, so it's type-checked with the app. Imports use
// relative `.ts` paths for the same reason as read-schedule.ts.
//
// It follows the phone's mirror (mirrorPair in src/lib/device-calendars.ts) rule for rule: every
// mirrored event has a link with a fingerprint of how both sides last agreed, the side that changed
// wins (the more recent edit when both did), deletions carry over unless the other side was edited
// since, Google's repeating events come in occurrence by occurrence, and Daybook's repeating events
// go to Google as a series.

import type { RepeatRule } from '../src/lib/recurrence.ts';

export const WINDOW_BACK_DAYS = 30;
export const WINDOW_AHEAD_DAYS = 365;

const API = 'https://www.googleapis.com/calendar/v3';

// ---- Shapes --------------------------------------------------------------------------------------

/** A Daybook event row as stored in records.data (other columns are carried through untouched). */
export type DaybookEvent = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string; // 'YYYY-MM-DDTHH:MM' local time
  ends_at: string;
  all_day: 0 | 1;
  repeat: string | null; // JSON RepeatRule
  repeat_until: string | null; // 'YYYY-MM-DD'
  exceptions: string; // JSON array of skipped 'YYYY-MM-DD'
  updated_at: string;
  [column: string]: unknown;
};

type GoogleTime = { date?: string; dateTime?: string; timeZone?: string };

export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start: GoogleTime;
  end: GoogleTime;
  recurringEventId?: string;
  originalStartTime?: GoogleTime;
  updated?: string;
};

export type EventLink = {
  event_id: string;
  google_event_id: string;
  /** '' for a Daybook series written to Google; otherwise the Google occurrence's original start
   *  (informational: occurrences are matched by id, which Google keeps unique and stable). */
  occurrence: string;
  fingerprint: string;
};

type Shape = { title: string; start: string; end: string; allDay: boolean; notes: string };

// ---- Dates (plain 'YYYY-MM-DD' arithmetic, no time zones involved) ------------------------------

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A Google time as Daybook's local 'YYYY-MM-DDTHH:MM' (events are fetched in the user's zone). */
const localKey = (time: GoogleTime) => (time.dateTime ? time.dateTime.slice(0, 16) : `${time.date}T00:00`);

// ---- Converting between the two sides -----------------------------------------------------------

function googleShape(event: GoogleEvent): Shape {
  if (event.start.date) {
    // Google ends all-day events on the next day (exclusive); Daybook on the last day at 23:59.
    const lastDay = event.end.date && event.end.date > event.start.date ? shiftDay(event.end.date, -1) : event.start.date;
    return {
      title: event.summary ?? '',
      start: `${event.start.date}T00:00`,
      end: `${lastDay}T23:59`,
      allDay: true,
      notes: event.description ?? '',
    };
  }
  return {
    title: event.summary ?? '',
    start: localKey(event.start),
    end: localKey(event.end),
    allDay: false,
    notes: event.description ?? '',
  };
}

function localShape(event: DaybookEvent): Shape {
  return { title: event.title, start: event.starts_at, end: event.ends_at, allDay: event.all_day === 1, notes: event.notes ?? '' };
}

/** A repeating Daybook event's fingerprint also covers its rule, end and skipped dates. */
const localFingerprint = (event: DaybookEvent) =>
  JSON.stringify([localShape(event), event.repeat, event.repeat_until, event.exceptions]);
const fingerprint = (shape: Shape) => JSON.stringify([shape, null, null, '[]']);

function googleBody(shape: Shape, timeZone: string) {
  const base = { summary: shape.title, description: shape.notes || undefined };
  if (shape.allDay) {
    return { ...base, start: { date: shape.start.slice(0, 10) }, end: { date: shiftDay(shape.end.slice(0, 10), 1) } };
  }
  return {
    ...base,
    start: { dateTime: `${shape.start}:00`, timeZone },
    end: { dateTime: `${shape.end}:00`, timeZone },
  };
}

const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** RFC 5545 lines for a repeating Daybook event: the rule, then each skipped date. */
export function recurrenceLines(event: DaybookEvent, timeZone: string): string[] {
  const rule = JSON.parse(event.repeat!) as RepeatRule;
  const parts = [`FREQ=${rule.freq.toUpperCase()}`, `INTERVAL=${rule.interval}`];
  if (rule.freq === 'weekly' && rule.weekdays?.length) parts.push(`BYDAY=${rule.weekdays.map((d) => RRULE_DAYS[d]).join(',')}`);
  if (event.repeat_until) {
    const until = event.repeat_until.replaceAll('-', '');
    parts.push(event.all_day ? `UNTIL=${until}` : `UNTIL=${until}T235959Z`);
  }
  const lines = [`RRULE:${parts.join(';')}`];
  const skipped: string[] = JSON.parse(event.exceptions || '[]');
  for (const day of skipped) {
    const date = day.replaceAll('-', '');
    lines.push(
      event.all_day
        ? `EXDATE;VALUE=DATE:${date}`
        : `EXDATE;TZID=${timeZone}:${date}T${event.starts_at.slice(11, 16).replace(':', '')}00`
    );
  }
  return lines;
}

// ---- Google Calendar API ------------------------------------------------------------------------

export class GoogleError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** Swaps the stored refresh token for a short-lived access token. */
export async function accessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new GoogleError(response.status, body.error_description ?? body.error ?? 'Token refresh failed');
  return body.access_token as string;
}

export type GoogleCalendarEntry = { id: string; summary: string; backgroundColor?: string; accessRole: string; primary?: boolean };

/** A small Calendar API client for one user. */
export function googleApi(token: string) {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 204) return undefined as T;
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new GoogleError(response.status, json.error?.message ?? `Google Calendar: ${response.status}`);
    return json as T;
  };

  return {
    async calendars(): Promise<GoogleCalendarEntry[]> {
      const items: GoogleCalendarEntry[] = [];
      let pageToken: string | undefined;
      do {
        const page = await call<{ items: GoogleCalendarEntry[]; nextPageToken?: string }>(
          'GET',
          `/users/me/calendarList?minAccessRole=reader${pageToken ? `&pageToken=${pageToken}` : ''}`
        );
        items.push(...page.items);
        pageToken = page.nextPageToken;
      } while (pageToken);
      return items;
    },
    /** Every occurrence in the window, repeats expanded, in the user's time zone. */
    async occurrences(calendarId: string, timeMin: string, timeMax: string, timeZone: string): Promise<GoogleEvent[]> {
      const items: GoogleEvent[] = [];
      let pageToken: string | undefined;
      do {
        const query = new URLSearchParams({
          singleEvents: 'true',
          timeMin,
          timeMax,
          timeZone,
          maxResults: '2500',
          ...(pageToken ? { pageToken } : {}),
        });
        const page = await call<{ items: GoogleEvent[]; nextPageToken?: string }>(
          'GET',
          `/calendars/${encodeURIComponent(calendarId)}/events?${query}`
        );
        items.push(...page.items.filter((event) => event.status !== 'cancelled'));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return items;
    },
    async exists(calendarId: string, eventId: string): Promise<boolean> {
      try {
        const event = await call<GoogleEvent>('GET', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
        return event.status !== 'cancelled';
      } catch (error) {
        if (error instanceof GoogleError && (error.status === 404 || error.status === 410)) return false;
        throw error;
      }
    },
    insert: (calendarId: string, body: unknown) =>
      call<GoogleEvent>('POST', `/calendars/${encodeURIComponent(calendarId)}/events`, body).then((event) => event.id),
    update: (calendarId: string, eventId: string, body: unknown) =>
      call<GoogleEvent>('PATCH', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, body),
    async remove(calendarId: string, eventId: string) {
      try {
        await call('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
      } catch (error) {
        // Already gone.
        if (!(error instanceof GoogleError && (error.status === 404 || error.status === 410))) throw error;
      }
    },
  };
}

export type GoogleApi = ReturnType<typeof googleApi>;

// ---- The mirror ---------------------------------------------------------------------------------

/** How the mirror reads and writes Daybook's side (the records table, in the function). */
export type DaybookSide = {
  create: (fields: Pick<DaybookEvent, 'title' | 'notes' | 'starts_at' | 'ends_at' | 'all_day'>) => Promise<string>;
  update: (event: DaybookEvent, fields: Pick<DaybookEvent, 'title' | 'notes' | 'starts_at' | 'ends_at' | 'all_day'>) => Promise<void>;
  remove: (event: DaybookEvent) => Promise<void>;
  saveLink: (link: EventLink) => Promise<void>;
  dropLink: (link: EventLink) => Promise<void>;
};

type MirrorInput = {
  api: GoogleApi;
  googleCalendarId: string;
  /** False for calendars you can only read (holidays, someone else's): Google always wins there. */
  writable: boolean;
  timeZone: string;
  /** Today in the user's time zone, 'YYYY-MM-DD'. */
  today: string;
  locals: DaybookEvent[];
  links: EventLink[];
  daybook: DaybookSide;
};

const fieldsOf = (shape: Shape) => ({
  title: shape.title || '(No title)',
  notes: shape.notes || null,
  starts_at: shape.start,
  ends_at: shape.end,
  all_day: (shape.allDay ? 1 : 0) as 0 | 1,
});

/** Mirrors one linked calendar both ways. Returns how many Daybook events changed. */
export async function mirrorCalendar(input: MirrorInput): Promise<number> {
  const { api, googleCalendarId: calendarId, writable, timeZone, daybook } = input;
  const startDay = shiftDay(input.today, -WINDOW_BACK_DAYS);
  const endDay = shiftDay(input.today, WINDOW_AHEAD_DAYS);
  const startKey = `${startDay}T00:00`;
  const endKey = `${endDay}T23:59`;
  const inWindow = (start: string) => start >= startKey && start <= endKey;

  // Pad the request a day each side: timeMin/timeMax are absolute times, the window is local.
  const occurrences = await api.occurrences(
    calendarId,
    `${shiftDay(startDay, -1)}T00:00:00Z`,
    `${shiftDay(endDay, 1)}T23:59:59Z`,
    timeZone
  );
  const localById = new Map(input.locals.map((event) => [event.id, event]));
  const seriesIds = new Set(input.links.filter((link) => link.occurrence === '').map((link) => link.google_event_id));
  // Google occurrences by id (an occurrence of a repeating event has its own stable id), so moving
  // an event's time doesn't look like a delete plus a new one. Daybook's own series are handled as a series.
  const googleById = new Map<string, GoogleEvent>();
  for (const event of occurrences) {
    if (event.recurringEventId && seriesIds.has(event.recurringEventId)) continue;
    googleById.set(event.id, event);
  }

  const series = (event: DaybookEvent) => ({ ...googleBody(localShape(event), timeZone), recurrence: recurrenceLines(event, timeZone) });

  let changed = 0;
  const linkedLocal = new Set<string>();

  for (const link of input.links) {
    const local = localById.get(link.event_id) ?? null;
    if (local) linkedLocal.add(local.id);

    if (link.occurrence === '') {
      // A Daybook repeating event, written to Google as a series.
      if (!local || !local.repeat) {
        if (writable) await api.remove(calendarId, link.google_event_id);
        await daybook.dropLink(link);
        if (local) linkedLocal.delete(local.id); // No longer repeating: re-added below as a one-off.
        continue;
      }
      if (!(await api.exists(calendarId, link.google_event_id))) {
        // Deleted in Google: delete it here too, unless it was edited here since.
        if (localFingerprint(local) === link.fingerprint) {
          await daybook.remove(local);
          changed++;
          await daybook.dropLink(link);
          continue;
        }
      } else if (localFingerprint(local) === link.fingerprint) {
        continue;
      }
      if (!writable) continue;
      // Edited in Daybook (or deleted in Google after an edit): write the series again.
      await api.remove(calendarId, link.google_event_id);
      await daybook.dropLink(link);
      const id = await api.insert(calendarId, series(local));
      await daybook.saveLink({ ...link, google_event_id: id, fingerprint: localFingerprint(local) });
      continue;
    }

    const google = googleById.get(link.google_event_id) ?? null;
    googleById.delete(link.google_event_id);
    // Outside the window, a missing Google occurrence means nothing.
    if (!google && local && !inWindow(local.starts_at)) continue;
    if (!google && !local) {
      await daybook.dropLink(link);
      continue;
    }
    if (local?.repeat) {
      // Made repeating in Daybook: replace the single Google occurrence with a series (added below).
      if (google && writable) await api.remove(calendarId, google.id);
      await daybook.dropLink(link);
      linkedLocal.delete(local.id);
      continue;
    }

    const localPrint = local ? fingerprint(localShape(local)) : null;
    const googlePrint = google ? fingerprint(googleShape(google)) : null;

    if (local && google) {
      if (localPrint === googlePrint) {
        if (link.fingerprint !== localPrint) await daybook.saveLink({ ...link, fingerprint: localPrint! });
        continue;
      }
      const localChanged = localPrint !== link.fingerprint;
      const googleChanged = googlePrint !== link.fingerprint;
      // Both changed: the more recent edit wins.
      const googleWins =
        googleChanged && (!localChanged || Date.parse(google.updated ?? '') > Date.parse(local.updated_at));
      if (googleWins || !writable) {
        await daybook.update(local, fieldsOf(googleShape(google)));
        changed++;
        await daybook.saveLink({ ...link, fingerprint: googlePrint! });
      } else {
        await api.update(calendarId, google.id, googleBody(localShape(local), timeZone));
        await daybook.saveLink({ ...link, fingerprint: localPrint! });
      }
    } else if (local) {
      // Gone from Google.
      if (localPrint === link.fingerprint || !writable) {
        await daybook.remove(local);
        changed++;
        await daybook.dropLink(link);
      } else {
        // Edited here after it was deleted there: put it back in Google.
        await daybook.dropLink(link);
        linkedLocal.delete(local.id);
      }
    } else if (google) {
      // Gone from Daybook.
      if ((googlePrint === link.fingerprint && writable) || !writable) {
        if (writable) await api.remove(calendarId, google.id);
        await daybook.dropLink(link);
      } else {
        // Edited in Google after it was deleted here: bring it back.
        await daybook.dropLink(link);
        googleById.set(google.id, google);
      }
    }
  }

  // New in Google → new in Daybook.
  for (const google of googleById.values()) {
    if (!inWindow(localKey(google.start))) continue;
    const shape = googleShape(google);
    const id = await daybook.create(fieldsOf(shape));
    changed++;
    await daybook.saveLink({
      event_id: id,
      google_event_id: google.id,
      occurrence: localKey(google.originalStartTime ?? google.start),
      fingerprint: fingerprint(shape),
    });
  }

  // New in Daybook → new in Google.
  if (writable) {
    for (const local of input.locals) {
      if (linkedLocal.has(local.id)) continue;
      if (local.repeat) {
        const id = await api.insert(calendarId, series(local));
        await daybook.saveLink({ event_id: local.id, google_event_id: id, occurrence: '', fingerprint: localFingerprint(local) });
      } else if (inWindow(local.starts_at)) {
        const shape = localShape(local);
        const id = await api.insert(calendarId, googleBody(shape, timeZone));
        await daybook.saveLink({ event_id: local.id, google_event_id: id, occurrence: shape.start, fingerprint: fingerprint(shape) });
      }
    }
  }
  return changed;
}
