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
import { EstimatePicker } from '@/components/estimate-picker';
import { FocusCard } from '@/components/focus-card';
import { GroupChips } from '@/components/group-chips';
import { KindSwitch } from '@/components/kind-switch';
import { ReminderPicker } from '@/components/reminder-picker';
import { RepeatPicker } from '@/components/repeat-picker';
import { SyllabusDetails } from '@/components/syllabus-details';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TypeChips } from '@/components/type-chips';
import { TaskCheck } from '@/components/ui/task-check';
import { nativeOnly } from '@/components/ui/back-arrow';
import { EmptyState } from '@/components/ui/empty-state';
import { closeModal } from '@/components/ui/close-button';
import { Radius, Spacing } from '@/constants/theme';
import { listCalendars, type Calendar } from '@/db/calendars';
import { learnFromPlacement, listGroups, type Group, type GroupChoice } from '@/db/groups';
import { getSettings } from '@/db/settings';
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
import { useConfirmDiscard } from '@/hooks/use-confirm-discard';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive, notify } from '@/lib/confirm';
import { notifyDataChanged } from '@/lib/data-events';
import { dateToTime, daysBetween, fromKey, shiftKey, toDateKey } from '@/lib/dates';
import { backToQuickAdd, draftGroup, readDraft, reviewAs } from '@/lib/entry-draft';
import { detectItemType, isCourseGroup, typeColor, type ItemType } from '@/lib/item-type';
import { rescheduleAll } from '@/lib/notifications';
import { showToast } from '@/lib/toast';
import { parseRule, type RepeatRule } from '@/lib/recurrence';
import { parseReminders, type ReminderToken } from '@/lib/reminders';

/**
 * Create (`/task/new`, or `/task/new?draft=1` filled in from quick add's typed text) or edit (`/task/<id>?date=<occurrence>`) a task. A repeating task is ticked
 * off per date, and saving asks whether to change only this date or all of them.
 */
export default function TaskScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const params = useLocalSearchParams<{ id: string; date?: string; draft?: string }>();
  const { id, date } = params;
  const isNew = id === 'new';
  const [choiceDialog, ask] = useChoiceDialog();
  // What quick add read from the typed text, shown here to check over before it's added.
  const [draft] = useState(() => (isNew && params.draft ? readDraft() : null));
  const parsed = draft?.parsed;

  const [title, setTitle] = useState(parsed?.title ?? '');
  const [notes, setNotes] = useState(draft?.notes ?? '');
  // The title and notes as loaded, to tell whether leaving would lose typing.
  const [loadedText, setLoadedText] = useState({ title: parsed?.title ?? '', notes: draft?.notes ?? '' });
  const allowLeave = useConfirmDiscard(title !== loadedText.title || notes !== loadedText.notes);
  const [day, setDay] = useState(() =>
    parsed ? fromKey(parsed.starts_at.slice(0, 10)) : date ? fromKey(date) : new Date()
  );
  const [hasTime, setHasTime] = useState(parsed ? !parsed.allDay : false);
  const [time, setTime] = useState(() => {
    if (parsed && !parsed.allDay) return fromKey(parsed.starts_at);
    const next = new Date();
    next.setHours(9, 0, 0, 0);
    return next;
  });
  const [done, setDone] = useState(false);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(draft?.calendarId ?? null);
  const [color, setColor] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  // The group the automatic rules gave this task, and whether you picked one by hand this time.
  const [autoGroupId, setAutoGroupId] = useState<string | null>(null);
  const [groupChoice, setGroupChoice] = useState<GroupChoice>(() => (draft && draftGroup(draft)) ?? 'auto');
  const [groupTouched, setGroupTouched] = useState(false);
  // Class, exam, assignment...; null = guessed from the title.
  const [itemType, setItemType] = useState<ItemType | null>(null);
  // What an imported syllabus says about it (read-only).
  const [details, setDetails] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<RepeatRule | null>(parsed?.repeat ?? null);
  const [repeatUntil, setRepeatUntil] = useState<string | null>(parsed?.repeatUntil ?? null);
  // For repeating tasks: when the series starts, and which date is being edited.
  const [series, setSeries] = useState<{ start: string; occurrence: string } | null>(null);
  // Opened from a link to a task that's since been deleted (here or on another device).
  const [missing, setMissing] = useState(false);
  // Reminder choice: null = the defaults for its type (and whether those are on in Settings).
  const [reminders, setReminders] = useState<ReminderToken[] | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [defaultRemindersOn, setDefaultRemindersOn] = useState(true);

  useEffect(() => {
    listCalendars(db).then((list) => {
      setCalendars(list);
      setCalendarId((current) => current ?? list.find((c) => c.is_default)?.id ?? list[0]?.id ?? null);
    });
    listGroups(db).then(setGroups);
    getSettings(db).then((settings) => setDefaultRemindersOn(settings.defaultReminders));
    if (isNew) return;
    Promise.all([getTask(db, id), listCompletions(db)]).then(([task, completions]) => {
      if (!task) return setMissing(true);
      setLoadedText({ title: task.title, notes: task.notes ?? '' });
      setReminders(parseReminders(task.reminders));
      setMinutes(task.minutes);
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
      reminders,
      minutes,
    };
    const finish = async (newId?: string) => {
      // Putting a task in a group by hand teaches that group its first word.
      if (groupTouched && groupChoice !== 'auto' && groupChoice.groupId) {
        await learnFromPlacement(db, groupChoice.groupId, title);
      }
      rescheduleAll(db);
      allowLeave();
      closeModal();
      if (newId && draft) {
        showToast(`Added: ${title.trim()}`, async () => {
          await deleteTask(db, newId);
          notifyDataChanged();
          rescheduleAll(db);
        });
      }
      // Typed in quick add: show where it landed.
      if (draft) router.navigate({ pathname: '/calendar', params: { date: input.date } });
    };

    if (isNew) {
      const newId = await createTask(db, input);
      if (done) await (repeat ? setOccurrenceDone(db, newId, input.date, true) : setTaskDone(db, newId, true));
      return finish(newId);
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
      allowLeave();
      closeModal();
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
          allowLeave();
          closeModal();
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

  if (missing) {
    return (
      <ThemedView style={[styles.container, styles.content]}>
        <Stack.Screen
          options={{
            title: 'Task', headerRight: () => null,
            headerLeft: nativeOnly(() => (
              <Pressable onPress={closeModal} hitSlop={8}>
                <ThemedText style={{ color: theme.accent }}>Close</ThemedText>
              </Pressable>
            )),
          }}
        />
        <EmptyState text="This task was deleted." />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: isNew ? 'New task' : 'Edit task',
          headerLeft: nativeOnly(() => (
            <Pressable onPress={draft ? backToQuickAdd : closeModal} hitSlop={8}>
              <ThemedText style={{ color: theme.accent }}>Cancel</ThemedText>
            </Pressable>
          )),
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
        {/* Quick add guessed wrong? Switch without retyping. */}
        {draft && <KindSwitch value="task" onChange={(kind) => kind !== 'task' && reviewAs(kind, draft, title)} />}
        <ThemedView type="backgroundElement" style={[styles.group, styles.titleRow]}>
          <TaskCheck done={done} color={color ?? groupColor ?? calendarColor} size={24} onToggle={() => setDone(!done)} />
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Task"
            returnKeyType="done"
            placeholderTextColor={theme.textSecondary}
            autoFocus={isNew && !draft}
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

        {!isNew && !done && (
          <FocusCard
            taskId={id}
            groupId={shownGroup?.id ?? null}
            groupName={shownGroup?.name ?? null}
            itemType={itemType ?? guessedType}
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
          <ReminderPicker
            item={{ kind: 'task', itemType: itemType ?? guessedType, allDay: !hasTime, startDay: toDateKey(day), time: hasTime ? dateToTime(time) : null }}
            value={reminders}
            onChange={setReminders}
            defaultsOn={defaultRemindersOn}
          />
          <EstimatePicker value={minutes} onChange={setMinutes} />
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
  group: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.three },
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
