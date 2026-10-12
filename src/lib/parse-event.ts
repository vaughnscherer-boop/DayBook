import * as chrono from 'chrono-node';

import { toDateKey, toDateTimeKey } from '@/lib/dates';
import { firstMatchingDay, type RepeatRule } from '@/lib/recurrence';

export type ParsedEvent = {
  title: string;
  starts_at: string;
  ends_at: string;
  allDay: boolean;
  /** Text after '#', e.g. 'work' from 'standup 9am #work'. Matched against calendar names. */
  calendarTag: string | null;
  repeat: RepeatRule | null;
  /** Last day of the series ('YYYY-MM-DD'), from "until dec 1". */
  repeatUntil: string | null;
  /** False when no date or time was found and it fell back to all day on the selected day. */
  understood: boolean;
};

const HOUR = 60 * 60 * 1000;

// ---- Text clean-up before parsing ----------------------------------------------------------

// "12-1pm" -> "12pm-1pm" (chrono otherwise reads "oct 12 12-1pm" as the year 2012).
// When the start hour is bigger than the end ("11-1pm"), the start is the other half of the day.
const SHORT_RANGE = /\b(\d{1,2})(:\d{2})?\s*(-|–|to)\s*(\d{1,2})(:\d{2})?\s*(am|pm)\b/gi;
function expandShortRanges(text: string) {
  return text.replace(SHORT_RANGE, (_all, h1, m1 = '', sep, h2, m2 = '', meridiem: string) => {
    const pm = meridiem.toLowerCase() === 'pm';
    const startMeridiem = Number(h1) % 12 > Number(h2) % 12 ? (pm ? 'am' : 'pm') : meridiem;
    return `${h1}${m1}${startMeridiem} ${sep} ${h2}${m2}${meridiem}`;
  });
}

// "quarter past 3" -> "3:15", "half past 3" -> "3:30", "quarter to 4" -> "3:45".
function expandClockWords(text: string) {
  return text
    .replace(/\bquarter\s+past\s+(\d{1,2})\b/gi, (_all, h) => `${h}:15`)
    .replace(/\bhalf\s+past\s+(\d{1,2})\b/gi, (_all, h) => `${h}:30`)
    .replace(/\bquarter\s+(?:to|til|till)\s+(\d{1,2})\b/gi, (_all, h) => `${((Number(h) + 10) % 12) + 1}:45`);
}

// ---- chrono with an extra rule for "the 20th" (no month) -----------------------------------

const parser = chrono.casual.clone();
parser.parsers.push({
  pattern: () => /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i,
  extract: (context, match) => {
    const day = Number(match[1]);
    if (day < 1 || day > 31) return null;
    const ref = context.refDate;
    // This month, or next month if that day has already passed.
    const date = new Date(ref.getFullYear(), ref.getMonth() + (day < ref.getDate() ? 1 : 0), day);
    return { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() };
  },
});

// ---- Repeats -------------------------------------------------------------------------------

const DAY_WORD = '(?:sun|mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur)(?:day)?s?';
const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

type RepeatMatch = { rule: RepeatRule; text: string };

/** Finds "every monday", "weekdays", "every 2 weeks", "monthly"… and returns the rule and matched text. */
function findRepeat(text: string): RepeatMatch | null {
  const days = (list: string) =>
    [...new Set(list.toLowerCase().match(new RegExp(DAY_WORD, 'g'))!.map((d) => DAY_INDEX[d.slice(0, 3)]))].sort();

  let m = text.match(new RegExp(`\\b(?:every|each)\\s+(other\\s+)?(${DAY_WORD}(?:\\s*(?:,|and|&)\\s*${DAY_WORD})*)\\b`, 'i'));
  if (m) return { rule: { freq: 'weekly', interval: m[1] ? 2 : 1, weekdays: days(m[2]) }, text: m[0] };

  m = text.match(/\b(?:every|each)\s+(other\s+|(\d+)\s+)?(day|week|month|year)s?\b/i);
  if (m) {
    const unit = m[3].toLowerCase() as 'day' | 'week' | 'month' | 'year';
    const freq = ({ day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' } as const)[unit];
    return { rule: { freq, interval: m[2] ? Number(m[2]) : m[1] ? 2 : 1 }, text: m[0] };
  }

  m = text.match(/\b(?:every\s+)?weekdays\b|\bevery\s+weekday\b/i);
  if (m) return { rule: { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] }, text: m[0] };

  m = text.match(/\b(?:every\s+)?weekends\b|\bevery\s+weekend\b/i);
  if (m) return { rule: { freq: 'weekly', interval: 1, weekdays: [0, 6] }, text: m[0] };

  m = text.match(/\b(daily|weekly|biweekly|fortnightly|monthly|yearly|annually)\b/i);
  if (m) {
    const word = m[1].toLowerCase();
    const rule: RepeatRule =
      word === 'daily'
        ? { freq: 'daily', interval: 1 }
        : word === 'weekly'
          ? { freq: 'weekly', interval: 1 }
          : word === 'biweekly' || word === 'fortnightly'
            ? { freq: 'weekly', interval: 2 }
            : word === 'monthly'
              ? { freq: 'monthly', interval: 1 }
              : { freq: 'yearly', interval: 1 };
    return { rule, text: m[0] };
  }

  // Plural day names on their own: "gym mondays 6pm", "on tuesdays and thursdays".
  m = text.match(
    /\b(?:on\s+)?((?:sun|mon|tues|wednes|thurs|fri|satur)days(?:\s*(?:,|and|&)\s*(?:sun|mon|tues|wednes|thurs|fri|satur)days)*)\b/i
  );
  if (m) return { rule: { freq: 'weekly', interval: 1, weekdays: days(m[1]) }, text: m[0] };

  return null;
}

/** "until dec 1" / "through friday" after a repeat: returns the end day and the matched text. */
function findUntil(text: string, now: Date): { day: string; text: string } | null {
  const m = text.match(/\b(?:until|till|thru|through)\s+(.+)$/i);
  if (!m) return null;
  const [result] = parser.parse(m[1], now, { forwardDate: true });
  if (!result || result.index !== 0) return null;
  return { day: toDateKey(result.start.date()), text: `${m[0].slice(0, m[0].length - m[1].length)}${result.text}` };
}

// ---- Times of day without a clock time -----------------------------------------------------

const PART_OF_DAY: [RegExp, number][] = [
  [/\b(?:this\s+)?morning\b/i, 9],
  [/\b(?:this\s+)?afternoon\b/i, 14],
  [/\b(?:this\s+)?evening\b/i, 18],
  [/\btonight\b|\b(?:at\s+)?night\b/i, 20],
];

// ---- Main ----------------------------------------------------------------------------------

// Words left dangling once date phrases are cut out, e.g. "dentist at" or "on gym".
const DANGLING =
  /^(?:at|on|from|to|for|by|in|every|each|until|starting|,|-|–)\s+|\s+(?:at|on|from|to|for|by|in|every|each|until|starting|,|-|–)$/i;

/**
 * Turns everyday text into an event: "on Thursday SOAR at 11:30 am to 12:30 pm",
 * "gym tomorrow 6pm #work", "team sync every monday 9am", "pay rent every month on the 1st".
 * Dates you type count from today; with no date it lands on `referenceDay`; with no time it's all-day.
 */
export function parseEvent(text: string, referenceDay: Date): ParsedEvent | null {
  const tagMatch = text.match(/(?:^|\s)#(\w[\w-]*)/);
  const calendarTag = tagMatch ? tagMatch[1] : null;
  let rest = (tagMatch ? text.replace(tagMatch[0], ' ') : text).trim();
  if (!rest) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const selectedDay = new Date(referenceDay.getFullYear(), referenceDay.getMonth(), referenceDay.getDate());

  // 1. Pull out the repeat ("every monday") and its end ("until dec 1").
  const repeat = findRepeat(rest);
  let repeatUntil: string | null = null;
  if (repeat) {
    rest = rest.replace(repeat.text, ' ');
    const until = findUntil(rest, now);
    if (until) {
      repeatUntil = until.day;
      rest = rest.replace(until.text, ' ');
    }
  }

  // 2. Parse what's left. chrono may split it ("on Thursday" … "at 11:30 am to 12:30 pm") — merge.
  rest = expandClockWords(expandShortRanges(rest));
  const results = parser.parse(rest, now, { forwardDate: true });
  const isRelativeTime = (r: chrono.ParsedResult) => /\bin\s+\d+\s*(?:min|minute|hour|hr)/i.test(r.text);
  const dateResult = results.find(
    (r) => isRelativeTime(r) || (['day', 'weekday', 'month'] as const).some((part) => r.start.isCertain(part))
  );
  const timeResult = results.find((r) => r.start.isCertain('hour'));
  const endResult = timeResult?.end ? timeResult : results.find((r) => r.end?.isCertain('hour'));

  let titleText = rest;
  for (const r of results) titleText = titleText.replace(r.text, ' ');

  // 3. Which day.
  let day: Date;
  if (dateResult) {
    day = dateResult.start.date();
    // Only trust a year you actually typed; anything else stays in the coming year.
    if (dateResult.start.isCertain('year') && !/\b(19|20)\d{2}\b/.test(text)) {
      day.setFullYear(today.getFullYear());
      if (day < today) day.setFullYear(today.getFullYear() + 1);
    }
  } else if (repeat) {
    day = new Date(`${firstMatchingDay(repeat.rule, toDateKey(today))}T00:00`);
  } else {
    day = selectedDay;
  }

  // 4. Which time.
  let hour: number | null = null;
  let minute = 0;
  if (timeResult) {
    const start = timeResult.start.date();
    hour = start.getHours();
    minute = start.getMinutes();
    // "2:30" or "at 7" almost always means the afternoon/evening, not early morning.
    if (!timeResult.start.isCertain('meridiem') && hour >= 1 && hour <= 7) hour += 12;
  } else {
    for (const [pattern, defaultHour] of PART_OF_DAY) {
      const m = rest.match(pattern);
      if (m) {
        hour = defaultHour;
        titleText = titleText.replace(pattern, ' ');
        break;
      }
    }
  }

  const title = cleanTitle(titleText);
  if (!title) return null;
  const rule = weeklyOnStartDay(repeat?.rule ?? null, day);
  const base = { title, calendarTag, repeat: rule, repeatUntil, understood: Boolean(dateResult || hour !== null || repeat) };

  if (hour === null) {
    const startKey = toDateKey(day);
    // "trip oct 20 to oct 23" spans several whole days.
    const endDate = dateResult?.end?.date();
    const endKey = endDate && toDateKey(endDate) > startKey ? toDateKey(endDate) : startKey;
    return { ...base, starts_at: `${startKey}T00:00`, ends_at: `${endKey}T23:59`, allDay: true };
  }

  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
  let end = new Date(start.getTime() + HOUR);
  const parsedEnd = endResult?.end?.date();
  if (parsedEnd) {
    // Keep the end on the same day as the start: "work 9 to 5" means 9 AM–5 PM.
    const sameDayEnd = new Date(start);
    sameDayEnd.setHours(parsedEnd.getHours(), parsedEnd.getMinutes(), 0, 0);
    if (sameDayEnd <= start) sameDayEnd.setTime(sameDayEnd.getTime() + 12 * HOUR);
    if (sameDayEnd > start) end = sameDayEnd;
  }

  return { ...base, starts_at: toDateTimeKey(start), ends_at: toDateTimeKey(end), allDay: false };
}

/** A plain "weekly" repeats on the weekday it starts. */
function weeklyOnStartDay(rule: RepeatRule | null, day: Date): RepeatRule | null {
  if (rule?.freq !== 'weekly' || rule.weekdays?.length) return rule;
  return { ...rule, weekdays: [day.getDay()] };
}

function cleanTitle(raw: string): string {
  let title = raw.replace(/\s+/g, ' ').trim();
  for (let previous = ''; previous !== title; ) {
    previous = title;
    title = title.replace(DANGLING, '').trim();
  }
  return title.charAt(0).toUpperCase() + title.slice(1);
}
