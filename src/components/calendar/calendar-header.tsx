import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CalendarViewMode = 'month' | 'week' | 'day';

const MODES: { value: CalendarViewMode; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];

type Props = {
  view: CalendarViewMode;
  title: string;
  /** Lighter text after the title (the weekday, in Month view). */
  subtitle?: string;
  wide: boolean;
  onViewChange: (view: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onTitlePress: () => void;
};

export function CalendarHeader(props: Props) {
  const theme = useTheme();

  const pills = (
    <View style={styles.pills}>
      {MODES.map((mode) => (
        <Chip
          key={mode.value}
          label={mode.label}
          role="tab"
          size={props.wide ? 'large' : 'small'}
          selected={mode.value === props.view}
          onPress={() => props.onViewChange(mode.value)}
        />
      ))}
    </View>
  );

  const prev = (
    <Pressable onPress={props.onPrev} hitSlop={10} accessibilityLabel="Previous" style={styles.chevron}>
      <Icon name="back" size={16} weight="bold" color={theme.text} />
    </Pressable>
  );
  const next = (
    <Pressable onPress={props.onNext} hitSlop={10} accessibilityLabel="Next" style={styles.chevron}>
      <Icon name="forward" size={16} weight="bold" color={theme.text} />
    </Pressable>
  );
  const today = (
    <Chip label="Today" role="button" size={props.wide ? 'large' : 'small'} selected={false} onPress={props.onToday} />
  );

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable onPress={props.onTitlePress} hitSlop={6} accessibilityLabel="Jump to a date" style={styles.titleButton}>
          <ThemedText numberOfLines={1} style={[styles.title, !props.wide && styles.titleSmall]}>
            {props.title}
            {props.subtitle && <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}> {props.subtitle}</ThemedText>}
          </ThemedText>
          <Icon name="expand" size={14} weight="bold" color={theme.text} />
        </Pressable>
        <View style={styles.spacer} />
        {props.wide && pills}
        {prev}
        {props.wide && today}
        {next}
      </View>
      {/* Phones: the view pills and Today get their own row so nothing overflows at 390pt. */}
      {!props.wide && (
        <View style={styles.row}>
          {pills}
          <View style={styles.spacer} />
          {today}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  titleButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, flexShrink: 1 },
  subtitle: { fontWeight: 500, letterSpacing: 0 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: 800, letterSpacing: -0.8 },
  titleSmall: { fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  spacer: { flex: 1 },
  pills: { flexDirection: 'row', gap: Spacing.one + 2 },
  chevron: { padding: Spacing.one },
});
