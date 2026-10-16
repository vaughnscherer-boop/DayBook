import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Shown as a dot before the label when `dot` is set. */
  color?: string | null;
  dot?: boolean;
  role?: 'radio' | 'button' | 'tab' | 'checkbox';
  /** Taller pill for primary toggles (the view switcher). */
  size?: 'small' | 'large';
};

/** Pill toggle: a light outline when off, solid black (white in dark mode) when selected. */
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
        // A quiet outline when off, so the one selected chip stands out.
        { borderColor: selected ? theme.accent : theme.textSecondary },
        selected && { backgroundColor: theme.accent },
      ]}>
      {dot && color && (
        <View style={[styles.dot, { backgroundColor: color }, selected && { borderColor: theme.onAccent, borderWidth: 1 }]} />
      )}
      {/* Chips sit in rows; past this they push each other off-screen. */}
      <ThemedText type="smallBold" maxFontSizeMultiplier={1.4} style={{ color: selected ? theme.onAccent : theme.text }}>
        {label}
      </ThemedText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.full,
    minHeight: 32,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  large: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
