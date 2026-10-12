import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { formatDateKey, formatTime } from '@/lib/dates';

type Props = {
  item: CalendarItem;
  day: string;
  onOpen: () => void;
  onToggle: () => void;
};

/** One event (color bar) or task (checkbox) with its time — used by the day popover and mini-month list. */
export function DayItemRow({ item, day, onOpen, onToggle }: Props) {
  return (
    <Pressable onPress={onOpen} style={styles.row}>
      {item.kind === 'task' ? (
        <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: item.done }}>
          <ThemedText style={[styles.check, { color: item.color }]}>{item.done ? '☑' : '☐'}</ThemedText>
        </Pressable>
      ) : (
        <View style={[styles.bar, { backgroundColor: item.color }]} />
      )}
      <View style={styles.text}>
        <ThemedText
          type="small"
          numberOfLines={1}
          style={item.done ? styles.done : undefined}
          themeColor={item.done ? 'textSecondary' : 'text'}>
          {item.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {describe(item, day)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function describe(item: CalendarItem, day: string) {
  const repeat = item.repeating ? ' · ↻' : '';
  if (item.kind === 'task') return (item.time ? `Task · ${formatTime(`${day}T${item.time}`)}` : 'Task') + repeat;
  if (item.allDay) {
    return (
      (item.endDay > item.startDay
        ? `All day · ${formatDateKey(item.startDay)} – ${formatDateKey(item.endDay)}`
        : 'All day') + repeat
    );
  }
  return `${formatTime(item.startsAt!)} – ${formatTime(item.endsAt!)}${repeat}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  check: { fontSize: 18, lineHeight: 22 },
  text: { flex: 1 },
  done: { textDecorationLine: 'line-through' },
});
