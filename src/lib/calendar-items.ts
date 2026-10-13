import { itemColor, itemTypeOf, type Calendar } from '@/db/calendars';
import type { CalendarEvent } from '@/db/events';
import type { Group } from '@/db/groups';
import type { Task, TaskCompletion } from '@/db/tasks';
import { daysBetween, shiftKey, toDateKey } from '@/lib/dates';
import type { ItemType } from '@/lib/item-type';
import { occurrences, parseRule } from '@/lib/recurrence';

/** One occurrence of an event or task, flattened into what the month/week/day views draw. */
export type CalendarItem = {
  kind: 'event' | 'task';
  id: string;
  /** Unique per occurrence: `${kind}-${id}-${occurrenceDate}`. */
  key: string;
  /** The date this occurrence starts (differs from the series start for repeats). */
  occurrenceDate: string;
  repeating: boolean;
  title: string;
  color: string;
  groupId: string | null;
  /** Class, exam, assignment… within its group (guessed from the title unless set). */
  itemType: ItemType;
  /** What an imported syllabus says about it. */
  details: string | null;
  notes: string | null;
  /** The local day it was added to Daybook. */
  createdDay: string;
  startDay: string; // 'YYYY-MM-DD'
  endDay: string; // later than startDay only for multi-day all-day events
  allDay: boolean; // all-day event, or task without a time
  time: string | null; // 'HH:MM' start, when it has one
  startsAt: string | null; // events only, 'YYYY-MM-DDTHH:MM'
  endsAt: string | null;
  done: boolean;
};

/** The dates an event/task series occurs within [rangeStart, rangeEnd]; one-offs give their own date. */
function datesInRange(
  item: { repeat: string | null; repeat_until: string | null; exceptions: string },
  startDay: string,
  endDay: string,
  rangeStart: string,
  rangeEnd: string
): string[] {
  const rule = parseRule(item.repeat);
  if (!rule) return startDay <= rangeEnd && endDay >= rangeStart ? [startDay] : [];
  const exceptions: string[] = JSON.parse(item.exceptions || '[]');
  return occurrences(startDay, rule, item.repeat_until, exceptions, rangeStart, rangeEnd, daysBetween(startDay, endDay));
}

type BuildOptions = { includeHidden?: boolean; groups?: Group[] };

/**
 * Merges events and tasks into per-occurrence items for the dates [rangeStart, rangeEnd],
 * expanding repeats and dropping anything in a hidden calendar.
 */
export function buildItems(
  events: CalendarEvent[],
  tasks: Task[],
  completions: TaskCompletion[],
  calendars: Calendar[],
  rangeStart: string,
  rangeEnd: string,
  { includeHidden = false, groups = [] }: BuildOptions = {}
): CalendarItem[] {
  const byId = Object.fromEntries(calendars.map((calendar) => [calendar.id, calendar]));
  const groupsById = Object.fromEntries(groups.map((group) => [group.id, group]));
  const isVisible = (calendarId: string | null) =>
    includeHidden || !calendarId || byId[calendarId]?.visible !== 0;
  const completed = new Set(completions.map((c) => `${c.task_id}|${c.date}`));

  const items: CalendarItem[] = [];
  for (const event of events) {
    if (!isVisible(event.calendar_id)) continue;
    const allDay = event.all_day === 1;
    const seriesStart = event.starts_at.slice(0, 10);
    const seriesEnd = allDay ? event.ends_at.slice(0, 10) : seriesStart;
    const eventType = itemTypeOf(event, 'event', event.group_id ? groupsById[event.group_id] : null);
    for (const date of datesInRange(event, seriesStart, seriesEnd, rangeStart, rangeEnd)) {
      const shift = daysBetween(seriesStart, date);
      const startsAt = shiftKey(event.starts_at, shift);
      const endsAt = shiftKey(event.ends_at, shift);
      items.push({
        kind: 'event',
        id: event.id,
        key: `event-${event.id}-${date}`,
        occurrenceDate: date,
        repeating: event.repeat !== null,
        title: event.title,
        color: itemColor(event, 'event', byId, groupsById),
        groupId: event.group_id,
        itemType: eventType,
        details: event.details,
        notes: event.notes,
        createdDay: toDateKey(new Date(event.created_at)),
        startDay: date,
        // Timed events that run past midnight still live on their start day.
        endDay: allDay ? endsAt.slice(0, 10) : date,
        allDay,
        time: allDay ? null : startsAt.slice(11, 16),
        startsAt,
        endsAt,
        done: false,
      });
    }
  }
  for (const task of tasks) {
    if (!isVisible(task.calendar_id)) continue;
    const repeating = task.repeat !== null;
    const taskType = itemTypeOf(task, 'task', task.group_id ? groupsById[task.group_id] : null);
    for (const date of datesInRange(task, task.date, task.date, rangeStart, rangeEnd)) {
      items.push({
        kind: 'task',
        id: task.id,
        key: `task-${task.id}-${date}`,
        occurrenceDate: date,
        repeating,
        title: task.title,
        color: itemColor(task, 'task', byId, groupsById),
        groupId: task.group_id,
        itemType: taskType,
        details: task.details,
        notes: task.notes,
        createdDay: toDateKey(new Date(task.created_at)),
        startDay: date,
        endDay: date,
        allDay: !task.time,
        time: task.time,
        startsAt: null,
        endsAt: null,
        done: repeating ? completed.has(`${task.id}|${date}`) : task.done === 1,
      });
    }
  }
  return items;
}

export const isMultiDay = (item: CalendarItem) => item.endDay > item.startDay;

/** Display order inside a day: all-day events, timed events, then tasks (timed before untimed). */
function compareInDay(a: CalendarItem, b: CalendarItem) {
  if (a.kind !== b.kind) return a.kind === 'event' ? -1 : 1;
  if (a.allDay !== b.allDay) return a.kind === 'event' ? (a.allDay ? -1 : 1) : a.allDay ? 1 : -1;
  return (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title);
}

/** Everything touching `day`, multi-day events included, in display order. */
export function itemsOnDay(items: CalendarItem[], day: string): CalendarItem[] {
  return items.filter((item) => item.startDay <= day && item.endDay >= day).sort(compareInDay);
}

/** Single-day items grouped by day, each list in display order. */
export function singleDayItemsByDay(items: CalendarItem[]): Record<string, CalendarItem[]> {
  const byDay: Record<string, CalendarItem[]> = {};
  for (const item of items) {
    if (isMultiDay(item)) continue;
    (byDay[item.startDay] ??= []).push(item);
  }
  for (const list of Object.values(byDay)) list.sort(compareInDay);
  return byDay;
}

export type WeekSegment = { item: CalendarItem; startCol: number; endCol: number; lane: number };

/**
 * Lays multi-day events across one week row (7 day keys) as bars. Each bar gets a lane
 * (row inside the week) so overlapping bars stack instead of colliding.
 */
export function weekSegments(items: CalendarItem[], week: string[]): WeekSegment[] {
  const first = week[0];
  const last = week[6];
  const spanning = items
    .filter((item) => isMultiDay(item) && item.startDay <= last && item.endDay >= first)
    .sort((a, b) => a.startDay.localeCompare(b.startDay) || b.endDay.localeCompare(a.endDay));

  const laneEnds: number[] = []; // last occupied column per lane
  return spanning.map((item) => {
    const startCol = item.startDay < first ? 0 : week.indexOf(item.startDay);
    const endCol = item.endDay > last ? 6 : week.indexOf(item.endDay);
    let lane = laneEnds.findIndex((end) => end < startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = endCol;
    return { item, startCol, endCol, lane };
  });
}

/** `hex` at `alpha` opacity, for soft tinted fills. */
export function tint(hex: string, alpha: number): string {
  return `${hex.slice(0, 7)}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/** Black or white, whichever reads better on `hex`. */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luminance = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.7 ? '#000000' : '#ffffff';
}
