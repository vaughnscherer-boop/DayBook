import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { CalendarChips } from '@/components/calendar-chips';
import { DateTimeField } from '@/components/date-time-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import type { Calendar } from '@/db/calendars';
import { useShortTitles } from '@/hooks/use-short-titles';
import { useTheme } from '@/hooks/use-theme';
import { formatDateKey, formatDuration, formatTime, fromKey, toDateKey, toDateTimeKey } from '@/lib/dates';
import type { ClassInfo } from '@/lib/class-schedule';
import { calendarFor } from '@/lib/create-entry';
import { parseEvent, type ParsedEvent } from '@/lib/parse-event';
import { describeRule } from '@/lib/recurrence';

export type AddKind = 'event' | 'task';
export type NewEntry = { kind: AddKind; parsed: ParsedEvent; calendarId: string | null; notes?: string };

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

/** The time picked by hand in the box, in place of the one read from the text. */
type TimeEdit = { startsAt: Date; endsAt: Date; allDay: boolean };

const HOUR = 60 * 60 * 1000;

const timeOf = (parsed: ParsedEvent): TimeEdit => ({
  startsAt: fromKey(parsed.starts_at),
  endsAt: fromKey(parsed.ends_at),
  allDay: parsed.allDay,
});

function withTime(parsed: ParsedEvent, { startsAt, endsAt, allDay }: TimeEdit): ParsedEvent {
  const end = endsAt < startsAt ? startsAt : endsAt;
  return {
    ...parsed,
    allDay,
    starts_at: allDay ? `${toDateKey(startsAt)}T00:00` : toDateTimeKey(startsAt),
    ends_at: allDay ? `${toDateKey(end)}T23:59` : toDateTimeKey(end),
    understood: true,
  };
}

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

/** "What are you doing?" box: type "gym tomorrow 6pm #work" and it's read into an event or task. */
export function AddBox({ calendars, referenceDay, calendarId, classes, onCalendarChange, onAdd, inputRef }: Props) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<AddKind>('event');
  // The class picked from the "Which class?" chips, for "due next class" when the text doesn't say.
  const [chosenClassId, setChosenClassId] = useState<string | null>(null);
  // Tapping the preview opens pickers to change the time; typing again goes back to the text's time.
  const [editingTime, setEditingTime] = useState(false);
  const [timeEdit, setTimeEdit] = useState<TimeEdit | null>(null);

  const read = parseEvent(text.replace(TASK_PREFIX, ''), referenceDay, { classes, chosenClassId });
  const parsed = read && timeEdit ? withTime(read, timeEdit) : read;
  const time = parsed ? timeOf(parsed) : null;
  const changeTime = (next: Partial<TimeEdit>) => {
    if (time) setTimeEdit({ ...time, ...next });
  };
  // Moving the start keeps the event's length, like the full form.
  const changeStart = (next: Date) => {
    if (!time) return;
    const length = Math.max(time.endsAt.getTime() - time.startsAt.getTime(), time.allDay ? 0 : HOUR);
    changeTime({ startsAt: next, endsAt: new Date(next.getTime() + length) });
  };
  const changeAllDay = (allDay: boolean) => {
    if (!time) return;
    if (allDay) return changeTime({ allDay });
    // An all-day item given a time starts at 9, an hour long.
    const startsAt = new Date(time.startsAt);
    startsAt.setHours(9, 0, 0, 0);
    changeTime({ allDay, startsAt, endsAt: new Date(startsAt.getTime() + HOUR) });
  };
  const changeText = (next: string) => {
    setText(next);
    setTimeEdit(null);
  };
  const { short, settle } = useShortTitles(parsed ? [parsed.title] : []);
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

  const submit = async () => {
    if (!parsed || !canAdd) return;
    await settle();
    const title = short(parsed.title);
    onAdd({
      kind,
      parsed: { ...parsed, title },
      calendarId: calendar?.id ?? null,
      // The wording as typed stays in the notes when the title was shortened.
      notes: title === parsed.title ? undefined : text.replace(TASK_PREFIX, '').trim(),
    });
    setText('');
    setChosenClassId(null);
    setTimeEdit(null);
    setEditingTime(false);
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
          onChangeText={changeText}
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
          accessibilityLabel="Review before adding"
          style={[styles.button, { backgroundColor: canAdd ? color : theme.backgroundSelected }]}>
          <ThemedText type="smallBold" style={styles.buttonText}>
            Next
          </ThemedText>
        </Pressable>
      </ThemedView>

      {parsed && (
        <Pressable
          onPress={() => setEditingTime(!editingTime)}
          accessibilityRole="button"
          accessibilityLabel={editingTime ? 'Hide time' : 'Change time'}
          style={styles.preview}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.previewText}>
            <ThemedText type="smallBold">
              {kind === 'task' ? '☐ ' : ''}
              {short(parsed.title)}
            </ThemedText>{' '}
            · {describe(kind, parsed)}
          </ThemedText>
          <View style={styles.changeTime}>
            <Icon name="edit" size={13} color={theme.accent} />
            <ThemedText type="small" style={{ color: theme.accent }}>
              {editingTime ? 'Done' : 'Time'}
            </ThemedText>
          </View>
        </Pressable>
      )}
      {parsed && time && editingTime && (
        <ThemedView type="backgroundElement" style={styles.timeBox}>
          <View style={styles.timeRow}>
            {/* Like the full forms: events switch on "All-day", tasks switch on "Time". */}
            <ThemedText>{kind === 'task' ? 'Time' : 'All-day'}</ThemedText>
            <Switch
              value={kind === 'task' ? !time.allDay : time.allDay}
              onValueChange={(on) => changeAllDay(kind === 'task' ? !on : on)}
            />
          </View>
          <DateTimeField
            label={kind === 'task' ? 'Due' : 'Starts'}
            value={time.startsAt}
            onChange={changeStart}
            mode={time.allDay ? 'date' : 'datetime'}
          />
          {kind === 'event' && (
            <DateTimeField
              label="Ends"
              value={time.endsAt}
              onChange={(endsAt) => changeTime({ endsAt })}
              mode={time.allDay ? 'date' : 'datetime'}
              hint={time.allDay ? null : formatDuration(time.startsAt, time.endsAt)}
            />
          )}
        </ThemedView>
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
  changeTime: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeBox: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
