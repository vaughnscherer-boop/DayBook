import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { getSettings, type Settings } from '@/db/settings';
import { useTheme } from '@/hooks/use-theme';
import { formatShortTime } from '@/lib/dates';

/** "Morning brief at 7:30 AM · Change": the reminder behind this tab, one tap from its settings. */
export function ReminderLink({ kind }: { kind: 'morning' | 'night' }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  useFocusEffect(
    useCallback(() => {
      getSettings(db).then(setSettings);
    }, [db])
  );
  if (!settings) return null;

  const name = kind === 'morning' ? 'Morning brief' : 'Nightly check-in';
  const on = kind === 'morning' ? settings.morningEnabled : settings.nightEnabled;
  const time = formatShortTime(kind === 'morning' ? settings.morningTime : settings.nightTime).replace(/(\d)(AM|PM)/, '$1 $2');

  return (
    <Pressable
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      accessibilityLabel={`${name} reminder settings`}
      style={[styles.row, { borderColor: theme.backgroundSelected }]}>
      <Icon name="bell" size={14} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        {on ? `${name} reminder at ${time}` : `${name} reminder is off`}
      </ThemedText>
      <ThemedText type="smallBold" style={{ color: theme.text }}>
        Change
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  flex: { flex: 1 },
});
