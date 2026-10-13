import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CalendarChips } from '@/components/calendar-chips';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Calendar } from '@/db/calendars';
import { useTheme } from '@/hooks/use-theme';
import { formatDateKey, formatTime } from '@/lib/dates';
import type { ClassInfo } from '@/lib/class-schedule';
import { calendarFor } from '@/lib/create-entry';
import { parseEvent, type ParsedEvent } from '@/lib/parse-event';
import { describeRule } from '@/lib/recurrence';

export type AddKind = 'event' | 'task';
export type NewEntry = { kind: AddKind; parsed: ParsedEvent; calendarId: string | null };

type Props = {
  calendars: Calendar[];
  /** Day used when the text doesn't mention one. */
  referenceDay: Date;
  calendarId: string | null;
  /** Your classes, for "due next class". */
  classes: ClassInfo[];
  onCalendarChange: (calendarId: string) => void;
  onAdd: (entry: NewEntry) => void;
  inputRef?: Ref<TextInput>;
};

// "todo buy milk" or "[] buy milk" adds a task even in Event mode.
const TASK_PREFIX = /^(todo|\[\s?\])\s+/i;

function describe(kind: AddKind, parsed: ParsedEvent) {
  const day = formatDateKey(parsed.starts_at.slice(0, 10));
  if (parsed.classRef?.kind === 'found') return `due ${day}, ${formatTime(parsed.starts_at)} (${parsed.classRef.reason})`;
  if (parsed.classRef?.kind === 'choose') return 'due next class — which class?';
  if (!parsed.understood) return `No date or time found — all day on ${day}`;
  if (parsed.repeat) {
    const time = parsed.allDay ? '' : ` · ${formatTime(parsed.starts_at)}${kind === 'event' ? `–${formatTime(parsed.ends_at)}` : ''}`;
    const until = parsed.repeatUntil ? ` until ${formatDateKey(parsed.repeatUntil)}` : '';
    return `↻ ${describeRule(parsed.repeat, parsed.starts_at.slice(0, 10))}${time} · from ${day}${until}`;
  }
  if (parsed.allDay) {
    const endDay = parsed.ends_at.slice(0, 10);
    const range = endDay > parsed.starts_at.slice(0, 10) ? `${day} – ${formatDateKey(endDay)}` : day;
    return kind === 'task' ? range : `${range} · All day`;
  }
  if (kind === 'task') return `${day} · ${formatTime(parsed.starts_at)}`;
  return `${day} · ${formatTime(parsed.starts_at)}–${formatTime(parsed.ends_at)}`;
}

/** "What are you doing?" box: type "gym tomorrow 6pm #work" and it lands on the calendar. */
export function AddBox({ calendars, referenceDay, calendarId, classes, onCalendarChange, onAdd, inputRef }: Props) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<AddKind>('event');
  // The class picked from the "Which class?" chips, for "due next class" when the text doesn't say.
  const [chosenClassId, setChosenClassId] = useState<string | null>(null);

  const parsed = parseEvent(text.replace(TASK_PREFIX, ''), referenceDay, { classes, chosenClassId });
  const classRef = parsed?.classRef ?? null;
  // Something "due next class" is a task, whichever mode is on.
  const kind: AddKind = TASK_PREFIX.test(text) || (classRef && classRef.kind !== 'none') ? 'task' : mode;
  const classColor =
    classRef?.kind === 'found' ? classes.find((c) => c.groupId === classRef.groupId)?.color : undefined;
  const canAdd = parsed !== null && classRef?.kind !== 'choose';

  // "#work" picks a calendar; homework for a class goes in that class's calendar.
  const { calendar, unknownTag } = parsed
    ? calendarFor(parsed, calendars, calendarId)
    : { calendar: calendars.find((c) => c.id === calendarId) ?? calendars[0], unknownTag: null };
  const color = classColor ?? calendar?.color ?? theme.accent;

  const submit = () => {
    if (!parsed || !canAdd) return;
    onAdd({ kind, parsed, calendarId: calendar?.id ?? null });
    setText('');
    setChosenClassId(null);
  };

  return (
    <View style={styles.container}>
      <ThemedView type="backgroundElement" style={styles.segmented}>
        {(['event', 'task'] as const).map((value) => {
          const selected = kind === value;
          return (
            <Pressable
              key={value}
              onPress={() => setMode(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.segment, selected && { backgroundColor: theme.background }]}>
              <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
                {value === 'event' ? 'Event' : 'Task'}
              </ThemedText>
            </Pressable>
          );
        })}
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.inputBox}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          placeholder={kind === 'task' ? 'e.g. call bank friday' : 'What are you doing? e.g. gym tomorrow 6pm'}
          placeholderTextColor={theme.textSecondary}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          style={[styles.input, { color: theme.text }]}
        />
        <Pressable
          onPress={submit}
          disabled={!canAdd}
          accessibilityLabel="Add to calendar"
          style={[styles.button, { backgroundColor: canAdd ? color : theme.backgroundSelected }]}>
          <ThemedText type="smallBold" style={styles.buttonText}>
            Add
          </ThemedText>
        </Pressable>
      </ThemedView>

      {parsed && (
        <View style={styles.preview}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.previewText}>
            <ThemedText type="smallBold">
              {kind === 'task' ? '☐ ' : ''}
              {parsed.title}
            </ThemedText>{' '}
            · {describe(kind, parsed)}
          </ThemedText>
        </View>
      )}
      {classRef?.kind === 'choose' && (
        <View style={styles.classChoices}>
          {classRef.options.map((option) => (
            <Pressable
              key={option.groupId}
              onPress={() => setChosenClassId(option.groupId)}
              accessibilityLabel={`Due next ${option.name} class`}
              style={[styles.classChip, { borderColor: option.color }]}>
              <View style={[styles.dot, { backgroundColor: option.color }]} />
              <ThemedText type="small">{option.name}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}
      {classRef?.kind === 'none' && (
        <ThemedText type="small" themeColor="textSecondary">
          {classRef.reason}.
        </ThemedText>
      )}
      {unknownTag && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          No calendar named “{unknownTag}” — adding to {calendar?.name}.
        </ThemedText>
      )}

      <CalendarChips calendars={calendars} value={calendar?.id ?? null} onChange={onCalendarChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  segmented: { flexDirection: 'row', borderRadius: Spacing.two, padding: 2 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: Spacing.one, borderRadius: Spacing.two - 2 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.one,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: Spacing.two },
  button: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  buttonText: { color: '#fff' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  previewText: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  classChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  classChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
