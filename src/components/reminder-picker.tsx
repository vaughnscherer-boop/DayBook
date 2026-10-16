import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import { ALL_DAY_REMINDERS, defaultReminders, TIMED_REMINDERS, type ReminderToken } from '@/lib/reminders';

type Props = {
  item: Parameters<typeof defaultReminders>[0];
  /** null = the defaults for this kind of item. */
  value: ReminderToken[] | null;
  onChange: (value: ReminderToken[] | null) => void;
  /** Whether default reminders are on in Settings. */
  defaultsOn: boolean;
};

/** "Remind me": pick any number of reminders, or none; untouched items follow the defaults. */
export function ReminderPicker({ item, value, onChange, defaultsOn }: Props) {
  const options = item.allDay ? ALL_DAY_REMINDERS : TIMED_REMINDERS;
  const defaults = defaultsOn ? defaultReminders(item) : [];
  const chosen = value ?? defaults;
  const toggle = (token: ReminderToken) =>
    onChange(chosen.includes(token) ? chosen.filter((t) => t !== token) : [...chosen, token]);
  const labels = options.filter((o) => chosen.includes(o.token)).map((o) => o.label.toLowerCase());

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        Remind me
        {chosen.length === 0 ? ': never' : `: ${labels.join(', ')}`}
        {value === null && chosen.length > 0 ? ' (default)' : ''}
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.chips}>
        <Chip label="None" role="button" selected={chosen.length === 0} onPress={() => onChange([])} />
        {options.map((option) => (
          <Chip
            key={option.token}
            label={option.label}
            role="checkbox"
            selected={chosen.includes(option.token)}
            onPress={() => toggle(option.token)}
          />
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
