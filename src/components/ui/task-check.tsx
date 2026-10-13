import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { tap } from '@/lib/haptics';

type Props = {
  done: boolean;
  color: string;
  size?: number;
  /** Leave out for a display-only check. */
  onToggle?: () => void;
};

/** Round task checkbox: the ring fills with the task's color, with a small settle when ticked. */
export function TaskCheck({ done, color, size = 20, onToggle }: Props) {
  const fill = useSharedValue(done ? 1 : 0);
  const scale = useSharedValue(1);

  useEffect(() => {
    fill.set(withTiming(done ? 1 : 0, { duration: 180 }));
    if (done) scale.set(withSequence(withTiming(0.85, { duration: 80 }), withSpring(1, { damping: 18, stiffness: 300 })));
  }, [done, fill, scale]);

  const checkStyle = useAnimatedStyle(() => ({ opacity: fill.get() }));
  const containerStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const icon = (
    <Animated.View style={[{ width: size, height: size }, containerStyle]}>
      <Icon name="unchecked" size={size} color={color} />
      <Animated.View style={[StyleSheet.absoluteFill, checkStyle]}>
        <Icon name="checked" size={size} color={color} />
      </Animated.View>
    </Animated.View>
  );

  if (!onToggle) return <View accessibilityState={{ checked: done }}>{icon}</View>;
  return (
    <Pressable
      onPress={() => {
        tap();
        onToggle();
      }}
      hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: done }}>
      {icon}
    </Pressable>
  );
}
