import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { success, tap } from '@/lib/haptics';

type Move = { label: string; date: string };

type Props = {
  item: CalendarItem;
  children: ReactNode;
  onToggle: () => void;
  /** Days it can be pushed to with a swipe left, e.g. Today and Tomorrow. Left out for repeating tasks. */
  moves?: Move[];
  onMove?: (date: string) => void;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** The surface the row sits on, so it covers the swipe panels: the page, or a RowGroup. */
  surface?: 'background' | 'backgroundElement';
};

/**
 * A task row you can swipe: right to tick it off (or back on), left for buttons that move it to
 * another day. Events and anything disabled render the row as it is.
 */
export function SwipeTask({
  item,
  children,
  onToggle,
  moves = [],
  onMove,
  enabled = true,
  style,
  surface = 'background',
}: Props) {
  const theme = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  if (item.kind !== 'task' || !enabled) return <>{children}</>;
  // Moving a repeating task would move the whole series, so those only get the tick.
  const canMove = !item.repeating && moves.length > 0 && !!onMove;

  const doneAction = () => (
    <View style={[styles.done, { backgroundColor: theme.accent }]}>
      <Icon name="checked" size={18} color={theme.onAccent} />
      <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
        {item.done ? 'Not done' : 'Done'}
      </ThemedText>
    </View>
  );
  const moveActions = () => (
    <View style={styles.moves}>
      {moves.map((move) => (
        <Pressable
          key={move.date}
          onPress={() => {
            tap();
            ref.current?.close();
            onMove?.(move.date);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Move ${item.title} to ${move.label}`}
          style={[styles.move, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="smallBold">{move.label}</ThemedText>
        </Pressable>
      ))}
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      containerStyle={style}
      friction={1.5}
      leftThreshold={72}
      rightThreshold={40}
      overshootLeft={false}
      renderLeftActions={doneAction}
      renderRightActions={canMove ? moveActions : undefined}
      onSwipeableWillOpen={(direction) => {
        // Swiping right (the left panel showing) ticks it straight away.
        if (direction !== SwipeDirection.RIGHT) return;
        if (!item.done) success();
        else tap();
        onToggle();
        ref.current?.close();
      }}>
      {/* Opaque so the panels only show where the row has slid away. */}
      <View style={{ backgroundColor: theme[surface] }}>{children}</View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.sm,
    marginRight: Spacing.two,
  },
  moves: { flexDirection: 'row', gap: Spacing.one, marginLeft: Spacing.two },
  move: { justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: Radius.sm },
});
