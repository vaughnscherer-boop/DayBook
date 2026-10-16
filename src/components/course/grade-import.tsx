import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui/error-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { itemTypeOf } from '@/db/calendars';
import type { CalendarEvent } from '@/db/events';
import { createCategory, setScore, type GradeCategory } from '@/db/grades';
import type { Group } from '@/db/groups';
import { createTask, setTaskDone, type Task } from '@/db/tasks';
import { useTheme } from '@/hooks/use-theme';
import { readGradesOnServer } from '@/lib/class-tools-api';
import { formatDateKey, todayKey } from '@/lib/dates';
import type { GradeRead, GradeTarget } from '@/lib/grade-import-format';
import { formatPercent } from '@/lib/grades';
import { pickScheduleFile, type PickedFile } from '@/lib/pick-schedule';
import { MAX_IMPORT_TEXT, TEXT_IMPORT } from '@/lib/schedule-format';

type Props = {
  group: Group;
  categories: GradeCategory[];
  events: CalendarEvent[];
  tasks: Task[];
  /** Daybook's own running grade, to compare with the school's. */
  percent: number | null;
  onChanged: () => void;
};

type Target = GradeTarget & { table: 'events' | 'tasks'; id: string };

/** The class's exams and assignments (and anything already scored) that a grade row could fill in. */
function targetsOf(group: Group, events: CalendarEvent[], tasks: Task[]): Target[] {
  const toTarget = (table: 'events' | 'tasks') => (row: CalendarEvent | Task): Target[] => {
    if (row.group_id !== group.id || row.repeat !== null) return [];
    const itemType = itemTypeOf(row, table === 'events' ? 'event' : 'task', group);
    if (row.score === null && itemType !== 'exam' && itemType !== 'assignment') return [];
    const date = 'date' in row ? row.date : row.starts_at.slice(0, 10);
    return [{ ref: `${table[0]}:${row.id}`, table, id: row.id, title: row.title, date, item_type: itemType, max: row.max_score }];
  };
  return [...events.flatMap(toTarget('events')), ...tasks.flatMap(toTarget('tasks'))];
}

/**
 * "Import grades from your school site": paste the grades page (or pick a screenshot/PDF of it),
 * Claude matches each score to this class's exams and assignments, and you tick what to save.
 */
export function GradeImport({ group, categories, events, tasks, percent, onChanged }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<GradeRead | null>(null);
  const [ticks, setTicks] = useState<boolean[]>([]);
  const [setUpGrading, setSetUpGrading] = useState(true);
  const [done, setDone] = useState<string | null>(null);
  const targets = targetsOf(group, events, tasks);

  const ask = async (file: Pick<PickedFile, 'mediaType' | 'data'>) => {
    setReading(true);
    setError(null);
    const result = await readGradesOnServer({
      ...file,
      course: group.name,
      items: targets.map(({ ref, title, date, item_type, max }) => ({ ref, title, date, item_type, max })),
      categories: categories.map((c) => c.name),
      today: todayKey(),
    });
    setReading(false);
    if (!result.ok) return setError(result.error);
    if (result.read.grades.length === 0) return setError('No scores found there — copy the page that lists your graded work.');
    setRead(result.read);
    setTicks(result.read.grades.map(() => true));
  };

  const pick = async () => {
    const picked = await pickScheduleFile();
    if (picked.kind === 'error') setError(picked.message);
    if (picked.kind === 'picked') await ask(picked.file);
  };

  const readPasted = () => {
    const text = pasted.trim();
    if (text.length > MAX_IMPORT_TEXT) return setError('That’s too much text — paste just the grades table.');
    return ask({ mediaType: TEXT_IMPORT, data: text });
  };

  const reset = () => {
    setRead(null);
    setTicks([]);
    setPasted('');
    setError(null);
  };

  const save = async () => {
    if (!read || saving) return;
    setSaving(true);
    const byRef = new Map(targets.map((t) => [t.ref, t]));
    let saved = 0;
    await db.withTransactionAsync(async () => {
      // The page's weights become the class's grading when it has none yet.
      const categoryIds = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
      if (categories.length === 0 && setUpGrading) {
        for (const line of read.categories) {
          categoryIds.set(line.name.trim().toLowerCase(), await createCategory(db, { groupId: group.id, name: line.name, weight: line.weight }));
        }
      }
      for (const [i, grade] of read.grades.entries()) {
        if (!ticks[i]) continue;
        const categoryId = grade.category ? categoryIds.get(grade.category.trim().toLowerCase()) : undefined;
        const target = grade.ref ? byRef.get(grade.ref) : undefined;
        if (target) {
          await setScore(db, target.table, target.id, { score: grade.score, maxScore: grade.max ?? target.max ?? null, categoryId });
          // A graded task is a finished one.
          if (target.table === 'tasks') await setTaskDone(db, target.id, true);
        } else {
          const id = await createTask(db, {
            title: grade.title,
            date: grade.date ?? todayKey(),
            calendar_id: group.calendar_id,
            item_type: grade.kind,
            group: { groupId: group.id },
          });
          await setTaskDone(db, id, true);
          await setScore(db, 'tasks', id, { score: grade.score, maxScore: grade.max, categoryId });
        }
        saved++;
      }
    });
    setSaving(false);
    reset();
    setOpen(false);
    onChanged();
    setDone(`Saved ${saved} grade${saved === 1 ? '' : 's'} from your school site.`);
  };

  if (!open) {
    return (
      <View style={styles.closed}>
        {done && (
          <ThemedText type="small" themeColor="textSecondary">
            {done}
          </ThemedText>
        )}
        <Button
          title="Import grades from your school site"
          variant="secondary"
          onPress={() => {
            setDone(null);
            setOpen(true);
          }}
        />
      </View>
    );
  }

  const titleOf = (ref: string | null) => targets.find((t) => t.ref === ref)?.title;
  const count = ticks.filter(Boolean).length;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.flex}>
          Import grades
        </ThemedText>
        <Pressable
          onPress={() => {
            reset();
            setOpen(false);
          }}
          hitSlop={8}
          accessibilityRole="button">
          <ThemedText type="small" style={{ color: theme.accent }}>
            Cancel
          </ThemedText>
        </Pressable>
      </View>

      {reading ? (
        <View style={styles.reading}>
          <ActivityIndicator color={theme.accent} />
          <ThemedText type="small" themeColor="textSecondary">
            Reading your grades… this takes up to a minute.
          </ThemedText>
        </View>
      ) : !read ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            On your school site, open this class’s Grades page, select all, copy, and paste it here. Or pick a screenshot or
            PDF of it.
          </ThemedText>
          <TextInput
            value={pasted}
            onChangeText={setPasted}
            multiline
            placeholder="Paste the grades page…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.paste, { color: theme.text, backgroundColor: theme.background }]}
          />
          <View style={styles.buttons}>
            <Button title="Read grades" onPress={readPasted} disabled={pasted.trim().length < 20} style={styles.flex} />
            <Button title="Choose file…" variant="secondary" onPress={pick} style={styles.flex} />
          </View>
        </>
      ) : (
        <>
          {read.overall_percent !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              Your school site says {formatPercent(read.overall_percent)}
              {percent !== null ? ` · Daybook has ${formatPercent(percent)} so far` : ''}
            </ThemedText>
          )}
          {read.warnings.map((warning) => (
            <ThemedText key={warning} type="caption" themeColor="textSecondary">
              • {warning}
            </ThemedText>
          ))}
          {read.grades.map((grade, i) => {
            const matched = titleOf(grade.ref);
            return (
              <Pressable
                key={`${i}-${grade.title}`}
                onPress={() => setTicks(ticks.map((t, j) => (j === i ? !t : t)))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ticks[i] }}
                style={styles.row}>
                <Icon name={ticks[i] ? 'checked' : 'unchecked'} size={20} color={ticks[i] ? group.color : theme.textSecondary} />
                <View style={styles.flex}>
                  <ThemedText type="small" numberOfLines={1}>
                    {matched ?? grade.title}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                    {matched ? (matched === grade.title ? 'On your calendar' : `“${grade.title}” on the site`) : 'New item'}
                    {grade.category ? ` · ${grade.category}` : ''}
                    {!matched && grade.date ? ` · ${formatDateKey(grade.date)}` : ''}
                  </ThemedText>
                </View>
                <ThemedText type="smallBold">
                  {grade.score}
                  {grade.max !== null ? `/${grade.max}` : ''}
                </ThemedText>
              </Pressable>
            );
          })}
          {categories.length === 0 && read.categories.length > 0 && (
            <Pressable
              onPress={() => setSetUpGrading(!setUpGrading)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: setUpGrading }}
              style={styles.row}>
              <Icon name={setUpGrading ? 'checked' : 'unchecked'} size={20} color={setUpGrading ? group.color : theme.textSecondary} />
              <ThemedText type="small" style={styles.flex}>
                Also set up grading: {read.categories.map((c) => `${c.name} ${c.weight}%`).join(', ')}
              </ThemedText>
            </Pressable>
          )}
          <Button
            title={count === 0 ? 'Nothing selected' : `Save ${count} grade${count === 1 ? '' : 's'}`}
            onPress={save}
            disabled={count === 0}
            busy={saving}
          />
        </>
      )}

      {error && <ErrorText error={error} />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  closed: { gap: Spacing.two },
  reading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  paste: { minHeight: 100, maxHeight: 220, borderRadius: Radius.sm, padding: Spacing.two, fontSize: 15, textAlignVertical: 'top' },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
});
