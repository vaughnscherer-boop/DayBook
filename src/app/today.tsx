import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { moveTask, setOccurrenceDone, setTaskDone } from '@/db/tasks';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { briefRange, buildBrief, untilText, type TimelineEntry } from '@/lib/day-brief';
import { formatDateKey, formatShortTime, fromKey, toDateKey } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';

const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

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
  const [now] = useState(() => new Date());
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
          <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
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
    const location = locationOf(item);
    const label = TYPE_LABEL[item.itemType];
    return (
      <Pressable key={item.key} onPress={() => open(item)} style={styles.row}>
        <ThemedText type="small" style={styles.time}>
          {formatShortTime(item.startsAt!)}
        </ThemedText>
        <View style={[styles.bar, { backgroundColor: item.color }]} />
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={2}>
            {item.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {[`until ${formatShortTime(item.endsAt!)}`, label, location].filter(Boolean).join(' · ')}
          </ThemedText>
          {item.details && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={3} style={styles.details}>
              {item.details}
            </ThemedText>
          )}
        </View>
      </Pressable>
    );
  };

  const taskRow = (item: CalendarItem, actions?: 'stillOpen') => (
    <Pressable key={item.key} onPress={() => open(item)} style={styles.row}>
      <Pressable
        onPress={() => toggle(item)}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done }}>
        <ThemedText style={[styles.check, { color: item.color }]}>{item.done ? '☑' : '☐'}</ThemedText>
      </Pressable>
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
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </ThemedView>
  );

  const longDate = fromKey(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: isToday ? 'Today' : formatDateKey(day),
          headerLeft: () => (
            <Pressable onPress={close} hitSlop={8}>
              <ThemedText style={{ color: theme.accent }}>Close</ThemedText>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <ThemedText type="subtitle" style={styles.heading}>
            {isToday ? greeting(now) : 'Your day'}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{longDate}</ThemedText>
          <ThemedText style={styles.summary}>{brief.summary}</ThemedText>
        </View>

        {brief.allDay.length > 0 && (
          <View style={styles.chips}>
            {brief.allDay.map((item) => (
              <Pressable key={item.key} onPress={() => open(item)} style={[styles.chip, { backgroundColor: item.color }]}>
                <ThemedText type="small" style={styles.chipText}>
                  {item.title}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        {section(
          'Your day',
          brief.timeline.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No classes or events — the whole day is yours.
            </ThemedText>
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
            <ThemedText type="small" themeColor="textSecondary">
              Nothing due today.
            </ThemedText>
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

        <Pressable
          onPress={() => router.replace({ pathname: '/', params: { date: day } })}
          style={[styles.primary, { backgroundColor: theme.accent }]}>
          <ThemedText style={styles.primaryText}>Open calendar</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  heading: { fontSize: 28, lineHeight: 34 },
  summary: { marginTop: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  chipText: { color: '#ffffff' },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  time: { width: 56 },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  freeBar: { width: 4, alignSelf: 'stretch', borderLeftWidth: 2, borderStyle: 'dashed' },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  nowLine: { flex: 1, height: 2, borderRadius: 1 },
  check: { fontSize: 20, lineHeight: 24, width: 22 },
  flex: { flex: 1, gap: 2 },
  details: { fontStyle: 'italic' },
  done: { textDecorationLine: 'line-through' },
  smallButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  primary: { borderRadius: 999, paddingVertical: Spacing.two + 2, alignItems: 'center' },
  primaryText: { color: '#ffffff', fontSize: 16 },
});
