import { Pressable, StyleSheet, View } from 'react-native';

import { DayItemRow } from '@/components/day-item-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { formatDateKey } from '@/lib/dates';

type Props = {
  day: string;
  items: CalendarItem[];
  onClose: () => void;
  onOpenItem: (item: CalendarItem) => void;
  onToggleTask: (item: CalendarItem) => void;
};

/** Drop-down under the side panel's mini month: everything on the clicked day. */
export function DayAgenda({ day, items, onClose, onOpenItem, onToggleTask }: Props) {
  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      <Pressable onPress={onClose} style={styles.header} accessibilityLabel="Close day list">
        <ThemedText type="smallBold">{formatDateKey(day)}</ThemedText>
        <ThemedText themeColor="textSecondary">▴</ThemedText>
      </Pressable>
      <View style={styles.list}>
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
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  list: { gap: Spacing.two },
});
