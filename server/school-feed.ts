import { courseCode } from '../src/lib/grouping.ts';
import { MAX_FEED_BYTES, MAX_FEED_ITEMS, type FeedItem, type FeedResponse, type FeedSite } from '../src/lib/feed-format.ts';

// Server-only like read-schedule.ts, but it needs no SDK or key: it just downloads a calendar link
// and turns it into FeedItems. Relative `.ts` imports so it runs under both Node and Deno (the
// hosted `school-feed` function).

export class FeedError extends Error {}

// ---- Safety: only fetch public https addresses, so the link can't be pointed at the server's own network ----

const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp'];

function privateIPv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * The URL to fetch, or a FeedError saying why not. webcal:// is https:// under another name.
 * `allowLocal` (the dev server on your own computer) also lets http and localhost through.
 */
export function checkFeedUrl(raw: string, allowLocal = false): URL {
  const text = raw.trim().replace(/^webcals?:\/\//i, 'https://');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new FeedError('That doesn’t look like a link. Paste the calendar feed address.');
  }
  if (allowLocal) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new FeedError('Use an https:// link.');
    return url;
  }
  if (url.protocol !== 'https:') throw new FeedError('The link has to start with https:// (or webcal://).');
  if (url.username || url.password) throw new FeedError('Remove the username and password from the link.');
  if (url.port && url.port !== '443') throw new FeedError('That link uses an unusual port, so it was refused.');
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.startsWith('[') ||
    !host.includes('.') ||
    PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
    privateIPv4(host)
  ) {
    throw new FeedError('That address isn’t a public school website, so it was refused.');
  }
  return url;
}

// ---- Which site is it? ----

export function detectSite(url: string, prodId = ''): FeedSite {
  const text = `${url} ${prodId}`.toLowerCase();
  if (text.includes('instructure') || text.includes('/feeds/calendars/')) return 'canvas';
  if (text.includes('moodle') || text.includes('calendar/export_execute')) return 'moodle';
  if (text.includes('blackboard') || text.includes('/webapps/calendar')) return 'blackboard';
  if (text.includes('brightspace') || text.includes('d2l') || text.includes('/d2l/le/calendar')) return 'brightspace';
  if (text.includes('schoology')) return 'schoology';
  return 'other';
}

// ---- iCalendar (.ics) parsing ----

type Line = { name: string; params: Record<string, string>; value: string };

/** "NAME;PARAM=x:value" -> parts. Colons and semicolons inside quotes belong to the parameter. */
function parseLine(line: string): Line | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 1) return null;
  const head: string[] = [];
  let current = '';
  quoted = false;
  for (const ch of line.slice(0, colon)) {
    if (ch === '"') quoted = !quoted;
    if (ch === ';' && !quoted) {
      head.push(current);
      current = '';
    } else current += ch;
  }
  head.push(current);
  const params: Record<string, string> = {};
  for (const part of head.slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: head[0].toUpperCase(), params, value: line.slice(colon + 1) };
}

const unescapeText = (value: string) =>
  value.replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1');

/** How far a time zone is from UTC at a moment, in ms (positive east of Greenwich). */
function zoneOffset(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(at / 1000) * 1000;
}

type When = { value: string; allDay: boolean };

/** A DTSTART/DTEND value as the formats in `FeedItem`, or null if it isn't a date. */
function parseWhen(line: Line): When | null {
  const m = line.value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00', z] = m;
  if (h === undefined || line.params.VALUE === 'DATE') return { value: `${y}-${mo}-${d}`, allDay: true };
  if (z) return { value: `${y}-${mo}-${d}T${h}:${mi}:${s}Z`, allDay: false };
  const tz = line.params.TZID;
  if (tz) {
    try {
      const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
      // Two passes so a time just after a clock change still lands right.
      let at = guess - zoneOffset(tz, guess);
      at = guess - zoneOffset(tz, at);
      return { value: new Date(at).toISOString().slice(0, 19) + 'Z', allDay: false };
    } catch {
      // An unknown zone name: treat it as a plain clock time.
    }
  }
  return { value: `${y}-${mo}-${d}T${h}:${mi}`, allDay: false };
}

const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

type RawEvent = {
  uid: string;
  summary: string;
  description: string;
  categories: string[];
  url: string | null;
  start: When;
  end: When | null;
  cancelled: boolean;
};

export function parseIcs(text: string): { prodId: string; events: RawEvent[] } {
  const lines = text.replace(/^﻿/, '').replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  let prodId = '';
  const events: RawEvent[] = [];
  let current: Line[] | null = null;
  for (const raw of lines) {
    const line = raw.trim() === 'BEGIN:VEVENT' ? null : parseLine(raw);
    if (raw.trim() === 'BEGIN:VEVENT') current = [];
    else if (raw.trim() === 'END:VEVENT') {
      if (current) {
        const find = (name: string) => current!.find((l) => l.name === name);
        const dtstart = find('DTSTART');
        const start = dtstart && parseWhen(dtstart);
        if (start) {
          const dtend = find('DTEND');
          events.push({
            uid: find('UID')?.value.trim() || `${find('SUMMARY')?.value ?? ''}|${start.value}`,
            summary: unescapeText(find('SUMMARY')?.value ?? '').trim(),
            description: unescapeText(find('DESCRIPTION')?.value ?? ''),
            categories: current.filter((l) => l.name === 'CATEGORIES').flatMap((l) => l.value.split(',').map((c) => unescapeText(c).trim()).filter(Boolean)),
            url: find('URL')?.value.trim() || null,
            start,
            end: (dtend && parseWhen(dtend)) || null,
            cancelled: /^cancel/i.test(find('STATUS')?.value ?? ''),
          });
        }
      }
      current = null;
    } else if (current && line) current.push(line);
    else if (line?.name === 'PRODID') prodId = line.value;
  }
  return { prodId, events };
}

// ---- Turning raw events into the app's items, with each site's way of naming the course ----

const COURSE_LINE = /^\s*(?:course|class)\s*(?:name)?\s*:\s*(.+)$/im;

function courseOf(site: FeedSite, event: RawEvent): { title: string; course: string | null } {
  let title = event.summary;
  let course: string | null = null;

  // Canvas (and some others) put the course last, in brackets: "Homework 3 [BIO 150-01]".
  const bracket = title.match(/\s*\[([^\]]+)\]\s*$/);
  if (bracket && (site === 'canvas' || courseCode(bracket[1]))) {
    course = bracket[1].trim();
    title = title.slice(0, bracket.index).trim();
  }

  if (site === 'moodle') {
    // Moodle: the course's short name is the category; titles end "is due" / "closes" / "opens".
    course ??= event.categories[0] ?? null;
    title = title.replace(/\s+(is due|closes|opens|is open)\s*$/i, '').trim();
  }

  // "Course: X" in the description (Schoology, Blackboard, Brightspace).
  course ??= event.description.match(COURSE_LINE)?.[1].trim().slice(0, 80) ?? null;
  // "BIO 150: Homework 3" / "BIO 150 - Homework 3".
  if (!course) {
    const prefix = title.match(/^(.{2,30}?)\s*(?::|\s-\s|–)\s+(.+)$/);
    if (prefix && courseCode(prefix[1])) {
      course = prefix[1].trim();
      title = prefix[2].trim();
    }
  }
  course ??= event.categories.find((c) => courseCode(c)) ?? null;
  if (!course) course = courseCode(title)?.name ?? courseCode(event.description.slice(0, 300))?.name ?? null;
  return { title: title || event.summary, course };
}

/** A homework-style due date rather than something you attend? */
function isDue(site: FeedSite, event: RawEvent, title: string): boolean {
  if (site === 'canvas' && /assignment/i.test(event.uid)) return true;
  if (site === 'canvas' && /calendar-event/i.test(event.uid)) return false;
  if (site === 'moodle') return /\b(is due|closes)\s*$/i.test(event.summary);
  if (/\bdue\b/i.test(title)) return true;
  // No length (the end is missing or equal to the start): a deadline, not a meeting.
  return !event.end || event.end.value === event.start.value;
}

const plain = (text: string) =>
  text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

export function feedItems(site: FeedSite, events: RawEvent[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const event of events) {
    if (event.cancelled) continue;
    // Moodle also lists "X opens"; it's information, not something to do.
    if (site === 'moodle' && /\s+opens\s*$/i.test(event.summary)) continue;
    const { title, course } = courseOf(site, event);
    if (!title) continue;
    const allDay = event.start.allDay;
    items.push({
      uid: event.uid,
      title,
      course,
      start: event.start.value,
      // All-day DTEND is the day after the last day.
      end: event.end ? (allDay && event.end.allDay ? (event.end.value > event.start.value ? dayBefore(event.end.value) : event.start.value) : event.end.value) : null,
      allDay,
      description: plain(event.description).slice(0, 600) || null,
      url: event.url && /^https?:\/\//i.test(event.url) ? event.url : null,
      due: isDue(site, event, title),
    });
    if (items.length >= MAX_FEED_ITEMS) break;
  }
  return items.sort((a, b) => a.start.localeCompare(b.start));
}

// ---- Downloading ----

type FetchLike = typeof fetch;

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new FeedError('That calendar is too big to read (over 5 MB).');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder().decode(all);
}

/** Downloads a calendar link and reads it. Throws FeedError with a message fit to show. */
export async function readFeed(
  rawUrl: string,
  options: { allowLocal?: boolean; fetchImpl?: FetchLike; signal?: AbortSignal } = {}
): Promise<Extract<FeedResponse, { ok: true }>> {
  const doFetch = options.fetchImpl ?? fetch;
  let url = checkFeedUrl(rawUrl, options.allowLocal);
  let response: Response | null = null;
  // Follow redirects by hand so each hop is checked like the first.
  for (let hop = 0; hop < 4; hop++) {
    try {
      response = await doFetch(url, {
        redirect: 'manual',
        signal: options.signal ?? AbortSignal.timeout(15_000),
        headers: { accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5', 'user-agent': 'Daybook/1.0' },
      });
    } catch {
      throw new FeedError('Couldn’t reach that link. Check it and try again.');
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      url = checkFeedUrl(new URL(response.headers.get('location')!, url).toString(), options.allowLocal);
      response = null;
      continue;
    }
    break;
  }
  if (!response) throw new FeedError('That link redirected too many times.');
  if (response.status === 401 || response.status === 403) {
    throw new FeedError('The school site refused the link. It may have expired: copy a fresh calendar feed link.');
  }
  if (!response.ok) throw new FeedError(`The school site answered with an error (${response.status}).`);

  const text = await readCapped(response);
  if (!/^\s*BEGIN:VCALENDAR/i.test(text.replace(/^﻿/, ''))) {
    throw new FeedError('That link isn’t a calendar feed. Look for “calendar feed”, “subscribe” or “.ics”.');
  }
  const { prodId, events } = parseIcs(text);
  const site = detectSite(url.toString(), prodId);
  return { ok: true, site, items: feedItems(site, events) };
}
