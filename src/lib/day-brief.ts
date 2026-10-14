import { isMultiDay, itemsOnDay, type CalendarItem } from '@/lib/calendar-items';
import { sessionsFor } from '@/lib/study-sessions';
import { addDays, daysBetween, fromKey, toDateKey } from '@/lib/dates';

/**
 * The morning brief: today's schedule with its free time, what's due, what's still open from
 * earlier, and the tests and homework coming up this week. Pure, so it can be checked without the app.
 */

export type FreeGap = { kind: 'free'; start: string; end: string }; // 'HH:MM'
export type TimelineEntry = { kind: 'item'; item: CalendarItem } | FreeGap;

export type DayBrief = {
  day: string;
  /** "2 classes · 3 things due · Quiz 4 on Friday" */
  summary: string;
  allDay: CalendarItem[];
  /** Timed events in order, with free stretches of an hour or more between them. */
  timeline: TimelineEntry[];
  dueToday: CalendarItem[];
  /** Unticked one-off tasks from the last two weeks (repeating ones just roll on). */
  stillOpen: CalendarItem[];
  /** Exams and homework in the next 7 days. */
  comingUp: CalendarItem[];
  /** Study sessions already planned, by `comingUp` item key. */
  planned: Record<string, number>;
};

const DAY_START = '08:00';
const DAY_END = '21:00';
const MIN_GAP_MINUTES = 60;
const LOOK_BACK_DAYS = 14;
const LOOK_AHEAD_DAYS = 7;

/** The dates `buildBrief` needs items for. */
export function briefRange(day: string): [string, string] {
  const date = fromKey(day);
  return [toDateKey(addDays(date, -LOOK_BACK_DAYS)), toDateKey(addDays(date, LOOK_AHEAD_DAYS))];
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`;

function weekdayName(day: string, today: string): string {
  const ahead = daysBetween(today, day);
  if (ahead === 0) return 'today';
  if (ahead === 1) return 'tomorrow';
  return fromKey(day).toLocaleDateString(undefined, { weekday: 'long' });
}

/** Free stretches between `timed` events inside the waking day (from `now` onward when it's today). */
export function freeGaps(timed: CalendarItem[], from: string, minGap = MIN_GAP_MINUTES): FreeGap[] {
  const gaps: FreeGap[] = [];
  let cursor = minutes(from > DAY_START ? from : DAY_START);
  const end = minutes(DAY_END);
  const busy = timed
    .map((item) => [minutes(item.startsAt!.slice(11, 16)), item.endsAt!.slice(0, 10) > item.startDay ? end : minutes(item.endsAt!.slice(11, 16))])
    .sort((a, b) => a[0] - b[0]);
  for (const [start, stop] of [...busy, [end, end]]) {
    const gapEnd = Math.min(start, end);
    if (gapEnd - cursor >= minGap) gaps.push({ kind: 'free', start: clock(cursor), end: clock(gapEnd) });
    cursor = Math.max(cursor, stop);
  }
  return gaps;
}

/** Free stretches of at least `minGap` minutes on `day` (after `from`, e.g. now, when given). */
export function freeGapsOn(items: CalendarItem[], day: string, from = DAY_START, minGap = MIN_GAP_MINUTES): FreeGap[] {
  const timed = itemsOnDay(items, day).filter((item) => item.kind === 'event' && !item.allDay && !isMultiDay(item));
  return freeGaps(timed, from, minGap);
}

export function buildBrief(items: CalendarItem[], day: string, now = new Date()): DayBrief {
  const isToday = toDateKey(now) === day;
  const todays = itemsOnDay(items, day);
  const allDay = todays.filter((item) => item.kind === 'event' && (item.allDay || isMultiDay(item)));
  const timed = todays.filter((item) => item.kind === 'event' && !item.allDay && !isMultiDay(item));
  const dueToday = todays.filter((item) => item.kind === 'task');

  // Free time from now on (today) or the whole day (another day), interleaved with the events.
  const from = isToday ? clock(now.getHours() * 60 + now.getMinutes()) : DAY_START;
  const timeline: TimelineEntry[] = [
    ...timed.map((item): TimelineEntry => ({ kind: 'item', item })),
    ...freeGaps(timed, from),
  ].sort((a, b) => {
    const start = (entry: TimelineEntry) => (entry.kind === 'free' ? entry.start : entry.item.startsAt!.slice(11, 16));
    return start(a).localeCompare(start(b));
  });

  // Only things you had before they were due: a syllabus imported mid-term adds weeks of past
  // homework that was never really "yours" to finish.
  const stillOpen = items
    .filter(
      (item) =>
        item.kind === 'task' && !item.repeating && !item.done && item.startDay < day && item.createdDay <= item.startDay
    )
    .sort((a, b) => b.startDay.localeCompare(a.startDay));

  const lastDay = toDateKey(addDays(fromKey(day), LOOK_AHEAD_DAYS));
  const comingUp = items
    .filter(
      (item) =>
        item.startDay > day &&
        item.startDay <= lastDay &&
        !item.done &&
        // A daily habit isn't news; one-off tests and homework are.
        !item.repeating &&
        (item.itemType === 'exam' || (item.kind === 'task' && item.itemType === 'assignment'))
    )
    .sort((a, b) => a.startDay.localeCompare(b.startDay) || (a.time ?? '').localeCompare(b.time ?? ''));

  const classes = timed.filter((item) => item.itemType === 'class').length;
  const due = dueToday.filter((item) => !item.done).length;
  const exams = todays.filter((item) => item.itemType === 'exam');
  // Tests are named on their own, so they aren't counted again as "other events".
  const others = timed.filter((item) => item.itemType !== 'class' && item.itemType !== 'exam').length;
  const nextExam = comingUp.find((item) => item.itemType === 'exam');
  const parts = [
    classes > 0 ? plural(classes, 'class') : null,
    others > 0 ? plural(others, classes > 0 ? 'other event' : 'event') : null,
    due > 0 ? `${due} thing${due === 1 ? '' : 's'} due` : null,
    exams.length > 0 ? `${exams[0].title} today` : nextExam ? `${nextExam.title} ${weekdayName(nextExam.startDay, day)}` : null,
  ].filter(Boolean);

  return {
    day,
    summary: parts.length > 0 ? parts.join(' · ') : 'Nothing scheduled — a free day',
    allDay,
    timeline,
    dueToday,
    stillOpen,
    comingUp,
    planned: Object.fromEntries(
      comingUp.filter((item) => item.itemType === 'exam').map((item) => [item.key, sessionsFor(items, item).length])
    ),
  };
}

/** "in 3 days", "tomorrow" */
export function untilText(day: string, from: string): string {
  const ahead = daysBetween(from, day);
  if (ahead <= 0) return 'today';
  if (ahead === 1) return 'tomorrow';
  return `in ${ahead} days`;
}
