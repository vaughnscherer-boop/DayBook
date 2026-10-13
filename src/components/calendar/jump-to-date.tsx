import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addMonths, fromKey, toDateKey } from '@/lib/dates';

type Props = {
  visible: boolean;
  date: string;
  onPick: (day: string) => void;
  onClose: () => void;
};

/** Pick any day, with year arrows for jumping far ahead or back. */
export function JumpToDate({ visible, date, onPick, onClose }: Props) {
  const theme = useTheme();
  const [shown, setShown] = useState(date);
  const [lastDate, setLastDate] = useState(date);
  if (date !== lastDate) {
    setLastDate(date);
    setShown(date);
  }

  const calendarTheme = useMemo(
    () => ({
      calendarBackground: 'transparent',
      dayTextColor: theme.text,
      monthTextColor: theme.text,
      textSectionTitleColor: theme.textSecondary,
      textDisabledColor: theme.textSecondary,
      todayTextColor: theme.accent,
      selectedDayBackgroundColor: theme.accent,
      selectedDayTextColor: theme.onAccent,
      textMonthFontWeight: '800' as const,
      arrowColor: theme.accent,
    }),
    [theme]
  );

  const year = shown.slice(0, 4);
  const shiftYear = (years: number) => setShown(toDateKey(addMonths(fromKey(shown), years * 12)));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <ThemedView style={[styles.card, { borderColor: theme.backgroundSelected }]}>
            <View style={styles.yearRow}>
              <Pressable onPress={() => shiftYear(-1)} hitSlop={8}>
                <ThemedText style={[styles.arrow, { color: theme.accent }]}>«</ThemedText>
              </Pressable>
              <ThemedText type="smallBold">{year}</ThemedText>
              <Pressable onPress={() => shiftYear(1)} hitSlop={8}>
                <ThemedText style={[styles.arrow, { color: theme.accent }]}>»</ThemedText>
              </Pressable>
            </View>
            <Calendar
              key={`${shown.slice(0, 7)}-${theme.background}`}
              current={shown}
              markedDates={{ [date]: { selected: true } }}
              onDayPress={(day) => onPick(day.dateString)}
              onMonthChange={(month) => setShown(month.dateString)}
              firstDay={0}
              theme={calendarTheme}
            />
            <Pressable onPress={() => onPick(toDateKey(new Date()))} style={styles.today}>
              <ThemedText type="small" style={{ color: theme.accent }}>
                Today
              </ThemedText>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: 340,
    maxWidth: '100%',
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  yearRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.four },
  arrow: { fontSize: 20 },
  today: { alignSelf: 'center', padding: Spacing.one },
});
