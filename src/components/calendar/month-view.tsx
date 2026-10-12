import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { DayPopover, POPOVER_WIDTH } from '@/components/calendar/day-popover';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  itemsOnDay,
  singleDayItemsByDay,
  textOn,
  weekSegments,
  type CalendarItem,
} from '@/lib/calendar-items';
import { formatShortTime, fromKey, monthGrid, todayKey } from '@/lib/dates';

type Props = {
  focusedDate: string;
  items: CalendarItem[];
  /** Wide layout: roomier lines with times on the right. */
  wide: boolean;
  onOpenDay: (day: string) => void;
  onOpenItem: (item: CalendarItem) => void;
  onToggleTask: (item: CalendarItem) => void;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOVER_DELAY = 350;

type Popover = { day: string; row: number; col: number };

/**
 * Apple-Calendar-style month: each day box lists its events and tasks as colored lines,
 * multi-day events are bars across the days they cover, and overflow becomes "+k more".
 */
export function MonthView({ focusedDate, items, wide, onOpenDay, onOpenItem, onToggleTask }: Props) {
  const theme = useTheme();
  const weeks = useMemo(() => monthGrid(fromKey(focusedDate)), [focusedDate]);
  const month = focusedDate.slice(0, 7);
  const today = todayKey();
  const byDay = useMemo(() => singleDayItemsByDay(items), [items]);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [popover, setPopover] = useState<Popover | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lineHeight = wide ? 18 : 15;
  const dayNumberHeight = wide ? 26 : 22;
  const rowHeight = size.height / weeks.length;
  const cellWidth = size.width / 7;
  const capacity = Math.max(0, Math.floor((rowHeight - dayNumberHeight - 2) / lineHeight));

  const clearHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  const hoverOpen = (next: Popover) => {
    clearHover();
    hoverTimer.current = setTimeout(() => setPopover(next), HOVER_DELAY);
  };
  const hoverClose = () => {
    clearHover();
    hoverTimer.current = setTimeout(() => setPopover(null), 150);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  // Open beside the day (right, or left near the edge), like Apple Calendar on Mac, so it
  // doesn't cover the days above and below; align to the day's top or bottom edge.
  const fitsRight = popover ? (popover.col + 1) * cellWidth + POPOVER_WIDTH + 8 <= size.width : true;
  const inTopHalf = popover ? popover.row < weeks.length / 2 : true;
  const popoverRoom = size.height - 8;
  const popoverStyle = popover && {
    left: fitsRight
      ? (popover.col + 1) * cellWidth + 4
      : Math.max(popover.col * cellWidth - POPOVER_WIDTH - 4, 4),
    ...(inTopHalf
      ? { top: popover.row * rowHeight }
      : { bottom: (weeks.length - popover.row - 1) * rowHeight }),
  };

  return (
    <View style={styles.container}>
      <View style={styles.weekdays}>
        {WEEKDAYS.map((name) => (
          <ThemedText key={name} type="small" themeColor="textSecondary" style={styles.weekday}>
            {wide ? name : name[0]}
          </ThemedText>
        ))}
      </View>

      <View style={styles.grid} onLayout={onLayout}>
        {size.height > 0 &&
          weeks.map((week, row) => {
            const segments = weekSegments(items, week);
            const lanes = segments.reduce((max, s) => Math.max(max, s.lane + 1), 0);
            const shownLanes = Math.min(lanes, capacity);

            return (
              <View key={week[0]} style={[styles.week, { borderColor: theme.backgroundSelected }]}>
                {week.map((day, col) => {
                  const singles = byDay[day] ?? [];
                  const hiddenSpans = segments.filter(
                    (s) => s.lane >= shownLanes && s.startCol <= col && s.endCol >= col
                  ).length;
                  let room = capacity - shownLanes;
                  let shown = singles.slice(0, room);
                  let more = singles.length - shown.length + hiddenSpans;
                  if (more > 0 && room > 0) {
                    room -= 1; // make space for the "+k more" line
                    shown = singles.slice(0, room);
                    more = singles.length - shown.length + hiddenSpans;
                  }
                  const isToday = day === today;
                  const inMonth = day.startsWith(month);

                  return (
                    <Pressable
                      key={day}
                      onPress={() => onOpenDay(day)}
                      onLongPress={() => setPopover({ day, row, col })}
                      onHoverIn={Platform.OS === 'web' ? () => hoverOpen({ day, row, col }) : undefined}
                      onHoverOut={Platform.OS === 'web' ? hoverClose : undefined}
                      accessibilityLabel={`${day}, ${singles.length} items`}
                      style={[styles.cell, { borderColor: theme.backgroundSelected }]}>
                      <View style={[styles.dayNumberRow, { height: dayNumberHeight }]}>
                        <View style={[styles.dayNumber, isToday && { backgroundColor: theme.accent }]}>
                          <ThemedText
                            type="small"
                            themeColor={inMonth ? 'text' : 'textSecondary'}
                            style={[isToday && styles.todayText, !inMonth && styles.outside]}>
                            {Number(day.slice(8))}
                          </ThemedText>
                        </View>
                      </View>
                      <View style={{ height: shownLanes * lineHeight }} />
                      {shown.map((item) => (
                        <ItemLine key={item.key} item={item} wide={wide} height={lineHeight} />
                      ))}
                      {more > 0 && (
                        <ThemedText
                          themeColor="textSecondary"
                          style={[styles.lineText, { lineHeight, fontSize: wide ? 12 : 10 }]}>
                          +{more} more
                        </ThemedText>
                      )}
                    </Pressable>
                  );
                })}

                {segments
                  .filter((s) => s.lane < shownLanes)
                  .map(({ item, startCol, endCol, lane }) => (
                    <View
                      key={item.key}
                      pointerEvents="none"
                      style={[
                        styles.span,
                        {
                          top: dayNumberHeight + lane * lineHeight,
                          left: `${(startCol / 7) * 100}%`,
                          width: `${((endCol - startCol + 1) / 7) * 100}%`,
                          height: lineHeight - 2,
                        },
                      ]}>
                      <View style={[styles.spanFill, { backgroundColor: item.color }]}>
                        <ThemedText
                          numberOfLines={1}
                          style={[styles.lineText, { color: textOn(item.color), fontSize: wide ? 12 : 10 }]}>
                          {item.title}
                        </ThemedText>
                      </View>
                    </View>
                  ))}
              </View>
            );
          })}

        {popover && popoverStyle && (
          <>
            {Platform.OS !== 'web' && (
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setPopover(null)} />
            )}
            <DayPopover
              day={popover.day}
              items={itemsOnDay(items, popover.day)}
              style={popoverStyle}
              listMaxHeight={Math.max(popoverRoom - 70, 80)}
              onOpenItem={(item) => {
                setPopover(null);
                onOpenItem(item);
              }}
              onToggleTask={onToggleTask}
              onOpenDay={(day) => {
                setPopover(null);
                onOpenDay(day);
              }}
              onHoverIn={clearHover}
              onHoverOut={hoverClose}
            />
          </>
        )}
      </View>
    </View>
  );
}

/** One line inside a day box: a timed event, a single-day all-day event, or a task. */
function ItemLine({ item, wide, height }: { item: CalendarItem; wide: boolean; height: number }) {
  const fontSize = wide ? 12 : 10;

  if (item.kind === 'event' && item.allDay) {
    return (
      <View style={[styles.pill, { height: height - 2, backgroundColor: item.color }]}>
        <ThemedText numberOfLines={1} style={[styles.lineText, { color: textOn(item.color), fontSize }]}>
          {item.title}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.line, { height }]}>
      {item.kind === 'task' ? (
        <ThemedText style={[styles.lineText, { color: item.color, fontSize: fontSize + 1 }]}>
          {item.done ? '☑' : '☐'}
        </ThemedText>
      ) : (
        <View style={[styles.lineBar, { backgroundColor: item.color }]} />
      )}
      <ThemedText
        numberOfLines={1}
        themeColor={item.done ? 'textSecondary' : 'text'}
        style={[styles.lineText, styles.lineTitle, { fontSize }, item.done && styles.done]}>
        {item.title}
      </ThemedText>
      {wide && item.time && (
        <ThemedText themeColor="textSecondary" style={[styles.lineText, { fontSize }]}>
          {formatShortTime(item.time)}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  weekdays: { flexDirection: 'row', paddingBottom: Spacing.one },
  weekday: { flex: 1, textAlign: 'center' },
  grid: { flex: 1 },
  week: { flex: 1, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  cell: {
    flex: 1,
    overflow: 'hidden',
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 2,
  },
  dayNumberRow: { alignItems: 'flex-end', justifyContent: 'center', paddingRight: 2 },
  dayNumber: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  todayText: { color: '#ffffff', fontWeight: '700' },
  outside: { opacity: 0.5 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lineBar: { width: 3, height: '70%', borderRadius: 1.5 },
  lineText: { fontWeight: '500' },
  lineTitle: { flex: 1 },
  done: { textDecorationLine: 'line-through' },
  pill: { borderRadius: 3, justifyContent: 'center', paddingHorizontal: 3, marginBottom: 2 },
  span: { position: 'absolute', paddingHorizontal: 2 },
  spanFill: { flex: 1, borderRadius: 3, justifyContent: 'center', paddingHorizontal: 4 },
});
