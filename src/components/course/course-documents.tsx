import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { listGroupImports, undoImport, type ImportRecord } from '@/db/imports';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { rescheduleAll } from '@/lib/notifications';

type Props = { groupId: string; onChanged: () => void };

/** The syllabi and pages imported into one class, each undoable, and "Add document" for more. */
export function CourseDocuments({ groupId, onChanged }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [imports, setImports] = useState<ImportRecord[]>([]);

  const load = useCallback(() => listGroupImports(db, groupId).then(setImports), [db, groupId]);
  // Back from the import screen with a new document.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const undo = (record: ImportRecord) =>
    confirmDestructive(`Undo “${record.title}”?`, 'Everything this import added will be removed.', 'Undo import', async () => {
      await undoImport(db, record.id);
      rescheduleAll(db);
      await load();
      onChanged();
    });

  return (
    <View style={styles.list}>
      {imports.map((record) => (
        <ThemedView key={record.id} type="backgroundElement" style={styles.row}>
          <View style={styles.flex}>
            <ThemedText type="small">{record.title}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {new Date(record.created_at).toLocaleDateString()}
              {record.file_name ? ` · ${record.file_name}` : ''}
            </ThemedText>
          </View>
          <Pressable onPress={() => undo(record)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Undo ${record.title}`}>
            <ThemedText type="small" style={{ color: theme.danger }}>
              Undo
            </ThemedText>
          </Pressable>
        </ThemedView>
      ))}
      <Button
        title={imports.length ? 'Add another document' : 'Add a syllabus or document'}
        variant="secondary"
        onPress={() => router.push({ pathname: '/import', params: { groupId } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Spacing.two, padding: Spacing.two },
  flex: { flex: 1 },
});
