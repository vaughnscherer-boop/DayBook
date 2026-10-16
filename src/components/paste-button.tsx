import { ClipboardPasteButton, isPasteButtonAvailable } from 'expo-clipboard';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * iOS's own Paste button (no "allow paste?" prompt). Kept in its own file and loaded only on builds
 * that include expo-clipboard's native code.
 */
export default function PasteButton({ onPaste }: { onPaste: (text: string) => void }) {
  const theme = useTheme();
  if (!isPasteButtonAvailable) return null;
  return (
    <ClipboardPasteButton
      acceptedContentTypes={['plain-text']}
      displayMode="iconAndLabel"
      cornerStyle="capsule"
      backgroundColor={theme.accent}
      foregroundColor={theme.onAccent}
      onPress={(data) => {
        if (data.type === 'text' && data.text.trim()) onPaste(data.text);
      }}
      style={styles.button}
    />
  );
}

const styles = StyleSheet.create({
  button: { width: 100, height: 36 },
});
