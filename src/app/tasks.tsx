import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { groupNames, ItemCard, typeLabel } from '@/components/item-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Spacing } from '@/constants/theme';
import { setOccurrenceDone, setTaskDone } from '@/db/tasks';
import { useCalendarData } from '@/hooks/use-calendar-data';
import type { CalendarItem } from '@/lib/calendar-items';
import { formatShortTime, fromKey, todayKey } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';
import { FILTERS, filterItems, loadRange, rangeDays, RANGES, type OverviewRange, type TaskFilter } from '@/lib/overview';

const EMPTY: Record<TaskFilter, string> = {
  open: 'No open tasks. Nice work.',
  due: 'Nothing due in this stretch.',
  tests: 'No tests coming up.',
  overdue: 'Nothing overdue.',
};

/** Open tasks, what's due soon, upcoming tests and overdue tasks, opened from Home's tiles. */
export default function TasksScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ filter?: TaskFilter; range?: OverviewRange }>();
  const [filter, setFilter] = useState<TaskFilter>(params.filter ?? 'open');
  const range: OverviewRange = RANGES.some((r) => r.value === params.range) ? params.range! : 'week';
  const days = rangeDays(range);
  const { itemsBetween, groups, reload } = useCalendarData();
  const today = todayKey();
  const [start, end] = loadRange(today, days);

  const list = useMemo(
    () => filterItems(itemsBetween(start, end), filter, today, days),
    [itemsBetween, start, end, filter, today, days]
  );
  const groupName = useMemo(() => groupNames(groups), [groups]);

  const toggle = async (item: CalendarItem) => {
    if (item.repeating) await setOccurrenceDone(db, item.id, item.occurrenceDate, !item.done);
    else await setTaskDone(db, item.id, !item.done);
    await reload();
    rescheduleAll(db);
  };
  const open = (item: CalendarItem) =>
    router.push({
      pathname: item.kind === 'task' ? '/task/[id]' : '/event/[id]',
      params: { id: item.id, date: item.occurrenceDate },
    });

  const when = (item: CalendarItem) => {
    const date = fromKey(item.startDay).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const time = item.time ? ` ${formatShortTime(item.time)}` : '';
    const verb = item.kind === 'task' || item.itemType === 'assignment' ? 'due ' : '';
    return `${verb}${item.startDay === today ? 'today' : date}${time}`;
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filters}>
        {FILTERS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={filter === option.value}
            onPress={() => setFilter(option.value)}
          />
        ))}
      </ScrollView>
      {(filter === 'due' || filter === 'tests' || filter === 'open') && (
        <ThemedText type="caption" themeColor="textSecondary" style={styles.rangeNote}>
          {RANGES.find((r) => r.value === range)!.label}
        </ThemedText>
      )}
      <ScrollView contentContainerStyle={styles.list}>
        {list.length === 0 ? (
          <EmptyState text={EMPTY[filter]} />
        ) : (
          list.map((item) => (
            <View key={item.key}>
              <ItemCard
                item={item}
                subtitle={[item.groupId ? groupName[item.groupId] : null, typeLabel(item), when(item)]
                  .filter(Boolean)
                  .join('  ·  ')}
                onOpen={() => open(item)}
                onToggle={() => toggle(item)}
              />
            </View>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterBar: { flexGrow: 0 },
  filters: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  rangeNote: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  list: { padding: Spacing.three, gap: Spacing.two + 4, paddingBottom: Spacing.six },
});
