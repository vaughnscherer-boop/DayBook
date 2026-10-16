import { useSQLiteContext } from 'expo-sqlite';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import { setAttendance, type AttendanceStatus } from '@/db/attendance';
import type { CalendarItem } from '@/lib/calendar-items';
import { notifyDataChanged } from '@/lib/data-events';
import { tap } from '@/lib/haptics';

const CHOICES: { status: AttendanceStatus; label: string }[] = [
  { status: 'went', label: 'Went' },
  { status: 'skipped', label: 'Skipped' },
  { status: 'cancelled', label: 'Cancelled' },
];

/** Under a class that has ended today: "Did you go?" Went / Skipped / Cancelled, for the class's absence count. */
export function AttendanceCheck({ item, status }: { item: CalendarItem; status: AttendanceStatus | undefined }) {
  const db = useSQLiteContext();
  const choose = async (next: AttendanceStatus) => {
    tap();
    await setAttendance(db, { eventId: item.id, groupId: item.groupId, day: item.occurrenceDate }, next);
    notifyDataChanged();
  };
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {status ? 'Attendance' : 'Did you go?'}
      </ThemedText>
      {CHOICES.map((choice) => (
        <Chip key={choice.status} label={choice.label} selected={status === choice.status} onPress={() => choose(choice.status)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two, paddingLeft: 64 + Spacing.two },
});
