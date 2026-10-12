import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

const EDGE_WIDTH = 20;

/**
 * Phone side panel: slides in from the left over a dimmed backdrop. Opens from the ☰ button
 * or a swipe from the left edge; closes on backdrop tap or a swipe back.
 */
export function Drawer({ open, onOpenChange, children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(screenWidth * 0.86, 360);
  const progress = useSharedValue(open ? 1 : 0); // 0 closed, 1 open

  useEffect(() => {
    progress.set(withTiming(open ? 1 : 0, { duration: 220 }));
  }, [open, progress]);

  const settle = (velocityX: number) => {
    'worklet';
    const shouldOpen = velocityX > 300 || (velocityX > -300 && progress.get() > 0.5);
    progress.set(withTiming(shouldOpen ? 1 : 0, { duration: 180 }));
    runOnJS(onOpenChange)(shouldOpen);
  };

  // Drag from the left edge to open.
  const edgePan = Gesture.Pan()
    .activeOffsetX(10)
    .onUpdate((e) => {
      progress.set(Math.min(Math.max(e.translationX / width, 0), 1));
    })
    .onEnd((e) => settle(e.velocityX));

  // Drag the open panel left to close.
  const panelPan = Gesture.Pan()
    .activeOffsetX(-10)
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      progress.set(Math.min(Math.max(1 + e.translationX / width, 0), 1));
    })
    .onEnd((e) => settle(e.velocityX));

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (progress.get() - 1) * width }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() * 0.4 }));

  return (
    <>
      {!open && (
        <GestureDetector gesture={edgePan}>
          <Animated.View style={[styles.edge, { width: EDGE_WIDTH }]} />
        </GestureDetector>
      )}
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpenChange(false)} accessibilityLabel="Close panel" />
      </Animated.View>
      <GestureDetector gesture={panelPan}>
        <Animated.View
          style={[
            styles.panel,
            { width, backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom },
            panelStyle,
          ]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 30 },
  backdrop: { backgroundColor: '#000000', zIndex: 40 },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 50,
    boxShadow: '4px 0 24px rgba(0,0,0,0.25)',
  },
});
