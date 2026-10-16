import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getSyncStatus, subscribeSyncStatus } from '@/lib/sync';

function ago(iso: string | null): string {
  if (!iso) return 'not yet';
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Side panel: who you're signed in as and whether sync is up to date; opens the Account screen. */
export function AccountSection({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  // Hidden until Supabase is configured in .env.local.
  if (status.state === 'unconfigured') return null;

  return (
    <View style={style}>
      <ThemedText type="sectionLabel">Account</ThemedText>
      <Pressable onPress={() => router.push('/account')} style={styles.row} accessibilityRole="button">
        {status.state === 'signedOut' ? (
          <ThemedText type="small" style={{ color: theme.accent }}>
            Sign in to sync your calendar across devices
          </ThemedText>
        ) : (
          <>
            <ThemedText type="small" numberOfLines={1}>
              {status.email}
            </ThemedText>
            <ThemedText
              type="small"
              numberOfLines={2}
              style={{ color: status.state === 'error' ? theme.danger : theme.textSecondary }}>
              {status.state === 'syncing'
                ? 'Syncing…'
                : status.state === 'error'
                  ? status.message
                  : `Synced ${ago(status.lastSyncedAt)}`}
            </ThemedText>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: Spacing.one, gap: 2 },
});
