import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

import { DayItemRow } from '@/components/day-item-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { formatDateKey } from '@/lib/dates';

type Props = {
  day: string;
  items: CalendarItem[];
  style: ViewStyle;
  /** Height the event list may use before it scrolls. */
  listMaxHeight?: number;
  onOpenItem: (item: CalendarItem) => void;
  onToggleTask: (item: CalendarItem) => void;
  onOpenDay: (day: string) => void;
};

export const POPOVER_WIDTH = 260;

/** Floating card listing one day's events and tasks (long-press a day in Month view). */
export function DayPopover({ day, items, style, listMaxHeight = 260, onOpenItem, onToggleTask, onOpenDay }: Props) {
  const theme = useTheme();
  return (
    <Pressable style={[styles.wrap, style]}>
      <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.backgroundSelected }]}>
        <View style={styles.header}>
          <ThemedText type="smallBold">{formatDateKey(day)}</ThemedText>
          <Pressable onPress={() => onOpenDay(day)} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              Open day ›
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: listMaxHeight }} contentContainerStyle={styles.listContent}>
          {items.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Nothing scheduled
            </ThemedText>
          )}
          {items.map((item) => (
            <DayItemRow
              key={item.key}
              item={item}
              day={day}
              onOpen={() => onOpenItem(item)}
              onToggle={() => onToggleTask(item)}
            />
          ))}
        </ScrollView>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', width: POPOVER_WIDTH, zIndex: 20 },
  card: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listContent: { gap: Spacing.two },
});
