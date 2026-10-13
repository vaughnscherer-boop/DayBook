import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { completeGoogleSignIn } from '@/lib/google';

/** Where Google sends you back after "Continue with Google" (on the web, and deep links on the phone). */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const query = new URLSearchParams(
      Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
    completeGoogleSignIn(`daybook://auth-callback?${query}`).then((result) => {
      if (result.ok) router.replace('/settings');
      else if ('error' in result) setError(result.error);
      else router.replace('/');
    });
  }, [params]);

  return (
    <ThemedView style={styles.container}>
      {error ? (
        <>
          <ThemedText type="smallBold">Google sign-in didn’t finish</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {error}
          </ThemedText>
          <Button title="Back to Daybook" onPress={() => router.replace('/')} />
        </>
      ) : (
        <>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Signing you in with Google…
          </ThemedText>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  center: { textAlign: 'center' },
});
