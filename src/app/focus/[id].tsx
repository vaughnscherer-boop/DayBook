import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { CloseToolbar, closeModal } from '@/components/ui/close-button';
import { Spacing } from '@/constants/theme';
import { focusedOn, logFocus } from '@/db/focus';
import { listGroups } from '@/db/groups';
import { getSettings, setSetting } from '@/db/settings';
import { getTask, setTaskDone, type Task } from '@/db/tasks';
import { useTheme } from '@/hooks/use-theme';
import { notifyDataChanged } from '@/lib/data-events';
import { formatMinutes } from '@/lib/dates';
import { success } from '@/lib/haptics';
import { notificationsSupported, rescheduleAll } from '@/lib/notifications';
import { showToast } from '@/lib/toast';

const LENGTHS = [15, 25, 45, 60];

type Running = { startedAt: string; endsAt: string };

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * The focus timer for one task (`/focus/<task id>`): pick a length, work, and the time is logged on
 * the task so Daybook learns how long things really take. A notification says when time's up, even
 * with the phone locked.
 */
export default function FocusScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [color, setColor] = useState<string>(theme.accent);
  const [length, setLength] = useState(25);
  const [running, setRunning] = useState<Running | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [spent, setSpent] = useState(0);

  useEffect(() => {
    getTask(db, id).then(async (row) => {
      setTask(row);
      if (row?.group_id) {
        const group = (await listGroups(db)).find((g) => g.id === row.group_id);
        if (group) setColor(group.color);
      }
    });
    focusedOn(db, id).then(setSpent);
    // Opened from the "time's up" notification, or reopened while running: pick the timer back up.
    getSettings(db).then((settings) => {
      if (settings.focus?.taskId === id) setRunning({ startedAt: settings.focus.startedAt, endsAt: settings.focus.endsAt });
    });
  }, [db, id]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [running]);

  const left = running ? new Date(running.endsAt).getTime() - now : length * 60_000;
  const finished = !!running && left <= 0;

  useEffect(() => {
    if (finished) success();
  }, [finished]);

  const start = async (minutes: number) => {
    const next = { startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + minutes * 60_000).toISOString() };
    setRunning(next);
    setNow(Date.now());
    await setSetting(db, 'focus', { taskId: id, title: task?.title ?? 'Focus', ...next });
    rescheduleAll(db);
  };

  /** Logs the time worked so far and clears the timer. Returns the minutes logged. */
  const stop = async () => {
    if (!running) return 0;
    const end = Math.min(Date.now(), new Date(running.endsAt).getTime());
    const minutes = Math.round((end - new Date(running.startedAt).getTime()) / 60_000);
    if (task) {
      await logFocus(db, { taskId: id, groupId: task.group_id, itemType: task.item_type, startedAt: running.startedAt, minutes });
    }
    setRunning(null);
    setSpent((s) => s + Math.max(0, minutes));
    await setSetting(db, 'focus', null);
    rescheduleAll(db);
    notifyDataChanged();
    return minutes;
  };

  const markDone = async () => {
    await stop();
    await setTaskDone(db, id, true);
    notifyDataChanged();
    showToast(`Done: ${task?.title ?? 'Task'}`);
    closeModal();
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Focus' }} />
      <CloseToolbar
        onPress={async () => {
          const minutes = await stop();
          if (minutes > 0) showToast(`Logged ${formatMinutes(minutes)} on ${task?.title ?? 'this task'}`);
          closeModal();
        }}
      />
      <View style={styles.center}>
        <View style={styles.titleRow}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <ThemedText type="label" numberOfLines={2} style={styles.title}>
            {task?.title ?? ''}
          </ThemedText>
        </View>
        <ThemedText
          type="display"
          style={[styles.clock, finished && { color: theme.textSecondary }]}
          accessibilityRole="timer"
          accessibilityLabel={finished ? 'Time is up' : `${clock(left)} left`}>
          {finished ? 'Done' : clock(left)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {finished
            ? 'Nice work. Take a 5-minute break, or keep going.'
            : running
              ? notificationsSupported
                ? 'Phone down. You’ll get a notification when time’s up.'
                : 'Keep this open; it’ll say when time’s up.'
              : spent > 0
                ? `${formatMinutes(spent)} focused on this so far`
                : 'How long do you want to focus?'}
        </ThemedText>
      </View>

      <View style={styles.actions}>
        {!running && (
          <View style={styles.lengths}>
            {LENGTHS.map((minutes) => (
              <Chip key={minutes} label={`${minutes} min`} selected={length === minutes} onPress={() => setLength(minutes)} />
            ))}
          </View>
        )}
        {!running && <Button title={`Start ${length} minutes`} onPress={() => start(length)} />}
        {running && !finished && <Button title="Stop and log time" variant="secondary" onPress={stop} />}
        {finished && (
          <>
            <Button title="Mark task done" onPress={markDone} />
            <Button
              title="Keep going (+15 min)"
              variant="secondary"
              onPress={async () => {
                await stop();
                await start(15);
              }}
            />
          </>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.four },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { textAlign: 'center', flexShrink: 1 },
  clock: { fontSize: 88, lineHeight: 96 },
  hint: { textAlign: 'center' },
  actions: { gap: Spacing.twoHalf, paddingBottom: Spacing.four },
  lengths: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
});
