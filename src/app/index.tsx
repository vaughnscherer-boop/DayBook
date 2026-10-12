import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NewEntry } from '@/components/add-box';
import { CalendarHeader, type CalendarViewMode } from '@/components/calendar/calendar-header';
import { JumpToDate } from '@/components/calendar/jump-to-date';
import { MonthView } from '@/components/calendar/month-view';
import { TimeGrid } from '@/components/calendar/time-grid';
import { ZoomGestures } from '@/components/calendar/zoom-gestures';
import { Drawer } from '@/components/drawer';
import { SidePanel } from '@/components/side-panel';
import { ThemedView } from '@/components/themed-view';
import { createEvent } from '@/db/events';
import { getSettings, setSetting } from '@/db/settings';
import { createTask, setOccurrenceDone, setTaskDone } from '@/db/tasks';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { addDays, addMonths, fromKey, monthGrid, toDateKey, todayKey, tomorrowKey, weekDays } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';

const WIDE_BREAKPOINT = 900;
const PANEL_WIDTH = 320;
const ZOOM_ORDER: CalendarViewMode[] = ['month', 'week', 'day'];

function titleFor(view: CalendarViewMode, focusedDate: string, wide: boolean) {
  const date = fromKey(focusedDate);
  if (view === 'month') return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (view === 'day') {
    return date.toLocaleDateString(undefined, {
      weekday: wide ? 'long' : 'short',
      month: 'short',
      day: 'numeric',
      ...(wide && { year: 'numeric' }),
    });
  }
  const days = weekDays(date);
  const first = fromKey(days[0]);
  const last = fromKey(days[6]);
  const start = first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const end = last.toLocaleDateString(undefined, {
    ...(first.getMonth() !== last.getMonth() && { month: 'short' }),
    day: 'numeric',
  });
  return `${start} – ${end}, ${last.getFullYear()}`;
}

/** First and last day the current view shows. */
function visibleRange(view: CalendarViewMode, focusedDate: string): [string, string] {
  const date = fromKey(focusedDate);
  if (view === 'day') return [focusedDate, focusedDate];
  if (view === 'week') {
    const days = weekDays(date);
    return [days[0], days[6]];
  }
  const weeks = monthGrid(date);
  return [weeks[0][0], weeks[weeks.length - 1][6]];
}

/** Opens the editor on this occurrence (the date matters for repeating items). */
function openItem(item: CalendarItem) {
  router.push({
    pathname: item.kind === 'task' ? '/task/[id]' : '/event/[id]',
    params: { id: item.id, date: item.occurrenceDate },
  });
}

export default function CalendarScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const { itemsBetween, calendars, reload } = useCalendarData();
  const inputRef = useRef<TextInput>(null);

  const [view, setView] = useState<CalendarViewMode>('month');
  const [focusedDate, setFocusedDate] = useState(todayKey());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelDocked, setPanelDocked] = useState(true);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [calendarId, setCalendarId] = useState<string | null>(null);

  const [rangeStart, rangeEnd] = visibleRange(view, focusedDate);
  const items = useMemo(() => itemsBetween(rangeStart, rangeEnd), [itemsBetween, rangeStart, rangeEnd]);

  // The add box starts on the calendar you used last time, else the default one.
  useEffect(() => {
    getSettings(db).then((settings) => setCalendarId(settings.lastCalendarId));
  }, [db]);
  const addCalendarId =
    calendars.find((c) => c.id === calendarId)?.id ?? calendars.find((c) => c.is_default)?.id ?? null;
  const changeCalendar = (id: string) => {
    setCalendarId(id);
    setSetting(db, 'lastCalendarId', id);
  };

  const openPanel = () => {
    if (wide) setPanelDocked(true);
    else setDrawerOpen(true);
  };

  // Notification taps arrive as `/?add=tomorrow` (night) or `/?date=YYYY-MM-DD` (morning).
  const params = useLocalSearchParams<{ add?: string; date?: string }>();
  const request = params.add === 'tomorrow' ? tomorrowKey() : params.date;
  const [handledRequest, setHandledRequest] = useState<string | undefined>(undefined);
  if (request !== handledRequest) {
    setHandledRequest(request);
    if (request) {
      setFocusedDate(request);
      setView('day');
      if (params.add === 'tomorrow') {
        if (wide) setPanelDocked(true);
        else setDrawerOpen(true);
      }
    }
  }
  useEffect(() => {
    if (params.add === 'tomorrow') {
      setTimeout(() => inputRef.current?.focus(), 450);
      router.setParams({ add: undefined });
    } else if (params.date) {
      router.setParams({ date: undefined });
    }
  }, [params.add, params.date]);

  const step = (direction: 1 | -1) => {
    const date = fromKey(focusedDate);
    const next =
      view === 'month' ? addMonths(date, direction) : addDays(date, view === 'week' ? 7 * direction : direction);
    setFocusedDate(toDateKey(next));
  };
  const zoom = (direction: 1 | -1) => {
    const index = ZOOM_ORDER.indexOf(view) + direction;
    if (index >= 0 && index < ZOOM_ORDER.length) setView(ZOOM_ORDER[index]);
  };
  const openDay = (day: string) => {
    setFocusedDate(day);
    setView('day');
  };

  const add = async ({ kind, parsed, calendarId: chosen }: NewEntry) => {
    if (kind === 'event') {
      await createEvent(db, {
        title: parsed.title,
        starts_at: parsed.starts_at,
        ends_at: parsed.ends_at,
        all_day: parsed.allDay,
        calendar_id: chosen,
        repeat: parsed.repeat,
        repeat_until: parsed.repeatUntil,
      });
    } else {
      await createTask(db, {
        title: parsed.title,
        date: parsed.starts_at.slice(0, 10),
        time: parsed.allDay ? null : parsed.starts_at.slice(11, 16),
        calendar_id: chosen,
        repeat: parsed.repeat,
        repeat_until: parsed.repeatUntil,
      });
    }
    setFocusedDate(parsed.starts_at.slice(0, 10));
    setDrawerOpen(false);
    await reload();
    rescheduleAll(db);
  };

  const toggleTask = async (item: CalendarItem) => {
    // A repeating task is ticked off just for this date.
    if (item.repeating) await setOccurrenceDone(db, item.id, item.occurrenceDate, !item.done);
    else await setTaskDone(db, item.id, !item.done);
    await reload();
    rescheduleAll(db);
  };

  const panel = (
    <SidePanel
      calendars={calendars}
      focusedDate={focusedDate}
      calendarId={addCalendarId}
      onCalendarChange={changeCalendar}
      onAdd={add}
      itemsBetween={itemsBetween}
      onOpenItem={(item) => {
        setDrawerOpen(false);
        openItem(item);
      }}
      onToggleTask={toggleTask}
      onChanged={() => {
        reload();
        rescheduleAll(db);
      }}
      inputRef={inputRef}
    />
  );

  const viewProps = { items, wide, onOpenItem: openItem, onToggleTask: toggleTask, onOpenDay: openDay };
  const body =
    view === 'month' ? (
      <MonthView focusedDate={focusedDate} {...viewProps} />
    ) : (
      <TimeGrid
        days={view === 'week' ? weekDays(fromKey(focusedDate)) : [focusedDate]}
        onCreateAt={(start) => router.push({ pathname: '/event/[id]', params: { id: 'new', start } })}
        {...viewProps}
      />
    );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.row} edges={['top', 'left', 'right', 'bottom']}>
        {wide && panelDocked && (
          <View style={[styles.docked, { borderColor: theme.backgroundSelected }]}>{panel}</View>
        )}

        <View style={styles.main}>
          <CalendarHeader
            view={view}
            title={titleFor(view, focusedDate, wide)}
            wide={wide}
            onViewChange={setView}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onToday={() => setFocusedDate(todayKey())}
            onTitlePress={() => setJumpOpen(true)}
            onTogglePanel={() => (wide ? setPanelDocked(!panelDocked) : openPanel())}
          />
          <ZoomGestures
            onZoomIn={() => zoom(1)}
            onZoomOut={() => zoom(-1)}
            onNext={() => step(1)}
            onPrev={() => step(-1)}>
            <View style={styles.body}>{body}</View>
          </ZoomGestures>
        </View>
      </SafeAreaView>

      {!wide && (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          {panel}
        </Drawer>
      )}

      <JumpToDate
        visible={jumpOpen}
        date={focusedDate}
        onPick={(day) => {
          setFocusedDate(day);
          setJumpOpen(false);
        }}
        onClose={() => setJumpOpen(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  docked: { width: PANEL_WIDTH, borderRightWidth: StyleSheet.hairlineWidth },
  main: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 4 },
});
