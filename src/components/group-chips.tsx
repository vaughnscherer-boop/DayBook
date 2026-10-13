import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Group, GroupChoice } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** Groups of the item's calendar. */
  groups: Group[];
  value: GroupChoice;
  /** The group automatic grouping put the item in, shown on the Auto chip. */
  autoGroup: Group | null;
  onChange: (choice: GroupChoice) => void;
};

/** Auto · each group · None. Picking a group (or None) is a hand pick the automatic rules won't undo. */
export function GroupChips({ groups, value, autoGroup, onChange }: Props) {
  const theme = useTheme();
  const isAuto = value === 'auto';
  const picked = value === 'auto' ? undefined : value.groupId;

  const chip = (key: string, label: string, selected: boolean, color: string | null, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { borderColor: selected ? (color ?? theme.accent) : theme.backgroundSelected },
        selected && { backgroundColor: color ?? theme.accent },
      ]}>
      {color && <View style={[styles.dot, { backgroundColor: selected ? '#ffffff' : color }]} />}
      <ThemedText type="small" style={selected ? styles.selectedText : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chip('auto', autoGroup ? `Auto · ${autoGroup.name}` : 'Auto', isAuto, null, () => onChange('auto'))}
      {groups.map((group) =>
        chip(group.id, group.name, picked === group.id, group.color, () => onChange({ groupId: group.id }))
      )}
      {chip('none', 'None', picked === null, null, () => onChange({ groupId: null }))}
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
  selectedText: { color: '#ffffff' },
});
