import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';

import { LoadMeter } from '@/components/home/load-meter';
import { ItemRow, RowGroup } from '@/components/item-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { moveTask, type Task } from '@/db/tasks';
import type { CalendarItem } from '@/lib/calendar-items';
import { notifyDataChanged } from '@/lib/data-events';
import { formatDateKey, fromKey, shiftKey } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';
import { filterItems } from '@/lib/overview';
import { toggleTask } from '@/lib/task-toggle';
import { showToast } from '@/lib/toast';

type Props = {
  /** The day being planned (Monday, on a Sunday night). */
  day: string;
  today: string;
  /** Items from a couple of weeks back to a week after `day`. */
  items: CalendarItem[];
  tasks: Task[];
};

/**
 * Sunday night's week review: what you finished, what slipped (one tap moves it to tomorrow), and the
 * tests and load coming up next week.
 */
export function WeekReview({ day, today, items, tasks }: Props) {
  const db = useSQLiteContext();
  const weekAgo = fromKey(shiftKey(today, -6)).toISOString();
  const finished = tasks.filter((t) => t.done === 1 && t.completed_at && t.completed_at >= weekAgo).length;
  const slipped = filterItems(items, 'overdue', today, 1).filter((item) => !item.repeating);
  const tests = items.filter((item) => item.itemType === 'exam' && item.startDay >= day && item.startDay <= shiftKey(day, 6));
  const weekday = fromKey(day).toLocaleDateString(undefined, { weekday: 'short' });

  const moveAll = async () => {
    for (const item of slipped) await moveTask(db, item.id, day);
    notifyDataChanged();
    rescheduleAll(db);
    showToast(`Moved ${slipped.length} to ${weekday}`, async () => {
      for (const item of slipped) await moveTask(db, item.id, item.startDay);
      notifyDataChanged();
      rescheduleAll(db);
    });
  };

  return (
    <View style={styles.container}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="label">Week review</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {finished > 0 ? `You finished ${finished} task${finished === 1 ? '' : 's'} this week. ` : ''}
          {slipped.length ? `${slipped.length} slipped.` : 'Nothing slipped — nice.'}{' '}
          {tests.length ? `${tests.length} test${tests.length === 1 ? '' : 's'} next week.` : 'No tests next week.'}
        </ThemedText>
      </ThemedView>

      {slipped.length > 0 && (
        <View style={styles.section}>
          <View style={styles.head}>
            <ThemedText type="sectionLabel" style={styles.flex}>
              Slipped
            </ThemedText>
            <Pressable onPress={moveAll} accessibilityRole="button" hitSlop={10} style={styles.action}>
              <ThemedText type="smallBold">Move all to {weekday}</ThemedText>
            </Pressable>
          </View>
          <RowGroup>
            {slipped.map((item) => (
              <ItemRow
                key={item.key}
                item={item}
                subtitle={`was due ${formatDateKey(item.startDay)}`}
                onOpen={() => router.push({ pathname: '/task/[id]', params: { id: item.id } })}
                onToggle={() => toggleTask(db, item, notifyDataChanged)}
                trailing={
                  <Pressable
                    onPress={async () => {
                      await moveTask(db, item.id, day);
                      notifyDataChanged();
                      rescheduleAll(db);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.title} to ${weekday}`}
                    hitSlop={10}>
                    <ThemedText type="smallBold">{weekday}</ThemedText>
                  </Pressable>
                }
              />
            ))}
          </RowGroup>
        </View>
      )}

      {tests.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="sectionLabel">Tests next week</ThemedText>
          <RowGroup>
            {tests.map((item) => (
              <ItemRow
                key={item.key}
                item={item}
                subtitle={formatDateKey(item.startDay)}
                onOpen={() =>
                  router.push({ pathname: item.kind === 'task' ? '/task/[id]' : '/event/[id]', params: { id: item.id } })
                }
                onToggle={() => toggleTask(db, item, notifyDataChanged)}
              />
            ))}
          </RowGroup>
        </View>
      )}

      <LoadMeter items={items} today={day} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.one },
  section: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  action: { minHeight: 32, justifyContent: 'center' },
});
