import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { createTerm, deleteTerm, endTerm, listTerms, reopenTerm, termName, updateTerm, type Term } from '@/db/terms';
import type { Group } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { addDays, formatDateKey, fromKey, todayKey, toDateKey } from '@/lib/dates';
import { parseBreaks, termRange } from '@/lib/terms';

type Props = { groups: Group[]; onChanged: () => void };

/** Settings → Terms: a semester's dates and breaks. Classes from a syllabus stop at the end and skip the breaks. */
export function TermsSection({ groups, onChanged }: Props) {
  const db = useSQLiteContext();
  const [terms, setTerms] = useState<Term[]>([]);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => listTerms(db).then(setTerms), [db]);
  useEffect(() => {
    load();
  }, [load]);

  const change = async (action: Promise<unknown>) => {
    await action;
    await load();
    onChanged();
  };

  const add = async () => {
    const start = todayKey();
    const id = await createTerm(db, {
      name: termName(start),
      starts_on: start,
      ends_on: toDateKey(addDays(fromKey(start), 105)),
    });
    setEditing(id);
    await load();
    onChanged();
  };

  return (
    <View style={styles.container}>
      {terms.length === 0 && <EmptyState text="No terms yet. Importing a syllabus adds one automatically." icon="calendar" />}
      {terms.map((term) => (
        <TermRow
          key={term.id}
          term={term}
          courses={groups.filter((g) => g.term_id === term.id)}
          editing={editing === term.id}
          onToggleEdit={() => setEditing(editing === term.id ? null : term.id)}
          onChange={change}
        />
      ))}
      <Button title="Add a term" variant="secondary" onPress={add} />
    </View>
  );
}

function TermRow({
  term,
  courses,
  editing,
  onToggleEdit,
  onChange,
}: {
  term: Term;
  courses: Group[];
  editing: boolean;
  onToggleEdit: () => void;
  onChange: (action: Promise<unknown>) => void;
}) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [name, setName] = useState(term.name);
  const breaks = parseBreaks(term.breaks);
  const ended = courses.length > 0 && courses.every((g) => g.archived === 1);

  const addBreak = () => {
    // A week-long break to start from, a few weeks into the term.
    const from = toDateKey(addDays(fromKey(term.starts_on), 49));
    const to = toDateKey(addDays(fromKey(from), 6));
    onChange(updateTerm(db, term.id, { breaks: [...breaks, { name: 'Break', from, to }] }));
  };
  const editBreak = (index: number, changes: Partial<(typeof breaks)[number]>) =>
    onChange(updateTerm(db, term.id, { breaks: breaks.map((b, i) => (i === index ? { ...b, ...changes } : b)) }));

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable onPress={onToggleEdit} style={styles.head} accessibilityRole="button" accessibilityLabel={`Term ${term.name}`}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{term.name}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {termRange(term)} · {courses.length} class{courses.length === 1 ? '' : 'es'}
            {breaks.length > 0 ? ` · ${breaks.length} break${breaks.length === 1 ? '' : 's'}` : ''}
            {ended ? ' · ended' : ''}
          </ThemedText>
        </View>
        <Icon name={editing ? 'collapse' : 'expand'} size={14} color={theme.textSecondary} />
      </Pressable>

      {editing && (
        <View style={styles.editor}>
          <TextInput
            value={name}
            onChangeText={setName}
            onBlur={() => name.trim() && name.trim() !== term.name && onChange(updateTerm(db, term.id, { name }))}
            placeholder="Term name"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <DateTimeField
            label="First day"
            mode="date"
            value={fromKey(term.starts_on)}
            onChange={(date) => onChange(updateTerm(db, term.id, { starts_on: toDateKey(date) }))}
          />
          <DateTimeField
            label="Last day"
            mode="date"
            value={fromKey(term.ends_on)}
            onChange={(date) => onChange(updateTerm(db, term.id, { ends_on: toDateKey(date) }))}
          />

          <ThemedText type="caption" themeColor="textSecondary">
            Breaks (classes skip these days)
          </ThemedText>
          {breaks.map((b, i) => (
            <View key={`${b.from}-${i}`} style={styles.breakBlock}>
              <View style={styles.head}>
                <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                  {b.name} · {formatDateKey(b.from)}
                  {b.to !== b.from ? ` – ${formatDateKey(b.to)}` : ''}
                </ThemedText>
                <Pressable
                  onPress={() => onChange(updateTerm(db, term.id, { breaks: breaks.filter((_, j) => j !== i) }))}
                  hitSlop={8}
                  accessibilityLabel={`Remove ${b.name}`}>
                  <Icon name="close" size={14} color={theme.textSecondary} />
                </Pressable>
              </View>
              <DateTimeField label="From" mode="date" value={fromKey(b.from)} onChange={(d) => editBreak(i, { from: toDateKey(d), to: b.to < toDateKey(d) ? toDateKey(d) : b.to })} />
              <DateTimeField label="Through" mode="date" value={fromKey(b.to)} onChange={(d) => editBreak(i, { to: toDateKey(d) < b.from ? b.from : toDateKey(d) })} />
            </View>
          ))}
          <Pressable onPress={addBreak} style={styles.head} accessibilityRole="button">
            <Icon name="add" size={16} color={theme.accent} />
            <ThemedText type="small" style={{ color: theme.accent }}>
              Add a break
            </ThemedText>
          </Pressable>

          <View style={styles.actions}>
            {courses.length > 0 &&
              (ended ? (
                <Pressable onPress={() => onChange(reopenTerm(db, term.id))} hitSlop={6}>
                  <ThemedText type="small" style={{ color: theme.accent }}>
                    Bring classes back
                  </ThemedText>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() =>
                    confirmDestructive(
                      `End “${term.name}”?`,
                      'Its classes leave Home. Their events and tasks stay on the calendar.',
                      'End term',
                      () => onChange(endTerm(db, term.id))
                    )
                  }
                  hitSlop={6}>
                  <ThemedText type="small" style={{ color: theme.accent }}>
                    End term
                  </ThemedText>
                </Pressable>
              ))}
            <Pressable
              onPress={() =>
                confirmDestructive(`Delete “${term.name}”?`, 'Its classes stay, just without a term.', 'Delete', () =>
                  onChange(deleteTerm(db, term.id))
                )
              }
              hitSlop={6}>
              <ThemedText type="small" style={{ color: theme.danger }}>
                Delete term
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  editor: { gap: Spacing.two },
  input: { fontSize: 15, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.one },
  breakBlock: { gap: Spacing.one, paddingLeft: Spacing.two },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
});
