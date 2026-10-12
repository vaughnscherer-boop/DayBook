import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  isMultiDay,
  itemsOnDay,
  textOn,
  weekSegments,
  type CalendarItem,
} from '@/lib/calendar-items';
import { formatShortTime, formatTime, fromKey, todayKey } from '@/lib/dates';

type Props = {
  /** 1 day (Day view) or 7 days (Week view). */
  days: string[];
  items: CalendarItem[];
  wide: boolean;
  onOpenDay: (day: string) => void;
  onOpenItem: (item: CalendarItem) => void;
  onToggleTask: (item: CalendarItem) => void;
  /** Long-press on an empty slot: create an event starting there ('YYYY-MM-DDTHH:MM'). */
  onCreateAt: (start: string) => void;
};

const GUTTER = 52;
const STRIP_LINE = 22;
const MAX_STRIP_LINES = 4;

const minutesOf = (key: string) => Number(key.slice(11, 13)) * 60 + Number(key.slice(14, 16));

type Placed = { item: CalendarItem; top: number; height: number; column: number; columns: number };

/** Lays out one day's timed events; overlapping events share the width side by side. */
function placeDay(items: CalendarItem[], hourHeight: number): Placed[] {
  const timed = items
    .filter((item) => item.kind === 'event' && !item.allDay)
    .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));

  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const columns = Math.max(...cluster.map((p) => p.column)) + 1;
    for (const p of cluster) p.columns = columns;
    cluster = [];
  };

  for (const item of timed) {
    const start = minutesOf(item.startsAt!);
    const sameDayEnd = item.endsAt!.slice(0, 10) === item.startDay ? minutesOf(item.endsAt!) : 24 * 60;
    const end = Math.max(sameDayEnd, start + 20);
    if (cluster.length && start >= clusterEnd) flush();
    const taken = new Set(
      cluster.filter((p) => (p.top + p.height) / hourHeight * 60 > start).map((p) => p.column)
    );
    let column = 0;
    while (taken.has(column)) column++;
    const entry = { item, top: (start / 60) * hourHeight, height: ((end - start) / 60) * hourHeight, column, columns: 1 };
    cluster.push(entry);
    placed.push(entry);
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) flush();
  return placed;
}

/** Hour-by-hour grid for Day and Week views, with an all-day/tasks strip on top. */
export function TimeGrid({ days, items, wide, onOpenDay, onOpenItem, onToggleTask, onCreateAt }: Props) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const hourHeight = wide ? 52 : 48;
  const today = todayKey();
  const isWeek = days.length > 1;

  const placedByDay = useMemo(
    () => days.map((day) => placeDay(itemsOnDay(items, day), hourHeight)),
    [days, items, hourHeight]
  );

  // All-day strip: multi-day bars across the week, then each day's all-day events and tasks.
  const segments = useMemo(() => (isWeek ? weekSegments(items, days) : []), [isWeek, items, days]);
  const lanes = segments.reduce((max, s) => Math.max(max, s.lane + 1), 0);
  const stripByDay = days.map((day) =>
    itemsOnDay(items, day).filter(
      (item) => (item.kind === 'task' || item.allDay) && !(isWeek && isMultiDay(item))
    )
  );
  const stripLines = lanes + Math.max(0, ...stripByDay.map((list) => list.length));

  // Start scrolled to just before now (if today is visible) or 7 AM.
  const firstDay = days[0];
  useEffect(() => {
    const now = new Date();
    const hour = days.includes(today) ? Math.max(now.getHours() - 1, 0) : 7;
    scrollRef.current?.scrollTo({ y: hour * hourHeight, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the visible days change
  }, [firstDay, hourHeight]);

  const longPress = (day: string) => (e: GestureResponderEvent) => {
    const minutes = Math.floor(((e.nativeEvent.locationY / hourHeight) * 60) / 15) * 15;
    const hour = String(Math.min(Math.floor(minutes / 60), 23)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    onCreateAt(`${day}T${hour}:${minute}`);
  };

  const now = new Date();
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight;

  return (
    <View style={styles.container}>
      {isWeek && (
        <View style={[styles.headerRow, { borderColor: theme.backgroundSelected }]}>
          <View style={{ width: GUTTER }} />
          {days.map((day) => {
            const isToday = day === today;
            return (
              <Pressable key={day} style={styles.dayHeader} onPress={() => onOpenDay(day)}>
                <ThemedText type="small" themeColor="textSecondary">
                  {fromKey(day).toLocaleDateString(undefined, { weekday: wide ? 'short' : 'narrow' })}
                </ThemedText>
                <View style={[styles.headerNumber, isToday && { backgroundColor: theme.accent }]}>
                  <ThemedText type="smallBold" style={isToday ? styles.todayText : undefined}>
                    {Number(day.slice(8))}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {stripLines > 0 && (
        <ScrollView
          style={[styles.strip, { maxHeight: MAX_STRIP_LINES * STRIP_LINE + 8, borderColor: theme.backgroundSelected }]}
          contentContainerStyle={{ height: stripLines * STRIP_LINE + 4 }}>
          <View style={styles.stripRow}>
            <ThemedText type="small" themeColor="textSecondary" style={[styles.stripLabel, { width: GUTTER }]}>
              all-day
            </ThemedText>
            <View style={styles.stripDays}>
              {days.map((day, col) => (
                <View key={day} style={styles.stripDay}>
                  <View style={{ height: lanes * STRIP_LINE }} />
                  {stripByDay[col].map((item) => (
                    <StripItem
                      key={item.key}
                      item={item}
                      onPress={() => onOpenItem(item)}
                      onToggle={() => onToggleTask(item)}
                    />
                  ))}
                </View>
              ))}
              {segments.map(({ item, startCol, endCol, lane }) => (
                <Pressable
                  key={item.key}
                  onPress={() => onOpenItem(item)}
                  style={[
                    styles.stripSpan,
                    {
                      top: lane * STRIP_LINE,
                      left: `${(startCol / days.length) * 100}%`,
                      width: `${((endCol - startCol + 1) / days.length) * 100}%`,
                    },
                  ]}>
                  <View style={[styles.stripFill, { backgroundColor: item.color }]}>
                    <ThemedText type="small" numberOfLines={1} style={{ color: textOn(item.color) }}>
                      {item.title}
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      <ScrollView ref={scrollRef} style={styles.scroll}>
        <View style={[styles.hours, { height: 24 * hourHeight }]}>
          <View style={{ width: GUTTER }}>
            {Array.from({ length: 24 }, (_, hour) => (
              <ThemedText
                key={hour}
                themeColor="textSecondary"
                style={[styles.hourLabel, { top: hour * hourHeight - 7 }]}>
                {hour === 0 ? '' : formatShortTime(`${String(hour).padStart(2, '0')}:00`).replace(/(\d)(AM|PM)/, '$1 $2')}
              </ThemedText>
            ))}
          </View>

          <View style={styles.columns}>
            {Array.from({ length: 24 }, (_, hour) => (
              <View
                key={hour}
                pointerEvents="none"
                style={[styles.hourLine, { top: hour * hourHeight, borderColor: theme.backgroundSelected }]}
              />
            ))}

            {days.map((day, col) => (
              <View
                key={day}
                style={[styles.column, col > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: theme.backgroundSelected }]}>
                <Pressable style={StyleSheet.absoluteFill} onLongPress={longPress(day)} delayLongPress={350} />
                {placedByDay[col].map(({ item, top, height, column, columns }) => (
                  <Pressable
                    key={item.key}
                    onPress={() => onOpenItem(item)}
                    style={[
                      styles.block,
                      {
                        top,
                        height: height - 1,
                        left: `${(column / columns) * 100}%`,
                        width: `${100 / columns}%`,
                      },
                    ]}>
                    <View style={[styles.blockFill, { backgroundColor: item.color }]}>
                      <ThemedText
                        type="smallBold"
                        numberOfLines={height > 40 ? 2 : 1}
                        style={[styles.blockText, { color: textOn(item.color) }]}>
                        {item.title}
                      </ThemedText>
                      {height > 36 && (
                        <ThemedText
                          type="small"
                          numberOfLines={1}
                          style={[styles.blockText, { color: textOn(item.color), opacity: 0.85 }]}>
                          {wide || !isWeek ? `${formatTime(item.startsAt!)} – ${formatTime(item.endsAt!)}` : formatShortTime(item.startsAt!)}
                        </ThemedText>
                      )}
                    </View>
                  </Pressable>
                ))}
                {day === today && (
                  <View pointerEvents="none" style={[styles.nowLine, { top: nowTop, backgroundColor: theme.danger }]}>
                    <View style={[styles.nowDot, { backgroundColor: theme.danger }]} />
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** A chip in the all-day strip: an all-day event (filled) or a task (checkbox). */
function StripItem({ item, onPress, onToggle }: { item: CalendarItem; onPress: () => void; onToggle: () => void }) {
  if (item.kind === 'event') {
    return (
      <Pressable onPress={onPress} style={styles.stripItem}>
        <View style={[styles.stripFill, { backgroundColor: item.color }]}>
          <ThemedText type="small" numberOfLines={1} style={{ color: textOn(item.color) }}>
            {item.title}
          </ThemedText>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={[styles.stripItem, styles.taskRow]}>
      <Pressable onPress={onToggle} hitSlop={6} accessibilityRole="checkbox">
        <ThemedText style={{ color: item.color }}>{item.done ? '☑' : '☐'}</ThemedText>
      </Pressable>
      <ThemedText
        type="small"
        numberOfLines={1}
        themeColor={item.done ? 'textSecondary' : 'text'}
        style={[styles.taskTitle, item.done && styles.done]}>
        {item.time ? `${formatShortTime(item.time)} ` : ''}
        {item.title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: Spacing.one },
  dayHeader: { flex: 1, alignItems: 'center', gap: 2 },
  headerNumber: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  todayText: { color: '#ffffff' },
  strip: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  stripRow: { flexDirection: 'row', paddingVertical: 2 },
  stripLabel: { fontSize: 11, textAlign: 'right', paddingRight: Spacing.one, paddingTop: 2 },
  stripDays: { flex: 1, flexDirection: 'row' },
  stripDay: { flex: 1, paddingHorizontal: 1 },
  stripItem: { height: STRIP_LINE, justifyContent: 'center' },
  stripSpan: { position: 'absolute', height: STRIP_LINE, paddingHorizontal: 1, justifyContent: 'center' },
  stripFill: { height: STRIP_LINE - 3, borderRadius: 4, justifyContent: 'center', paddingHorizontal: 4 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  taskTitle: { flex: 1 },
  done: { textDecorationLine: 'line-through' },
  scroll: { flex: 1 },
  hours: { flexDirection: 'row' },
  hourLabel: { position: 'absolute', right: Spacing.one, fontSize: 11, lineHeight: 14 },
  columns: { flex: 1, flexDirection: 'row' },
  hourLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  column: { flex: 1 },
  block: { position: 'absolute', paddingHorizontal: 1 },
  blockFill: { flex: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, overflow: 'hidden' },
  blockText: { fontSize: 12 },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2 },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4 },
});
