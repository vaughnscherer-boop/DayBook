import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { createTask } from '@/db/tasks';
import { useTheme } from '@/hooks/use-theme';
import { breakDownOnServer } from '@/lib/breakdown-api';
import type { BreakdownStep } from '@/lib/breakdown-format';
import { formatDateKey, todayKey } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';
import { notifyLocalChange } from '@/lib/data-events';

type Props = {
  title: string;
  details: string | null;
  notes: string | null;
  /** 'YYYY-MM-DD' */
  due: string;
  calendarId: string | null;
  groupId: string | null;
};

/**
 * "Break it down" for a big assignment: Claude suggests dated steps, you drop any you don't want,
 * and the rest become tasks in the same class.
 */
export function BreakDown({ title, details, notes, due, calendarId, groupId }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [steps, setSteps] = useState<BreakdownStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const today = todayKey();
  if (due < today) return null;

  const ask = async () => {
    setBusy(true);
    setError(null);
    setAdded(0);
    const result = await breakDownOnServer({ title, details, notes, due, today });
    setBusy(false);
    if (result.ok) setSteps(result.steps);
    else setError(result.error);
  };

  const accept = async () => {
    if (!steps?.length || busy) return;
    setBusy(true);
    for (const step of steps) {
      await createTask(db, {
        title: step.title,
        notes: `Step for: ${title}`,
        date: step.date,
        calendar_id: calendarId,
        group: groupId ? { groupId } : undefined,
        item_type: 'other',
      });
    }
    rescheduleAll(db);
    notifyLocalChange();
    setAdded(steps.length);
    setSteps(null);
    setBusy(false);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Break it down</ThemedText>
      {!steps && (
        <ThemedText type="small" themeColor="textSecondary">
          {added > 0
            ? `Added ${added} step${added === 1 ? '' : 's'} to your tasks.`
            : 'Claude splits this into smaller steps with their own dates before it’s due.'}
        </ThemedText>
      )}
      {steps?.map((step) => (
        <View key={`${step.date}-${step.title}`} style={styles.row}>
          <View style={styles.flex}>
            <ThemedText type="small">{step.title}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {formatDateKey(step.date)}
            </ThemedText>
          </View>
          <Pressable
            onPress={() => setSteps(steps.filter((s) => s !== step))}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${step.title}`}
            hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.danger }}>
              Remove
            </ThemedText>
          </Pressable>
        </View>
      ))}
      {error && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      )}
      {steps && steps.length > 0 ? (
        <Button title={`Add ${steps.length} step${steps.length === 1 ? '' : 's'} as tasks`} onPress={accept} busy={busy} />
      ) : (
        <Button
          title={busy ? 'Thinking…' : added > 0 ? 'Break it down again' : 'Break it down'}
          variant="secondary"
          onPress={ask}
          busy={busy}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
});
