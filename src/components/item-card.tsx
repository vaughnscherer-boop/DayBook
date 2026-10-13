import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { TaskCheck } from '@/components/ui/task-check';
import { Spacing } from '@/constants/theme';
import type { Group } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';
import { tint, type CalendarItem } from '@/lib/calendar-items';
import { ITEM_TYPES } from '@/lib/item-type';

const TYPE_ICON: Record<CalendarItem['itemType'], IconName> = {
  class: 'class',
  exam: 'exam',
  assignment: 'assignment',
  reading: 'reading',
  other: 'event',
};

/** "Class", "Exam", "Task", "Event"… for an item. */
export function typeLabel(item: CalendarItem) {
  if (item.itemType === 'other') return item.kind === 'task' ? 'Task' : 'Event';
  return ITEM_TYPES.find((t) => t.type === item.itemType)?.label.replace(' / quiz', '') ?? 'Event';
}

/** The item's group name, by id. */
export const groupNames = (groups: Group[]) => Object.fromEntries(groups.map((g) => [g.id, g.name]));

type Props = {
  item: CalendarItem;
  subtitle: string;
  /** Tinted with the item's color, with its notes opened up (the thing happening now). */
  highlighted?: boolean;
  notes?: string | null;
  onOpen: () => void;
  onToggle: () => void;
};

/** A calm card for one event or task: icon tile (or checkbox), title, a detail line and a chevron. */
export function ItemCard({ item, subtitle, highlighted, notes, onOpen, onToggle }: Props) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onOpen}
      scaleTo={0.98}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
        highlighted && { backgroundColor: tint(item.color, 0.16), borderColor: tint(item.color, 0.35) },
      ]}>
      <View style={styles.cardRow}>
        <View style={[styles.tile, { backgroundColor: tint(item.color, highlighted ? 0.22 : 0.14) }]}>
          {item.kind === 'task' ? (
            <TaskCheck done={item.done} color={item.color} size={20} onToggle={onToggle} />
          ) : (
            <Icon name={TYPE_ICON[item.itemType]} size={18} color={item.color} />
          )}
        </View>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            {highlighted && <View style={[styles.liveDot, { backgroundColor: item.color }]} />}
            <ThemedText
              type="smallBold"
              numberOfLines={1}
              themeColor={item.done ? 'textSecondary' : 'text'}
              style={[styles.title, item.done && styles.done]}>
              {item.title}
            </ThemedText>
          </View>
          {subtitle.length > 0 && (
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          )}
        </View>
        <Icon name="forward" size={13} weight="semibold" color={theme.textSecondary} />
      </View>
      {highlighted && notes ? (
        <View style={[styles.notes, { backgroundColor: tint(item.color, 0.14) }]}>
          <ThemedText type="small" numberOfLines={4}>
            {notes}
          </ThemedText>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three - 2,
    gap: Spacing.two + 4,
    boxShadow: '0 1px 2px rgba(22, 22, 22, 0.04)',
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 4 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  title: { flex: 1, fontSize: 15 },
  done: { textDecorationLine: 'line-through' },
  notes: { borderRadius: 12, padding: Spacing.two + 4 },
});
