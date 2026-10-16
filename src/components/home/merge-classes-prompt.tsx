import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { mergeGroups, type Group } from '@/db/groups';
import { getSettings, setSetting } from '@/db/settings';
import type { CalendarItem } from '@/lib/calendar-items';
import { sameCourse } from '@/lib/grouping';
import { showToast } from '@/lib/toast';

const pairKey = (a: Group, b: Group) => [a.id, b.id].sort().join('|');

/**
 * "LAT 111 looks like the same class as Latin 111": shown above Home's classes when an import and
 * hand-added items made two groups for one course. Merging keeps the one with more coming up.
 */
export function MergeClassesPrompt({
  groups,
  upcoming,
  onChanged,
}: {
  groups: Group[];
  upcoming: CalendarItem[];
  onChanged: () => void;
}) {
  const db = useSQLiteContext();
  const [separate, setSeparate] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSettings(db).then((settings) => setSeparate(settings.separateClasses));
  }, [db]);
  if (!separate) return null;

  let pair: [Group, Group] | null = null;
  for (let i = 0; i < groups.length && !pair; i++) {
    for (let j = i + 1; j < groups.length && !pair; j++) {
      const [a, b] = [groups[i], groups[j]];
      if (sameCourse(a.name, b.name) && !separate.includes(pairKey(a, b))) pair = [a, b];
    }
  }
  if (!pair) return null;

  const count = (group: Group) => upcoming.filter((item) => item.groupId === group.id).length;
  const [keep, drop] = count(pair[0]) >= count(pair[1]) ? pair : [pair[1], pair[0]];

  const merge = async () => {
    setBusy(true);
    await mergeGroups(db, drop.id, keep.id);
    setBusy(false);
    showToast(`Merged “${drop.name}” into “${keep.name}”`);
    onChanged();
  };
  const notSame = async () => {
    const next = [...separate, pairKey(keep, drop)];
    setSeparate(next);
    await setSetting(db, 'separateClasses', next);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Same class?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        “{drop.name}” looks like “{keep.name}”. Merging puts everything from both in “{keep.name}”.
      </ThemedText>
      <View style={styles.buttons}>
        <Button title="Merge" onPress={merge} busy={busy} style={styles.flex} />
        <Pressable onPress={notSame} accessibilityRole="button" hitSlop={8} style={styles.notSame}>
          <ThemedText type="small" themeColor="textSecondary">
            They’re different
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.two },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
  notSame: { paddingHorizontal: Spacing.two },
});
