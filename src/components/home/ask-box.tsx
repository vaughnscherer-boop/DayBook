import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ErrorText } from '@/components/ui/error-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { createEvent, deleteEvent } from '@/db/events';
import type { Group } from '@/db/groups';
import { createTask, deleteTask, setTaskDone } from '@/db/tasks';
import { useTheme } from '@/hooks/use-theme';
import { askDaybook } from '@/lib/ask-api';
import { MAX_ITEMS, MAX_QUESTION, type AskChange, type AskItem } from '@/lib/ask-format';
import type { CalendarItem } from '@/lib/calendar-items';
import { notifyDataChanged } from '@/lib/data-events';
import { formatDateKey, formatShortTime, shiftKey, toDateTimeKey } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';
import { showToast } from '@/lib/toast';

type Props = { items: CalendarItem[]; groups: Group[]; today: string };

const EXAMPLES = ['When’s my next test?', 'What’s due this week?', 'Move my overdue homework to tomorrow'];

/** What a proposed change will do, in words. */
function describe(change: AskChange): string {
  const when = change.date ? `${formatDateKey(change.date)}${change.time ? `, ${formatShortTime(change.time)}` : ''}` : '';
  if (change.op === 'move') return `Move “${change.title}” to ${when}`;
  if (change.op === 'done') return `Mark “${change.title}” done`;
  if (change.op === 'delete') return `Delete “${change.title}”`;
  return `Add ${change.kind === 'task' ? 'task' : 'event'} “${change.title}” on ${when}`;
}

/**
 * "Ask Daybook" on Home: a question about your schedule ("when's my next Latin quiz?") gets a short
 * answer from Claude; a request ("move my bio homework a day earlier") comes back as changes you check
 * over and apply.
 */
export function AskBox({ items, groups, today }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ text: string; changes: AskChange[] } | null>(null);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null;

  const ask = async (text = question) => {
    if (!text.trim() || busy) return;
    setQuestion(text);
    setBusy(true);
    setError(null);
    setAnswer(null);
    const now = new Date();
    const askItems: AskItem[] = items
      .filter((item) => item.startDay >= shiftKey(today, -14) && item.startDay <= shiftKey(today, 60))
      .slice(0, MAX_ITEMS)
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        date: item.startDay,
        time: item.time,
        end: item.endsAt ? item.endsAt.slice(11, 16) : null,
        class: groupName(item.groupId),
        type: item.itemType,
        done: item.done,
        repeating: item.repeating,
        details: item.details,
      }));
    const result = await askDaybook({ question: text.trim(), today, now: toDateTimeKey(now).slice(11, 16), items: askItems });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAnswer({ text: result.answer, changes: result.changes });
    setKept(new Set(result.changes.map((_, i) => i)));
  };

  const apply = async () => {
    if (!answer || applying) return;
    setApplying(true);
    const byId = new Map(items.map((item) => [item.id, item]));
    const chosen = answer.changes.filter((_, i) => kept.has(i));
    for (const change of chosen) {
      const item = change.id ? byId.get(change.id) : undefined;
      const now = new Date().toISOString();
      if (change.op === 'done' && item) await setTaskDone(db, item.id, true);
      if (change.op === 'delete' && item) await (item.kind === 'task' ? deleteTask(db, item.id) : deleteEvent(db, item.id));
      if (change.op === 'move' && item && change.date) {
        if (item.kind === 'task') {
          await db.runAsync('UPDATE tasks SET date = ?, time = ?, updated_at = ? WHERE id = ?', change.date, change.time, now, item.id);
        } else if (item.startsAt && item.endsAt) {
          const length = new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime();
          const start = `${change.date}T${change.time ?? item.startsAt.slice(11, 16)}`;
          const end = toDateTimeKey(new Date(new Date(start).getTime() + length));
          await db.runAsync('UPDATE events SET starts_at = ?, ends_at = ?, updated_at = ? WHERE id = ?', start, end, now, item.id);
        }
      }
      if (change.op === 'add' && change.date) {
        const group = groups.find((g) => g.name === change.class);
        if (change.kind === 'task') {
          await createTask(db, {
            title: change.title,
            date: change.date,
            time: change.time,
            calendar_id: group?.calendar_id ?? null,
            group: group ? { groupId: group.id } : undefined,
          });
        } else {
          const start = `${change.date}T${change.time ?? '09:00'}`;
          await createEvent(db, {
            title: change.title,
            starts_at: start,
            ends_at: toDateTimeKey(new Date(new Date(start).getTime() + 60 * 60 * 1000)),
            all_day: !change.time,
            calendar_id: group?.calendar_id ?? null,
            group: group ? { groupId: group.id } : undefined,
          });
        }
      }
    }
    setApplying(false);
    setAnswer(null);
    setQuestion('');
    notifyDataChanged();
    rescheduleAll(db);
    showToast(`Made ${chosen.length} change${chosen.length === 1 ? '' : 's'}`);
  };

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="sparkles" size={16} color={theme.textSecondary} />
        <ThemedText themeColor="textSecondary">Ask Daybook…</ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.inputRow}>
        <Icon name="sparkles" size={16} color={theme.textSecondary} />
        <TextInput
          value={question}
          onChangeText={setQuestion}
          onSubmitEditing={() => ask()}
          placeholder="Ask about your schedule"
          placeholderTextColor={theme.textSecondary}
          maxLength={MAX_QUESTION}
          returnKeyType="send"
          autoFocus
          style={[styles.input, { color: theme.text }]}
        />
        {busy ? (
          <ActivityIndicator color={theme.textSecondary} />
        ) : (
          <Pressable
            onPress={() => ask()}
            disabled={!question.trim()}
            accessibilityRole="button"
            accessibilityLabel="Ask"
            hitSlop={8}
            style={[styles.send, { backgroundColor: theme.accent, opacity: question.trim() ? 1 : 0.35 }]}>
            <Icon name="send" size={16} weight="bold" color={theme.onAccent} fixed />
          </Pressable>
        )}
      </View>

      {!answer && !busy && !error && (
        <View style={styles.examples}>
          {EXAMPLES.map((example) => (
            <Pressable key={example} onPress={() => ask(example)} accessibilityRole="button" hitSlop={4}>
              <ThemedText type="small" themeColor="textSecondary">
                {example}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      {error && <ErrorText error={error} />}

      {answer && (
        <View style={styles.answer}>
          <ThemedText>{answer.text}</ThemedText>
          {answer.changes.map((change, i) => {
            const on = kept.has(i);
            return (
              <Pressable
                key={i}
                onPress={() => setKept((current) => {
                  const next = new Set(current);
                  if (on) next.delete(i);
                  else next.add(i);
                  return next;
                })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={styles.change}>
                <Icon name={on ? 'checked' : 'unchecked'} size={20} color={on ? theme.accent : theme.textSecondary} />
                <ThemedText type="small" style={styles.flex}>
                  {describe(change)}
                </ThemedText>
              </Pressable>
            );
          })}
          {answer.changes.length > 0 && (
            <Button
              title={kept.size ? `Apply ${kept.size} change${kept.size === 1 ? '' : 's'}` : 'Nothing selected'}
              onPress={apply}
              disabled={kept.size === 0}
              busy={applying}
            />
          )}
        </View>
      )}

      <Pressable
        onPress={() => {
          setOpen(false);
          setAnswer(null);
          setError(null);
          setQuestion('');
        }}
        accessibilityRole="button"
        hitSlop={8}
        style={styles.close}>
        <ThemedText type="small" themeColor="textSecondary">
          Close
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
  },
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.twoHalf },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { flex: 1, fontSize: 16, minHeight: 36 },
  send: { width: 32, height: 32, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  examples: { gap: Spacing.two },
  answer: { gap: Spacing.twoHalf },
  change: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 32 },
  flex: { flex: 1 },
  close: { alignSelf: 'flex-end' },
});
