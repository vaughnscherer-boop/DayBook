import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/bottom-bar';
import { CalendarHeader, type CalendarViewMode } from '@/components/calendar/calendar-header';
import { DaySchedule } from '@/components/calendar/day-schedule';
import { JumpToDate } from '@/components/calendar/jump-to-date';
import { DayListScroll, MonthGrid } from '@/components/calendar/month-agenda';
import { PagedCalendar } from '@/components/calendar/paged-calendar';
import { TimeGrid } from '@/components/calendar/time-grid';
import { WeekStrip } from '@/components/calendar/week-strip';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { addDays, addMonths, fromKey, monthGrid, toDateKey, todayKey, weekDays } from '@/lib/dates';
import { tap, tick } from '@/lib/haptics';
import { toggleTask } from '@/lib/task-toggle';

const WIDE_BREAKPOINT = 900;
/** Six week rows plus the weekday row, so every month's grid is the same height. */
const MONTH_GRID_HEIGHT = 28 + 6 * 52;
const WIDE_GRID_WIDTH = 440;
const ZOOM_ORDER: CalendarViewMode[] = ['month', 'week', 'day'];

function titleFor(view: CalendarViewMode, focusedDate: string, wide: boolean) {
  const date = fromKey(focusedDate);
  if (view === 'month') return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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
  const tabBarSpace = useTabBarSpace();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const { itemsBetween, groups, reload } = useCalendarData();

  const [view, setView] = useState<CalendarViewMode>('month');
  const [focusedDate, setFocusedDate] = useState(todayKey());
  const [jumpOpen, setJumpOpen] = useState(false);

  // Load the neighbouring pages too, so they already show their items while being dragged in.
  const rangeStart = visibleRange(view, shiftFocus(view, focusedDate, -1))[0];
  const rangeEnd = visibleRange(view, shiftFocus(view, focusedDate, 1))[1];
  const items = useMemo(() => itemsBetween(rangeStart, rangeEnd), [itemsBetween, rangeStart, rangeEnd]);

  // `/calendar?date=YYYY-MM-DD` (from quick add, the brief, the night check-in) selects that day.
  const params = useLocalSearchParams<{ date?: string }>();
  const [handledRequest, setHandledRequest] = useState<string | undefined>(undefined);
  if (params.date !== handledRequest) {
    setHandledRequest(params.date);
    if (params.date) {
      setFocusedDate(params.date);
      if (view === 'week') setView('day');
    }
  }
  useEffect(() => {
    if (params.date) router.setParams({ date: undefined });
  }, [params.date]);

  const step = (direction: 1 | -1) => {
    tick();
    setFocusedDate(shiftFocus(view, focusedDate, direction));
  };
  const changeView = (next: CalendarViewMode) => {
    if (next !== view) tap();
    setView(next);
  };
  const zoom = (direction: 1 | -1) => {
    const index = ZOOM_ORDER.indexOf(view) + direction;
    if (index >= 0 && index < ZOOM_ORDER.length) changeView(ZOOM_ORDER[index]);
  };
  const openDay = (day: string) => {
    setFocusedDate(day);
    setView('day');
  };

  const toggle = (item: CalendarItem) => toggleTask(db, item, reload);

  const viewProps = { items, wide, onOpenItem: openItem, onToggleTask: toggle, onOpenDay: openDay };
  const renderPage = (page: -1 | 0 | 1) => {
    const date = shiftFocus(view, focusedDate, page);
    if (view === 'month') {
      // Sliding months keep the same day number selected only on the centre page.
      return <MonthGrid month={date} selected={focusedDate} items={items} onSelect={setFocusedDate} />;
    }
    if (view === 'day') {
      return <DaySchedule day={date} items={items} groups={groups} onOpenItem={openItem} onToggleTask={toggle} />;
    }
    return (
      <TimeGrid
        days={weekDays(fromKey(date))}
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

  const pager = (
    <PagedCalendar
      axis="x"
      pageKey={pageKeys[1]}
      pageKeys={pageKeys}
      renderPage={renderPage}
      onZoomIn={() => zoom(1)}
      onZoomOut={() => zoom(-1)}
      onNext={() => step(1)}
      onPrev={() => step(-1)}
    />
  );
  const dayList = (
    <DayListScroll
      day={focusedDate}
      items={items}
      onOpenItem={openItem}
      onToggleTask={toggle}
      bottomSpace={tabBarSpace + Spacing.three}
    />
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <CalendarHeader
          view={view}
          title={titleFor(view, focusedDate, wide)}
          subtitle={view === 'month' ? fromKey(focusedDate).toLocaleDateString(undefined, { weekday: 'long' }) : undefined}
          wide={wide}
          onViewChange={changeView}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => setFocusedDate(todayKey())}
          onTitlePress={() => setJumpOpen(true)}
        />
        {view === 'month' ? (
          <View style={[styles.month, wide && styles.monthWide]}>
            <View style={[{ height: MONTH_GRID_HEIGHT }, wide && { width: WIDE_GRID_WIDTH }]}>{pager}</View>
            <View style={[styles.dayList, wide ? { borderLeftWidth: StyleSheet.hairlineWidth } : { borderTopWidth: StyleSheet.hairlineWidth }, { borderColor: theme.backgroundSelected }]}>
              {dayList}
            </View>
          </View>
        ) : (
          <>
            {view === 'day' && <WeekStrip day={focusedDate} onPick={setFocusedDate} />}
            <View style={[styles.body, { paddingBottom: view === 'week' ? tabBarSpace : 0 }, view === 'day' && styles.dayBody]}>
              {pager}
            </View>
          </>
        )}
      </SafeAreaView>

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
  month: { flex: 1 },
  monthWide: { flexDirection: 'row' },
  dayList: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 4 },
  dayBody: { paddingHorizontal: 0 },
});
