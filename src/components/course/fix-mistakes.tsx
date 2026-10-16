import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui/error-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import type { CalendarEvent } from '@/db/events';
import { applyFixes, fixItemsOf } from '@/db/fixes';
import type { Group } from '@/db/groups';
import { savedCourseReads } from '@/db/imports';
import type { Task } from '@/db/tasks';
import { useTheme } from '@/hooks/use-theme';
import { fixClassOnServer } from '@/lib/class-tools-api';
import { formatDateKey, formatShortTime, todayKey } from '@/lib/dates';
import { MAX_FIX_DOCUMENTS, MAX_FIX_REQUEST, type FixChange, type FixItem, type FixPlan } from '@/lib/fix-format';
import { rescheduleAll } from '@/lib/notifications';

type Props = { group: Group; events: CalendarEvent[]; tasks: Task[]; onChanged: () => void };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon/Wed 2PM–3:15PM" for a series, "Thu, Oct 22 · 2PM" for a one-off. */
function when(item: Pick<FixItem, 'date' | 'start_time' | 'end_time' | 'weekdays'>): string {
  const time = item.start_time
    ? `${formatShortTime(item.start_time)}${item.end_time ? `–${formatShortTime(item.end_time)}` : ''}`
    : '';
  if (item.weekdays?.length) return `${item.weekdays.map((d) => WEEKDAYS[d]).join('/')}${time ? ` ${time}` : ''}`;
  return `${formatDateKey(item.date)}${time ? ` · ${time}` : ''}`;
}

/** What one proposed change does, as a line a student can check. */
function describe(change: FixChange, before: FixItem | undefined): { title: string; detail: string } {
  if (change.op === 'delete') return { title: `Remove “${before?.title ?? change.title}”`, detail: before ? when(before) : '' };
  if (change.op === 'add') return { title: `Add “${change.title}”`, detail: when(change) };
  const renamed = before && before.title !== change.title;
  const moved = before && when(before) !== when(change);
  return {
    title: renamed ? `Rename “${before.title}” → “${change.title}”` : `Change “${change.title}”`,
    detail: moved ? `${when(before)} → ${when(change)}` : when(change),
  };
}

/**
 * "Fix mistakes" for one class: say what's wrong ("I'm in Lab B, not Lab A"), Claude proposes
 * changes to the class's items, and you tick the ones to apply.
 */
export function FixMistakes({ group, events, tasks, onChanged }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<FixPlan | null>(null);
  const [ticks, setTicks] = useState<boolean[]>([]);
  const [items, setItems] = useState<FixItem[]>([]);
  const [noDocuments, setNoDocuments] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const ask = async () => {
    const text = request.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const current = fixItemsOf(group, events, tasks);
    // Newest reads first, dropping older ones that don't fit.
    const reads = (await savedCourseReads(db, group.id, group.name)).reverse();
    while (reads.length > 1 && JSON.stringify(reads).length > MAX_FIX_DOCUMENTS) reads.pop();
    const documents = reads.length && JSON.stringify(reads).length <= MAX_FIX_DOCUMENTS ? JSON.stringify(reads) : null;
    setNoDocuments(!documents);
    const result = await fixClassOnServer({ request: text, course: group.name, items: current, documents, today: todayKey() });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setItems(current);
    setPlan(result.plan);
    setTicks(result.plan.changes.map(() => true));
  };

  const reset = () => {
    setPlan(null);
    setTicks([]);
    setError(null);
  };

  const apply = async () => {
    if (!plan || busy) return;
    setBusy(true);
    const applied = await applyFixes(db, group, plan.changes.filter((_, i) => ticks[i]));
    setBusy(false);
    reset();
    setRequest('');
    onChanged();
    rescheduleAll(db);
    setDone(`Made ${applied} change${applied === 1 ? '' : 's'} to ${group.name}.`);
  };

  const byRef = new Map(items.map((item) => [item.ref, item]));
  const count = ticks.filter(Boolean).length;
  // Section mix-ups need the syllabus's other sections, which older imports didn't keep.
  const sectionHint = noDocuments && /\b(section|lab|sect|discussion|recitation)\b/i.test(request);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {!plan ? (
        <>
          {done && <ThemedText type="smallBold">{done}</ThemedText>}
          <ThemedText type="small" themeColor="textSecondary">
            Picked the wrong section, or something landed on the wrong day? Say what’s wrong and Claude suggests the fixes. Nothing
            changes until you apply them.
          </ThemedText>
          <TextInput
            value={request}
            onChangeText={setRequest}
            multiline
            maxLength={MAX_FIX_REQUEST}
            placeholder="e.g. I’m in Lab B, not Lab A · Quiz 3 is on Oct 22"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
          />
          <Button
            title={busy ? 'Looking…' : 'Find fixes'}
            variant="secondary"
            onPress={ask}
            disabled={request.trim().length < 3}
            busy={busy}
          />
        </>
      ) : (
        <>
          {plan.summary ? <ThemedText type="smallBold">{plan.summary}</ThemedText> : null}
          {plan.warnings.map((warning) => (
            <ThemedText key={warning} type="caption" themeColor="textSecondary">
              • {warning}
            </ThemedText>
          ))}
          {sectionHint && (
            <ThemedText type="caption" themeColor="textSecondary">
              • This class’s syllabus was imported before Daybook kept a copy. Re-import it (Documents → Add document) so Claude
              can see the other sections’ times.
            </ThemedText>
          )}
          {plan.changes.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              No changes to suggest. Try saying it another way.
            </ThemedText>
          )}
          {plan.changes.map((change, i) => {
            const { title, detail } = describe(change, change.ref ? byRef.get(change.ref) : undefined);
            return (
              <Pressable
                key={`${i}-${change.op}-${change.title}`}
                onPress={() => setTicks(ticks.map((t, j) => (j === i ? !t : t)))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ticks[i] }}
                style={styles.row}>
                <Icon name={ticks[i] ? 'checked' : 'unchecked'} size={20} color={ticks[i] ? group.color : theme.textSecondary} />
                <View style={styles.flex}>
                  <ThemedText type="small">{title}</ThemedText>
                  {detail ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      {detail}
                    </ThemedText>
                  ) : null}
                  {change.reason ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      {change.reason}
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          <View style={styles.buttons}>
            <Button title="Back" variant="secondary" onPress={reset} style={styles.flex} />
            <Button
              title={count === 0 ? 'Nothing selected' : `Apply ${count} change${count === 1 ? '' : 's'}`}
              onPress={apply}
              disabled={count === 0}
              busy={busy}
              style={styles.flex}
            />
          </View>
        </>
      )}
      {error && <ErrorText error={error} />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.two },
  flex: { flex: 1 },
  input: { minHeight: 64, maxHeight: 160, borderRadius: Radius.sm, padding: Spacing.two, fontSize: 15, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, paddingVertical: Spacing.one },
  buttons: { flexDirection: 'row', gap: Spacing.two },
});
