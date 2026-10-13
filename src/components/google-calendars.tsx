import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import type { Calendar } from '@/db/calendars';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import {
  disconnectGoogle,
  googleCalendars,
  googleStatus,
  linkGoogleCalendar,
  signInWithGoogle,
  syncGoogle,
  unlinkGoogleCalendar,
  type GoogleCalendar,
} from '@/lib/google';
import { getSyncStatus, subscribeSyncStatus, syncNow } from '@/lib/sync';

type State =
  | { kind: 'loading' }
  | { kind: 'disconnected'; error?: string }
  | { kind: 'connected'; email: string | null; calendars: GoogleCalendar[]; error?: string };

/**
 * Settings → Google Calendar: connect your Google account, then pick which Google calendars show in
 * Daybook. The server mirrors them both ways, so this works the same on the computer and the phone.
 */
export function GoogleCalendars({ calendars }: { calendars: Calendar[] }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const account = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  const signedIn = account.state !== 'unconfigured' && account.state !== 'signedOut';
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const status = await googleStatus();
    if (!status.ok) return setState({ kind: 'disconnected', error: status.error });
    if (!status.connected) return setState({ kind: 'disconnected' });
    const list = await googleCalendars();
    // Includes "Google didn't give calendar access…": shown above the Connect button.
    if (!list.ok) return setState({ kind: 'disconnected', error: list.error });
    setState({ kind: 'connected', email: status.email, calendars: list.calendars });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (signedIn) load();
    }, [signedIn, load])
  );

  if (account.state === 'unconfigured') return null;
  if (!signedIn) {
    return (
      <Pressable onPress={() => router.push('/account')} style={styles.link}>
        <ThemedText type="small" style={{ color: theme.accent }}>
          Sign in (Continue with Google) to show your Google calendars here
        </ThemedText>
      </Pressable>
    );
  }

  // After any change on the server, pull it into this device right away.
  const afterChange = async () => {
    await syncNow(db);
    await load();
  };

  const connect = async () => {
    setBusy('connect');
    const result = await signInWithGoogle();
    setBusy(null);
    if (!result.ok && 'error' in result) setState({ kind: 'disconnected', error: result.error });
    else await load();
  };

  const toggle = async (calendar: GoogleCalendar, on: boolean) => {
    setBusy(calendar.id);
    const result = on ? await linkGoogleCalendar(calendar.id) : await unlinkGoogleCalendar(calendar.linkedCalendarId!);
    setBusy(null);
    if (!result.ok && state.kind === 'connected') setState({ ...state, error: result.error });
    await afterChange();
  };

  const syncAll = async () => {
    setBusy('sync');
    await syncNow(db); // Send this device's edits first, so Google gets them.
    const result = await syncGoogle();
    setBusy(null);
    if (!result.ok && state.kind === 'connected') setState({ ...state, error: result.error });
    await afterChange();
  };

  const disconnect = () =>
    confirmDestructive(
      'Disconnect Google Calendar?',
      'Your Google calendars are removed from Daybook. Nothing changes in Google.',
      'Disconnect',
      async () => {
        setBusy('disconnect');
        await disconnectGoogle();
        setBusy(null);
        await afterChange();
      }
    );

  if (state.kind === 'loading') return <ActivityIndicator style={styles.loading} />;

  if (state.kind === 'disconnected') {
    return (
      <View style={styles.container}>
        <ThemedText type="small" themeColor="textSecondary">
          Show your Google calendars in Daybook on every device, and edit them from here.
          {'email' in account ? ` Use the Google account for ${account.email}.` : ''}
        </ThemedText>
        {state.error && (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {state.error}
          </ThemedText>
        )}
        <Button title="Connect Google Calendar" variant="secondary" onPress={connect} busy={busy === 'connect'} />
      </View>
    );
  }

  const daybookNames = new Map(calendars.map((calendar) => [calendar.name.toLowerCase(), calendar.id]));
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        Connected as {state.email ?? 'your Google account'}. Turn on the calendars to show in Daybook; edits go both ways.
      </ThemedText>
      {state.error && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {state.error}
        </ThemedText>
      )}
      {state.calendars.map((calendar) => {
        const linked = calendar.linkedCalendarId !== null;
        // A Daybook calendar with the same name (likely the same calendar linked from the phone).
        const twin = daybookNames.get(calendar.name.toLowerCase());
        const duplicate = twin !== undefined && twin !== calendar.linkedCalendarId;
        return (
          <View key={calendar.id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: calendar.color ?? theme.textSecondary }]} />
            <View style={styles.flex}>
              <ThemedText numberOfLines={1}>{calendar.name}</ThemedText>
              {(calendar.readOnly || duplicate) && (
                <ThemedText type="caption" themeColor="textSecondary">
                  {[
                    calendar.readOnly && 'View only',
                    duplicate && 'Also in Daybook already (maybe as a phone calendar): turn one off to avoid doubles',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </ThemedText>
              )}
            </View>
            {busy === calendar.id ? (
              <ActivityIndicator />
            ) : (
              <Switch value={linked} onValueChange={(on) => toggle(calendar, on)} disabled={busy !== null} />
            )}
          </View>
        );
      })}
      <View style={styles.actions}>
        <Button title="Sync now" variant="secondary" onPress={syncAll} busy={busy === 'sync'} style={styles.flex} />
        <Button title="Disconnect" variant="ghost" onPress={disconnect} busy={busy === 'disconnect'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  loading: { alignSelf: 'flex-start' },
  link: { paddingVertical: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
});
