import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/empty-state';
import { PressableScale } from '@/components/ui/pressable-scale';
import { TaskCheck } from '@/components/ui/task-check';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { formatDateKey, formatTime } from '@/lib/dates';
import { ITEM_TYPES } from '@/lib/item-type';

type Props = {
  /** This course's items from today on, soonest first. */
  items: CalendarItem[];
  onToggle: (item: CalendarItem) => void;
};

/** The next things in a course: exams and homework first, then classes, each with its syllabus note. */
export function CourseUpcoming({ items, onToggle }: Props) {
  const theme = useTheme();
  if (items.length === 0) return <EmptyState text="Nothing coming up for this class." icon="event" />;

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <PressableScale
          key={item.key}
          scaleTo={0.98}
          onPress={() =>
            router.push({ pathname: item.kind === 'task' ? '/task/[id]' : '/event/[id]', params: { id: item.id } })
          }
          style={[styles.row, { borderColor: theme.backgroundSelected }]}>
          {item.kind === 'task' ? (
            <TaskCheck done={item.done} color={item.color} onToggle={() => onToggle(item)} />
          ) : (
            <View style={[styles.bar, { backgroundColor: item.color }]} />
          )}
          <View style={styles.flex}>
            <ThemedText type="small" numberOfLines={1} themeColor={item.done ? 'textSecondary' : 'text'}>
              {item.title}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {when(item)} · {ITEM_TYPES.find((t) => t.type === item.itemType)?.label.replace(' / quiz', '')}
            </ThemedText>
            {item.details && (
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={2}>
                {item.details}
              </ThemedText>
            )}
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

function when(item: CalendarItem): string {
  const day = formatDateKey(item.startDay);
  if (item.allDay || !item.time) return day;
  return `${day}, ${formatTime(`${item.startDay}T${item.time}`)}`;
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
  },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  flex: { flex: 1, gap: 1 },
});
