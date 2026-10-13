import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Shown as a dot before the label when `dot` is set. */
  color?: string | null;
  dot?: boolean;
  role?: 'radio' | 'button' | 'tab';
  /** Taller pill for primary toggles (the view switcher). */
  size?: 'small' | 'large';
};

/** Pill toggle: outlined when off, solid black (white in dark mode) when selected. */
export function Chip({ label, selected, onPress, color, dot, role = 'radio', size = 'small' }: Props) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        size === 'large' && styles.large,
        { borderColor: selected ? theme.accent : theme.text },
        selected && { backgroundColor: theme.accent },
      ]}>
      {dot && color && (
        <View style={[styles.dot, { backgroundColor: color }, selected && { borderColor: theme.onAccent, borderWidth: 1 }]} />
      )}
      <ThemedText type="smallBold" style={{ color: selected ? theme.onAccent : theme.text }}>
        {label}
      </ThemedText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 1,
  },
  large: { paddingVertical: Spacing.two - 1, paddingHorizontal: Spacing.three + 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
