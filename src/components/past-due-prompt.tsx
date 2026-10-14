import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { clearPastDue, listPastDue, markMissed, type PastDueTask } from '@/db/past-due';
import { getSettings } from '@/db/settings';
import { useTheme } from '@/hooks/use-theme';
import { notifyDataChanged } from '@/lib/data-events';
import { formatDateKey, formatShortTime, todayKey } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';

/**
 * Tasks whose due time has passed, checked when the app opens or comes back to the foreground.
 * It asks whether you did each one: "Did it" clears it (deleted, or ticked if it's graded work),
 * "Didn't" leaves it in Overdue. With "Ask about past-due tasks" off in Settings, they're cleared
 * without asking.
 */
export function PastDuePrompt() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [tasks, setTasks] = useState<PastDueTask[]>([]);
  const checking = useRef(false);

  const changed = useCallback(() => {
    notifyDataChanged();
    rescheduleAll(db);
  }, [db]);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const settings = await getSettings(db);
      // Not during the first-launch intro.
      if (!settings.onboardingDone) return;
      const pastDue = await listPastDue(db);
      if (pastDue.length === 0) return;
      if (settings.askAboutPastDue) setTasks(pastDue);
      else {
        await clearPastDue(db, pastDue);
        changed();
      }
    } finally {
      checking.current = false;
    }
  }, [db, changed]);

  useEffect(() => {
    check();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => appState.remove();
  }, [check]);

  const resolve = async (done: PastDueTask[], didIt: boolean) => {
    if (didIt) await clearPastDue(db, done);
    else await markMissed(db, done);
    setTasks((current) => current.filter((task) => !done.includes(task)));
    changed();
  };

  const when = (task: PastDueTask) => {
    const day = task.date === todayKey() ? 'today' : formatDateKey(task.date);
    return `Due ${day}${task.time ? ` ${formatShortTime(task.time)}` : ''}`;
  };

  return (
    <Modal visible={tasks.length > 0} transparent animationType="fade" onRequestClose={() => setTasks([])}>
      <View style={styles.backdrop}>
        <ThemedView style={[styles.sheet, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="subtitle">Did you do {tasks.length === 1 ? 'this' : 'these'}?</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {tasks.length === 1 ? 'Its due time has passed.' : 'Their due times have passed.'} Done ones are cleared away;
            the rest move to Overdue.
          </ThemedText>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {tasks.map((task) => (
              <ThemedView key={task.id} type="backgroundElement" style={styles.row}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{task.title}</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {[task.group_name, when(task)].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                <Pressable onPress={() => resolve([task], false)} hitSlop={6} accessibilityRole="button" style={styles.choice}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Didn’t
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => resolve([task], true)}
                  hitSlop={6}
                  accessibilityRole="button"
                  style={[styles.choice, { backgroundColor: theme.accent }]}>
                  <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                    Did it
                  </ThemedText>
                </Pressable>
              </ThemedView>
            ))}
          </ScrollView>
          {tasks.length > 1 && <Button title="I did all of them" onPress={() => resolve(tasks, true)} />}
          <View style={styles.footer}>
            <Pressable onPress={() => resolve(tasks, false)} hitSlop={6} accessibilityRole="button">
              <ThemedText type="small" style={{ color: theme.accent }}>
                {tasks.length > 1 ? 'Move all to Overdue' : 'Move to Overdue'}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setTasks([])} hitSlop={6} accessibilityRole="button">
              <ThemedText type="small" themeColor="textSecondary">
                Ask me later
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  list: { flexGrow: 0 },
  listContent: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Spacing.two, padding: Spacing.two + 2 },
  flex: { flex: 1 },
  choice: { paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.one + 2, borderRadius: 10 },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
});
