import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import { formatMinutes } from '@/lib/dates';

const OPTIONS = [15, 30, 60, 120];

/** "Takes about": a rough time estimate for a task, used by the load meter and Plan this. */
export function EstimatePicker({ value, onChange }: { value: number | null; onChange: (minutes: number | null) => void }) {
  const custom = value !== null && !OPTIONS.includes(value);
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        Takes about{value ? `: ${formatMinutes(value)}` : ''}
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.chips}>
        <Chip label="Not sure" selected={value === null} onPress={() => onChange(null)} />
        {custom && <Chip label={formatMinutes(value)} selected onPress={() => onChange(null)} />}
        {OPTIONS.map((minutes) => (
          <Chip key={minutes} label={formatMinutes(minutes)} selected={value === minutes} onPress={() => onChange(minutes)} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  scroll: { marginHorizontal: -Spacing.three },
  chips: { gap: Spacing.two, paddingHorizontal: Spacing.three },
});
