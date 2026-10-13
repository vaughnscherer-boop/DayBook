import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

/** Quiet placeholder for an empty list: a small symbol and a line of text. */
export function EmptyState({ text, icon = 'empty' }: { text: string; icon?: IconName }) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <Icon name={icon} size={18} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  text: { flex: 1, fontStyle: 'italic' },
});
