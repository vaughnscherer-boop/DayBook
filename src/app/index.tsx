import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NewEntry } from '@/components/add-box';
import { CalendarHeader, type CalendarViewMode } from '@/components/calendar/calendar-header';
import { JumpToDate } from '@/components/calendar/jump-to-date';
import { MonthView } from '@/components/calendar/month-view';
import { PagedCalendar } from '@/components/calendar/paged-calendar';
import { TimeGrid } from '@/components/calendar/time-grid';
import { Drawer } from '@/components/drawer';
import { SidePanel } from '@/components/side-panel';
import { ThemedView } from '@/components/themed-view';
import { getSettings, setSetting } from '@/db/settings';
import { setOccurrenceDone, setTaskDone } from '@/db/tasks';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { createFromParsed } from '@/lib/create-entry';
import { addDays, addMonths, fromKey, monthGrid, toDateKey, todayKey, weekDays } from '@/lib/dates';
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

/** The focused date `pages` months/weeks/days away from `focusedDate`. */
function shiftFocus(view: CalendarViewMode, focusedDate: string, pages: number): string {
  const date = fromKey(focusedDate);
  if (view === 'month') return toDateKey(addMonths(date, pages));
  return toDateKey(addDays(date, view === 'week' ? 7 * pages : pages));
}

/** First and last day the view shows for `focusedDate`. */
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

/** What a page is "about", so a page keeps its key as it slides from neighbour to centre. */
function pageId(view: CalendarViewMode, focusedDate: string): string {
  if (view === 'month') return focusedDate.slice(0, 7);
  if (view === 'week') return weekDays(fromKey(focusedDate))[0];
  return focusedDate;
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
  const { itemsBetween, calendars, groups, classes, reload } = useCalendarData();
  const inputRef = useRef<TextInput>(null);

  const [view, setView] = useState<CalendarViewMode>('month');
  const [focusedDate, setFocusedDate] = useState(todayKey());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelDocked, setPanelDocked] = useState(true);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [calendarId, setCalendarId] = useState<string | null>(null);

  // Load the neighbouring pages too, so they already show their items while being dragged in.
  const rangeStart = visibleRange(view, shiftFocus(view, focusedDate, -1))[0];
  const rangeEnd = visibleRange(view, shiftFocus(view, focusedDate, 1))[1];
  const items = useMemo(() => itemsBetween(rangeStart, rangeEnd), [itemsBetween, rangeStart, rangeEnd]);

  // The add box starts on the calendar you used last time, else the default one. First launch on
  // this device shows the intro.
  useEffect(() => {
    getSettings(db).then((settings) => {
      setCalendarId(settings.lastCalendarId);
      if (!settings.onboardingDone) router.push('/onboarding');
    });
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

  // `/?date=YYYY-MM-DD` opens that day (after the night check-in, and older morning notifications).
  // `/?add=tomorrow` came from night notifications scheduled before the check-in screen existed.
  const params = useLocalSearchParams<{ add?: string; date?: string }>();
  const [handledRequest, setHandledRequest] = useState<string | undefined>(undefined);
  if (params.date !== handledRequest) {
    setHandledRequest(params.date);
    if (params.date) {
      setFocusedDate(params.date);
      setView('day');
    }
  }
  useEffect(() => {
    if (params.add === 'tomorrow') {
      router.setParams({ add: undefined });
      router.push('/tomorrow');
    } else if (params.date) {
      router.setParams({ date: undefined });
    }
  }, [params.add, params.date]);

  const step = (direction: 1 | -1) => setFocusedDate(shiftFocus(view, focusedDate, direction));
  const zoom = (direction: 1 | -1) => {
    const index = ZOOM_ORDER.indexOf(view) + direction;
    if (index >= 0 && index < ZOOM_ORDER.length) setView(ZOOM_ORDER[index]);
  };
  const openDay = (day: string) => {
    setFocusedDate(day);
    setView('day');
  };

  const add = async ({ kind, parsed, calendarId: chosen }: NewEntry) => {
    await createFromParsed(db, kind, parsed, chosen);
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
      groups={groups}
      classes={classes}
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
  const renderPage = (page: -1 | 0 | 1) => {
    const date = shiftFocus(view, focusedDate, page);
    return view === 'month' ? (
      <MonthView focusedDate={date} {...viewProps} />
    ) : (
      <TimeGrid
        days={view === 'week' ? weekDays(fromKey(date)) : [date]}
        onCreateAt={(start) => router.push({ pathname: '/event/[id]', params: { id: 'new', start } })}
        {...viewProps}
      />
    );
  };
  const pageKeys = ([-1, 0, 1] as const).map((page) => `${view}-${pageId(view, shiftFocus(view, focusedDate, page))}`) as [
    string,
    string,
    string,
  ];

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
          <View style={styles.body}>
            <PagedCalendar
              axis={view === 'month' ? 'y' : 'x'}
              pageKey={pageKeys[1]}
              pageKeys={pageKeys}
              renderPage={renderPage}
              onZoomIn={() => zoom(1)}
              onZoomOut={() => zoom(-1)}
              onNext={() => step(1)}
              onPrev={() => step(-1)}
            />
          </View>
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
