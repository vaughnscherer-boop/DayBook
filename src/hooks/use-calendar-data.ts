import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { listCalendars, type Calendar } from '@/db/calendars';
import { listEvents, type CalendarEvent } from '@/db/events';
import { listCompletions, listTasks, type Task, type TaskCompletion } from '@/db/tasks';
import { buildItems, type CalendarItem } from '@/lib/calendar-items';

/**
 * Loads events, tasks, task completions and calendars, reloading whenever the screen comes back
 * into focus (e.g. after an editor closes). `itemsBetween(start, end)` expands repeats into
 * colored, visible-only occurrences for just those dates.
 */
export function useCalendarData() {
  const db = useSQLiteContext();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);

  const reload = useCallback(async () => {
    const [nextEvents, nextTasks, nextCompletions, nextCalendars] = await Promise.all([
      listEvents(db),
      listTasks(db),
      listCompletions(db),
      listCalendars(db),
    ]);
    setEvents(nextEvents);
    setTasks(nextTasks);
    setCompletions(nextCompletions);
    setCalendars(nextCalendars);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const itemsBetween = useCallback(
    (start: string, end: string): CalendarItem[] => buildItems(events, tasks, completions, calendars, start, end),
    [events, tasks, completions, calendars]
  );

  return { itemsBetween, calendars, reload };
}
