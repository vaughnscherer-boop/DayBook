import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AccountSection } from '@/components/account-section';
import { CalendarList } from '@/components/calendar-list';
import { NotificationSettings } from '@/components/notification-settings';
import { PhoneCalendars } from '@/components/phone-calendars';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { deviceCalendarsAvailable } from '@/lib/device-calendars';
import { rescheduleAll } from '@/lib/notifications';

/** Calendars, phone calendars, account and reminders (what used to live in the side panel). */
export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { calendars, groups, reload } = useCalendarData();
  const changed = () => {
    reload();
    rescheduleAll(db);
  };

  const section = (title: string, children: ReactNode) => (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {section('CALENDARS', <CalendarList calendars={calendars} groups={groups} onChanged={changed} />)}
        {deviceCalendarsAvailable &&
          section('PHONE CALENDARS', <PhoneCalendars calendars={calendars} onChanged={changed} />)}
        <AccountSection style={styles.section} />
        {section(
          'REMINDERS',
          <>
            <NotificationSettings />
            <Pressable onPress={() => router.push('/onboarding')} style={styles.link}>
              <ThemedText type="small" themeColor="textSecondary">
                Show intro again
              </ThemedText>
            </Pressable>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  link: { paddingVertical: Spacing.one },
});
