import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';

import { closeModal } from '@/components/ui/close-button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** On the computer, every screen's header has just this arrow; phones keep their own buttons. */
export const isWeb = Platform.OS === 'web';

/** A screen's own header-left button on phones; on the computer the root layout's back arrow shows instead. */
export const nativeOnly = (render: () => ReactNode) => (isWeb ? () => <BackArrow /> : render);

const fade = Platform.select<ViewStyle>({
  web: { transitionProperty: 'background-color', transitionDuration: '150ms' } as ViewStyle,
  default: {},
});

/** A plain back chevron, set in from the window edge, that tints under the pointer. */
export function BackArrow() {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <PressableScale
      onPress={closeModal}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={[styles.button, fade, { backgroundColor: hovered ? theme.backgroundElement : 'transparent' }]}>
      <Icon name="back" size={20} color={theme.text} weight="semibold" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.three,
  },
});
