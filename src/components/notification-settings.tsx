import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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

/** Morning summary and nightly check-in switches, times, and test buttons (side panel section). */
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

  if (!notificationsSupported) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Morning and nightly reminders work in the phone app.
      </ThemedText>
    );
  }

  return (
    <View style={styles.container}>
      {!allowed && (
        <Pressable onPress={allow}>
          <ThemedView type="backgroundElement" style={styles.group}>
            <ThemedText>Notifications are off.</ThemedText>
            <ThemedText style={{ color: theme.accent }}>Allow notifications</ThemedText>
          </ThemedView>
        </Pressable>
      )}

      <Section
        title="Morning summary"
        description="Everything on your calendar for the day."
        enabled={settings.morningEnabled}
        onToggle={(on) => update('morningEnabled', on)}
        time={settings.morningTime}
        onTimeChange={(time) => update('morningTime', time)}
        onTest={() => test('morning')}
      />

      <Section
        title="Nightly check-in"
        description="Asks what to add for tomorrow. Tap it to add things right away."
        enabled={settings.nightEnabled}
        onToggle={(on) => update('nightEnabled', on)}
        time={settings.nightTime}
        onTimeChange={(time) => update('nightTime', time)}
        onTest={() => test('night')}
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
  onTest: () => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.group}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedText type="smallBold" style={styles.sectionTitle}>
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
      <Pressable onPress={props.onTest} hitSlop={8}>
        <ThemedText type="small" style={{ color: theme.accent }}>
          Send a test (arrives in 5 seconds)
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  group: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15 },
});
