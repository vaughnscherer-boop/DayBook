import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotificationSettings } from '@/components/notification-settings';
import { PhoneCalendars } from '@/components/phone-calendars';
import { SignInForm } from '@/components/sign-in-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { listCalendars, type Calendar } from '@/db/calendars';
import { setSetting } from '@/db/settings';
import { useTheme } from '@/hooks/use-theme';
import { deviceCalendarsAvailable } from '@/lib/device-calendars';
import { notificationsSupported } from '@/lib/notifications';
import { getSyncStatus, subscribeSyncStatus } from '@/lib/sync';

type Step = 'welcome' | 'sync' | 'day' | 'calendars' | 'done';

const FEATURES = [
  { icon: '✏️', title: 'Just type it', text: '“gym tomorrow 6pm”, “bio hw due next class” — Daybook figures out the rest.' },
  { icon: '🎨', title: 'Organizes itself', text: 'Each class or activity gets its own group and color; tests, homework and classes get their own shades.' },
  { icon: '📄', title: 'Reads your syllabus', text: 'Import a PDF and every class, test and assignment lands on your calendar — with what each one is about.' },
  { icon: '☀️', title: 'Morning brief & night check-in', text: 'See your whole day each morning; jot down tomorrow’s list each night.' },
];

/** The first-launch intro: what Daybook does, sign in to sync, reminder times. Every step can be skipped. */
export default function OnboardingScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  // Decided once, so signing in on the sync step doesn't make that step vanish under you.
  const [steps] = useState<Step[]>(() => [
    'welcome',
    ...(status.state === 'signedOut' ? (['sync'] as const) : []),
    ...(notificationsSupported ? (['day'] as const) : []),
    ...(deviceCalendarsAvailable ? (['calendars'] as const) : []),
    'done',
  ]);
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const next = () => setIndex(Math.min(index + 1, steps.length - 1));
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const loadCalendars = () => listCalendars(db).then(setCalendars);
  useEffect(() => {
    listCalendars(db).then(setCalendars);
  }, [db]);

  const finish = async (then: '/' | '/import') => {
    await setSetting(db, 'onboardingDone', true);
    router.replace(then);
  };

  const signedIn = status.state === 'syncing' || status.state === 'synced' || status.state === 'error';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.top}>
          <View style={styles.dots}>
            {steps.map((s, i) => (
              <View
                key={s}
                style={[styles.dot, { backgroundColor: i === index ? theme.accent : theme.backgroundSelected }]}
              />
            ))}
          </View>
          {step !== 'done' && (
            <Pressable onPress={() => finish('/')} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                Skip intro
              </ThemedText>
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 'welcome' && (
            <>
              <ThemedText type="subtitle" style={styles.heading}>
                Your calendar that organizes itself
              </ThemedText>
              {FEATURES.map((feature) => (
                <View key={feature.title} style={styles.feature}>
                  <ThemedText style={styles.icon}>{feature.icon}</ThemedText>
                  <View style={styles.flex}>
                    <ThemedText type="smallBold">{feature.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {feature.text}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </>
          )}

          {step === 'sync' && (
            <>
              <ThemedText type="subtitle" style={styles.heading}>
                One calendar on every device
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                Sign in on your phone and your computer and they stay in sync. You can also do this later from the
                side panel.
              </ThemedText>
              {signedIn ? (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">Signed in as {status.email}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Your calendar will sync automatically.
                  </ThemedText>
                </ThemedView>
              ) : (
                <SignInForm onSignedIn={next} />
              )}
            </>
          )}

          {step === 'day' && (
            <>
              <ThemedText type="subtitle" style={styles.heading}>
                Start and end your day
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                Pick when Daybook should nudge you. Turn on notifications so they can arrive.
              </ThemedText>
              <NotificationSettings />
            </>
          )}

          {step === 'calendars' && (
            <>
              <ThemedText type="subtitle" style={styles.heading}>
                All your calendars in one place
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                Show your Apple and Google calendars in Daybook, and your Daybook calendars in Apple Calendar.
                Changes on either side stay in sync.
              </ThemedText>
              <PhoneCalendars calendars={calendars} onChanged={loadCalendars} />
            </>
          )}

          {step === 'done' && (
            <>
              <ThemedText type="subtitle" style={styles.heading}>
                You’re all set
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                Got a syllabus or schedule? Import it and Daybook fills in your classes, tests and homework.
              </ThemedText>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step === 'done' ? (
            <>
              <Pressable onPress={() => finish('/import')} style={[styles.primary, { backgroundColor: theme.accent }]}>
                <ThemedText style={styles.primaryText}>Import a syllabus</ThemedText>
              </Pressable>
              <Pressable onPress={() => finish('/')} style={styles.secondary}>
                <ThemedText style={{ color: theme.accent }}>Go to my calendar</ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={next} style={[styles.primary, { backgroundColor: theme.accent }]}>
                <ThemedText style={styles.primaryText}>
                  {step === 'sync' && !signedIn ? 'Not now' : step === 'welcome' ? 'Get started' : 'Next'}
                </ThemedText>
              </Pressable>
              {index > 0 && (
                <Pressable onPress={() => setIndex(index - 1)} style={styles.secondary}>
                  <ThemedText themeColor="textSecondary">Back</ThemedText>
                </Pressable>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  dots: { flexDirection: 'row', gap: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 4 },
  content: { padding: Spacing.three, gap: Spacing.three, maxWidth: 560, width: '100%', alignSelf: 'center' },
  heading: { fontSize: 30, lineHeight: 36 },
  feature: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  icon: { fontSize: 26, lineHeight: 32 },
  flex: { flex: 1, gap: 2 },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  footer: { padding: Spacing.three, gap: Spacing.two, maxWidth: 560, width: '100%', alignSelf: 'center' },
  primary: { borderRadius: 999, paddingVertical: Spacing.two + 4, alignItems: 'center' },
  primaryText: { color: '#ffffff', fontSize: 17 },
  secondary: { alignItems: 'center', paddingVertical: Spacing.two },
});
