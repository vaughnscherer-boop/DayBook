import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { createEvent, deleteEvent } from '@/db/events';
import type { Task } from '@/db/tasks';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import type { FreeGap } from '@/lib/day-brief';
import { notifyDataChanged } from '@/lib/data-events';
import { formatShortTime } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';
import { planBlocks, type WorkBlock } from '@/lib/plan-blocks';
import { showToast } from '@/lib/toast';

type Props = {
  /** The free row itself (time, dashed bar, "Free until…"). */
  children: ReactNode;
  gap: FreeGap;
  day: string;
  /** Items around this day: open tasks to plan, and blocks already planned. */
  items: CalendarItem[];
  tasks: Task[];
  onChanged: () => void;
};

/** A free stretch on Today with "Plan": proposes work blocks for open tasks, then adds them as events. */
export function PlanGap({ children, gap, day, items, tasks, onChanged }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [proposal, setProposal] = useState<WorkBlock[] | null>(null);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!proposal?.length || saving) return;
    setSaving(true);
    const ids: string[] = [];
    for (const block of proposal) {
      const task = tasks.find((t) => t.id === block.task.id);
      ids.push(
        await createEvent(db, {
          title: `Work on: ${block.task.title}`,
          starts_at: `${day}T${block.start}`,
          ends_at: `${day}T${block.end}`,
          calendar_id: task?.calendar_id ?? null,
          group: block.task.groupId ? { groupId: block.task.groupId } : undefined,
          item_type: 'other',
          task_id: block.task.id,
        })
      );
    }
    setSaving(false);
    setProposal(null);
    rescheduleAll(db);
    onChanged();
    showToast(`Planned ${ids.length} block${ids.length === 1 ? '' : 's'}`, async () => {
      for (const id of ids) await deleteEvent(db, id);
      notifyDataChanged();
      rescheduleAll(db);
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.flex}>{children}</View>
        <Pressable
          onPress={() => setProposal(proposal ? null : planBlocks(items, gap, day))}
          accessibilityRole="button"
          accessibilityLabel={`Plan the free time until ${formatShortTime(gap.end)}`}
          hitSlop={10}
          style={styles.plan}>
          <ThemedText type="smallBold">{proposal ? 'Cancel' : 'Plan'}</ThemedText>
        </Pressable>
      </View>
      {proposal && (
        <ThemedView type="backgroundElement" style={styles.card}>
          {proposal.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nothing open to plan — everything due this week is done or already has time set aside.
            </ThemedText>
          ) : (
            <>
              {proposal.map((block) => (
                <View key={block.task.key} style={styles.block}>
                  <View style={[styles.bar, { backgroundColor: block.task.color }]} />
                  <View style={styles.flex}>
                    <ThemedText type="label" numberOfLines={1}>
                      {block.task.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatShortTime(block.start)}–{formatShortTime(block.end)}
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={() => setProposal(proposal.filter((b) => b !== block))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${block.task.title}`}
                    hitSlop={10}>
                    <ThemedText type="small" style={{ color: theme.danger }}>
                      Remove
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
              <Button
                title={`Add ${proposal.length} block${proposal.length === 1 ? '' : 's'}`}
                onPress={add}
                busy={saving}
              />
            </>
          )}
        </ThemedView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  plan: { minHeight: 32, justifyContent: 'center', paddingHorizontal: Spacing.two },
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.twoHalf },
  block: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
});
