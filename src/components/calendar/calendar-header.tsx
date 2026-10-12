import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
  wide: boolean;
  onViewChange: (view: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onTitlePress: () => void;
  onTogglePanel: () => void;
};

export function CalendarHeader(props: Props) {
  const theme = useTheme();

  const switcher = (
    <ThemedView type="backgroundElement" style={[styles.segmented, !props.wide && styles.segmentedFull]}>
      {MODES.map((mode) => {
        const selected = mode.value === props.view;
        return (
          <Pressable
            key={mode.value}
            onPress={() => props.onViewChange(mode.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: theme.background }]}>
            <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
              {mode.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable onPress={props.onTogglePanel} hitSlop={8} accessibilityLabel="Toggle side panel" style={styles.iconButton}>
          <ThemedText style={[styles.icon, { color: theme.accent }]}>☰</ThemedText>
        </Pressable>

        <Pressable onPress={props.onTitlePress} hitSlop={6} accessibilityLabel="Jump to a date" style={styles.titleButton}>
          <ThemedText type="subtitle" numberOfLines={1} style={[styles.title, !props.wide && styles.titleSmall]}>
            {props.title}
          </ThemedText>
          <ThemedText style={{ color: theme.accent }}> ▾</ThemedText>
        </Pressable>

        <View style={styles.spacer} />
        {props.wide && switcher}

        <Pressable onPress={props.onPrev} hitSlop={8} accessibilityLabel="Previous" style={styles.iconButton}>
          <ThemedText style={[styles.icon, { color: theme.accent }]}>‹</ThemedText>
        </Pressable>
        <Pressable onPress={props.onToday} hitSlop={6} style={[styles.todayButton, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="small">Today</ThemedText>
        </Pressable>
        <Pressable onPress={props.onNext} hitSlop={8} accessibilityLabel="Next" style={styles.iconButton}>
          <ThemedText style={[styles.icon, { color: theme.accent }]}>›</ThemedText>
        </Pressable>
      </View>
      {!props.wide && switcher}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconButton: { paddingHorizontal: Spacing.one },
  icon: { fontSize: 24, lineHeight: 28 },
  titleButton: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  title: { fontSize: 24, lineHeight: 30 },
  titleSmall: { fontSize: 20, lineHeight: 26 },
  spacer: { flex: 1 },
  todayButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  segmented: { flexDirection: 'row', borderRadius: Spacing.two, padding: 2 },
  segmentedFull: { alignSelf: 'stretch' },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two - 2,
  },
});
