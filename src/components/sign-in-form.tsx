import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithGoogle } from '@/lib/google';
import { supabase } from '@/lib/supabase';

/** Supabase's sign-in errors in plain words. */
function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/already registered|already exists/i.test(message)) return 'That email already has an account — sign in instead.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first (check your inbox), then sign in.';
  if (/password.*(at least|short|weak)/i.test(message)) return 'Use a longer password (at least 6 characters).';
  if (/valid email|invalid.*email/i.test(message)) return 'That doesn’t look like an email address.';
  if (/fetch|network|load failed/i.test(message)) return 'No internet connection — try again when you’re online.';
  if (/rate limit|too many/i.test(message)) return 'Too many tries — wait a minute and try again.';
  return message;
}

/** Google or email + password sign-in / sign-up (Account screen and onboarding). Calls `onSignedIn` when done. */
export function SignInForm({ onSignedIn }: { onSignedIn: () => void }) {
  const theme = useTheme();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Signs in or creates the account in one step, and turns on Google Calendar access.
  const google = async () => {
    setGoogleBusy(true);
    setMessage(null);
    const result = await signInWithGoogle();
    setGoogleBusy(false);
    // On the web the page has gone to Google; it comes back to /auth-callback.
    if (result.ok) {
      if (Platform.OS !== 'web') onSignedIn();
    } else if ('error' in result) setMessage({ text: friendly(result.error), error: true });
  };

  const submit = async () => {
    if (!supabase || busy) return;
    if (!email.trim() || !password) {
      setMessage({ text: 'Enter your email and a password.', error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    const credentials = { email: email.trim(), password };
    const { data, error } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
    setBusy(false);
    if (error) {
      setMessage({ text: friendly(error.message), error: true });
      return;
    }
    if (!data.session) {
      // Sign-up with "Confirm email" switched on in Supabase.
      setMessage({ text: 'Check your email to confirm your account, then sign in here.', error: false });
      setMode('signIn');
      return;
    }
    setPassword('');
    onSignedIn();
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{mode === 'signIn' ? 'Sign in' : 'Create your account'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Use the same account on your phone and computer to see one calendar everywhere. What’s already on this
        device is kept and added to your account.
      </ThemedText>
      <Button title="Continue with Google" variant="secondary" onPress={google} busy={googleBusy} />
      <ThemedText type="caption" themeColor="textSecondary" style={styles.or}>
        or use your email
      </ThemedText>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={theme.textSecondary}
        secureTextEntry
        autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
        textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
        onSubmitEditing={submit}
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      {message && (
        <ThemedText type="small" style={{ color: message.error ? theme.danger : theme.textSecondary }}>
          {message.text}
        </ThemedText>
      )}
      <Button title={mode === 'signIn' ? 'Sign in' : 'Create account'} onPress={submit} busy={busy} />
      <Pressable
        onPress={() => {
          setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          setMessage(null);
        }}
        hitSlop={6}>
        <ThemedText type="small" style={{ color: theme.accent }}>
          {mode === 'signIn' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  or: { textAlign: 'center' },
  input: { fontSize: 17, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.two },
});
