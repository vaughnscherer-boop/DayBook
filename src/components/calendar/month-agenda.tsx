import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { typeLabel } from '@/components/item-card';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { TaskCheck } from '@/components/ui/task-check';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { itemsOnDay, type CalendarItem } from '@/lib/calendar-items';
import { formatShortTime, fromKey, monthGrid, todayKey } from '@/lib/dates';
import { tap } from '@/lib/haptics';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Seven columns only fit so much: the grid's labels and numbers stop growing past this text size. */
const GRID_MAX_SCALE = 1.3;
const TYPE_ICON: Record<CalendarItem['itemType'], IconName> = {
  class: 'class',
  exam: 'exam',
  assignment: 'assignment',
  reading: 'reading',
  other: 'event',
};

type GridProps = {
  /** Any day in the month to show. */
  month: string;
  selected: string;
  items: CalendarItem[];
  onSelect: (day: string) => void;
};

/** Compact month: day numbers with up to three colored dots, the selected day in a dark circle. */
export function MonthGrid({ month, selected, items, onSelect }: GridProps) {
  const theme = useTheme();
  const weeks = useMemo(() => monthGrid(fromKey(month)), [month]);
  const monthKey = month.slice(0, 7);
  const today = todayKey();

  return (
    <View style={styles.grid}>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((name) => (
          <ThemedText
            key={name}
            type="small"
            themeColor="textSecondary"
            numberOfLines={1}
            maxFontSizeMultiplier={GRID_MAX_SCALE}
            style={styles.weekday}>
            {name}
          </ThemedText>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={styles.weekRow}>
          {week.map((day) => {
            const inMonth = day.startsWith(monthKey);
            const isSelected = day === selected;
            const colors = [...new Set(itemsOnDay(items, day).map((item) => item.color))].slice(0, 3);
            return (
              <Pressable
                key={day}
                onPress={() => {
                  if (!isSelected) tap();
                  onSelect(day);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={fromKey(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                style={styles.cell}>
                <View style={[styles.number, isSelected && { backgroundColor: theme.accent }]}>
                  <ThemedText
                    maxFontSizeMultiplier={GRID_MAX_SCALE}
                    style={[
                      styles.numberText,
                      { color: isSelected ? theme.onAccent : inMonth ? theme.text : theme.textSecondary },
                      !inMonth && styles.outside,
                      day === today && !isSelected && styles.today,
                    ]}>
                    {Number(day.slice(8))}
                  </ThemedText>
                </View>
                <View style={styles.dots}>
                  {colors.map((color) => (
                    <View key={color} style={[styles.dot, { backgroundColor: color }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

type ListProps = {
  day: string;
  items: CalendarItem[];
  onOpenItem: (item: CalendarItem) => void;
  onToggleTask: (item: CalendarItem) => void;
};

/** "Today's Tasks" under the month: a type label, an icon, the title and the time for each item. */
export function DayList({ day, items, onOpenItem, onToggleTask }: ListProps) {
  const theme = useTheme();
  const list = useMemo(
    () =>
      [...itemsOnDay(items, day)].sort((a, b) =>
        (a.allDay ? '' : a.time ?? '').localeCompare(b.allDay ? '' : b.time ?? '')
      ),
    [items, day]
  );
  const heading =
    day === todayKey() ? 'Today’s plan' : `${fromKey(day).toLocaleDateString(undefined, { weekday: 'long' })}’s plan`;

  const timeOf = (item: CalendarItem) => {
    if (item.allDay) return item.kind === 'task' ? 'Any time' : 'All day';
    if (item.kind === 'task') return `Due ${formatShortTime(item.time!)}`;
    return `${formatShortTime(item.startsAt!)} – ${formatShortTime(item.endsAt!)}`;
  };

  return (
    <View style={styles.list}>
      <View style={styles.listHead}>
        <ThemedText type="heading" style={styles.flex}>
          {heading}
        </ThemedText>
        <PressableScale
          onPress={() => router.push({ pathname: '/event/[id]', params: { id: 'new', start: `${day}T09:00` } })}
          accessibilityLabel="Add on this day"
          style={[styles.addButton, { backgroundColor: theme.accent }]}>
          <Icon name="add" size={18} weight="semibold" color={theme.onAccent} />
        </PressableScale>
      </View>
      {list.length === 0 && <EmptyState text="Nothing planned for this day." />}
      {list.map((item, i) => (
        <Pressable
          key={item.key}
          onPress={() => onOpenItem(item)}
          style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.backgroundSelected }]}>
          <View style={styles.rowIcon}>
            {item.kind === 'task' ? (
              <TaskCheck done={item.done} color={item.color} size={20} onToggle={() => onToggleTask(item)} />
            ) : (
              <Icon name={TYPE_ICON[item.itemType]} size={19} color={item.color} />
            )}
          </View>
          <View style={styles.rowText}>
            <ThemedText type="caption" themeColor="textSecondary">
              {item.kind === 'task' && item.itemType === 'other' ? 'To do' : typeLabel(item)}
            </ThemedText>
            <ThemedText
              type="smallBold"
              numberOfLines={2}
              themeColor={item.done ? 'textSecondary' : 'text'}
              style={[styles.title, item.done && styles.done]}>
              {item.title}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {timeOf(item)}
            </ThemedText>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** Scrollable wrapper for the day list (used under the grid on phones, beside it on wide screens). */
export function DayListScroll({ bottomSpace, ...props }: ListProps & { bottomSpace: number }) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomSpace }}>
      <DayList {...props} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { paddingHorizontal: Spacing.two, gap: 2 },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', paddingBottom: Spacing.two },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3, gap: 3 },
  number: { minWidth: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 16, lineHeight: 20, fontWeight: 600, fontVariant: ['tabular-nums'] },
  outside: { opacity: 0.35 },
  today: { fontWeight: 800, textDecorationLine: 'underline' },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  list: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.one },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  flex: { flex: 1 },
  addButton: { width: 36, height: 36, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.three },
  rowIcon: { width: 24, alignItems: 'center', paddingTop: 18 },
  rowText: { flex: 1, gap: 2 },
  title: { fontSize: 16, lineHeight: 21 },
  done: { textDecorationLine: 'line-through' },
});
