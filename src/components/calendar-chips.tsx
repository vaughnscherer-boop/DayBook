import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import type { Calendar } from '@/db/calendars';

type Props = {
  calendars: Calendar[];
  value: string | null;
  onChange: (calendarId: string) => void;
};

/** Horizontal row of calendar chips (● Personal, ● Work…); the selected one is tinted. */
export function CalendarChips({ calendars, value, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {calendars.map((calendar) => {
        const selected = calendar.id === value;
        return (
          <Chip
            key={calendar.id}
            label={calendar.name}
            selected={selected}
            color={calendar.color}
            dot
            onPress={() => onChange(calendar.id)}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two },
});
