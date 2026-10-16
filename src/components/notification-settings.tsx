import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { DEFAULT_SETTINGS, getSettings, setSetting, type Settings } from '@/db/settings';
import { useTheme } from '@/hooks/use-theme';
import { dateToTime, timeToDate } from '@/lib/dates';
import {
  ensurePermission,
  hasPermission,
  notificationsSupported,
  rescheduleAll,
  sendTestNotification,
} from '@/lib/notifications';

/** Morning summary and nightly check-in switches, times, and test buttons (a Settings section). */
export function NotificationSettings() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [allowed, setAllowed] = useState(true);

  useFocusEffect(
    useCallback(() => {
      getSettings(db).then(setSettings);
      hasPermission().then(setAllowed);
    }, [db])
  );

  const update = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    await setSetting(db, key, value);
    if (!notificationsSupported) return;
    if (value === true) setAllowed(await ensurePermission());
    rescheduleAll(db);
  };

  const allow = async () => {
    const granted = await ensurePermission();
    setAllowed(granted);
    if (granted) rescheduleAll(db);
    else Linking.openSettings();
  };

  const test = async (kind: 'morning' | 'night') => {
    const sent = await sendTestNotification(db, kind);
    if (!sent) Alert.alert('Notifications are off', 'Turn them on in Settings to get reminders.');
  };

  // The computer can't send notifications, but it can set the times: they sync to the phone.
  const phone = notificationsSupported;

  return (
    <View style={styles.container}>
      {!phone && (
        <ThemedText type="small" themeColor="textSecondary">
          Your phone sends these reminders. Times set here sync to it.
        </ThemedText>
      )}
      {phone && !allowed && (
        <Pressable onPress={allow}>
          <ThemedView type="backgroundElement" style={styles.group}>
            <ThemedText>Notifications are off.</ThemedText>
            <ThemedText style={{ color: theme.accent }}>Allow notifications</ThemedText>
          </ThemedView>
        </Pressable>
      )}

      <Section
        title="Morning brief"
        description="Your day at a glance. Tap it for the full brief: classes, free time, what’s due and tests coming up."
        enabled={settings.morningEnabled}
        onToggle={(on) => update('morningEnabled', on)}
        time={settings.morningTime}
        onTimeChange={(time) => update('morningTime', time)}
        onTest={phone ? () => test('morning') : undefined}
      />

      <ThemedView type="backgroundElement" style={styles.group}>
        <ThemedView type="backgroundElement" style={styles.row}>
          <ThemedText type="label" style={styles.sectionTitle}>
            Remind me about tests and homework
          </ThemedText>
          <Switch
            value={settings.defaultReminders}
            onValueChange={(on) => update('defaultReminders', on)}
            accessibilityLabel="Remind me about tests and homework"
          />
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary">
          Tests: the evening before and an hour before. Homework: 3 hours before it’s due, or 8 PM if it has no time
          and isn’t ticked off. Change any item’s reminders in its “Remind me” row.
        </ThemedText>
      </ThemedView>

      <Section
        title="Nightly check-in"
        description="Asks about new tasks coming up. Tap it, list what you found out about (for tomorrow or later), and Daybook puts it on your calendar."
        enabled={settings.nightEnabled}
        onToggle={(on) => update('nightEnabled', on)}
        time={settings.nightTime}
        onTimeChange={(time) => update('nightTime', time)}
        onTest={phone ? () => test('night') : undefined}
      />
    </View>
  );
}

function Section(props: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  time: string;
  onTimeChange: (time: string) => void;
  /** Phone only: a test notification. */
  onTest?: () => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.group}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedText type="label" style={styles.sectionTitle}>
          {props.title}
        </ThemedText>
        <Switch value={props.enabled} onValueChange={props.onToggle} />
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        {props.description}
      </ThemedText>
      {props.enabled && (
        <DateTimeField
          label="Time"
          mode="time"
          value={timeToDate(props.time)}
          onChange={(date) => props.onTimeChange(dateToTime(date))}
        />
      )}
      {props.onTest && (
        <Pressable onPress={props.onTest} hitSlop={8}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            Send a test (arrives in 5 seconds)
          </ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  group: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { flex: 1 },
});
