import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/bottom-bar';
import { DayItemRow } from '@/components/day-item-row';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ThemedView } from '@/components/themed-view';
import { TaskCheck } from '@/components/ui/task-check';
import { Spacing } from '@/constants/theme';
import { getSettings } from '@/db/settings';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import { itemsOnDay } from '@/lib/calendar-items';
import { createFromParsed } from '@/lib/create-entry';
import { formatDateKey, formatTime } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';
import { planLines, planningDay, type PlannedLine } from '@/lib/tomorrow-list';

type Row = { id: number; text: string };

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
 * The night check-in (opened from the night notification): type tomorrow's list as bullets and it's
 * sorted onto the calendar — times become events, homework and errands become tasks.
 */
export default function TomorrowScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { itemsBetween, calendars, classes } = useCalendarData();
  const tabBarSpace = useTabBarSpace();
  // A tab stays mounted: recompute which day we're planning each time it's shown.
  const [day, setDay] = useState(() => planningDay());
  useFocusEffect(useCallback(() => setDay(planningDay()), []));
  const [rows, setRows] = useState<Row[]>([{ id: 0, text: '' }]);
  const nextId = useRef(1);
  const inputs = useRef(new Map<number, TextInput>());
  // Which bullet to focus once it has rendered (after Enter or Backspace).
  const [focusId, setFocusId] = useState<number | null>(0);
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

  const save = async () => {
    if (saving || lines.length === 0 || waiting > 0) return;
    setSaving(true);
    for (const line of lines) await createFromParsed(db, line.kind, line.parsed, line.calendar?.id ?? null);
    rescheduleAll(db);
    // The tab stays mounted, so clear the list for next time.
    setRows([{ id: nextId.current++, text: '' }]);
    setChosenClasses({});
    setSaving(false);
    router.navigate({ pathname: '/calendar', params: { date: day } });
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View>
            <ThemedText type="subtitle" style={styles.heading}>
              What’s on for tomorrow?
            </ThemedText>
            <ThemedText themeColor="textSecondary">{formatDateKey(day)}</ThemedText>
          </View>

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
                  onToggle={() => {}}
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
                  placeholder={i === 0 ? 'gym 7am' : i === 1 ? 'bio hw due next class' : i === 2 ? 'call mom' : ''}
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text }]}
                />
              </View>
            ))}
          </ThemedView>
          <ThemedText type="small" themeColor="textSecondary">
            One thing per line. Add a time to put it on the calendar (“gym 7am”); everything else becomes a task.
            “Due next class” and “#work” work too.
          </ThemedText>

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
                      {line.parsed.title}
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
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  heading: { fontSize: 26, lineHeight: 32 },
  block: { gap: Spacing.two },
  box: { borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 160 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bullet: { fontSize: 20, lineHeight: 24 },
  input: { flex: 1, fontSize: 17, paddingVertical: Spacing.one + 2 },
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
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footer: { padding: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
});
