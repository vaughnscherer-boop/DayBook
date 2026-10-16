import type { Calendar } from '@/db/calendars';
import type { ClassInfo } from '@/lib/class-schedule';
import { calendarFor, type EntryKind } from '@/lib/create-entry';
import { addDays, toDateKey } from '@/lib/dates';
import { detectItemType } from '@/lib/item-type';
import { parseEvent, type ParsedEvent } from '@/lib/parse-event';

/**
 * The night check-in: a bullet list ("• gym 7am", "• bio hw due next class", "• call mom") turned
 * into events and tasks: tomorrow unless a line names a later day. Pure, so it can be checked without the app.
 */

export type PlannedLine = {
  /** The bullet's text, as typed (also the key for its "Which class?" choice). */
  text: string;
  kind: EntryKind;
  parsed: ParsedEvent;
  calendar: Calendar | null;
  unknownTag: string | null;
  /** True while "due next class" can't tell which class: the line needs a pick. */
  needsClass: boolean;
};

const BULLET = /^\s*(?:[•·\-*–—▪◦‣]|\d+[.)]|\[\s?\])\s*/;
// "todo buy milk" makes a task, like in the add box.
const TASK_PREFIX = /^(todo|\[\s?\])\s+/i;

/** The day being planned: tomorrow, except after midnight and before 4 AM, when it's still "today". */
export function planningDay(now = new Date()): string {
  return toDateKey(now.getHours() < 4 ? now : addDays(now, 1));
}

/** Each non-empty line without its bullet ("•", "-", "1.", "[ ]"). */
export function splitBullets(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(BULLET, '').trim())
    .filter(Boolean);
}

/**
 * Event or task: a time makes it an event ("gym 7am"), unless it's homework ("essay due 11:59pm",
 * "read ch 4 at 8"), which stays a task due then. No time = a task for that day.
 */
export function kindOf(line: string, parsed: ParsedEvent): EntryKind {
  if (TASK_PREFIX.test(line)) return 'task';
  if (parsed.classRef && parsed.classRef.kind !== 'none') return 'task';
  if (parsed.allDay && !parsed.repeat) {
    // A multi-day thing ("trip fri-sun") is still an event.
    return parsed.ends_at.slice(0, 10) > parsed.starts_at.slice(0, 10) ? 'event' : 'task';
  }
  const type = detectItemType(parsed.title, 'task', parsed.repeat !== null, false);
  if (type === 'assignment' || type === 'reading' || /\bdue\b/i.test(line)) return 'task';
  return 'event';
}

/** Reads every bullet. Lines come back sorted: timed things by time, then the rest as typed. */
export function planLines(
  text: string,
  day: string,
  context: {
    calendars: Calendar[];
    classes: ClassInfo[];
    defaultCalendarId: string | null;
    /** "Which class?" picks, by line text. */
    chosenClasses: Record<string, string>;
    now?: Date;
  }
): PlannedLine[] {
  const [y, m, d] = day.split('-').map(Number);
  const reference = new Date(y, m - 1, d);
  const lines = splitBullets(text).flatMap((line): PlannedLine[] => {
    const parsed = parseEvent(line.replace(TASK_PREFIX, ''), reference, {
      classes: context.classes,
      chosenClassId: context.chosenClasses[line] ?? null,
      now: context.now,
    });
    if (!parsed) return [];
    const { calendar, unknownTag } = calendarFor(parsed, context.calendars, context.defaultCalendarId);
    return [
      { text: line, kind: kindOf(line, parsed), parsed, calendar, unknownTag, needsClass: parsed.classRef?.kind === 'choose' },
    ];
  });
  const sortKey = (line: PlannedLine) => (line.parsed.allDay ? `${line.parsed.starts_at.slice(0, 10)}T99` : line.parsed.starts_at);
  return lines
    .map((line, i) => ({ line, i }))
    .sort((a, b) => sortKey(a.line).localeCompare(sortKey(b.line)) || a.i - b.i)
    .map(({ line }) => line);
}
