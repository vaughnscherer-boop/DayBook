import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AttendanceCheck } from '@/components/attendance-check';
import { useTabBarSpace } from '@/components/bottom-bar';
import { ExamAlertCard } from '@/components/exam-alert-card';
import { ItemRow, RowGroup } from '@/components/item-row';
import { PlanGap } from '@/components/plan-gap';
import { ReminderLink } from '@/components/reminder-link';
import { SwipeTask } from '@/components/swipe-task';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { moveTask } from '@/db/tasks';
import { useAttendance } from '@/hooks/use-attendance';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import { textOn, type CalendarItem } from '@/lib/calendar-items';
import { briefRange, buildBrief, untilText, type TimelineEntry } from '@/lib/day-brief';
import { daysBetween, formatDateKey, formatShortTime, fromKey, shiftKey, toDateKey, toDateTimeKey } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';
import { toggleTask } from '@/lib/task-toggle';

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
/** The narrow time column ('6:40PM', 'Now') stops growing here so it doesn't break mid-word. */
const TIME_MAX_SCALE = 1.3;

const locationOf = (item: CalendarItem) => item.notes?.match(/Location:\s*(.+)/)?.[1] ?? null;

/**
 * The morning brief (opened from the morning notification): today's classes and events with your
 * free time, what's due, what's still open from earlier days, and the tests coming up this week.
 */
export default function TodayScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { itemsBetween, events, tasks, reload } = useCalendarData();
  const attendance = useAttendance();
  const params = useLocalSearchParams<{ date?: string }>();
  const tabBarSpace = useTabBarSpace();
  // A tab stays mounted, so take a fresh "now" each time it's shown.
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));
  const day = params.date ?? toDateKey(now);

  const [start, end] = briefRange(day);
  const briefItems = useMemo(() => itemsBetween(start, end), [itemsBetween, start, end]);
  const brief = useMemo(() => buildBrief(briefItems, day, now), [briefItems, day, now]);
  const isToday = day === toDateKey(now);
  // The soonest test after today with no study time planned yet.
  const unplannedExam = isToday
    ? brief.comingUp.find((item) => item.itemType === 'exam' && !item.repeating && item.startDay > day && !brief.planned[item.key])
    : undefined;
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
  const toggle = (item: CalendarItem) => toggleTask(db, item, reload);

  // Where the "Now" line goes: before the first thing that hasn't started yet. A free stretch starts
  // right at the current minute, so it counts as not started.
  const nowIndex = isToday
    ? brief.timeline.findIndex((entry) => (entry.kind === 'free' ? entry.start : entry.item.startsAt!.slice(11, 16)) >= nowTime)
    : -1;

  const timelineRow = (entry: TimelineEntry, i: number) => {
    if (entry.kind === 'free') {
      const row = (
        <View style={styles.row}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} maxFontSizeMultiplier={TIME_MAX_SCALE} style={styles.time}>
            {formatShortTime(entry.start)}
          </ThemedText>
          <View style={[styles.freeBar, { borderColor: theme.backgroundSelected }]} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            Free until {formatShortTime(entry.end)} · {duration(entry.start, entry.end)}
          </ThemedText>
        </View>
      );
      // Today and later: offer to fill the stretch with work on what's due.
      if (day < toDateKey(now)) return <View key={`free-${i}`}>{row}</View>;
      return (
        <PlanGap key={`free-${i}`} gap={entry} day={day} items={briefItems} tasks={tasks} onChanged={reload}>
          {row}
        </PlanGap>
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

  const move = async (item: CalendarItem, date: string) => {
    await moveTask(db, item.id, date);
    changed();
  };
  const tomorrow = shiftKey(day, 1);
  const taskRow = (item: CalendarItem, actions?: 'stillOpen') => (
    <SwipeTask
      key={item.key}
      item={item}
      surface="backgroundElement"
      onToggle={() => toggle(item)}
      moves={[...(actions === 'stillOpen' ? [{ label: 'Today', date: day }] : []), { label: 'Tomorrow', date: tomorrow }]}
      onMove={(date) => move(item, date)}>
      <ItemRow
        item={item}
        subtitle={
          actions === 'stillOpen'
            ? `from ${formatDateKey(item.startDay)}`
            : item.time
              ? `due ${formatShortTime(item.time)}`
              : isToday
                ? 'any time today'
                : 'any time'
        }
        details={item.details}
        onOpen={() => open(item)}
        onToggle={() => toggle(item)}
        onChanged={reload}
      />
    </SwipeTask>
  );

  const section = (title: string, children: ReactNode, action?: ReactNode) => (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <ThemedText type="heading" style={styles.flex}>
          {title}
        </ThemedText>
        {action}
      </View>
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
              <ThemedText style={styles.month} themeColor="textSecondary" maxFontSizeMultiplier={1.3}>
                {date.toLocaleDateString(undefined, { month: 'long' }).toUpperCase()}
              </ThemedText>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
            <View style={styles.dateSide}>
              <ThemedText style={styles.sideNumber} maxFontSizeMultiplier={1.3}>
                {/* "6:40PM", not "18.40", which reads like a date next to the day and month. */}
                {isToday ? formatShortTime(nowTime) : date.getFullYear()}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {isToday ? 'right now' : 'year'}
              </ThemedText>
            </View>
          </View>
          <View style={[styles.rule, { backgroundColor: theme.backgroundSelected }]} />
          <ThemedText style={styles.summary}>{brief.summary}</ThemedText>
        </View>

        {unplannedExam && (
          <ExamAlertCard
            exam={unplannedExam}
            calendarId={
              (unplannedExam.kind === 'event' ? events : tasks).find((row) => row.id === unplannedExam.id)?.calendar_id ?? null
            }
            items={itemsBetween(day, unplannedExam.startDay)}
            today={day}
            onChanged={changed}
          />
        )}

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
          isToday ? 'Your day' : 'Schedule',
          brief.timeline.length === 0 ? (
            <EmptyState icon="sun" text="No classes or events — the whole day is yours." />
          ) : (
            brief.timeline.flatMap((entry, i) => [
              ...(i === nowIndex
                ? [
                    <View key="now" style={styles.nowRow}>
                      <ThemedText
                        type="small"
                        numberOfLines={1}
                        maxFontSizeMultiplier={TIME_MAX_SCALE}
                        style={[styles.time, { color: theme.danger }]}>
                        Now
                      </ThemedText>
                      <View style={[styles.nowLine, { backgroundColor: theme.danger }]} />
                    </View>,
                  ]
                : []),
              timelineRow(entry, i),
              // A class that's over: did you go? (Counts toward the class's absences.)
              ...(entry.kind === 'item' && entry.item.itemType === 'class' && entry.item.endsAt! <= toDateTimeKey(now)
                ? [
                    <AttendanceCheck
                      key={`attend-${entry.item.key}`}
                      item={entry.item}
                      status={attendance.find((a) => a.id === `${entry.item.id}|${entry.item.occurrenceDate}`)?.status}
                    />,
                  ]
                : []),
            ])
          )
        )}

        {section(
          isToday ? 'Due today' : 'Due that day',
          brief.dueToday.length === 0 ? (
            <EmptyState text={isToday ? 'Nothing due today.' : `Nothing due ${formatDateKey(day)}.`} />
          ) : (
            <RowGroup>{brief.dueToday.map((item) => taskRow(item))}</RowGroup>
          )
        )}

        {brief.stillOpen.length > 0 &&
          section(
            'Still open',
            <RowGroup>{brief.stillOpen.map((item) => taskRow(item, 'stillOpen'))}</RowGroup>,
            isToday && (
              <Pressable
                onPress={async () => {
                  for (const item of brief.stillOpen) await moveTask(db, item.id, day);
                  changed();
                }}
                accessibilityRole="button"
                hitSlop={10}
                style={styles.headAction}>
                <ThemedText type="smallBold">Move all to today</ThemedText>
              </Pressable>
            )
          )}

        {brief.comingUp.length > 0 &&
          section(
            'Coming up this week',
            <RowGroup>
              {brief.comingUp.map((item) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  subtitle={`${item.itemType === 'exam' ? 'Test' : 'Due'} ${formatDateKey(item.startDay)}${
                    item.time ? `, ${formatShortTime(item.time)}` : ''
                  }${
                    brief.planned[item.key]
                      ? ` · ${brief.planned[item.key]} study session${brief.planned[item.key] === 1 ? '' : 's'} planned`
                      : ''
                  }`}
                  onOpen={() => open(item)}
                  onToggle={() => toggle(item)}
                  onChanged={reload}
                  trailing={
                    // Red only when a test is today or tomorrow, so it still means "urgent".
                    <ThemedText
                      type="small"
                      style={{
                        color:
                          item.itemType === 'exam' && daysBetween(day, item.startDay) <= 1 ? theme.danger : theme.textSecondary,
                      }}>
                      {untilText(item.startDay, day)}
                    </ThemedText>
                  }
                />
              ))}
            </RowGroup>
          )}

        <ReminderLink kind="morning" />
        <Button title="Open calendar" variant="ghost" onPress={() => router.navigate({ pathname: '/calendar', params: { date: day } })} />
      </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.one },
  month: { fontSize: 28, lineHeight: 34, fontWeight: 600 },
  divider: { width: 1, alignSelf: 'stretch' },
  dateSide: { gap: 2 },
  sideNumber: { fontSize: 26, lineHeight: 30, fontWeight: 600, fontVariant: ['tabular-nums'] },
  rule: { height: 1, marginTop: Spacing.three },
  summary: { marginTop: Spacing.three },
  eventCard: { borderRadius: Radius.lg, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.two },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  eventTitle: { flex: 1, fontSize: 22, lineHeight: 26, fontWeight: 800, letterSpacing: -0.4 },
  eventTime: { fontSize: 15, fontWeight: 600, fontVariant: ['tabular-nums'] },
  eventBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: Radius.full, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  section: { gap: Spacing.twoHalf, marginTop: Spacing.two },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headAction: { minHeight: 32, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  time: { minWidth: 64, fontVariant: ['tabular-nums'] },
  freeBar: { width: 4, alignSelf: 'stretch', borderLeftWidth: 2, borderStyle: 'dashed' },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  nowLine: { flex: 1, height: 2, borderRadius: 1 },
  flex: { flex: 1, gap: 2 },
  details: { fontStyle: 'italic' },
});
