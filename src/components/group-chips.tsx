import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import type { Group, GroupChoice } from '@/db/groups';

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
  const isAuto = value === 'auto';
  const picked = value === 'auto' ? undefined : value.groupId;

  const chip = (key: string, label: string, selected: boolean, color: string | null, onPress: () => void) => (
    <Chip key={key} label={label} selected={selected} color={color} dot onPress={onPress} />
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
});
