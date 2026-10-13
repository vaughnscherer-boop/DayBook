import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type TextInput } from 'react-native';

import { AddBox, type NewEntry } from '@/components/add-box';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon, type IconName } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { getSettings, setSetting } from '@/db/settings';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import { createFromParsed } from '@/lib/create-entry';
import { rescheduleAll } from '@/lib/notifications';

/** Quick add, opened from the bottom bar's +: type it in plain words, or pick a fuller form. */
export default function NewScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { calendars, classes } = useCalendarData();
  const inputRef = useRef<TextInput>(null);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [today] = useState(() => new Date());

  // Start on the calendar you used last time, like the old add box.
  useEffect(() => {
    getSettings(db).then((settings) => setCalendarId(settings.lastCalendarId));
  }, [db]);
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);
  const chosen = calendars.find((c) => c.id === calendarId)?.id ?? calendars.find((c) => c.is_default)?.id ?? null;

  const add = async ({ kind, parsed, calendarId: target }: NewEntry) => {
    await createFromParsed(db, kind, parsed, target);
    rescheduleAll(db);
    // Show where it landed.
    router.back();
    router.navigate({ pathname: '/calendar', params: { date: parsed.starts_at.slice(0, 10) } });
  };

  const row = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={[styles.row, { borderColor: theme.backgroundSelected }]}>
      <View style={[styles.rowIcon, { backgroundColor: theme.backgroundElement }]}>
        <Icon name={icon} size={17} color={theme.text} />
      </View>
      <ThemedText style={styles.flex}>{label}</ThemedText>
      <Icon name="forward" size={13} weight="semibold" color={theme.textSecondary} />
    </Pressable>
  );
  const replaceWith = (href: Parameters<typeof router.push>[0]) => {
    router.back();
    router.push(href);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AddBox
          calendars={calendars}
          referenceDay={today}
          calendarId={chosen}
          classes={classes}
          onCalendarChange={(id) => {
            setCalendarId(id);
            setSetting(db, 'lastCalendarId', id);
          }}
          onAdd={add}
          inputRef={inputRef}
        />
        <View>
          {row('event', 'New event with all the details', () => replaceWith({ pathname: '/event/[id]', params: { id: 'new' } }))}
          {row('checked', 'New task with all the details', () => replaceWith({ pathname: '/task/[id]', params: { id: 'new' } }))}
          {row('upload', 'Import a syllabus or schedule', () => replaceWith('/import'))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.four },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 4,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
