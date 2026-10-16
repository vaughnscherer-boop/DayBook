import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { SIGN_IN_FIRST } from '@/lib/server-api';
import { Radius } from '@/constants/theme';

/** An error line in red; "sign in first" errors also get a button that opens Account. */
export function ErrorText({ error }: { error: string }) {
  const theme = useTheme();
  const text = (
    <ThemedText type="small" style={[styles.flex, { color: theme.danger }]}>
      {error}
    </ThemedText>
  );
  if (!error.startsWith(SIGN_IN_FIRST)) return text;
  return (
    <View style={styles.row}>
      {text}
      <Pressable
        onPress={() => router.push('/account')}
        accessibilityRole="button"
        hitSlop={8}
        style={[styles.button, { borderColor: theme.text }]}>
        <ThemedText type="smallBold">Sign in</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flexShrink: 1 },
  button: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
});
