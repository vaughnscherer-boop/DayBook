import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useTabBarSpace } from '@/components/bottom-bar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { onToast, type Toast } from '@/lib/toast';

const SHOW_MS = 7000;

/** Shows `showToast` messages above the tab bar, with Undo when there's something to undo. */
export function ToastHost() {
  const theme = useTheme();
  const bottom = useTabBarSpace();
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(
    () =>
      onToast((next) => {
        setToast(next);
        // VoiceOver reads it out; the toast itself isn't focused.
        if (next) AccessibilityInfo.announceForAccessibility(next.undo ? `${next.text}. Undo available.` : next.text);
      }),
    []
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <Animated.View
      key={toast.id}
      // The same critically damped spring as PressableScale, so it feels part of the family.
      entering={FadeInDown.springify().damping(30).stiffness(400)}
      exiting={FadeOutDown.duration(150)}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: bottom + Spacing.two }]}>
      <Pressable
        onPress={() => setToast(null)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.toast, { backgroundColor: theme.accent }]}>
        <ThemedText type="small" numberOfLines={2} style={[styles.text, { color: theme.onAccent }]}>
          {toast.text}
        </ThemedText>
        {toast.undo && (
          <Pressable
            onPress={async () => {
              setToast(null);
              await toast.undo?.();
            }}
            accessibilityRole="button"
            hitSlop={10}
            style={styles.undo}>
            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
              Undo
            </ThemedText>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.three, right: Spacing.three, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    maxWidth: 520,
    width: '100%',
    borderRadius: Radius.full,
    boxShadow: Shadow.floating,
    paddingLeft: Spacing.four,
    paddingRight: Spacing.three,
    paddingVertical: Spacing.one,
    minHeight: 48,
  },
  undo: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.two },
  text: { flex: 1 },
});
