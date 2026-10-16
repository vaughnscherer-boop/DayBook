import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SignInForm } from '@/components/sign-in-form';
import { ThemedText } from '@/components/themed-text';
import { CloseToolbar } from '@/components/ui/close-button';
import { Button } from '@/components/ui/button';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { getSyncStatus, subscribeSyncStatus, syncNow } from '@/lib/sync';

const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Sign in (or create an account) so this device syncs with your others. */
export default function AccountScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  const signOut = () =>
    confirmDestructive(
      'Sign out?',
      'This device keeps its copy of your calendar but stops syncing.',
      'Sign out',
      () => supabase?.auth.signOut()
    );

  const signedIn = status.state === 'syncing' || status.state === 'synced' || status.state === 'error';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Account',
        }}
      />
      {/* Same Close on the right as Settings, which opens this. */}
      <CloseToolbar onPress={close} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {status.state === 'unconfigured' && (
          <ThemedText themeColor="textSecondary">
            Sync isn’t set up yet: add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local and
            restart the dev server.
          </ThemedText>
        )}

        {signedIn && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{status.email}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Your calendar syncs with every device signed in to this account.
            </ThemedText>
            {status.state === 'error' && (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {status.message}
              </ThemedText>
            )}
            <View style={styles.row}>
              <Button
                title={status.state === 'syncing' ? 'Syncing…' : 'Sync now'}
                onPress={() => syncNow(db)}
                disabled={status.state === 'syncing'}
              />
              <Pressable onPress={signOut} hitSlop={6}>
                <ThemedText style={{ color: theme.danger }}>Sign out</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        )}

        {status.state === 'signedOut' && <SignInForm onSignedIn={close} />}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
