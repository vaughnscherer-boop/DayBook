import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { groupNames, typeLabel } from '@/components/item-card';
import { ItemRow, RowGroup } from '@/components/item-row';
import { SwipeTask } from '@/components/swipe-task';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { addEventException, deleteEvent } from '@/db/events';
import { addTaskException, deleteTask, moveTask } from '@/db/tasks';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { confirmDestructive } from '@/lib/confirm';
import { formatShortTime, fromKey, shiftKey, todayKey } from '@/lib/dates';
import { redundantItems } from '@/lib/duplicates';
import { rescheduleAll } from '@/lib/notifications';
import { toggleTask } from '@/lib/task-toggle';
import { FILTERS, filterItems, loadRange, rangeDays, RANGES, type OverviewRange, type TaskFilter } from '@/lib/overview';

const EMPTY: Record<TaskFilter, string> = {
  open: 'No open tasks. Nice work.',
  due: 'Nothing due in this stretch.',
  tests: 'No tests coming up.',
  overdue: 'Nothing overdue.',
};

/**
 * Open tasks, what's due soon, upcoming tests and overdue tasks, opened from Home's tiles. "Select"
 * picks several to delete at once, and "Select duplicates" picks the extra copies of the same item.
 */
export default function TasksScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
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
  const redundant = useMemo(() => redundantItems(list), [list]);

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const pick = (item: CalendarItem) => {
    const next = new Set(selected);
    if (next.has(item.key)) next.delete(item.key);
    else next.add(item.key);
    setSelected(next);
  };
  const chosen = list.filter((item) => selected.has(item.key));

  // A repeating item loses just that day; anything else is deleted.
  const removeSelected = () =>
    confirmDestructive(
      `Delete ${chosen.length} item${chosen.length === 1 ? '' : 's'}?`,
      'Repeating ones lose just that day.',
      'Delete',
      async () => {
        setDeleting(true);
        await db.withTransactionAsync(async () => {
          for (const item of chosen) {
            if (item.kind === 'task') {
              if (item.repeating) await addTaskException(db, item.id, item.occurrenceDate);
              else await deleteTask(db, item.id);
            } else if (item.repeating) await addEventException(db, item.id, item.occurrenceDate);
            else await deleteEvent(db, item.id);
          }
        });
        setDeleting(false);
        stopSelecting();
        await reload();
        rescheduleAll(db);
      }
    );

  const toggle = (item: CalendarItem) => toggleTask(db, item, reload);
  const move = async (item: CalendarItem, date: string) => {
    await moveTask(db, item.id, date);
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
      <Stack.Screen
        options={{
          headerRight: () =>
            list.length > 0 || selecting ? (
              <Pressable
                onPress={() => (selecting ? stopSelecting() : setSelecting(true))}
                hitSlop={8}
                accessibilityRole="button">
                <ThemedText type={selecting ? 'smallBold' : 'small'} style={{ color: theme.accent }}>
                  {selecting ? 'Done' : 'Select'}
                </ThemedText>
              </Pressable>
            ) : null,
        }}
      />
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
            onPress={() => {
              setFilter(option.value);
              setSelected(new Set());
            }}
          />
        ))}
      </ScrollView>
      {(filter === 'due' || filter === 'tests' || filter === 'open') && (
        <ThemedText type="sectionLabel" style={styles.rangeNote}>
          {RANGES.find((r) => r.value === range)!.label}
        </ThemedText>
      )}
      <ScrollView contentContainerStyle={styles.list}>
        {list.length === 0 ? (
          <EmptyState text={EMPTY[filter]} />
        ) : (
          <RowGroup>
            {list.map((item) => (
              <SwipeTask
                key={item.key}
                item={item}
                enabled={!selecting}
                surface="backgroundElement"
                onToggle={() => toggle(item)}
                moves={[
                  ...(item.startDay !== today ? [{ label: 'Today', date: today }] : []),
                  ...(item.startDay !== shiftKey(today, 1) ? [{ label: 'Tomorrow', date: shiftKey(today, 1) }] : []),
                ]}
                onMove={(date) => move(item, date)}>
                <ItemRow
                  item={item}
                  subtitle={[item.groupId ? groupName[item.groupId] : null, typeLabel(item), when(item)]
                    .filter(Boolean)
                    .join(' · ')}
                  onOpen={() => (selecting ? pick(item) : open(item))}
                  onToggle={() => (selecting ? pick(item) : toggle(item))}
                  onChanged={reload}
                  leading={
                    selecting && (
                      <Pressable
                        onPress={() => pick(item)}
                        hitSlop={8}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected.has(item.key) }}
                        accessibilityLabel={`Select ${item.title}`}>
                        <Icon
                          name={selected.has(item.key) ? 'checked' : 'unchecked'}
                          size={24}
                          color={selected.has(item.key) ? theme.danger : theme.textSecondary}
                        />
                      </Pressable>
                    )
                  }
                />
              </SwipeTask>
            ))}
          </RowGroup>
        )}
      </ScrollView>
      {selecting && (
        <ThemedView style={[styles.footer, { borderColor: theme.backgroundSelected }]}>
          <View style={styles.quick}>
            <Pressable
              onPress={() => setSelected(new Set(redundant.map((item) => item.key)))}
              disabled={redundant.length === 0}
              hitSlop={6}
              accessibilityRole="button">
              <ThemedText type="small" style={{ color: redundant.length ? theme.accent : theme.textSecondary }}>
                {redundant.length ? `Select duplicates (${redundant.length})` : 'No duplicates'}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setSelected(chosen.length === list.length ? new Set() : new Set(list.map((item) => item.key)))}
              hitSlop={6}
              accessibilityRole="button">
              <ThemedText type="small" style={{ color: theme.accent }}>
                {chosen.length === list.length && list.length > 0 ? 'Select none' : 'Select all'}
              </ThemedText>
            </Pressable>
          </View>
          <Button
            title={chosen.length ? `Delete ${chosen.length}` : 'Delete'}
            onPress={removeSelected}
            disabled={chosen.length === 0}
            busy={deleting}
            style={chosen.length ? { backgroundColor: theme.danger } : undefined}
          />
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterBar: { flexGrow: 0 },
  filters: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  rangeNote: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  list: { padding: Spacing.three, paddingBottom: Spacing.six },
  footer: { padding: Spacing.three, gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  quick: { flexDirection: 'row', justifyContent: 'space-between' },
});
