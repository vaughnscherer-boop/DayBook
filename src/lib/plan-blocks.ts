import type { CalendarItem } from '@/lib/calendar-items';
import type { FreeGap } from '@/lib/day-brief';
import { shiftKey } from '@/lib/dates';
import { DEFAULT_TASK_MINUTES } from '@/lib/load';

export type WorkBlock = { task: CalendarItem; start: string; end: string }; // 'HH:MM'

const BREAK = 10;
const MIN_BLOCK = 20;
const AHEAD_DAYS = 7;
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/**
 * Work blocks for a free stretch on `day`: open tasks due in the next week (overdue ones first, then
 * soonest due, tests and homework before other tasks), each for its estimate, with short breaks.
 * Tasks that already have a block planned are left out. Pure, like day-brief.ts.
 */
export function planBlocks(items: CalendarItem[], gap: FreeGap, day: string): WorkBlock[] {
  const planned = new Set(items.filter((item) => item.taskId && item.startDay >= day).map((item) => item.taskId));
  const weight = (item: CalendarItem) => (item.itemType === 'exam' ? 0 : item.itemType === 'assignment' ? 1 : 2);
  const tasks = items
    .filter(
      (item) =>
        item.kind === 'task' &&
        !item.done &&
        !item.repeating &&
        !planned.has(item.id) &&
        item.startDay <= shiftKey(day, AHEAD_DAYS) &&
        (item.startDay >= day || item.createdDay <= item.startDay)
    )
    .sort((a, b) => a.startDay.localeCompare(b.startDay) || weight(a) - weight(b) || (a.time ?? '').localeCompare(b.time ?? ''));

  const blocks: WorkBlock[] = [];
  let cursor = minutes(gap.start);
  const end = minutes(gap.end);
  for (const task of tasks) {
    const room = end - cursor;
    if (room < MIN_BLOCK) break;
    const length = Math.min(task.minutes ?? DEFAULT_TASK_MINUTES, room);
    blocks.push({ task, start: clock(cursor), end: clock(cursor + length) });
    cursor += length + BREAK;
  }
  return blocks;
}
