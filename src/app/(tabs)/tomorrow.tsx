import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/bottom-bar';
import { DayItemRow } from '@/components/day-item-row';
import { ReminderLink } from '@/components/reminder-link';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ThemedView } from '@/components/themed-view';
import { WeekReview } from '@/components/week-review';
import { TaskCheck } from '@/components/ui/task-check';
import { Radius, Spacing } from '@/constants/theme';
import { deleteEvent } from '@/db/events';
import { getSettings } from '@/db/settings';
import { deleteTask } from '@/db/tasks';
import { useShortTitles } from '@/hooks/use-short-titles';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import { itemsOnDay, type CalendarItem } from '@/lib/calendar-items';
import { createFromParsed } from '@/lib/create-entry';
import { notifyDataChanged } from '@/lib/data-events';
import { formatDateKey, formatTime, fromKey, shiftKey, toDateKey } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';
import { showToast } from '@/lib/toast';
import { toggleTask } from '@/lib/task-toggle';
import { planLines, planningDay, type PlannedLine } from '@/lib/tomorrow-list';

type Row = { id: number; text: string };

/** Tappable examples of what the check-in understands. */
const EXAMPLES = ['gym 7am', 'essay due thursday', 'quiz in 3 days', 'read ch 4 due next class', 'call mom'];

/** "Tue, Oct 13 · 7:00–8:00 AM", "due Wed 8:00 AM (next LAT 111 class)", "Tue, Oct 13" … */
function when(line: PlannedLine, day: string): string {
  const { parsed } = line;
  const date = parsed.starts_at.slice(0, 10);
  const dateText = date === day ? '' : `${formatDateKey(date)} · `;
  if (parsed.classRef?.kind === 'found') {
    return `due ${formatDateKey(date)}, ${formatTime(parsed.starts_at)} (${parsed.classRef.reason})`;
  }
  if (line.needsClass) return 'due next class — which class?';
  if (parsed.allDay) return date === day ? 'any time' : formatDateKey(date);
  if (line.kind === 'task') return `${dateText}due ${formatTime(parsed.starts_at)}`;
  return `${dateText}${formatTime(parsed.starts_at)}–${formatTime(parsed.ends_at)}`;
}

/**
 * The night check-in, "New tasks coming up?" (opened from the night notification): type what's coming
 * as bullets and it's sorted onto the calendar — times become events, homework and errands become
 * tasks. Lines without a date go on tomorrow; "essay due friday" or "quiz in 3 days" go on that day.
 */
export default function TomorrowScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { itemsBetween, calendars, classes, reload, tasks } = useCalendarData();
  const tabBarSpace = useTabBarSpace();
  // A tab stays mounted: recompute which day we're planning each time it's shown.
  const [day, setDay] = useState(() => planningDay());
  useFocusEffect(useCallback(() => setDay(planningDay()), []));
  const [rows, setRows] = useState<Row[]>([{ id: 0, text: '' }]);
  const nextId = useRef(1);
  const inputs = useRef(new Map<number, TextInput>());
  // Which bullet to focus once it has rendered (after Enter or Backspace). The keyboard only comes up
  // by itself when opened from the night reminder (/tomorrow?focus=1); otherwise it would cover the tab bar.
  const { focus, review } = useLocalSearchParams<{ focus?: string; review?: string }>();
  // Sunday nights (or from the week-review notification): look back at the week and ahead to the next.
  const today = toDateKey(new Date());
  const showReview = !!review || fromKey(today).getDay() === 0;
  const [focusId, setFocusId] = useState<number | null>(null);
  useEffect(() => {
    if (focus) inputs.current.values().next().value?.focus();
  }, [focus]);
  const [chosenClasses, setChosenClasses] = useState<Record<string, string>>({});
  const [defaultCalendarId, setDefaultCalendarId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings(db).then((settings) => setDefaultCalendarId(settings.lastCalendarId));
  }, [db]);
  const fallbackCalendar =
    calendars.find((c) => c.id === defaultCalendarId)?.id ?? calendars.find((c) => c.is_default)?.id ?? null;

  const already = useMemo(() => itemsOnDay(itemsBetween(day, day), day), [itemsBetween, day]);
  useEffect(() => {
    if (focusId === null) return;
    inputs.current.get(focusId)?.focus();
  }, [focusId, rows]);

  const text = rows.map((row) => row.text).join('\n');
  const lines = planLines(text, day, { calendars, classes, defaultCalendarId: fallbackCalendar, chosenClasses });
  const { short, settle } = useShortTitles(lines.map((line) => line.parsed.title));
  const waiting = lines.filter((line) => line.needsClass).length;

  const newRow = (rowText = ''): Row => ({ id: nextId.current++, text: rowText });
  // A pasted list (several lines) becomes several bullets.
  const changeRow = (id: number, next: string) => {
    const parts = next.split(/\r?\n/);
    if (parts.length === 1) {
      setRows(rows.map((row) => (row.id === id ? { ...row, text: next } : row)));
      return;
    }
    const at = rows.findIndex((row) => row.id === id);
    const added = parts.slice(1).map((part) => newRow(part));
    setRows([...rows.slice(0, at), { id, text: parts[0] }, ...added, ...rows.slice(at + 1)]);
    setFocusId(added[added.length - 1].id);
  };
  // Enter starts the next bullet; Backspace on an empty bullet removes it.
  const addRowAfter = (id: number) => {
    const at = rows.findIndex((row) => row.id === id);
    const row = newRow();
    setRows([...rows.slice(0, at + 1), row, ...rows.slice(at + 1)]);
    setFocusId(row.id);
  };
  const removeRow = (id: number) => {
    const at = rows.findIndex((row) => row.id === id);
    setRows(rows.filter((row) => row.id !== id));
    setFocusId((rows[at - 1] ?? rows[at + 1]).id);
  };

  const toggle = (item: CalendarItem) => toggleTask(db, item, reload);

  // Tapping an example fills the empty bullet you're on, or starts a new one.
  const addExample = (example: string) => {
    const last = rows[rows.length - 1];
    if (last.text.trim() === '') setRows(rows.map((row) => (row.id === last.id ? { ...row, text: example } : row)));
    else setRows([...rows, newRow(example)]);
  };

  const save = async () => {
    if (saving || lines.length === 0 || waiting > 0) return;
    setSaving(true);
    await settle();
    const added: { kind: 'event' | 'task'; id: string }[] = [];
    for (const line of lines) {
      const title = short(line.parsed.title);
      // The wording as typed stays in the notes when the title was shortened.
      const notes = title === line.parsed.title ? undefined : line.text;
      added.push({ kind: line.kind, id: await createFromParsed(db, line.kind, { ...line.parsed, title }, line.calendar?.id ?? null, notes) });
    }
    rescheduleAll(db);
    showToast(`Added ${added.length} ${added.length === 1 ? 'thing' : 'things'}`, async () => {
      for (const entry of added) await (entry.kind === 'event' ? deleteEvent(db, entry.id) : deleteTask(db, entry.id));
      notifyDataChanged();
      rescheduleAll(db);
    });
    // The tab stays mounted, so clear the list for next time.
    setRows([{ id: nextId.current++, text: '' }]);
    setChosenClasses({});
    setSaving(false);
    // Show the first day something landed on (not always tomorrow).
    const first = lines.map((line) => line.parsed.starts_at.slice(0, 10)).sort()[0] ?? day;
    router.navigate({ pathname: '/calendar', params: { date: first } });
  };

  const colorOf = ({ parsed, calendar }: PlannedLine) => {
    const classRef = parsed.classRef;
    const classColor = classRef?.kind === 'found' ? classes.find((c) => c.groupId === classRef.groupId)?.color : null;
    return classColor ?? calendar?.color ?? theme.accent;
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive">
          <View>
            <ThemedText type="subtitle">New tasks coming up?</ThemedText>
            <ThemedText themeColor="textSecondary">Anything without a date goes on {formatDateKey(day)}</ThemedText>
          </View>
          <ReminderLink kind="night" />
          {showReview && (
            <WeekReview day={day} today={today} items={itemsBetween(shiftKey(today, -14), shiftKey(day, 7))} tasks={tasks} />
          )}

          {already.length > 0 && (
            <View style={styles.block}>
              <ThemedText type="small" themeColor="textSecondary">
                Already on {formatDateKey(day)}
              </ThemedText>
              {already.map((item) => (
                <DayItemRow
                  key={item.key}
                  item={item}
                  day={day}
                  onOpen={() =>
                    router.push({
                      pathname: item.kind === 'event' ? '/event/[id]' : '/task/[id]',
                      params: { id: item.id, date: item.occurrenceDate },
                    })
                  }
                  onToggle={() => toggle(item)}
                />
              ))}
            </View>
          )}

          <ThemedView type="backgroundElement" style={styles.box}>
            {rows.map((row, i) => (
              <View key={row.id} style={styles.bulletRow}>
                <ThemedText style={styles.bullet}>•</ThemedText>
                <TextInput
                  ref={(input) => {
                    if (input) inputs.current.set(row.id, input);
                    else inputs.current.delete(row.id);
                  }}
                  value={row.text}
                  onChangeText={(next) => changeRow(row.id, next)}
                  onSubmitEditing={() => addRowAfter(row.id)}
                  onKeyPress={(e) => {
                    if (e.nativeEvent.key !== 'Backspace' || row.text !== '' || rows.length === 1) return;
                    // Don't let the same key press also delete a letter from the bullet above.
                    e.preventDefault();
                    removeRow(row.id);
                  }}
                  onFocus={() => setFocusId(null)}
                  submitBehavior="submit"
                  returnKeyType="next"
                  placeholder={i === 0 ? 'gym 7am' : i === 1 ? 'bio essay due friday' : i === 2 ? 'call mom' : ''}
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text }]}
                />
              </View>
            ))}
          </ThemedView>
          <ThemedText type="small" themeColor="textSecondary">
            One thing per line. Add a time to put it on the calendar; everything else becomes a task.
          </ThemedText>
          <View style={styles.examples}>
            {EXAMPLES.map((example) => (
              <Chip key={example} label={example} role="button" selected={false} onPress={() => addExample(example)} />
            ))}
          </View>

          {lines.length > 0 && (
            <View style={styles.block}>
              <ThemedText type="small" themeColor="textSecondary">
                Will add
              </ThemedText>
              {lines.map((line, i) => (
                <View key={`${i}-${line.text}`} style={styles.previewRow}>
                  {line.kind === 'task' ? (
                    <TaskCheck done={false} color={colorOf(line)} />
                  ) : (
                    <View style={[styles.bar, { backgroundColor: colorOf(line) }]} />
                  )}
                  <View style={styles.flex}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {short(line.parsed.title)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      {line.kind === 'task' ? 'Task' : 'Event'} · {when(line, day)}
                      {line.calendar ? ` · ${line.calendar.name}` : ''}
                    </ThemedText>
                    {line.parsed.classRef?.kind === 'none' && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {line.parsed.classRef.reason}.
                      </ThemedText>
                    )}
                    {line.unknownTag && (
                      <ThemedText type="small" style={{ color: theme.danger }}>
                        No calendar named “{line.unknownTag}”.
                      </ThemedText>
                    )}
                    {line.parsed.classRef?.kind === 'choose' && (
                      <View style={styles.chips}>
                        {line.parsed.classRef.options.map((option) => (
                          <Pressable
                            key={option.groupId}
                            onPress={() => setChosenClasses({ ...chosenClasses, [line.text]: option.groupId })}
                            accessibilityLabel={`Due next ${option.name} class`}
                            style={[styles.chip, { borderColor: option.color }]}>
                            <View style={[styles.dot, { backgroundColor: option.color }]} />
                            <ThemedText type="small">{option.name}</ThemedText>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <ThemedView style={[styles.footer, { borderColor: theme.backgroundSelected, paddingBottom: tabBarSpace + Spacing.two }]}>
          <Button
            onPress={save}
            disabled={lines.length === 0 || waiting > 0}
            busy={saving}
            title={
              waiting > 0
                ? `Pick a class for ${waiting} line${waiting === 1 ? '' : 's'}`
                : lines.length === 0
                  ? 'Type what you need to do'
                  : `Add ${lines.length} to your calendar`
            }
          />
        </ThemedView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  block: { gap: Spacing.two },
  box: { borderRadius: Radius.md, borderCurve: 'continuous', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 160 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bullet: { fontSize: 20, lineHeight: 24 },
  input: { flex: 1, fontSize: 17, paddingVertical: Spacing.two },
  previewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  check: { fontSize: 18, lineHeight: 22, width: 16 },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginHorizontal: 6 },
  flex: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footer: { padding: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
});
