import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Back if there's somewhere to go back to (not after a deep link or reload), otherwise Home. */
export const closeModal = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Eases the hover tint in on web; native has no hover. */
const fade = Platform.select<ViewStyle>({
  web: { transitionProperty: 'background-color, border-color', transitionDuration: '150ms' } as ViewStyle,
  default: {},
});

/** Outlined "Close" pill for modal headers that brightens under the pointer. */
export function CloseButton({ onPress = closeModal }: { onPress?: () => void }) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <PressableScale
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Close"
      style={[
        styles.button,
        fade,
        {
          borderColor: hovered ? theme.textSecondary : theme.backgroundSelected,
          backgroundColor: hovered ? theme.backgroundElement : 'transparent',
        },
      ]}>
      <Icon name="close" size={14} color={theme.text} weight="semibold" />
      <ThemedText type="smallBold">Close</ThemedText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one + 2,
    paddingLeft: Spacing.two + 2,
    paddingRight: Spacing.three - 2,
    borderRadius: 10,
    borderWidth: 1,
  },
});
