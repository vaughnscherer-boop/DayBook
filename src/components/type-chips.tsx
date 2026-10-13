import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Group } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';
import { textOn } from '@/lib/calendar-items';
import { ITEM_TYPES, typeColor, type ItemType } from '@/lib/item-type';

type Props = {
  /** The item's group; each chip shows that type's shade of its color. */
  group: Group;
  /** null = guess from the title. */
  value: ItemType | null;
  /** What the guess currently is, shown on the Auto chip. */
  guessed: ItemType;
  onChange: (type: ItemType | null) => void;
};

/** Auto · Class · Exam / quiz · Assignment · Reading · Other, each in its shade of the group color. */
export function TypeChips({ group, value, guessed, onChange }: Props) {
  const theme = useTheme();

  const chip = (key: string, label: string, selected: boolean, color: string, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { borderColor: selected ? color : theme.backgroundSelected },
        selected && { backgroundColor: color },
      ]}>
      <View style={[styles.dot, { backgroundColor: color }, selected && styles.dotOnColor]} />
      <ThemedText type="small" style={selected ? { color: textOn(color) } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
  const labelOf = (type: ItemType) => ITEM_TYPES.find((t) => t.type === type)?.label ?? type;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chip('auto', `Auto · ${labelOf(guessed)}`, value === null, typeColor(group, guessed), () => onChange(null))}
      {ITEM_TYPES.map(({ type, label }) =>
        chip(type, label, value === type, typeColor(group, type), () => onChange(type))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOnColor: { borderWidth: 1, borderColor: '#ffffff' },
});
