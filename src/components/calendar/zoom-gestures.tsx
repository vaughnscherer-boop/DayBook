import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';

type Props = {
  /** Pinch fingers together: show more (day → week → month). */
  onZoomOut: () => void;
  /** Spread fingers apart: show less (month → week → day). */
  onZoomIn: () => void;
  onNext: () => void;
  onPrev: () => void;
  children: ReactNode;
};

/** Pinch to switch between Month/Week/Day, and swipe left/right for next/previous. */
export function ZoomGestures({ onZoomOut, onZoomIn, onNext, onPrev, children }: Props) {
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onEnd((e) => {
      if (e.scale < 0.8) onZoomOut();
      else if (e.scale > 1.25) onZoomIn();
    });
  const swipeLeft = Gesture.Fling().direction(Directions.LEFT).runOnJS(true).onEnd(onNext);
  const swipeRight = Gesture.Fling().direction(Directions.RIGHT).runOnJS(true).onEnd(onPrev);

  return (
    <GestureDetector gesture={Gesture.Race(pinch, swipeLeft, swipeRight)}>
      <View style={styles.fill}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
