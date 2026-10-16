import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Two to four mutually exclusive choices in one track (Event | Task, Month | Week | Day). The selected
 * segment is solid ink, like a selected chip, so it's obvious at a glance.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, style }: Props<T>) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.track, style]} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: theme.accent }]}>
            <ThemedText
              type="smallBold"
              maxFontSizeMultiplier={1.4}
              style={{ color: selected ? theme.onAccent : theme.textSecondary }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

const PADDING = 2;

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: Radius.sm, borderCurve: 'continuous', padding: PADDING },
  // Concentric with the track: its radius minus the padding between them.
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: Spacing.twoHalf,
    borderRadius: Radius.sm - PADDING,
    borderCurve: 'continuous',
  },
});
