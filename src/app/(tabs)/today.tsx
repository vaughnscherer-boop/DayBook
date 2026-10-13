import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/bottom-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TaskCheck } from '@/components/ui/task-check';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spacing } from '@/constants/theme';
import { moveTask, setOccurrenceDone, setTaskDone } from '@/db/tasks';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import { textOn, type CalendarItem } from '@/lib/calendar-items';
import { briefRange, buildBrief, untilText, type TimelineEntry } from '@/lib/day-brief';
import { formatDateKey, formatShortTime, fromKey, toDateKey } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';

const TYPE_LABEL: Partial<Record<CalendarItem['itemType'], string>> = { class: 'Class', exam: 'Test', reading: 'Reading' };

function greeting(now: Date) {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function duration(start: string, end: string) {
  const total = Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) - (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours === 0 ? `${minutes} min` : minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** "Location: TOH 367" from an imported class's notes. */
const locationOf = (item: CalendarItem) => item.notes?.match(/Location:\s*(.+)/)?.[1] ?? null;

/**
 * The morning brief (opened from the morning notification): today's classes and events with your
 * free time, what's due, what's still open from earlier days, and the tests coming up this week.
 */
export default function TodayScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { itemsBetween, reload } = useCalendarData();
  const params = useLocalSearchParams<{ date?: string }>();
  const tabBarSpace = useTabBarSpace();
  // A tab stays mounted, so take a fresh "now" each time it's shown.
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));
  const day = params.date ?? toDateKey(now);

  const [start, end] = briefRange(day);
  const brief = useMemo(() => buildBrief(itemsBetween(start, end), day, now), [itemsBetween, start, end, day, now]);
  const isToday = day === toDateKey(now);
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const open = (item: CalendarItem) =>
    router.push({
      pathname: item.kind === 'event' ? '/event/[id]' : '/task/[id]',
      params: { id: item.id, date: item.occurrenceDate },
    });
  const changed = async () => {
    await reload();
    rescheduleAll(db);
  };
  const toggle = async (item: CalendarItem) => {
    // A repeating task is ticked off just for this date.
    if (item.repeating) await setOccurrenceDone(db, item.id, item.occurrenceDate, !item.done);
    else await setTaskDone(db, item.id, !item.done);
    changed();
  };

  // Where the "Now" line goes: before the first thing that hasn't started yet.
  const nowIndex = isToday
    ? brief.timeline.findIndex((entry) => (entry.kind === 'free' ? entry.start : entry.item.startsAt!.slice(11, 16)) > nowTime)
    : -1;

  const timelineRow = (entry: TimelineEntry, i: number) => {
    if (entry.kind === 'free') {
      return (
        <View key={`free-${i}`} style={styles.row}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.time}>
            {formatShortTime(entry.start)}
          </ThemedText>
          <View style={[styles.freeBar, { borderColor: theme.backgroundSelected }]} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            Free until {formatShortTime(entry.end)} · {duration(entry.start, entry.end)}
          </ThemedText>
        </View>
      );
    }
    const { item } = entry;
    const ink = textOn(item.color);
    const location = locationOf(item);
    const label = TYPE_LABEL[item.itemType];
    return (
      <PressableScale
        key={item.key}
        onPress={() => open(item)}
        scaleTo={0.98}
        style={[styles.eventCard, { backgroundColor: item.color }]}>
        <View style={styles.eventTop}>
          <ThemedText numberOfLines={2} style={[styles.eventTitle, { color: ink }]}>
            {item.title}
          </ThemedText>
          <ThemedText style={[styles.eventTime, { color: ink }]}>{formatShortTime(item.startsAt!)}</ThemedText>
        </View>
        {item.details && (
          <ThemedText type="small" numberOfLines={2} style={[styles.details, { color: ink, opacity: 0.8 }]}>
            {item.details}
          </ThemedText>
        )}
        <View style={styles.eventBottom}>
          <Icon name={location ? 'location' : 'clock'} size={14} color={ink} />
          <ThemedText type="smallBold" numberOfLines={1} style={[styles.flex, { color: ink }]}>
            {[location, label, `until ${formatShortTime(item.endsAt!)}`].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
      </PressableScale>
    );
  };

  const taskRow = (item: CalendarItem, actions?: 'stillOpen') => (
    <Pressable key={item.key} onPress={() => open(item)} style={styles.row}>
      <TaskCheck done={item.done} color={item.color} size={22} onToggle={() => toggle(item)} />
      <View style={styles.flex}>
        <ThemedText
          type="smallBold"
          numberOfLines={2}
          themeColor={item.done ? 'textSecondary' : 'text'}
          style={item.done && styles.done}>
          {item.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {actions === 'stillOpen'
            ? `from ${formatDateKey(item.startDay)}`
            : item.time
              ? `due ${formatShortTime(item.time)}`
              : 'any time today'}
        </ThemedText>
        {item.details && !item.done && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={3} style={styles.details}>
            {item.details}
          </ThemedText>
        )}
      </View>
      {actions === 'stillOpen' && (
        <Pressable
          onPress={async () => {
            await moveTask(db, item.id, day);
            changed();
          }}
          hitSlop={6}
          style={[styles.smallButton, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            Move to today
          </ThemedText>
        </Pressable>
      )}
    </Pressable>
  );

  const section = (title: string, children: ReactNode) => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {children}
    </View>
  );

  const date = fromKey(day);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace + Spacing.three }]}>
        <View>
          <ThemedText type="smallBold">{isToday ? greeting(now) : 'Your day'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {isToday ? 'Have a great day!' : formatDateKey(day)}
          </ThemedText>
        </View>

        <View>
          <ThemedText type="smallBold">{date.toLocaleDateString(undefined, { weekday: 'long' })}</ThemedText>
          <View style={styles.dateRow}>
            <View>
              <ThemedText type="display">{date.getDate()}</ThemedText>
              <ThemedText style={styles.month}>
                {date.toLocaleDateString(undefined, { month: 'long' }).toUpperCase()}
              </ThemedText>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
            <View style={styles.dateSide}>
              <ThemedText style={styles.sideNumber}>
                {isToday
                  ? `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`
                  : date.getFullYear()}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {isToday ? 'right now' : 'year'}
              </ThemedText>
            </View>
          </View>
          <View style={[styles.rule, { backgroundColor: theme.backgroundSelected }]} />
          <ThemedText style={styles.summary}>{brief.summary}</ThemedText>
        </View>

        {brief.allDay.length > 0 && (
          <View style={styles.chips}>
            {brief.allDay.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => open(item)}
                style={[styles.chip, { backgroundColor: item.color }]}>
                <ThemedText type="smallBold" style={{ color: textOn(item.color) }}>
                  {item.title}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        {section(
          'Your day',
          brief.timeline.length === 0 ? (
            <EmptyState icon="sun" text="No classes or events — the whole day is yours." />
          ) : (
            brief.timeline.flatMap((entry, i) => [
              ...(i === nowIndex
                ? [
                    <View key="now" style={styles.nowRow}>
                      <ThemedText type="small" style={[styles.time, { color: theme.danger }]}>
                        Now
                      </ThemedText>
                      <View style={[styles.nowLine, { backgroundColor: theme.danger }]} />
                    </View>,
                  ]
                : []),
              timelineRow(entry, i),
            ])
          )
        )}

        {section(
          'Due today',
          brief.dueToday.length === 0 ? (
            <EmptyState text="Nothing due today." />
          ) : (
            brief.dueToday.map((item) => taskRow(item))
          )
        )}

        {brief.stillOpen.length > 0 && section('Still open', brief.stillOpen.map((item) => taskRow(item, 'stillOpen')))}

        {brief.comingUp.length > 0 &&
          section(
            'Coming up this week',
            brief.comingUp.map((item) => (
              <Pressable key={item.key} onPress={() => open(item)} style={styles.row}>
                <View style={[styles.bar, { backgroundColor: item.color }]} />
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {item.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.itemType === 'exam' ? 'Test' : 'Due'} {formatDateKey(item.startDay)}
                    {item.time ? `, ${formatShortTime(item.time)}` : ''}
                  </ThemedText>
                </View>
                <ThemedText
                  type="small"
                  style={{ color: item.itemType === 'exam' ? theme.danger : theme.textSecondary }}>
                  {untilText(item.startDay, day)}
                </ThemedText>
              </Pressable>
            ))
          )}

        <Button title="Open calendar" onPress={() => router.navigate({ pathname: '/calendar', params: { date: day } })} />
      </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.one },
  month: { fontSize: 30, lineHeight: 34, fontWeight: 400, letterSpacing: 0.5 },
  divider: { width: 1, alignSelf: 'stretch' },
  dateSide: { gap: 2 },
  sideNumber: { fontSize: 26, lineHeight: 30, fontWeight: 600, fontVariant: ['tabular-nums'] },
  rule: { height: 1, marginTop: Spacing.three },
  summary: { marginTop: Spacing.three },
  eventCard: { borderRadius: 20, padding: Spacing.three + 2, gap: Spacing.three, minHeight: 116 },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  eventTitle: { flex: 1, fontSize: 22, lineHeight: 26, fontWeight: 800, letterSpacing: -0.4 },
  eventTime: { fontSize: 15, fontWeight: 600, fontVariant: ['tabular-nums'] },
  eventBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, marginTop: 'auto' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  section: { gap: Spacing.two + 4, marginTop: Spacing.two },
  sectionTitle: { fontSize: 20, lineHeight: 24, fontWeight: 800, letterSpacing: -0.3 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  time: { width: 64, fontVariant: ['tabular-nums'] },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  freeBar: { width: 4, alignSelf: 'stretch', borderLeftWidth: 2, borderStyle: 'dashed' },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  nowLine: { flex: 1, height: 2, borderRadius: 1 },
  check: { fontSize: 20, lineHeight: 24, width: 22 },
  flex: { flex: 1, gap: 2 },
  details: { fontStyle: 'italic' },
  done: { textDecorationLine: 'line-through' },
  smallButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
});
