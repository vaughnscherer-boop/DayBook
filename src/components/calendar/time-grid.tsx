import { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TaskCheck } from '@/components/ui/task-check';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isMultiDay, itemsOnDay, textOn, tint, weekSegments, type CalendarItem } from '@/lib/calendar-items';
import { formatShortTime, fromKey, todayKey } from '@/lib/dates';

type Props = {
  /** The 7 days of the week. */
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
/** A timed task is drawn as a short row; this is the time it claims when sharing space. */
const TASK_MINUTES = 30;
const TASK_HEIGHT = 22;

const minutesOf = (key: string) => Number(key.slice(-5, -3)) * 60 + Number(key.slice(-2));

type Placed = {
  item: CalendarItem;
  start: number; // minutes since midnight
  end: number;
  top: number;
  height: number;
  column: number;
  columns: number;
};

/** True for things drawn in the hour grid: timed events and tasks with a time. */
const isTimed = (item: CalendarItem) => !item.allDay && (item.kind === 'event' || item.time !== null);

/** Lays out one day's timed events and tasks; overlapping ones share the width side by side. */
function placeDay(items: CalendarItem[], hourHeight: number): Placed[] {
  const timed = items
    .filter(isTimed)
    .map((item) => {
      if (item.kind === 'task') {
        const start = minutesOf(item.time!);
        return { item, start, end: start + TASK_MINUTES };
      }
      const start = minutesOf(item.startsAt!);
      const sameDayEnd = item.endsAt!.slice(0, 10) === item.startDay ? minutesOf(item.endsAt!) : 24 * 60;
      return { item, start, end: Math.max(sameDayEnd, start + 20) };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const columns = Math.max(...cluster.map((p) => p.column)) + 1;
    for (const p of cluster) p.columns = columns;
    cluster = [];
  };

  for (const { item, start, end } of timed) {
    if (cluster.length && start >= clusterEnd) flush();
    const taken = new Set(cluster.filter((p) => p.end > start).map((p) => p.column));
    let column = 0;
    while (taken.has(column)) column++;
    const height = item.kind === 'task' ? TASK_HEIGHT : ((end - start) / 60) * hourHeight;
    const entry = { item, start, end, top: (start / 60) * hourHeight, height, column, columns: 1 };
    cluster.push(entry);
    placed.push(entry);
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) flush();
  return placed;
}

/** "8AM–8:55AM" for wide blocks, just "8AM" when narrow. */
function blockTime(item: CalendarItem, roomy: boolean) {
  const start = formatShortTime(item.startsAt!);
  return roomy ? `${start}–${formatShortTime(item.endsAt!)}` : start;
}

/** Hour-by-hour Week view, with an all-day row on top. */
export function TimeGrid({ days, items, wide, onOpenDay, onOpenItem, onToggleTask, onCreateAt }: Props) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const scrolledFor = useRef<string | null>(null);
  const hourHeight = wide ? 52 : 48;
  const today = todayKey();
  const lineColor = theme.backgroundSelected;
  // A full 1px line in a soft colour: hairlines land on and between pixels and look uneven.
  const columnLine = tint(theme.backgroundSelected, 0.45);

  const placedByDay = useMemo(
    () => days.map((day) => placeDay(itemsOnDay(items, day), hourHeight)),
    [days, items, hourHeight]
  );

  // All-day row: multi-day bars across the week, then each day's all-day events and untimed tasks.
  const segments = useMemo(() => weekSegments(items, days), [items, days]);
  const lanes = segments.reduce((max, s) => Math.max(max, s.lane + 1), 0);
  const stripByDay = days.map((day) =>
    itemsOnDay(items, day).filter((item) => item.allDay && !isMultiDay(item))
  );
  const stripLines = lanes + Math.max(0, ...stripByDay.map((list) => list.length));

  // Open where things happen: just before now when today is in view, else just before the week's
  // first timed item, else 7 AM. Runs once the scroll view has its size, which web needs.
  const firstDay = days[0];
  const scrollToStart = () => {
    if (scrolledFor.current === firstDay) return;
    scrolledFor.current = firstDay;
    const now = new Date();
    const earliest = Math.min(...placedByDay.flat().map((p) => p.start));
    const minutes = days.includes(today)
      ? (now.getHours() - 1) * 60
      : Number.isFinite(earliest)
        ? earliest - 30
        : 7 * 60;
    scrollRef.current?.scrollTo({ y: (Math.max(minutes, 0) / 60) * hourHeight, animated: false });
  };

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
      <View style={[styles.headerRow, { borderColor: lineColor }]}>
        <View style={{ width: GUTTER }} />
        {days.map((day) => {
          const isToday = day === today;
          return (
            <Pressable key={day} style={styles.dayHeader} onPress={() => onOpenDay(day)}>
              <ThemedText type="caption" themeColor="textSecondary" style={styles.weekday}>
                {fromKey(day).toLocaleDateString(undefined, { weekday: wide ? 'short' : 'narrow' }).toUpperCase()}
              </ThemedText>
              <View style={[styles.headerNumber, isToday && { backgroundColor: theme.accent }]}>
                <ThemedText style={[styles.number, { color: isToday ? theme.onAccent : theme.text }]}>
                  {Number(day.slice(8))}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {stripLines > 0 && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={[styles.strip, { maxHeight: MAX_STRIP_LINES * STRIP_LINE + 8, borderColor: lineColor }]}
          contentContainerStyle={{ height: stripLines * STRIP_LINE + 6 }}>
          <View style={styles.stripRow}>
            <View style={[styles.stripLabel, { width: GUTTER, height: Math.min(stripLines, MAX_STRIP_LINES) * STRIP_LINE }]}>
              <ThemedText type="caption" themeColor="textSecondary" style={styles.stripLabelText}>
                all-day
              </ThemedText>
            </View>
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
                    <ThemedText numberOfLines={1} style={[styles.pillText, { color: textOn(item.color) }]}>
                      {item.title}
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* No scroll indicator: on web it takes width from the columns and they'd drift off the header. */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        onLayout={scrollToStart}>
        <View style={[styles.hours, { height: 24 * hourHeight }]}>
          <View style={{ width: GUTTER }}>
            {Array.from({ length: 24 }, (_, hour) => (
              <ThemedText
                key={hour}
                type="caption"
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
                style={[styles.hourLine, { top: hour * hourHeight, borderColor: columnLine }]}
              />
            ))}

            {days.map((day, col) => (
              <View
                key={day}
                style={[
                  styles.column,
                  col > 0 && { borderLeftWidth: 1, borderColor: columnLine },
                  day === today && { backgroundColor: tint(theme.accent, 0.04) },
                ]}>
                <Pressable style={StyleSheet.absoluteFill} onLongPress={longPress(day)} delayLongPress={350} />
                {placedByDay[col].map(({ item, top, height, column, columns }) => {
                  const position = {
                    top,
                    height: Math.max(height - 1, 18),
                    left: `${(column / columns) * 100}%` as const,
                    width: `${100 / columns}%` as const,
                  };
                  if (item.kind === 'task') {
                    return (
                      <Pressable key={item.key} onPress={() => onOpenItem(item)} style={[styles.block, position]}>
                        <View style={[styles.taskBlock, { backgroundColor: tint(item.color, 0.16) }]}>
                          <TaskCheck done={item.done} color={item.color} size={13} onToggle={() => onToggleTask(item)} />
                          <ThemedText
                            numberOfLines={1}
                            themeColor={item.done ? 'textSecondary' : 'text'}
                            style={[styles.taskText, item.done && styles.done]}>
                            {item.title}
                          </ThemedText>
                        </View>
                      </Pressable>
                    );
                  }
                  // Fit the content to the block so text is never cut mid-line.
                  const showTime = height >= 34;
                  const titleLines = height >= 64 ? 2 : 1;
                  const ink = textOn(item.color);
                  return (
                    <Pressable key={item.key} onPress={() => onOpenItem(item)} style={[styles.block, position]}>
                      <View style={[styles.blockFill, { backgroundColor: item.color }]}>
                        <ThemedText numberOfLines={titleLines} style={[styles.blockTitle, { color: ink }]}>
                          {item.title}
                        </ThemedText>
                        {showTime && (
                          <ThemedText numberOfLines={1} style={[styles.blockTime, { color: ink }]}>
                            {blockTime(item, wide && columns === 1)}
                          </ThemedText>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
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

/** A pill in the all-day row: an all-day event (filled) or a task without a time (checkbox). */
function StripItem({ item, onPress, onToggle }: { item: CalendarItem; onPress: () => void; onToggle: () => void }) {
  if (item.kind === 'event') {
    return (
      <Pressable onPress={onPress} style={styles.stripItem}>
        <View style={[styles.stripFill, { backgroundColor: item.color }]}>
          <ThemedText numberOfLines={1} style={[styles.pillText, { color: textOn(item.color) }]}>
            {item.title}
          </ThemedText>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={[styles.stripItem, styles.stripTask]}>
      <TaskCheck done={item.done} color={item.color} size={13} onToggle={onToggle} />
      <ThemedText
        numberOfLines={1}
        themeColor={item.done ? 'textSecondary' : 'text'}
        style={[styles.pillText, styles.flex, item.done && styles.done]}>
        {item.title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: Spacing.two },
  dayHeader: { flex: 1, alignItems: 'center', gap: 2 },
  headerNumber: { minWidth: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  weekday: { letterSpacing: 0.8, fontWeight: '700' },
  number: { fontSize: 16, lineHeight: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  strip: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  stripRow: { flexDirection: 'row', paddingVertical: 3 },
  stripLabel: { justifyContent: 'center', alignItems: 'flex-end', paddingRight: Spacing.two },
  stripLabelText: { fontSize: 10 },
  stripDays: { flex: 1, flexDirection: 'row' },
  stripDay: { flex: 1, paddingHorizontal: 1, minWidth: 0 },
  stripItem: { height: STRIP_LINE, justifyContent: 'center' },
  stripSpan: { position: 'absolute', height: STRIP_LINE, paddingHorizontal: 1, justifyContent: 'center' },
  stripFill: { height: STRIP_LINE - 4, borderRadius: 6, justifyContent: 'center', paddingHorizontal: 6 },
  stripTask: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 3 },
  pillText: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
  flex: { flex: 1 },
  done: { textDecorationLine: 'line-through' },
  scroll: { flex: 1 },
  hours: { flexDirection: 'row' },
  hourLabel: { position: 'absolute', right: Spacing.two, fontSize: 10, lineHeight: 14 },
  columns: { flex: 1, flexDirection: 'row' },
  hourLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1 },
  column: { flex: 1, minWidth: 0 },
  block: { position: 'absolute', paddingLeft: 1, paddingRight: 2 },
  blockFill: { flex: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, overflow: 'hidden', gap: 1 },
  blockTitle: { fontSize: 12, lineHeight: 15, fontWeight: '700' },
  blockTime: { fontSize: 11, lineHeight: 14, fontWeight: '500', opacity: 0.85, fontVariant: ['tabular-nums'] },
  taskBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  taskText: { flex: 1, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 1.5 },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4 },
});
