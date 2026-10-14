import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AccountSection } from '@/components/account-section';
import { CalendarList } from '@/components/calendar-list';
import { GoogleCalendars } from '@/components/google-calendars';
import { NotificationSettings } from '@/components/notification-settings';
import { PastDueSetting } from '@/components/past-due-setting';
import { PhoneCalendars } from '@/components/phone-calendars';
import { SchoolFeeds } from '@/components/school-feeds';
import { TermsSection } from '@/components/terms-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CloseButton } from '@/components/ui/close-button';
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
      <Stack.Screen options={{ headerRight: () => <CloseButton /> }} />
      <ScrollView contentContainerStyle={styles.content}>
        {section('CALENDARS', <CalendarList calendars={calendars} groups={groups} onChanged={changed} />)}
        {section('SCHOOL SITES', <SchoolFeeds calendars={calendars} onChanged={changed} />)}
        {section('TASKS', <PastDueSetting />)}
        {section('TERMS', <TermsSection groups={groups} onChanged={changed} />)}
        {section('GOOGLE CALENDAR', <GoogleCalendars calendars={calendars} />)}
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
