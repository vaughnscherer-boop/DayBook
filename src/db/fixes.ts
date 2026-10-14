import type { SQLiteDatabase } from 'expo-sqlite';

import { itemTypeOf } from '@/db/calendars';
import { createEvent, deleteEvent, getEvent, updateEvent, type CalendarEvent } from '@/db/events';
import type { Group } from '@/db/groups';
import { createTask, deleteTask, getTask, updateTask, type Task } from '@/db/tasks';
import { daysBetween, shiftKey } from '@/lib/dates';
import type { FixChange, FixItem } from '@/lib/fix-format';
import { firstMatchingDay, parseRule, type RepeatRule } from '@/lib/recurrence';
import { fitSeriesToTerm, type TermInfo } from '@/lib/terms';

/** A ref Claude can name: `e:<id>` for an event, `t:<id>` for a task. */
const refOf = (kind: 'event' | 'task', id: string) => `${kind[0]}:${id}`;
const idOf = (ref: string) => ref.slice(2);

/** One class's events and tasks (each series once) as "Fix mistakes" sends them. */
export function fixItemsOf(group: Group, events: CalendarEvent[], tasks: Task[]): FixItem[] {
  const weekdays = (repeat: string | null) => {
    const rule = parseRule(repeat);
    return rule?.freq === 'weekly' && rule.weekdays?.length ? rule.weekdays : null;
  };
  return [
    ...events
      .filter((e) => e.group_id === group.id)
      .map((e): FixItem => ({
        ref: refOf('event', e.id),
        kind: 'event',
        title: e.title,
        date: e.starts_at.slice(0, 10),
        start_time: e.all_day ? null : e.starts_at.slice(11, 16),
        end_time: e.all_day ? null : e.ends_at.slice(11, 16),
        weekdays: weekdays(e.repeat),
        repeat_until: e.repeat_until,
        item_type: itemTypeOf(e, 'event', group),
        details: e.details,
        done: false,
      })),
    ...tasks
      .filter((t) => t.group_id === group.id)
      .map((t): FixItem => ({
        ref: refOf('task', t.id),
        kind: 'task',
        title: t.title,
        date: t.date,
        start_time: t.time,
        end_time: null,
        weekdays: weekdays(t.repeat),
        repeat_until: t.repeat_until,
        item_type: itemTypeOf(t, 'task', group),
        details: t.details,
        done: t.done === 1,
      })),
  ];
}

const addHour = (time: string) => `${String(Math.min(Number(time.slice(0, 2)) + 1, 23)).padStart(2, '0')}${time.slice(2)}`;

/**
 * The repeat rule after a change: new weekdays make it weekly on them. A series isn't quietly turned
 * into a one-off (or a monthly one into weekly) when the change leaves weekdays out.
 */
function nextRule(current: RepeatRule | null, change: FixChange): RepeatRule | null {
  if (!change.weekdays) return current;
  return { freq: 'weekly', interval: current?.freq === 'weekly' ? current.interval : 1, weekdays: change.weekdays };
}

/** Start and end of an event on its (first) day: timed, or all day keeping its length in days. */
function eventTimes(change: FixChange, day: string, spanDays = 0) {
  if (!change.start_time) return { starts_at: `${day}T00:00`, ends_at: `${shiftKey(day, spanDays)}T23:59`, all_day: true };
  const end = change.end_time ?? addHour(change.start_time);
  return { starts_at: `${day}T${change.start_time}`, ends_at: `${day}T${end}`, all_day: false };
}

/** Applies the changes you ticked, all or nothing. Returns how many were applied. */
export async function applyFixes(db: SQLiteDatabase, group: Group, changes: FixChange[]): Promise<number> {
  let applied = 0;
  const term = group.term_id ? await db.getFirstAsync<TermInfo>('SELECT * FROM terms WHERE id = ?', group.term_id) : null;
  await db.withTransactionAsync(async () => {
    for (const change of changes) {
      if (change.op === 'delete' && change.ref) {
        if (change.kind === 'event') await deleteEvent(db, idOf(change.ref));
        else await deleteTask(db, idOf(change.ref));
        applied++;
        continue;
      }

      if (change.op === 'update' && change.ref) {
        if (change.kind === 'event') {
          const event = await getEvent(db, idOf(change.ref));
          if (!event) continue;
          const repeat = nextRule(parseRule(event.repeat), change);
          const day = repeat ? firstMatchingDay(repeat, change.date) : change.date;
          await updateEvent(db, event.id, {
            title: change.title,
            notes: event.notes,
            ...eventTimes(change, day, event.all_day ? Math.max(0, daysBetween(event.starts_at, event.ends_at)) : 0),
            calendar_id: event.calendar_id,
            color: event.color,
            repeat,
            repeat_until: repeat ? (change.repeat_until ?? event.repeat_until) : null,
            item_type: change.item_type,
          });
        } else {
          const task = await getTask(db, idOf(change.ref));
          if (!task) continue;
          const repeat = nextRule(parseRule(task.repeat), change);
          await updateTask(db, task.id, {
            title: change.title,
            notes: task.notes,
            date: repeat ? firstMatchingDay(repeat, change.date) : change.date,
            time: change.start_time,
            calendar_id: task.calendar_id,
            color: task.color,
            repeat,
            repeat_until: repeat ? (change.repeat_until ?? task.repeat_until) : null,
            item_type: change.item_type,
          });
        }
        applied++;
        continue;
      }

      if (change.op === 'add') {
        const repeat = nextRule(null, change);
        const day = repeat ? firstMatchingDay(repeat, change.date) : change.date;
        const common = {
          title: change.title,
          calendar_id: group.calendar_id,
          repeat,
          repeat_until: repeat ? change.repeat_until : null,
          item_type: change.item_type,
          group: { groupId: group.id },
        };
        if (change.kind === 'event') {
          const id = await createEvent(db, { ...common, ...eventTimes(change, day) });
          // A new weekly class (another section's lab, say) ends with the term and skips its breaks.
          if (repeat && term) {
            const fitted = fitSeriesToTerm({ repeat_until: change.repeat_until, exceptions: [] }, term);
            await db.runAsync(
              'UPDATE events SET repeat_until = ?, exceptions = ? WHERE id = ?',
              fitted.repeat_until,
              JSON.stringify(fitted.exceptions),
              id
            );
          }
        } else await createTask(db, { ...common, date: day, time: change.start_time });
        applied++;
      }
    }
  });
  return applied;
}
