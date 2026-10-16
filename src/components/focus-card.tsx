import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { focusedOn, typicalMinutes } from '@/db/focus';
import { formatMinutes } from '@/lib/dates';

type Props = { taskId: string; groupId: string | null; groupName: string | null; itemType: string | null };

/** On a task: start the focus timer, with how long you've spent and how long these usually take you. */
export function FocusCard({ taskId, groupId, groupName, itemType }: Props) {
  const db = useSQLiteContext();
  const [spent, setSpent] = useState(0);
  const [typical, setTypical] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      focusedOn(db, taskId).then(setSpent);
      if (groupId) typicalMinutes(db, groupId, itemType).then(setTypical);
    }, [db, taskId, groupId, itemType])
  );

  const lines = [
    spent > 0 ? `${formatMinutes(spent)} focused so far` : null,
    typical && groupName ? `${groupName} ${itemType === 'exam' ? 'test prep' : 'work like this'} usually takes you ~${formatMinutes(typical)}` : null,
  ].filter(Boolean);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.text}>
        <ThemedText type="label">Focus timer</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {lines.length ? lines.join(' · ') : 'Work in a timed stretch; Daybook learns how long things really take.'}
        </ThemedText>
      </View>
      <Button
        title="Start"
        variant="secondary"
        onPress={() => router.push({ pathname: '/focus/[id]', params: { id: taskId } })}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.twoHalf },
  text: { gap: 2 },
});
