import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { CalendarChips } from '@/components/calendar-chips';
import { useChoiceDialog } from '@/components/choice-dialog';
import { ColorSwatches } from '@/components/color-swatches';
import { DateTimeField } from '@/components/date-time-field';
import { BreakDown } from '@/components/course/break-down';
import { ExamStudy } from '@/components/course/exam-study';
import { ScoreField } from '@/components/course/score-field';
import { GroupChips } from '@/components/group-chips';
import { RepeatPicker } from '@/components/repeat-picker';
import { SyllabusDetails } from '@/components/syllabus-details';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TypeChips } from '@/components/type-chips';
import { TaskCheck } from '@/components/ui/task-check';
import { Spacing } from '@/constants/theme';
import { listCalendars, type Calendar } from '@/db/calendars';
import { learnFromPlacement, listGroups, type Group, type GroupChoice } from '@/db/groups';
import {
  addTaskException,
  createTask,
  deleteTask,
  getTask,
  listCompletions,
  setOccurrenceDone,
  setTaskDone,
  updateTask,
} from '@/db/tasks';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive, notify } from '@/lib/confirm';
import { dateToTime, daysBetween, fromKey, shiftKey, toDateKey } from '@/lib/dates';
import { detectItemType, isCourseGroup, typeColor, type ItemType } from '@/lib/item-type';
import { rescheduleAll } from '@/lib/notifications';
import { parseRule, type RepeatRule } from '@/lib/recurrence';

/**
 * Create (`/task/new`) or edit (`/task/<id>?date=<occurrence>`) a task. A repeating task is ticked
 * off per date, and saving asks whether to change only this date or all of them.
 */
export default function TaskScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const isNew = id === 'new';
  const [choiceDialog, ask] = useChoiceDialog();

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [day, setDay] = useState(() => (date ? fromKey(date) : new Date()));
  const [hasTime, setHasTime] = useState(false);
  const [time, setTime] = useState(() => {
    const next = new Date();
    next.setHours(9, 0, 0, 0);
    return next;
  });
  const [done, setDone] = useState(false);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  // The group the automatic rules gave this task, and whether you picked one by hand this time.
  const [autoGroupId, setAutoGroupId] = useState<string | null>(null);
  const [groupChoice, setGroupChoice] = useState<GroupChoice>('auto');
  const [groupTouched, setGroupTouched] = useState(false);
  // Class, exam, assignment...; null = guessed from the title.
  const [itemType, setItemType] = useState<ItemType | null>(null);
  // What an imported syllabus says about it (read-only).
  const [details, setDetails] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  const [repeatUntil, setRepeatUntil] = useState<string | null>(null);
  // For repeating tasks: when the series starts, and which date is being edited.
  const [series, setSeries] = useState<{ start: string; occurrence: string } | null>(null);

  useEffect(() => {
    listCalendars(db).then((list) => {
      setCalendars(list);
      setCalendarId((current) => current ?? list.find((c) => c.is_default)?.id ?? list[0]?.id ?? null);
    });
    listGroups(db).then(setGroups);
    if (isNew) return;
    Promise.all([getTask(db, id), listCompletions(db)]).then(([task, completions]) => {
      if (!task) return;
      const rule = parseRule(task.repeat);
      const occurrence = rule && date ? date : task.date;
      setTitle(task.title);
      setNotes(task.notes ?? '');
      setDay(fromKey(occurrence));
      setHasTime(task.time !== null);
      if (task.time) setTime(fromKey(`${task.date}T${task.time}`));
      setDone(rule ? completions.some((c) => c.task_id === id && c.date === occurrence) : task.done === 1);
      setCalendarId(task.calendar_id);
      setColor(task.color);
      if (task.group_locked) setGroupChoice({ groupId: task.group_id });
      else setAutoGroupId(task.group_id);
      setItemType(task.item_type);
      setDetails(task.details);
      setRepeat(rule);
      setRepeatUntil(task.repeat_until);
      if (rule) setSeries({ start: task.date, occurrence });
    });
  }, [db, id, isNew, date]);

  const save = async () => {
    if (!title.trim()) {
      notify('Add a title first');
      return;
    }
    const input = {
      title,
      notes: notes.trim() || null,
      date: toDateKey(day),
      time: hasTime ? dateToTime(time) : null,
      calendar_id: calendarId,
      color,
      repeat,
      repeat_until: repeat ? repeatUntil : null,
      // Keep a hand-picked group (also on a copy split off a series); 'auto' unless you chose one.
      group: groupTouched || groupChoice !== 'auto' ? groupChoice : undefined,
      item_type: itemType,
    };
    const finish = async () => {
      // Putting a task in a group by hand teaches that group its first word.
      if (groupTouched && groupChoice !== 'auto' && groupChoice.groupId) {
        await learnFromPlacement(db, groupChoice.groupId, title);
      }
      rescheduleAll(db);
      router.back();
    };

    if (isNew) {
      const newId = await createTask(db, input);
      if (done) await (repeat ? setOccurrenceDone(db, newId, input.date, true) : setTaskDone(db, newId, true));
      return finish();
    }
    if (!series) {
      await updateTask(db, id, input);
      if (repeat) await setOccurrenceDone(db, id, input.date, done);
      else await setTaskDone(db, id, done);
      return finish();
    }
    ask('This is a repeating task.', 'Save changes for:', [
      {
        label: 'Only this task',
        onPress: async () => {
          // Split this date off as its own one-off task.
          await addTaskException(db, id, series.occurrence);
          const newId = await createTask(db, { ...input, repeat: null, repeat_until: null });
          if (done) await setTaskDone(db, newId, true);
          finish();
        },
      },
      {
        label: 'All tasks',
        onPress: async () => {
          // Edits were made on this date; move them back onto the series' first date.
          const shift = repeat ? -daysBetween(series.start, series.occurrence) : 0;
          await updateTask(db, id, { ...input, date: shiftKey(input.date, shift) });
          // "Done" always means just the date you were looking at.
          if (repeat) await setOccurrenceDone(db, id, series.occurrence, done);
          else await setTaskDone(db, id, done);
          finish();
        },
      },
      { label: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmDelete = () => {
    const removeAll = async () => {
      await deleteTask(db, id);
      rescheduleAll(db);
      router.back();
    };
    if (!series) {
      confirmDestructive('Delete task?', title, 'Delete', removeAll);
      return;
    }
    ask('Delete this repeating task?', title, [
      {
        label: 'Delete only this task',
        style: 'destructive',
        onPress: async () => {
          await addTaskException(db, id, series.occurrence);
          rescheduleAll(db);
          router.back();
        },
      },
      { label: 'Delete all tasks', style: 'destructive', onPress: removeAll },
      { label: 'Cancel', style: 'cancel' },
    ]);
  };

  const calendarColor = calendars.find((c) => c.id === calendarId)?.color ?? theme.accent;
  const calendarGroups = groups.filter((group) => group.calendar_id === calendarId);
  const autoGroup = calendarGroups.find((group) => group.id === autoGroupId) ?? null;
  const shownGroupId = groupChoice === 'auto' ? autoGroup?.id : groupChoice.groupId;
  const shownGroup = calendarGroups.find((group) => group.id === shownGroupId) ?? null;
  // In a group, each type (class, exam, homework...) gets its own shade of the group's color.
  const guessedType = detectItemType(title, 'task', repeat !== null, !!shownGroup && isCourseGroup(shownGroup));
  const groupColor = shownGroup ? typeColor(shownGroup, itemType ?? guessedType) : null;
  const changeCalendar = (next: string) => {
    setCalendarId(next);
    // A group belongs to one calendar; a hand-picked one from the old calendar no longer fits.
    if (groupChoice !== 'auto' && groupChoice.groupId) setGroupChoice('auto');
  };
  const changeGroup = (choice: GroupChoice) => {
    setGroupChoice(choice);
    setGroupTouched(true);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: isNew ? 'New Task' : 'Edit Task',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <ThemedText style={{ color: theme.accent }}>Cancel</ThemedText>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={save} hitSlop={8}>
              <ThemedText type="smallBold" style={[styles.headerButton, { color: theme.accent }]}>
                {isNew ? 'Add' : 'Done'}
              </ThemedText>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView type="backgroundElement" style={[styles.group, styles.titleRow]}>
          <TaskCheck done={done} color={color ?? groupColor ?? calendarColor} size={24} onToggle={() => setDone(!done)} />
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Task"
            placeholderTextColor={theme.textSecondary}
            autoFocus={isNew}
            style={[styles.input, styles.titleInput, { color: theme.text }, done && styles.done]}
          />
        </ThemedView>

        {details && (
          <SyllabusDetails
            details={details}
            course={shownGroup?.name ?? null}
            color={color ?? groupColor ?? calendarColor}
          />
        )}

        {!isNew && !repeat && <ExamStudy id={id} />}
        {!isNew && !repeat && !done && (itemType ?? guessedType) === 'assignment' && (
          <BreakDown
            title={title}
            details={details}
            notes={notes.trim() || null}
            due={toDateKey(day)}
            calendarId={calendarId}
            groupId={shownGroup?.id ?? null}
          />
        )}

        <ThemedView type="backgroundElement" style={styles.group}>
          <DateTimeField label="Date" value={day} onChange={setDay} mode="date" />
          <ThemedView type="backgroundElement" style={styles.row}>
            <ThemedText>Time</ThemedText>
            <Switch value={hasTime} onValueChange={setHasTime} />
          </ThemedView>
          {hasTime && <DateTimeField label="At" value={time} onChange={setTime} mode="time" />}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.group}>
          <RepeatPicker
            rule={repeat}
            until={repeatUntil}
            startDay={toDateKey(day)}
            onChange={setRepeat}
            onUntilChange={setRepeatUntil}
          />
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.group}>
          <ThemedText type="small" themeColor="textSecondary">
            Calendar
          </ThemedText>
          <CalendarChips calendars={calendars} value={calendarId} onChange={changeCalendar} />
          <ThemedText type="small" themeColor="textSecondary">
            Group
          </ThemedText>
          <GroupChips groups={calendarGroups} value={groupChoice} autoGroup={autoGroup} onChange={changeGroup} />
          {shownGroup && (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Type
              </ThemedText>
              <TypeChips group={shownGroup} value={itemType} guessed={guessedType} onChange={setItemType} />
            </>
          )}
          {!isNew && shownGroup && !repeat && (itemType ?? guessedType) !== 'class' && (
            <ScoreField table="tasks" id={id} groupId={shownGroup.id} />
          )}
          <View style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary">
              Color
            </ThemedText>
            <Pressable onPress={() => setColor(null)} hitSlop={6}>
              <ThemedText type="small" style={{ color: color ? theme.accent : theme.textSecondary }}>
                {groupColor
                  ? color ? 'Use group color' : 'Using group color'
                  : color ? 'Use calendar color' : 'Using calendar color'}
              </ThemedText>
            </Pressable>
          </View>
          <ColorSwatches value={color ?? groupColor ?? calendarColor} onChange={setColor} />
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.group}>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, styles.notes, { color: theme.text }]}
          />
        </ThemedView>

        {!isNew && (
          <Pressable onPress={confirmDelete}>
            <ThemedView type="backgroundElement" style={styles.group}>
              <ThemedText style={[styles.center, { color: theme.danger }]}>Delete Task</ThemedText>
            </ThemedView>
          </Pressable>
        )}
      </ScrollView>
      {choiceDialog}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.four },
  group: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  check: { fontSize: 24, lineHeight: 28 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { fontSize: 17 },
  titleInput: { flex: 1 },
  done: { textDecorationLine: 'line-through' },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  center: { textAlign: 'center' },
  headerButton: { fontSize: 17 },
});
