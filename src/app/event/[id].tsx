import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { CalendarChips } from '@/components/calendar-chips';
import { useChoiceDialog } from '@/components/choice-dialog';
import { ColorSwatches } from '@/components/color-swatches';
import { DateTimeField } from '@/components/date-time-field';
import { ScoreField } from '@/components/course/score-field';
import { GroupChips } from '@/components/group-chips';
import { RepeatPicker } from '@/components/repeat-picker';
import { SyllabusDetails } from '@/components/syllabus-details';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TypeChips } from '@/components/type-chips';
import { Spacing } from '@/constants/theme';
import { listCalendars, type Calendar } from '@/db/calendars';
import { addEventException, createEvent, deleteEvent, getEvent, updateEvent } from '@/db/events';
import { learnFromPlacement, listGroups, type Group, type GroupChoice } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive, notify } from '@/lib/confirm';
import { daysBetween, fromKey, shiftKey, toDateKey, toDateTimeKey } from '@/lib/dates';
import { detectItemType, isCourseGroup, typeColor, type ItemType } from '@/lib/item-type';
import { rescheduleAll } from '@/lib/notifications';
import { parseRule, type RepeatRule } from '@/lib/recurrence';

const HOUR = 60 * 60 * 1000;

function defaultStart(start?: string) {
  if (start) return fromKey(start);
  const next = new Date();
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next;
}

/**
 * Create (`/event/new`) or edit (`/event/<id>?date=<occurrence>`) an event. For a repeating event
 * the form shows the tapped occurrence, and saving asks whether to change only it or all of them.
 */
export default function EventScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { id, start, date } = useLocalSearchParams<{ id: string; start?: string; date?: string }>();
  const isNew = id === 'new';
  const [choiceDialog, ask] = useChoiceDialog();

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startsAt, setStartsAt] = useState(() => defaultStart(start));
  const [endsAt, setEndsAt] = useState(() => new Date(defaultStart(start).getTime() + HOUR));
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  // The group the automatic rules gave this event, and whether you picked one by hand this time.
  const [autoGroupId, setAutoGroupId] = useState<string | null>(null);
  const [groupChoice, setGroupChoice] = useState<GroupChoice>('auto');
  const [groupTouched, setGroupTouched] = useState(false);
  // Class, exam, assignment...; null = guessed from the title.
  const [itemType, setItemType] = useState<ItemType | null>(null);
  // What an imported syllabus says about it (read-only).
  const [details, setDetails] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  const [repeatUntil, setRepeatUntil] = useState<string | null>(null);
  // For repeating events: when the series starts, and which occurrence is being edited.
  const [series, setSeries] = useState<{ start: string; occurrence: string } | null>(null);

  useEffect(() => {
    listCalendars(db).then((list) => {
      setCalendars(list);
      // New events start in the default calendar; loading an event overrides this below.
      setCalendarId((current) => current ?? list.find((c) => c.is_default)?.id ?? list[0]?.id ?? null);
    });
    listGroups(db).then(setGroups);
    if (isNew) return;
    getEvent(db, id).then((event) => {
      if (!event) return;
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
    };
    const finish = async () => {
      // Putting an event in a group by hand teaches that group its first word.
      if (groupTouched && groupChoice !== 'auto' && groupChoice.groupId) {
        await learnFromPlacement(db, groupChoice.groupId, title);
      }
      rescheduleAll(db);
      router.back();
    };

    if (isNew) {
      await createEvent(db, input);
      return finish();
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

  const confirmDelete = () => {
    const removeAll = async () => {
      await deleteEvent(db, id);
      rescheduleAll(db);
      router.back();
    };
    if (!series) {
      confirmDestructive('Delete event?', title, 'Delete', removeAll);
      return;
    }
    ask('Delete this repeating event?', title, [
      {
        label: 'Delete only this event',
        style: 'destructive',
        onPress: async () => {
          await addEventException(db, id, series.occurrence);
          rescheduleAll(db);
          router.back();
        },
      },
      { label: 'Delete all events', style: 'destructive', onPress: removeAll },
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

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: isNew ? 'New Event' : 'Edit Event',
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
        <ThemedView type="backgroundElement" style={styles.group}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={theme.textSecondary}
            autoFocus={isNew}
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
  group: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { fontSize: 17 },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  center: { textAlign: 'center' },
  headerButton: { fontSize: 17 },
});
