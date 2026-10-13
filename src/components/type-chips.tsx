import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import type { Group } from '@/db/groups';
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

  const chip = (key: string, label: string, selected: boolean, color: string, onPress: () => void) => (
    <Chip key={key} label={label} selected={selected} color={color} dot onPress={onPress} />
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
});
