import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AccountSection } from '@/components/account-section';
import { CalendarList } from '@/components/calendar-list';
import { GoogleCalendars } from '@/components/google-calendars';
import { NotificationSettings } from '@/components/notification-settings';
import { DayHoursSetting } from '@/components/day-hours-setting';
import { PastDueSetting } from '@/components/past-due-setting';
import { PhoneCalendars } from '@/components/phone-calendars';
import { SchoolFeeds } from '@/components/school-feeds';
import { TermsSection } from '@/components/terms-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CloseToolbar } from '@/components/ui/close-button';
import { Radius, Spacing } from '@/constants/theme';
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

  /** A labelled section; `card` puts lists that don't draw their own surface on one, like the rest. */
  const section = (title: string, children: ReactNode, card = false) => (
    <View style={styles.section}>
      <ThemedText type="sectionLabel">{title}</ThemedText>
      {card ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          {children}
        </ThemedView>
      ) : (
        children
      )}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <CloseToolbar />
      <ScrollView contentContainerStyle={styles.content}>
        {section('Calendars', <CalendarList calendars={calendars} groups={groups} onChanged={changed} />, true)}
        {section('School sites', <SchoolFeeds calendars={calendars} onChanged={changed} />)}
        {section('Tasks', <PastDueSetting />)}
        {section('My day', <DayHoursSetting />)}
        {section('Terms', <TermsSection groups={groups} onChanged={changed} />)}
        {section('Google Calendar', <GoogleCalendars calendars={calendars} />, true)}
        {deviceCalendarsAvailable &&
          section('Phone calendars', <PhoneCalendars calendars={calendars} onChanged={changed} />, true)}
        <AccountSection style={styles.section} />
        {section(
          'Reminders',
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
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.two },
  link: { paddingVertical: Spacing.one },
});
