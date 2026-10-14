import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { GroupList } from '@/components/group-list';
import { ThemedView } from '@/components/themed-view';
import { CloseButton, closeModal } from '@/components/ui/close-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spacing } from '@/constants/theme';
import { useCalendarData } from '@/hooks/use-calendar-data';

/** Rename, recolor, reshade or merge one class or group (⋯ → Edit on Home). */
export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { groups, reload } = useCalendarData();
  const group = groups.find((g) => g.id === id);

  // Merged or deleted from here: there's nothing left to edit, so close.
  const seen = useRef(false);
  useEffect(() => {
    if (group) seen.current = true;
    else if (seen.current) closeModal();
  }, [group]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerRight: () => <CloseButton /> }} />
      <ScrollView contentContainerStyle={styles.content}>
        {group ? (
          <GroupList
            groups={groups.filter((g) => g.calendar_id === group.calendar_id)}
            focusId={group.id}
            onChanged={reload}
          />
        ) : (
          <EmptyState text="This class no longer exists." />
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three },
});
