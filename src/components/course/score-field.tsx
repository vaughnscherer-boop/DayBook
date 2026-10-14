import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import { listCategories, setScore, type GradeCategory } from '@/db/grades';
import { useTheme } from '@/hooks/use-theme';
import { formatPercent, letter } from '@/lib/grades';

type Props = {
  table: 'events' | 'tasks';
  id: string;
  groupId: string;
  /** Called after a change, so the course's grade refreshes. */
  onChanged?: () => void;
};

const parse = (text: string): number | null => {
  const value = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null;
};

/**
 * Your score on an exam or assignment ("46 out of 50") and the grade category it counts in. It
 * saves as you go, separately from the rest of the form.
 */
export function ScoreField({ table, id, groupId, onChanged }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [categories, setCategories] = useState<GradeCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [score, setScoreText] = useState('');
  const [max, setMax] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listCategories(db),
      db.getFirstAsync<{ score: number | null; max_score: number | null; category_id: string | null }>(
        `SELECT score, max_score, category_id FROM ${table} WHERE id = ?`,
        id
      ),
    ]).then(([list, row]) => {
      if (cancelled) return;
      setCategories(list.filter((c) => c.group_id === groupId));
      setScoreText(row?.score != null ? String(row.score) : '');
      setMax(row?.max_score != null ? String(row.max_score) : '');
      setCategoryId(row?.category_id ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [db, table, id, groupId]);

  const save = async (changes: Parameters<typeof setScore>[3]) => {
    await setScore(db, table, id, changes);
    onChanged?.();
  };

  // Typing a score without a total assumes it's out of 100 (a percentage).
  const earned = parse(score);
  const possible = parse(max) ?? (earned !== null ? 100 : null);
  const percent = earned !== null && possible ? (earned / possible) * 100 : null;
  const commit = () => {
    const nextScore = parse(score);
    save({ score: nextScore, maxScore: nextScore === null ? null : (parse(max) ?? 100) });
  };

  if (!loaded) return null;
  const field = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        Score
      </ThemedText>
      <View style={styles.row}>
        <TextInput
          value={score}
          onChangeText={setScoreText}
          onBlur={commit}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Score"
          style={field}
        />
        <ThemedText type="small" themeColor="textSecondary">
          out of
        </ThemedText>
        <TextInput
          value={max}
          onChangeText={setMax}
          onBlur={commit}
          keyboardType="decimal-pad"
          placeholder="100"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Points possible"
          style={field}
        />
        {percent !== null && (
          <ThemedText type="smallBold">
            {formatPercent(percent)} · {letter(percent)}
          </ThemedText>
        )}
      </View>
      {categories.length > 0 && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Counts in
          </ThemedText>
          <View style={styles.chips}>
            <Chip
              label="Automatic"
              selected={categoryId === null}
              onPress={() => {
                setCategoryId(null);
                save({ categoryId: null });
              }}
            />
            {categories.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                selected={categoryId === category.id}
                onPress={() => {
                  setCategoryId(category.id);
                  save({ categoryId: category.id });
                }}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { width: 64, fontSize: 15, textAlign: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
