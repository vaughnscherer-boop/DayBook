import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type Props = {
  details: string;
  /** The course group's name, e.g. "LAT 111". */
  course: string | null;
  color: string;
};

/** What the imported syllabus says about this homework/exam: read-only, apart from your notes. */
export function SyllabusDetails({ details, course, color }: Props) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={[styles.accent, { backgroundColor: color }]} />
      <View style={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          From your syllabus{course ? ` · ${course}` : ''}
        </ThemedText>
        <ThemedText>{details}</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, flexDirection: 'row', overflow: 'hidden' },
  accent: { width: 4 },
  body: { flex: 1, padding: Spacing.three, gap: Spacing.one },
});
