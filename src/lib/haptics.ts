import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Builds made before expo-haptics was added reject these calls; taps just stay silent there.
const enabled = Platform.OS !== 'web';

/** A light tap: ticking a task, switching views. */
export function tap() {
  if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A selection tick: snapping to the next page. */
export function tick() {
  if (enabled) Haptics.selectionAsync().catch(() => {});
}
