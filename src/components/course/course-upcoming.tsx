import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ItemRow, RowGroup } from '@/components/item-row';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { CalendarItem } from '@/lib/calendar-items';
import { formatDateKey, formatTime } from '@/lib/dates';
import { ITEM_TYPES } from '@/lib/item-type';

type Props = {
  /** This course's items from today on, soonest first. */
  items: CalendarItem[];
  onToggle: (item: CalendarItem) => void;
  /** After a long-press menu action. */
  onChanged?: () => void;
};

/** How many show before "Show all": the rest of the term would be a wall of rows. */
const FIRST = 5;

/** The next things in a course: exams and homework first, then classes, each with its syllabus note. */
export function CourseUpcoming({ items, onToggle, onChanged }: Props) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return <EmptyState text="Nothing coming up for this class." icon="event" />;
  const shown = all ? items : items.slice(0, FIRST);

  return (
    <View>
      <RowGroup>
        {shown.map((item) => (
          <ItemRow
            key={item.key}
            item={item}
            subtitle={`${when(item)} · ${ITEM_TYPES.find((t) => t.type === item.itemType)?.label.replace(' / quiz', '')}`}
            details={item.details}
            onOpen={() =>
              router.push({ pathname: item.kind === 'task' ? '/task/[id]' : '/event/[id]', params: { id: item.id } })
            }
            onToggle={() => onToggle(item)}
            onChanged={onChanged}
          />
        ))}
      </RowGroup>
      {items.length > FIRST && (
        <Button
          title={all ? 'Show fewer' : `Show all ${items.length}`}
          variant="ghost"
          onPress={() => setAll(!all)}
        />
      )}
    </View>
  );
}

function when(item: CalendarItem): string {
  const day = formatDateKey(item.startDay);
  if (item.allDay || !item.time) return day;
  return `${day}, ${formatTime(`${item.startDay}T${item.time}`)}`;
}
