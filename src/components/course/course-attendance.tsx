import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { setAbsenceLimit, type Attendance } from '@/db/attendance';
import type { Group } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';

/** The class page's attendance: absences against what the syllabus allows, with the limit adjustable. */
export function CourseAttendance({ group, records, onChanged }: { group: Group; records: Attendance[]; onChanged: () => void }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const mine = records.filter((r) => r.group_id === group.id);
  const skipped = mine.filter((r) => r.status === 'skipped').length;
  const went = mine.filter((r) => r.status === 'went').length;
  const limit = group.absence_limit;
  const atLimit = limit !== null && skipped >= limit;

  const change = async (next: number | null) => {
    await setAbsenceLimit(db, group.id, next);
    onChanged();
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <ThemedText type="label" style={atLimit && { color: theme.danger }}>
            {limit !== null ? `${skipped} of ${limit} absences used` : `${skipped} absence${skipped === 1 ? '' : 's'}`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {atLimit
              ? skipped > limit!
                ? 'Over the limit — this may already be costing you points.'
                : 'At the limit — another absence may cost you points.'
              : mine.length
                ? `Went to ${went} of ${went + skipped} classes you’ve checked in on`
                : 'After each class ends, Today asks whether you went.'}
          </ThemedText>
        </View>
      </View>
      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
          Absences allowed{limit === null ? ': not set' : ''}
        </ThemedText>
        {limit !== null && (
          <Pressable
            onPress={() => change(limit > 0 ? limit - 1 : null)}
            accessibilityRole="button"
            accessibilityLabel="One fewer allowed absence"
            hitSlop={8}
            style={[styles.step, { borderColor: theme.textSecondary }]}>
            <Icon name="minus" size={14} color={theme.text} />
          </Pressable>
        )}
        {limit !== null && (
          <ThemedText type="label" style={styles.count}>
            {limit}
          </ThemedText>
        )}
        <Pressable
          onPress={() => change(limit === null ? 3 : limit + 1)}
          accessibilityRole="button"
          accessibilityLabel={limit === null ? 'Set allowed absences' : 'One more allowed absence'}
          hitSlop={8}
          style={[styles.step, { borderColor: theme.textSecondary }]}>
          <Icon name="add" size={14} color={theme.text} />
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.twoHalf },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf },
  flex: { flex: 1, gap: 2 },
  step: { width: 32, height: 32, borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 20, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
