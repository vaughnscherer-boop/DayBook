import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { CalendarChips } from '@/components/calendar-chips';
import { useChoiceDialog, type Choice } from '@/components/choice-dialog';
import { ColorSwatches } from '@/components/color-swatches';
import { DateTimeField } from '@/components/date-time-field';
import { ExamStudy } from '@/components/course/exam-study';
import { ScoreField } from '@/components/course/score-field';
import { GroupChips } from '@/components/group-chips';
import { KindSwitch } from '@/components/kind-switch';
import { ReminderPicker } from '@/components/reminder-picker';
import { RepeatPicker } from '@/components/repeat-picker';
import { SyllabusDetails } from '@/components/syllabus-details';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TypeChips } from '@/components/type-chips';
import { nativeOnly } from '@/components/ui/back-arrow';
import { EmptyState } from '@/components/ui/empty-state';
import { closeModal } from '@/components/ui/close-button';
import { Radius, Spacing } from '@/constants/theme';
import { listCalendars, type Calendar } from '@/db/calendars';
import { addEventException, createEvent, deleteEvent, deleteEvents, getEvent, sameNamedEvents, updateEvent } from '@/db/events';
import { learnFromPlacement, listGroups, type Group, type GroupChoice } from '@/db/groups';
import { getSettings } from '@/db/settings';
import { useConfirmDiscard } from '@/hooks/use-confirm-discard';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive, notify } from '@/lib/confirm';
import { notifyDataChanged } from '@/lib/data-events';
import { daysBetween, formatDuration, fromKey, shiftKey, toDateKey, toDateTimeKey } from '@/lib/dates';
import { backToQuickAdd, draftGroup, readDraft, reviewAs } from '@/lib/entry-draft';
import { detectItemType, isCourseGroup, typeColor, type ItemType } from '@/lib/item-type';
import { rescheduleAll } from '@/lib/notifications';
import { showToast } from '@/lib/toast';
import { parseRule, type RepeatRule } from '@/lib/recurrence';
import { parseReminders, type ReminderToken } from '@/lib/reminders';

const HOUR = 60 * 60 * 1000;

function defaultStart(start?: string) {
  if (start) return fromKey(start);
  const next = new Date();
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next;
}

/**
 * Create (`/event/new`, or `/event/new?draft=1` filled in from quick add's typed text) or edit (`/event/<id>?date=<occurrence>`) an event. For a repeating event
 * the form shows the tapped occurrence, and saving asks whether to change only it or all of them.
 */
export default function EventScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const params = useLocalSearchParams<{ id: string; start?: string; date?: string; draft?: string }>();
  const { id, start, date } = params;
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
  const [allDay, setAllDay] = useState(parsed?.allDay ?? false);
  const [startsAt, setStartsAt] = useState(() => (parsed ? fromKey(parsed.starts_at) : defaultStart(start)));
  const [endsAt, setEndsAt] = useState(() =>
    parsed ? fromKey(parsed.ends_at) : new Date(defaultStart(start).getTime() + HOUR)
  );
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(draft?.calendarId ?? null);
  const [color, setColor] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  // The group the automatic rules gave this event, and whether you picked one by hand this time.
  const [autoGroupId, setAutoGroupId] = useState<string | null>(null);
  const [groupChoice, setGroupChoice] = useState<GroupChoice>(() => (draft && draftGroup(draft)) ?? 'auto');
  const [groupTouched, setGroupTouched] = useState(false);
  // Class, exam, assignment...; null = guessed from the title.
  const [itemType, setItemType] = useState<ItemType | null>(null);
  // What an imported syllabus says about it (read-only).
  const [details, setDetails] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<RepeatRule | null>(parsed?.repeat ?? null);
  const [repeatUntil, setRepeatUntil] = useState<string | null>(parsed?.repeatUntil ?? null);
  // For repeating events: when the series starts, and which occurrence is being edited.
  const [series, setSeries] = useState<{ start: string; occurrence: string } | null>(null);
  // Opened from a link to a event that's since been deleted (here or on another device).
  const [missing, setMissing] = useState(false);
  // Reminder choice: null = the defaults for its type (and whether those are on in Settings).
  const [reminders, setReminders] = useState<ReminderToken[] | null>(null);
  const [defaultRemindersOn, setDefaultRemindersOn] = useState(true);

  useEffect(() => {
    listCalendars(db).then((list) => {
      setCalendars(list);
      // New events start in the default calendar; loading an event overrides this below.
      setCalendarId((current) => current ?? list.find((c) => c.is_default)?.id ?? list[0]?.id ?? null);
    });
    listGroups(db).then(setGroups);
    getSettings(db).then((settings) => setDefaultRemindersOn(settings.defaultReminders));
    if (isNew) return;
    getEvent(db, id).then((event) => {
      if (!event) return setMissing(true);
      setLoadedText({ title: event.title, notes: event.notes ?? '' });
      setReminders(parseReminders(event.reminders));
      setCalendarId(event.calendar_id);
      setColor(event.color);
      if (event.group_locked) setGroupChoice({ groupId: event.group_id });
      else setAutoGroupId(event.group_id);
      setItemType(event.item_type);
      setDetails(event.details);
      setTitle(event.title);
      setNotes(event.notes ?? '');
      setAllDay(event.all_day === 1);
      const rule = parseRule(event.repeat);
      setRepeat(rule);
      setRepeatUntil(event.repeat_until);
      // Show the tapped occurrence's date, not the series' first date.
      const seriesStart = event.starts_at.slice(0, 10);
      const occurrence = rule && date ? date : seriesStart;
      const shift = daysBetween(seriesStart, occurrence);
      setStartsAt(fromKey(shiftKey(event.starts_at, shift)));
      setEndsAt(fromKey(shiftKey(event.ends_at, shift)));
      if (rule) setSeries({ start: seriesStart, occurrence });
    });
  }, [db, id, isNew, date]);

  // Moving the start keeps the event's length, like Apple Calendar.
  const changeStart = (next: Date) => {
    const length = Math.max(endsAt.getTime() - startsAt.getTime(), allDay ? 0 : HOUR);
    setStartsAt(next);
    setEndsAt(new Date(next.getTime() + length));
  };

  const save = async () => {
    if (!title.trim()) {
      notify('Add a title first');
      return;
    }
    const end = endsAt < startsAt ? startsAt : endsAt;
    const input = {
      title,
      notes: notes.trim() || null,
      all_day: allDay,
      starts_at: allDay ? `${toDateKey(startsAt)}T00:00` : toDateTimeKey(startsAt),
      ends_at: allDay ? `${toDateKey(end)}T23:59` : toDateTimeKey(end),
      calendar_id: calendarId,
      color,
      repeat,
      repeat_until: repeat ? repeatUntil : null,
      // Keep a hand-picked group (also on a copy split off a series); 'auto' unless you chose one.
      group: groupTouched || groupChoice !== 'auto' ? groupChoice : undefined,
      item_type: itemType,
      reminders,
    };
    const finish = async (newId?: string) => {
      // Putting an event in a group by hand teaches that group its first word.
      if (groupTouched && groupChoice !== 'auto' && groupChoice.groupId) {
        await learnFromPlacement(db, groupChoice.groupId, title);
      }
      rescheduleAll(db);
      allowLeave();
      closeModal();
      if (newId && draft) {
        showToast(`Added: ${title.trim()}`, async () => {
          await deleteEvent(db, newId);
          notifyDataChanged();
          rescheduleAll(db);
        });
      }
      // Typed in quick add: show where it landed.
      if (draft) router.navigate({ pathname: '/calendar', params: { date: input.starts_at.slice(0, 10) } });
    };

    if (isNew) {
      return finish(await createEvent(db, input));
    }
    if (!series) {
      await updateEvent(db, id, input);
      return finish();
    }
    ask('This is a repeating event.', 'Save changes for:', [
      {
        label: 'Only this event',
        onPress: async () => {
          // Split this date off as its own one-off event.
          await addEventException(db, id, series.occurrence);
          await createEvent(db, { ...input, repeat: null, repeat_until: null });
          finish();
        },
      },
      {
        label: 'All events',
        onPress: async () => {
          // Edits were made on this occurrence; move them back onto the series' first date.
          const shift = repeat ? -daysBetween(series.start, series.occurrence) : 0;
          await updateEvent(db, id, {
            ...input,
            starts_at: shiftKey(input.starts_at, shift),
            ends_at: shiftKey(input.ends_at, shift),
          });
          finish();
        },
      },
      { label: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmDelete = async () => {
    const done = () => {
      rescheduleAll(db);
      allowLeave();
      closeModal();
    };
    const removeAll = async () => {
      await deleteEvent(db, id);
      done();
    };
    // Other events with this name in the same calendar: separate copies of the same class or meeting.
    const saved = await getEvent(db, id);
    const same = saved ? await sameNamedEvents(db, saved) : [];
    const copies: Choice[] =
      same.length > 1
        ? [
            {
              label: `Delete all ${same.length} “${saved!.title.trim()}” events`,
              style: 'destructive',
              onPress: async () => {
                await deleteEvents(db, same.map((event) => event.id));
                done();
              },
            },
          ]
        : [];
    const fromSite = same.some((event) => event.feed_id !== null);
    const note = fromSite ? `${title}\n\nOnes from your school site come back when it refreshes.` : title;

    if (!series) {
      if (copies.length === 0) {
        confirmDestructive('Delete event?', title, 'Delete', removeAll);
        return;
      }
      ask('Delete event?', note, [
        { label: 'Delete only this event', style: 'destructive', onPress: removeAll },
        ...copies,
        { label: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    ask('Delete this repeating event?', copies.length ? note : title, [
      {
        label: 'Delete only this event',
        style: 'destructive',
        onPress: async () => {
          await addEventException(db, id, series.occurrence);
          done();
        },
      },
      { label: 'Delete all events in this series', style: 'destructive', onPress: removeAll },
      ...copies,
      { label: 'Cancel', style: 'cancel' },
    ]);
  };

  const calendarColor = calendars.find((c) => c.id === calendarId)?.color ?? theme.accent;
  const calendarGroups = groups.filter((group) => group.calendar_id === calendarId);
  const autoGroup = calendarGroups.find((group) => group.id === autoGroupId) ?? null;
  const shownGroupId = groupChoice === 'auto' ? autoGroup?.id : groupChoice.groupId;
  const shownGroup = calendarGroups.find((group) => group.id === shownGroupId) ?? null;
  // In a group, each type (class, exam, homework...) gets its own shade of the group's color.
  const guessedType = detectItemType(title, 'event', repeat !== null, !!shownGroup && isCourseGroup(shownGroup));
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
            title: 'Event', headerRight: () => null,
            headerLeft: nativeOnly(() => (
              <Pressable onPress={closeModal} hitSlop={8}>
                <ThemedText style={{ color: theme.accent }}>Close</ThemedText>
              </Pressable>
            )),
          }}
        />
        <EmptyState text="This event was deleted." />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: isNew ? 'New event' : 'Edit event',
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
        {draft && <KindSwitch value="event" onChange={(kind) => kind !== 'event' && reviewAs(kind, draft, title)} />}
        <ThemedView type="backgroundElement" style={styles.group}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            returnKeyType="done"
            placeholderTextColor={theme.textSecondary}
            autoFocus={isNew && !draft}
            style={[styles.input, { color: theme.text }]}
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

        <ThemedView type="backgroundElement" style={styles.group}>
          <ThemedView type="backgroundElement" style={styles.row}>
            <ThemedText>All-day</ThemedText>
            <Switch value={allDay} onValueChange={setAllDay} />
          </ThemedView>
          <DateTimeField
            label="Starts"
            value={startsAt}
            onChange={changeStart}
            mode={allDay ? 'date' : 'datetime'}
          />
          <DateTimeField
            label="Ends"
            value={endsAt}
            onChange={setEndsAt}
            mode={allDay ? 'date' : 'datetime'}
            hint={allDay ? null : formatDuration(startsAt, endsAt)}
          />
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.group}>
          <ReminderPicker
            item={{
              kind: 'event',
              itemType: itemType ?? guessedType,
              allDay,
              startDay: toDateKey(startsAt),
              time: allDay ? null : toDateTimeKey(startsAt).slice(11, 16),
            }}
            value={reminders}
            onChange={setReminders}
            defaultsOn={defaultRemindersOn}
          />
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.group}>
          <RepeatPicker
            rule={repeat}
            until={repeatUntil}
            startDay={toDateKey(startsAt)}
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
            <ScoreField table="events" id={id} groupId={shownGroup.id} />
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
              <ThemedText style={[styles.center, { color: theme.danger }]}>Delete Event</ThemedText>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { fontSize: 17 },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  center: { textAlign: 'center' },
  headerButton: { fontSize: 17 },
});
