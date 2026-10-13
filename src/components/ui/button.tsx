import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title: string;
  onPress: () => void;
  /** primary: filled accent. secondary: outlined. ghost: text only. */
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'primary', disabled, busy, style }: Props) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const inactive = disabled || busy;
  const textColor = primary ? (disabled ? theme.textSecondary : theme.onAccent) : theme.accent;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      style={[
        styles.button,
        primary && { backgroundColor: disabled ? theme.backgroundSelected : theme.accent },
        variant === 'secondary' && [styles.outlined, { borderColor: theme.text }],
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <ThemedText style={[styles.text, { color: textColor }]}>{title}</ThemedText>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 999,
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  outlined: { borderWidth: 1.5 },
  text: { fontSize: 16, lineHeight: 20, fontWeight: 700 },
});
