import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useRef } from 'react';

import { confirmDestructive } from '@/lib/confirm';

/**
 * While `dirty`, leaving the screen (Cancel, swiping the sheet down, the back arrow) asks before
 * throwing the changes away. Call the returned function just before leaving on purpose (after saving
 * or deleting) so that doesn't ask.
 */
export function useConfirmDiscard(dirty: boolean) {
  const navigation = useNavigation();
  const leaving = useRef(false);
  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) {
      navigation.dispatch(data.action);
      return;
    }
    confirmDestructive('Discard changes?', 'What you changed here won’t be saved.', 'Discard', () =>
      navigation.dispatch(data.action)
    );
  });
  return () => {
    leaving.current = true;
  };
}
