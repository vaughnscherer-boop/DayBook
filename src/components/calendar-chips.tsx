import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Calendar } from '@/db/calendars';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  calendars: Calendar[];
  value: string | null;
  onChange: (calendarId: string) => void;
};

/** Horizontal row of calendar chips (● Personal, ● Work…); the selected one is filled. */
export function CalendarChips({ calendars, value, onChange }: Props) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {calendars.map((calendar) => {
        const selected = calendar.id === value;
        return (
          <Pressable
            key={calendar.id}
            onPress={() => onChange(calendar.id)}
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              { borderColor: selected ? calendar.color : theme.backgroundSelected },
              selected && { backgroundColor: calendar.color },
            ]}>
            <View style={[styles.dot, { backgroundColor: selected ? '#ffffff' : calendar.color }]} />
            <ThemedText type="small" style={selected ? styles.selectedText : undefined}>
              {calendar.name}
            </ThemedText>
          </Pressable>
        );
      })}
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
