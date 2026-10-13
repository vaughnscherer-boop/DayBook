import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

type Props = {
  /** 'y' pages up/down (Month), 'x' pages left/right (Week/Day, whose hours scroll vertically). */
  axis: 'x' | 'y';
  /** Changes whenever the centre page changes (e.g. view + focused date); re-centres the pages. */
  pageKey: string;
  /** Keys for the previous, current and next pages; a page keeps its instance as it slides into the centre. */
  pageKeys: [string, string, string];
  renderPage: (offset: -1 | 0 | 1) => ReactNode;
  onNext: () => void;
  onPrev: () => void;
  /** Spread fingers apart: show less (month → week → day). */
  onZoomIn: () => void;
  /** Pinch fingers together: show more (day → week → month). */
  onZoomOut: () => void;
};

const SNAP_FRACTION = 1 / 3;
const FLICK_VELOCITY = 600;
const SNAP_TIMING = { duration: 240, easing: Easing.out(Easing.cubic) };
const SPRING_BACK = { damping: 20, stiffness: 220 };
/** Wheel scrolling this far (px) and then pausing turns the page; less springs back. */
const WHEEL_MIN_TURN = 50;
/** Wheel scrolling past this fraction of the page turns it right away. */
const WHEEL_COMMIT_FRACTION = 0.5;
/** A pause this long (ms) ends a wheel/trackpad gesture. */
const WHEEL_SETTLE_MS = 120;
/** Trackpad momentum keeps firing after a page turn; ignore it until the wheel is quiet this long (ms). */
const WHEEL_QUIET_MS = 250;

/**
 * Previous, current and next pages laid out in a row (or column). Dragging moves them with the
 * finger; letting go past a third of the page, or flicking, snaps to the neighbour. On web the
 * trackpad/mouse wheel moves them the same way and snaps when the scrolling pauses, so one
 * gesture turns one page. Pinch still zooms between Month/Week/Day.
 */
export function PagedCalendar({ axis, pageKey, pageKeys, renderPage, onNext, onPrev, onZoomIn, onZoomOut }: Props) {
  const [size, setSize] = useState(0);
  const offset = useSharedValue(0);
  const horizontal = axis === 'x';

  // The parent moved the centre page: the neighbour we slid to is now the centre, so start from 0.
  useLayoutEffect(() => {
    offset.set(0);
  }, [pageKey, offset]);

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onEnd((e) => {
      if (e.scale < 0.8) onZoomOut();
      else if (e.scale > 1.25) onZoomIn();
    });

  const basePan = Gesture.Pan().maxPointers(1);
  // Only claim drags along our axis, so the hour grid can still scroll vertically and taps still work.
  const pan = (
    horizontal
      ? basePan.activeOffsetX([-15, 15]).failOffsetY([-25, 25])
      : basePan.activeOffsetY([-15, 15]).failOffsetX([-25, 25])
  )
    .onUpdate((e) => {
      offset.set(horizontal ? e.translationX : e.translationY);
    })
    .onEnd((e) => {
      const moved = horizontal ? e.translationX : e.translationY;
      const velocity = horizontal ? e.velocityX : e.velocityY;
      const toNext = moved < -size * SNAP_FRACTION || velocity < -FLICK_VELOCITY;
      const toPrev = moved > size * SNAP_FRACTION || velocity > FLICK_VELOCITY;
      if (size > 0 && (toNext || toPrev)) {
        offset.set(
          withTiming(toNext ? -size : size, SNAP_TIMING, (finished) => {
            if (finished) scheduleOnRN(toNext ? onNext : onPrev);
          })
        );
      } else {
        offset.set(withSpring(0, SPRING_BACK));
      }
    });

  // Web: the wheel moves the pages like a drag would, then snaps once the scrolling pauses.
  const containerRef = useRef<View>(null);
  const wheel = useRef({
    settleTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    quietTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    /** Direction of the page turn in progress: 1 next, -1 previous, 0 none. */
    turning: 0 as -1 | 0 | 1,
    lastSize: 0,
    lastTime: 0,
  });
  const snapTo = useEffectEvent((toNext: boolean) => {
    wheel.current.turning = toNext ? 1 : -1;
    offset.set(
      withTiming(toNext ? -size : size, SNAP_TIMING, (finished) => {
        if (finished) scheduleOnRN(toNext ? onNext : onPrev);
      })
    );
  });
  const settleWheel = useEffectEvent(() => {
    const moved = offset.get();
    if (Math.abs(moved) >= WHEEL_MIN_TURN) snapTo(moved < 0);
    else offset.set(withSpring(0, SPRING_BACK));
  });
  // Setting the offset directly also cancels a page turn still animating (it then doesn't turn).
  const scrollBy = useEffectEvent((delta: number) => {
    const moved = Math.min(Math.max(offset.get() - delta, -size), size);
    offset.set(moved);
    if (Math.abs(moved) >= size * WHEEL_COMMIT_FRACTION) snapTo(moved < 0);
  });
  const turnFinished = useEffectEvent(() => offset.get() === 0);
  // A new swipe arrived before the page-turn animation ended: land that turn now.
  const finishTurnNow = useEffectEvent((direction: 1 | -1) => {
    offset.set(offset.get()); // stops the animation, so its own page change doesn't fire too
    if (direction === 1) onNext();
    else onPrev();
  });
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const state = wheel.current;
    const onWheel = (event: WheelEvent) => {
      // Week/Day only page on sideways scrolling; vertical wheel scrolls the hours.
      if (horizontal && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const delta = horizontal ? event.deltaX : event.deltaY;
      const direction = delta > 0 ? 1 : -1;
      const deltaSize = Math.abs(delta);
      const gap = event.timeStamp - state.lastTime;
      state.lastTime = event.timeStamp;

      if (state.turning !== 0) {
        // While a page turns, trackpad momentum keeps arriving in the same direction, steadily and with
        // shrinking steps; ignore it so one swipe can't skip two pages. Scrolling back the other way, or a
        // fresh swipe (steps growing again, or a wheel click after a pause) is the person scrolling.
        const reversed = direction !== state.turning;
        const freshSwipe = deltaSize > 8 && (deltaSize > state.lastSize * 1.5 || gap > 80);
        state.lastSize = deltaSize;
        if (!reversed && freshSwipe && !turnFinished()) {
          clearTimeout(state.quietTimer);
          state.turning = 0;
          finishTurnNow(direction);
          return;
        }
        if (!reversed && !freshSwipe) {
          clearTimeout(state.quietTimer);
          const unlockWhenTurned = () => {
            if (turnFinished()) state.turning = 0;
            else state.quietTimer = setTimeout(unlockWhenTurned, 50);
          };
          state.quietTimer = setTimeout(unlockWhenTurned, WHEEL_QUIET_MS);
          return;
        }
        clearTimeout(state.quietTimer);
        state.turning = 0;
      }
      state.lastSize = deltaSize;

      scrollBy(delta);
      clearTimeout(state.settleTimer);
      if (state.turning === 0) state.settleTimer = setTimeout(settleWheel, WHEEL_SETTLE_MS);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
      clearTimeout(state.settleTimer);
      clearTimeout(state.quietTimer);
    };
  }, [horizontal, offset]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(horizontal ? width : height);
  };

  const trackStyle = useAnimatedStyle(() =>
    horizontal ? { transform: [{ translateX: offset.get() }] } : { transform: [{ translateY: offset.get() }] }
  );

  return (
    <GestureDetector gesture={Gesture.Race(pinch, pan)}>
      <View ref={containerRef} style={styles.viewport} onLayout={onLayout}>
        {size > 0 && (
          <Animated.View style={[StyleSheet.absoluteFill, trackStyle]}>
            {([-1, 0, 1] as const).map((page, index) => (
              <View
                key={pageKeys[index]}
                // Neighbours are off-screen until dragged in; hide them from screen readers.
                importantForAccessibility={page === 0 ? 'auto' : 'no-hide-descendants'}
                accessibilityElementsHidden={page !== 0}
                style={[StyleSheet.absoluteFill, horizontal ? { left: page * size, right: -page * size } : { top: page * size, bottom: -page * size }]}>
                {renderPage(page)}
              </View>
            ))}
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ viewport: { flex: 1, overflow: 'hidden' } });
