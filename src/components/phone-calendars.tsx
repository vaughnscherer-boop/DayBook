import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Calendar } from '@/db/calendars';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import {
  calendarLinks,
  copyToPhone,
  deviceCalendarsAvailable,
  hasCalendarAccess,
  linkPhoneCalendar,
  listPhoneCalendars,
  mirrorDeviceCalendars,
  unlink,
  type PhoneCalendar,
} from '@/lib/device-calendars';

type Props = {
  /** Daybook's calendars, for "Show in Apple Calendar". */
  calendars: Calendar[];
  onChanged: () => void;
};

/**
 * Side panel section (iPhone build only): which of the phone's calendars (iCloud, Google…) show in
 * Daybook, and which Daybook calendars are copied to the phone. Linked pairs stay in sync both ways.
 */
export function PhoneCalendars({ calendars, onChanged }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [access, setAccess] = useState<boolean | null>(null);
  const [phone, setPhone] = useState<PhoneCalendar[]>([]);
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [fromPhone, setFromPhone] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const granted = await hasCalendarAccess(false);
    setAccess(granted);
    if (!granted) return;
    const [list, links] = await Promise.all([listPhoneCalendars(db), calendarLinks(db)]);
    setPhone(list.filter((calendar) => !calendar.madeByDaybook));
    setCopied(Object.fromEntries(links.filter((l) => l.origin === 'daybook').map((l) => [l.calendar_id, true])));
    setFromPhone(Object.fromEntries(links.filter((l) => l.origin === 'device').map((l) => [l.calendar_id, true])));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      if (deviceCalendarsAvailable) load();
    }, [load])
  );

  if (!deviceCalendarsAvailable) return null;

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
      await mirrorDeviceCalendars(db);
    } finally {
      setBusy(null);
      await load();
      onChanged();
    }
  };

  const allow = async () => {
    const granted = await hasCalendarAccess(true);
    if (!granted) Linking.openSettings();
    load();
  };

  const togglePhone = (calendar: PhoneCalendar, on: boolean) => {
    if (on) {
      run(calendar.id, () => linkPhoneCalendar(db, calendar));
      return;
    }
    confirmDestructive(
      `Stop showing “${calendar.title}”?`,
      'Its events are removed from Daybook. They stay in your phone’s Calendar app.',
      'Stop showing',
      () => run(calendar.id, () => unlink(db, calendar.linkedCalendarId!))
    );
  };

  const toggleCopy = (calendar: Calendar, on: boolean) => {
    if (on) {
      run(calendar.id, () => copyToPhone(db, calendar));
      return;
    }
    confirmDestructive(
      `Stop copying “${calendar.name}”?`,
      `The “Daybook · ${calendar.name}” calendar is removed from your phone. Nothing in Daybook changes.`,
      'Stop copying',
      () => run(calendar.id, () => unlink(db, calendar.id))
    );
  };

  if (access === false) {
    return (
      <Pressable onPress={allow} style={styles.row}>
        <ThemedText type="small" style={{ color: theme.accent }}>
          Show your Apple & Google calendars…
        </ThemedText>
      </Pressable>
    );
  }
  if (access === null) return null;

  const accounts = [...new Set(phone.map((calendar) => calendar.account))];
  const ownCalendars = calendars.filter((calendar) => !fromPhone[calendar.id]);

  return (
    <View style={styles.container}>
      {accounts.map((account) => (
        <View key={account} style={styles.group}>
          <ThemedText type="small" themeColor="textSecondary">
            {account || 'On this iPhone'}
          </ThemedText>
          {phone
            .filter((calendar) => calendar.account === account)
            .map((calendar) => (
              <View key={calendar.id} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: calendar.color }]} />
                <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                  {calendar.title}
                </ThemedText>
                {busy === calendar.id ? (
                  <ActivityIndicator />
                ) : (
                  <Switch value={calendar.linkedCalendarId !== null} onValueChange={(on) => togglePhone(calendar, on)} />
                )}
              </View>
            ))}
        </View>
      ))}

      <View style={styles.group}>
        <ThemedText type="small" themeColor="textSecondary">
          Show Daybook calendars in Apple Calendar
        </ThemedText>
        {ownCalendars.map((calendar) => (
          <View key={calendar.id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: calendar.color }]} />
            <ThemedText type="small" numberOfLines={1} style={styles.flex}>
              {calendar.name}
            </ThemedText>
            {busy === calendar.id ? (
              <ActivityIndicator />
            ) : (
              <Switch value={!!copied[calendar.id]} onValueChange={(on) => toggleCopy(calendar, on)} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  group: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 32 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1 },
});
