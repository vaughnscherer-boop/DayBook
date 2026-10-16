import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Back if there's somewhere to go back to (not after a deep link or reload), otherwise Home. */
export const closeModal = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Eases the hover tint in on web; native has no hover. */
const fade = Platform.select<ViewStyle>({
  web: { transitionProperty: 'background-color, border-color', transitionDuration: '150ms' } as ViewStyle,
  default: {},
});

/** Outlined "Close" pill for modal headers on phones (the computer shows a back arrow instead). */
export function CloseButton({ onPress = closeModal }: { onPress?: () => void }) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);
  if (Platform.OS === 'web') return null;

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
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.twoHalf,
    paddingRight: Spacing.twoHalf,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
});

/**
 * Close for a modal's header. On iOS it's a native toolbar button, so it sits in the system's own glass
 * capsule instead of drawing a second pill inside it; elsewhere the outlined pill.
 */
export function CloseToolbar({ onPress = closeModal }: { onPress?: () => void }) {
  if (Platform.OS === 'ios') {
    return (
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Close" onPress={onPress} />
      </Stack.Toolbar>
    );
  }
  return <Stack.Screen options={{ headerRight: () => <CloseButton onPress={onPress} /> }} />;
}
