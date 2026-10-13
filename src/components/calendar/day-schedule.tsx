import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { groupNames, ItemCard, typeLabel } from '@/components/item-card';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/empty-state';
import { Spacing } from '@/constants/theme';
import type { Group } from '@/db/groups';
import { itemsOnDay, type CalendarItem } from '@/lib/calendar-items';
import { formatShortTime, todayKey } from '@/lib/dates';

type Props = {
  day: string;
  items: CalendarItem[];
  groups: Group[];
  onOpenItem: (item: CalendarItem) => void;
  onToggleTask: (item: CalendarItem) => void;
};

const minutesOf = (key: string) => Number(key.slice(11, 13)) * 60 + Number(key.slice(14, 16));

/** "15 min", "1h", "1h 15m" between two 'YYYY-MM-DDTHH:MM' keys (end may be on a later day). */
function duration(start: string, end: string) {
  const days = Math.round((Date.parse(end.slice(0, 10)) - Date.parse(start.slice(0, 10))) / 86_400_000);
  const total = days * 24 * 60 + minutesOf(end) - minutesOf(start);
  if (total <= 0) return null;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours === 0 ? `${minutes} min` : minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** "Location: TOH 367" from an imported class's notes. */
const locationOf = (item: CalendarItem) => item.notes?.match(/Location:\s*(.+)/)?.[1] ?? null;

/** All-day things first, then everything with a time in order. */
function sortForDay(items: CalendarItem[], day: string) {
  const startOf = (item: CalendarItem) =>
    item.allDay ? '' : (item.startsAt?.slice(0, 10) === day ? item.startsAt.slice(11, 16) : item.time) ?? '';
  return [...items].sort((a, b) => startOf(a).localeCompare(startOf(b)) || a.title.localeCompare(b.title));
}

/**
 * Day view as a schedule: a time column on the left and a calm card per event or task. The thing
 * happening right now is tinted and opens up its notes.
 */
export function DaySchedule({ day, items, groups, onOpenItem, onToggleTask }: Props) {
  const list = useMemo(() => sortForDay(itemsOnDay(items, day), day), [items, day]);
  const groupName = useMemo(() => groupNames(groups), [groups]);

  const now = new Date();
  const nowKey = `${todayKey()}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const isNow = (item: CalendarItem) =>
    item.kind === 'event' && !item.allDay && item.startsAt! <= nowKey && nowKey < item.endsAt!;

  if (list.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState text="Nothing planned — enjoy the open day." />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {list.map((item) => {
        const current = isNow(item);
        const startsToday = item.startsAt?.slice(0, 10) === day;
        const timeLabel = item.allDay
          ? item.kind === 'task'
            ? 'Any time'
            : 'All day'
          : formatShortTime(startsToday ? item.startsAt! : item.time ?? '00:00').replace(/(\d)(AM|PM)/, '$1 $2');
        const length = item.kind === 'event' && !item.allDay ? duration(item.startsAt!, item.endsAt!) : null;
        const subtitle = [item.groupId ? groupName[item.groupId] : null, typeLabel(item), locationOf(item), length]
          .filter(Boolean)
          .join('  ·  ');
        const notes = item.details ?? item.notes?.replace(/Location:\s*.+\n?/, '').trim();

        return (
          <View key={item.key} style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.time}>
              {timeLabel}
            </ThemedText>
            <ItemCard
              item={item}
              subtitle={subtitle}
              highlighted={current}
              notes={notes}
              onOpen={() => onOpenItem(item)}
              onToggle={() => onToggleTask(item)}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },
  empty: { padding: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two + 4 },
  time: { width: 64, paddingTop: Spacing.three, fontVariant: ['tabular-nums'] },
});
