import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { listCalendars, type Calendar } from '@/db/calendars';
import { listEvents, type CalendarEvent } from '@/db/events';
import { autoGroup, listGroups, type Group } from '@/db/groups';
import { listCompletions, listTasks, type Task, type TaskCompletion } from '@/db/tasks';
import { buildItems, type CalendarItem } from '@/lib/calendar-items';
import { buildClasses } from '@/lib/class-schedule';
import { notifyLocalChange, onDataChanged } from '@/lib/data-events';

/**
 * Loads events, tasks, task completions, calendars and groups, reloading whenever the screen comes
 * back into focus (e.g. after an editor closes). Each reload first runs automatic grouping, so
 * anything just added or renamed lands in its group. `itemsBetween(start, end)` expands repeats
 * into colored, visible-only occurrences for just those dates.
 */
export function useCalendarData() {
  const db = useSQLiteContext();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const reload = useCallback(async () => {
    await autoGroup(db);
    const [nextEvents, nextTasks, nextCompletions, nextCalendars, nextGroups] = await Promise.all([
      listEvents(db),
      listTasks(db),
      listCompletions(db),
      listCalendars(db),
      listGroups(db),
    ]);
    setEvents(nextEvents);
    setTasks(nextTasks);
    setCompletions(nextCompletions);
    setCalendars(nextCalendars);
    setGroups(nextGroups);
    // Linked iPhone calendars pick up whatever just changed.
    notifyLocalChange();
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );
  // Sync brought in changes from another device.
  useEffect(() => onDataChanged(reload), [reload]);

  const itemsBetween = useCallback(
    (start: string, end: string): CalendarItem[] =>
      buildItems(events, tasks, completions, calendars, start, end, { groups }),
    [events, tasks, completions, calendars, groups]
  );

  // Course groups and their meetings, for "due next class".
  const classes = useMemo(() => buildClasses(groups, events), [groups, events]);

  return { itemsBetween, calendars, groups, classes, reload };
}
