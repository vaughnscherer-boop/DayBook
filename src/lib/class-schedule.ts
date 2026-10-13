import type { CalendarEvent } from '@/db/events';
import type { Group } from '@/db/groups';
import { addDays, toDateKey } from '@/lib/dates';
import { bestGroup, courseCode } from '@/lib/grouping';
import { occurrences, parseRule } from '@/lib/recurrence';

/**
 * "Due next class": phrases that point at a class meeting instead of a date. A class is a group
 * that's a course (course code, imported syllabus, or holding a lecture/lab/class event); its
 * meetings are that group's timed events, repeats included.
 */

export type ClassInfo = {
  groupId: string;
  name: string;
  color: string;
  calendarId: string;
  keywords: string[];
  /** The group's timed events (lectures, labs...), repeating or not. */
  meetings: CalendarEvent[];
};

/** What the text asked for: the next meeting, the first on/after a day, or the n-th from now. */
export type ClassPhrase = {
  text: string;
  /** Words naming the course inside the phrase ("bio" in "next bio class"), if any. */
  courseHint: string | null;
  /** 1 = next meeting, 2 = the one after... */
  nth: number;
  /** "by class on friday": the weekday (0 Sun – 6 Sat) the meeting must be on or after. */
  weekday: number | null;
};

export type ClassMatch =
  | { kind: 'found'; groupId: string; name: string; calendarId: string; startsAt: string; reason: string }
  | { kind: 'choose'; options: ClassInfo[] }
  | { kind: 'none'; reason: string };

const CLASS_WORD = '(?:class|lecture|lab|section|seminar|discussion|recitation|tutorial|studio)';
const CLASS_EVENT = new RegExp(`\\b${CLASS_WORD}e?s?\\b`, 'i');
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, a: 1, an: 1 };
const WEEKDAY = '(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?';
const WEEKDAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const LOOKAHEAD_DAYS = 180;

/** The course groups and their meetings. */
export function buildClasses(groups: Group[], events: CalendarEvent[]): ClassInfo[] {
  return groups.flatMap((group) => {
    const keywords: string[] = JSON.parse(group.keywords);
    const meetings = events.filter((event) => event.group_id === group.id && event.all_day === 0);
    const isCourse =
      group.source === 'import' ||
      courseCode(group.name) !== null ||
      keywords.some((keyword) => courseCode(keyword) !== null) ||
      meetings.some((event) => CLASS_EVENT.test(event.title));
    if (!isCourse || meetings.length === 0) return [];
    return [{ groupId: group.id, name: group.name, color: group.color, calendarId: group.calendar_id, keywords, meetings }];
  });
}

/** Finds a "next class"-style phrase in the text. */
export function findClassPhrase(text: string): ClassPhrase | null {
  // "in two classes", "in 3 lectures", "two classes from now"
  let m = text.match(
    new RegExp(`\\b(?:(?:due\\s+)?in\\s+(\\d|one|two|three|four|five)\\s+${CLASS_WORD}e?s|(\\d|two|three|four|five)\\s+${CLASS_WORD}e?s\\s+from\\s+now)\\b`, 'i')
  );
  if (m) {
    const word = (m[1] ?? m[2]).toLowerCase();
    return { text: m[0], courseHint: null, nth: NUMBER_WORDS[word] ?? Number(word), weekday: null };
  }

  // "by class on friday", "for friday's lecture", "due friday's class"
  m = text.match(new RegExp(`\\b(?:(?:due|by|before|for|at|in)\\s+)?${CLASS_WORD}\\s+on\\s+${WEEKDAY}\\b`, 'i'));
  if (m) return { text: m[0], courseHint: null, nth: 1, weekday: WEEKDAY_INDEX[m[1].toLowerCase().slice(0, 3)] };
  m = text.match(new RegExp(`\\b(?:(?:due|by|before|for|at|in)\\s+)?${WEEKDAY}'?s\\s+${CLASS_WORD}\\b`, 'i'));
  if (m) return { text: m[0], courseHint: null, nth: 1, weekday: WEEKDAY_INDEX[m[1].toLowerCase().slice(0, 3)] };

  // "due next class", "for next bio lecture", "next cs 101 lab"
  m = text.match(new RegExp(`\\b(?:(?:due|by|before|for|at|in)\\s+)?(?:the\\s+)?next\\s+(?:([\\w ]{1,20}?)\\s+)?${CLASS_WORD}\\b`, 'i'));
  if (m) return { text: m[0], courseHint: m[1]?.trim() || null, nth: 1, weekday: null };

  // "next time we meet", "before class", "due in class", "by class"
  m = text.match(/\b(?:(?:due|by|before|for)\s+)?next\s+time\s+(?:we|class)\s+meets?\b/i) ??
    text.match(new RegExp(`\\b(?:due\\s+)?(?:before|by|in|at)\\s+${CLASS_WORD}\\b(?!\\s+on\\b)`, 'i'));
  if (m) return { text: m[0], courseHint: null, nth: 1, weekday: null };

  return null;
}

type Meeting = { startsAt: string; classInfo: ClassInfo };

/** Every meeting of these classes from `fromDay` for the next few months, in time order. */
function upcomingMeetings(classes: ClassInfo[], fromDay: string): Meeting[] {
  const toDay = toDateKey(addDays(new Date(`${fromDay}T00:00`), LOOKAHEAD_DAYS));
  const meetings: Meeting[] = [];
  for (const classInfo of classes) {
    for (const event of classInfo.meetings) {
      const seriesStart = event.starts_at.slice(0, 10);
      const time = event.starts_at.slice(11, 16);
      const rule = parseRule(event.repeat);
      const days = rule
        ? occurrences(seriesStart, rule, event.repeat_until, JSON.parse(event.exceptions || '[]'), fromDay, toDay)
        : seriesStart >= fromDay && seriesStart <= toDay
          ? [seriesStart]
          : [];
      for (const day of days) meetings.push({ startsAt: `${day}T${time}`, classInfo });
    }
  }
  return meetings.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Which class the text means: one it names, or the class you're in (or just left) today. */
function pickClass(phrase: ClassPhrase, title: string, classes: ClassInfo[], now: Date): ClassInfo | null {
  const asGroups = classes.map((c) => ({ id: c.groupId, calendarId: c.calendarId, keywords: c.keywords, source: 'user' as const }));
  for (const text of [phrase.courseHint, title]) {
    if (!text) continue;
    const named = bestGroup(text, asGroups);
    if (named) return classes.find((c) => c.groupId === named.id) ?? null;
  }
  // Nothing named: the class that started most recently today (you're in it, or it just ended).
  const today = toDateKey(now);
  const nowKey = `${today}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const startedToday = upcomingMeetings(classes, today).filter((m) => m.startsAt.startsWith(today) && m.startsAt <= nowKey);
  return startedToday.at(-1)?.classInfo ?? null;
}

const ordinal = (n: number) => (n === 1 ? 'next' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/**
 * Resolves a class phrase to a meeting time. `chosenGroupId` is the class picked from the
 * "Which class?" chips when the text didn't say.
 */
export function resolveClassPhrase(
  phrase: ClassPhrase,
  title: string,
  classes: ClassInfo[],
  now: Date,
  chosenGroupId?: string | null
): ClassMatch {
  if (classes.length === 0) {
    return { kind: 'none', reason: 'No classes yet — add one like “BIO 101 lecture every mon wed fri 10am”' };
  }
  const classInfo =
    (chosenGroupId && classes.find((c) => c.groupId === chosenGroupId)) || pickClass(phrase, title, classes, now);
  if (!classInfo) return { kind: 'choose', options: classes };

  const nowKey = `${toDateKey(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let upcoming = upcomingMeetings([classInfo], toDateKey(now)).filter((m) => m.startsAt > nowKey);
  if (phrase.weekday !== null) {
    upcoming = upcoming.filter((m) => new Date(`${m.startsAt}:00`).getDay() === phrase.weekday);
  }
  const meeting = upcoming[phrase.nth - 1];
  if (!meeting) return { kind: 'none', reason: `No upcoming ${classInfo.name} class found` };

  const which =
    phrase.weekday !== null
      ? `${classInfo.name} class on ${new Date(`${meeting.startsAt}:00`).toLocaleDateString(undefined, { weekday: 'long' })}`
      : `${ordinal(phrase.nth)} ${classInfo.name} class`;
  return {
    kind: 'found',
    groupId: classInfo.groupId,
    name: classInfo.name,
    calendarId: classInfo.calendarId,
    startsAt: meeting.startsAt,
    reason: which,
  };
}
