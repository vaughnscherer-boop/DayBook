import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { createCategory, deleteCategory, updateCategory, type GradeCategory } from '@/db/grades';
import type { Group } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { formatPercent, letter, neededOn, type CourseGrade, type GradeItem } from '@/lib/grades';

type Props = {
  group: Group;
  categories: GradeCategory[];
  items: GradeItem[];
  result: CourseGrade | undefined;
  onChanged: () => void;
};

/** A course's running grade, its weighted categories (editable), and the "what do I need?" calculator. */
export function GradeCard({ group, categories, items, result, onChanged }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);

  const change = async (action: Promise<unknown>) => {
    await action;
    onChanged();
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.head}>
        {result?.percent != null ? (
          <View style={styles.flex}>
            <View style={styles.big}>
              <ThemedText style={styles.percent}>{formatPercent(result.percent)}</ThemedText>
              <ThemedText style={[styles.letter, { color: group.color }]}>{letter(result.percent)}</ThemedText>
            </View>
            <ThemedText type="caption" themeColor="textSecondary">
              Counting the work you’ve scored so far
            </ThemedText>
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {categories.length === 0
              ? 'Add how this class is graded to see your grade. A syllabus import fills it in.'
              : 'No scores yet. Open an exam or assignment and enter your score.'}
          </ThemedText>
        )}
        <Pressable onPress={() => setEditing(!editing)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit grading">
          <ThemedText type="small" style={{ color: theme.accent }}>
            {editing ? 'Done' : categories.length ? 'Edit' : 'Set up'}
          </ThemedText>
        </Pressable>
      </View>

      {!editing &&
        result?.categories.map(({ category, percent, scored, total }) => (
          <View key={category.id} style={styles.line}>
            <ThemedText type="small" numberOfLines={1} style={styles.flex}>
              {category.name}
              <ThemedText type="small" themeColor="textSecondary">
                {'  '}
                {category.weight}%
                {category.drop_lowest > 0 ? ` · drops ${category.drop_lowest}` : ''}
              </ThemedText>
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {scored}/{total}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.value}>
              {percent === null ? '—' : formatPercent(percent)}
            </ThemedText>
          </View>
        ))}
      {!editing && result && result.uncategorized > 0 && (
        <ThemedText type="caption" themeColor="textSecondary">
          {result.uncategorized} scored item{result.uncategorized === 1 ? '' : 's'} fit no category. Pick one on the item.
        </ThemedText>
      )}

      {editing && (
        <View style={styles.editor}>
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              onSave={(changes) => change(updateCategory(db, category.id, changes))}
              onDelete={() =>
                confirmDestructive(`Remove “${category.name}”?`, 'Its items stay; they just stop counting here.', 'Remove', () =>
                  change(deleteCategory(db, category.id))
                )
              }
            />
          ))}
          <ThemedText type="caption" style={{ color: Math.abs(totalWeight - 100) < 0.01 || categories.length === 0 ? theme.textSecondary : theme.danger }}>
            Weights add up to {Math.round(totalWeight * 10) / 10}%
            {Math.abs(totalWeight - 100) < 0.01 || categories.length === 0 ? '' : ' (usually 100%)'}
          </ThemedText>
          <Pressable
            onPress={() => change(createCategory(db, { groupId: group.id, name: 'New category', weight: 0 }))}
            style={styles.line}
            accessibilityRole="button">
            <Icon name="add" size={16} color={theme.accent} />
            <ThemedText type="small" style={{ color: theme.accent }}>
              Add a category
            </ThemedText>
          </Pressable>
        </View>
      )}

      {!editing && categories.length > 0 && <Calculator categories={categories} items={items} />}
    </ThemedView>
  );
}

function CategoryRow({
  category,
  onSave,
  onDelete,
}: {
  category: GradeCategory;
  onSave: (changes: Partial<{ name: string; weight: number; dropLowest: number }>) => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState(category.name);
  const [weight, setWeight] = useState(String(category.weight));
  const [drop, setDrop] = useState(String(category.drop_lowest));
  const input = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];
  return (
    <View style={styles.categoryRow}>
      <TextInput
        value={name}
        onChangeText={setName}
        onBlur={() => name.trim() && name.trim() !== category.name && onSave({ name })}
        placeholder="Name"
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="Category name"
        style={[input, styles.flex]}
      />
      <TextInput
        value={weight}
        onChangeText={setWeight}
        onBlur={() => Number(weight) !== category.weight && Number.isFinite(Number(weight)) && onSave({ weight: Number(weight) })}
        keyboardType="decimal-pad"
        accessibilityLabel={`${category.name} weight percent`}
        style={[input, styles.number]}
      />
      <ThemedText type="small" themeColor="textSecondary">
        %
      </ThemedText>
      <TextInput
        value={drop}
        onChangeText={setDrop}
        onBlur={() => Number(drop) !== category.drop_lowest && Number.isFinite(Number(drop)) && onSave({ dropLowest: Number(drop) })}
        keyboardType="number-pad"
        accessibilityLabel={`${category.name} lowest scores dropped`}
        style={[input, styles.number]}
      />
      <ThemedText type="caption" themeColor="textSecondary">
        drop
      </ThemedText>
      <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel={`Remove ${category.name}`}>
        <Icon name="close" size={14} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

/** "What do I need on the final?": pick a category with work still to do and a target grade. */
function Calculator({ categories, items }: { categories: GradeCategory[]; items: GradeItem[] }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('90');
  const [picked, setPicked] = useState<string | null>(null);

  // Categories that still have something ungraded in them.
  const options = categories.filter((c) => neededOn(categories, items, c.id, 90) !== null);
  if (options.length === 0) return null;
  const categoryId = picked && options.some((c) => c.id === picked) ? picked : options[options.length - 1].id;
  const goal = Number(target);
  const answer = Number.isFinite(goal) && goal > 0 ? neededOn(categories, items, categoryId, goal) : null;

  if (!open) {
    return (
      <Button title="What do I need?" variant="secondary" onPress={() => setOpen(true)} />
    );
  }
  return (
    <View style={styles.calc}>
      <View style={styles.line}>
        <ThemedText type="small" themeColor="textSecondary">
          I want
        </ThemedText>
        <TextInput
          value={target}
          onChangeText={setTarget}
          keyboardType="decimal-pad"
          accessibilityLabel="Target grade percent"
          style={[styles.input, styles.number, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          % overall. On the rest of:
        </ThemedText>
      </View>
      <View style={styles.chips}>
        {options.map((c) => (
          <Chip key={c.id} label={c.name} selected={c.id === categoryId} onPress={() => setPicked(c.id)} />
        ))}
      </View>
      {answer && (
        <ThemedText>
          {answer.needed <= 0
            ? 'You’re already there: any score keeps you at or above it.'
            : answer.reachable
              ? `You need about ${formatPercent(answer.needed)} on it.`
              : `That would take ${formatPercent(answer.needed)}, which is out of reach with the grades you have now.`}
        </ThemedText>
      )}
      <ThemedText type="caption" themeColor="textSecondary">
        Other categories stay as they are today. Dropped scores aren’t counted in this estimate.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  flex: { flex: 1 },
  big: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  percent: { fontSize: 32, lineHeight: 38, fontWeight: 800, letterSpacing: -0.5 },
  letter: { fontSize: 22, lineHeight: 28, fontWeight: 800 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  value: { minWidth: 56, textAlign: 'right' },
  editor: { gap: Spacing.two },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { fontSize: 15, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.one },
  number: { width: 44, textAlign: 'center' },
  calc: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
