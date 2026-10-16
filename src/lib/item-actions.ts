import type { SQLiteDatabase } from 'expo-sqlite';

import { addEventException, createEvent, deleteEvent, getEvent } from '@/db/events';
import { addTaskException, createTask, deleteTask, getTask, moveTask } from '@/db/tasks';
import type { CalendarItem } from '@/lib/calendar-items';
import { confirmDestructive } from '@/lib/confirm';
import { shiftKey } from '@/lib/dates';

/** A copy of an item as a new one-off on the same date (the long-press menu's Duplicate). */
export async function duplicateItem(db: SQLiteDatabase, item: CalendarItem) {
  if (item.kind === 'task') {
    const task = await getTask(db, item.id);
    if (!task) return;
    await createTask(db, {
      title: task.title,
      notes: task.notes,
      date: item.occurrenceDate,
      time: task.time,
      calendar_id: task.calendar_id,
      color: task.color,
      group: task.group_id ? { groupId: task.group_id } : undefined,
      item_type: task.item_type,
    });
    return;
  }
  const event = await getEvent(db, item.id);
  if (!event || !item.startsAt || !item.endsAt) return;
  await createEvent(db, {
    title: event.title,
    notes: event.notes,
    starts_at: item.startsAt,
    ends_at: item.endsAt,
    all_day: event.all_day === 1,
    calendar_id: event.calendar_id,
    color: event.color,
    group: event.group_id ? { groupId: event.group_id } : undefined,
    item_type: event.item_type,
  });
}

/** Pushes a one-off task a day later. */
export const moveToTomorrow = (db: SQLiteDatabase, item: CalendarItem) => moveTask(db, item.id, shiftKey(item.startDay, 1));

/** Asks, then deletes it; a repeating item loses just this date. */
export function confirmDeleteItem(db: SQLiteDatabase, item: CalendarItem, onDeleted: () => void) {
  const { repeating } = item;
  const what = item.kind === 'task' ? 'task' : 'event';
  confirmDestructive(
    `Delete ${what}?`,
    item.repeating ? `${item.title}\n\nJust this date; the rest of the series stays.` : item.title,
    'Delete',
    async () => {
      if (item.kind === 'task') await (repeating ? addTaskException(db, item.id, item.occurrenceDate) : deleteTask(db, item.id));
      else await (repeating ? addEventException(db, item.id, item.occurrenceDate) : deleteEvent(db, item.id));
      onDeleted();
    }
  );
}
