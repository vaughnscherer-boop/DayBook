import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Choice = { label: string; style?: 'default' | 'destructive' | 'cancel'; onPress?: () => void };
type Request = { title: string; message?: string; choices: Choice[] };

/**
 * A small in-app "pick one" dialog (e.g. "Only this event" / "All events"). Works the same on
 * phone and web, where the browser's confirm box only offers OK/Cancel.
 * Returns the dialog element to render and an `ask` function to open it.
 */
export function useChoiceDialog(): [ReactNode, (title: string, message: string | undefined, choices: Choice[]) => void] {
  const theme = useTheme();
  const [request, setRequest] = useState<Request | null>(null);

  const ask = (title: string, message: string | undefined, choices: Choice[]) => setRequest({ title, message, choices });
  const close = () => setRequest(null);

  const dialog = (
    <Modal visible={request !== null} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable onPress={() => {}}>
          <ThemedView style={[styles.card, { borderColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold" style={styles.title}>
              {request?.title}
            </ThemedText>
            {request?.message && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
                {request.message}
              </ThemedText>
            )}
            {request?.choices.map((choice) => (
              <Pressable
                key={choice.label}
                onPress={() => {
                  close();
                  choice.onPress?.();
                }}
                style={[styles.button, { borderColor: theme.backgroundSelected }]}>
                <ThemedText
                  style={{
                    color: choice.style === 'destructive' ? theme.danger : choice.style === 'cancel' ? theme.textSecondary : theme.accent,
                    fontWeight: choice.style === 'cancel' ? '400' : '600',
                  }}>
                  {choice.label}
                </ThemedText>
              </Pressable>
            ))}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return [dialog, ask];
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: 300,
    maxWidth: '100%',
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.four,
    overflow: 'hidden',
  },
  title: { textAlign: 'center', fontSize: 16, paddingHorizontal: Spacing.four },
  message: { textAlign: 'center', paddingHorizontal: Spacing.four, paddingTop: Spacing.one },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.two,
  },
});
