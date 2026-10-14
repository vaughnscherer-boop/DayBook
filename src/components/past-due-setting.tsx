import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { DEFAULT_SETTINGS, getSettings, setSetting } from '@/db/settings';

/** Settings switch: ask whether you did a task once it's past due, or clear past-due tasks automatically. */
export function PastDueSetting() {
  const db = useSQLiteContext();
  const [ask, setAsk] = useState(DEFAULT_SETTINGS.askAboutPastDue);

  useFocusEffect(
    useCallback(() => {
      getSettings(db).then((settings) => setAsk(settings.askAboutPastDue));
    }, [db])
  );

  const change = (on: boolean) => {
    setAsk(on);
    setSetting(db, 'askAboutPastDue', on);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.group}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedText type="smallBold" style={styles.flex}>
          Ask if I did a task once it’s due
        </ThemedText>
        <Switch value={ask} onValueChange={change} accessibilityLabel="Ask if I did a task once it’s due" />
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        {ask
          ? 'When you open Daybook after a task’s due time, it asks whether you did it. Done tasks are cleared away; the rest move to Overdue.'
          : 'Tasks are cleared away automatically once their due time passes, without asking.'}{' '}
        Graded homework is ticked off instead of deleted, so it stays on the class’s grade.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
});
