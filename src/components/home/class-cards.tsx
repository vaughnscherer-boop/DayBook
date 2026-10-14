import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { MenuButton } from '@/components/ui/menu-button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spacing } from '@/constants/theme';
import { deleteGroup, type Group } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { confirmDestructive } from '@/lib/confirm';
import { fromKey, todayKey } from '@/lib/dates';
import { formatPercent, letter, type CourseGrade } from '@/lib/grades';

type Props = {
  groups: Group[];
  /** Group ids that have class meetings (from buildClasses); the rest are "Other groups". */
  classIds: Set<string>;
  /** Groups with a timed event or a task; others hold only all-day dates and stay hidden. */
  activeIds: Set<string>;
  /** Upcoming items (today onward) to find each group's next meeting and counts. */
  upcoming: CalendarItem[];
  /** Running grade per course (only those with a grading scheme). */
  grades: Map<string, CourseGrade>;
  onChanged: () => void;
};

/** Home's "Classes" section: one card per class or group, with its next date and what's coming. */
export function ClassCards({ groups: allGroups, classIds, activeIds, upcoming, grades, onChanged }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  // Courses from an ended term are archived: out of the way, but still reachable from Settings → Terms.
  const groups = allGroups.filter((g) => !g.archived);
  const classes = groups.filter((g) => classIds.has(g.id));
  const notClasses = groups.filter((g) => !classIds.has(g.id));
  const [showDateOnly, setShowDateOnly] = useState(false);
  const dateOnly = notClasses.filter((g) => !activeIds.has(g.id));
  const others = showDateOnly ? notClasses : notClasses.filter((g) => activeIds.has(g.id));
  const [tab, setTab] = useState<'classes' | 'others'>('classes');
  const shown = tab === 'classes' || others.length === 0 ? classes : others;
  const today = todayKey();

  const remove = (group: Group) =>
    confirmDestructive(`Delete “${group.name}”?`, 'Its events and tasks stay, without a group.', 'Delete', async () => {
      await deleteGroup(db, group.id);
      onChanged();
    });

  return (
    <View style={styles.container}>
      {others.length > 0 && (
        <View style={styles.tabs}>
          <Chip label={`Classes (${classes.length})`} selected={tab === 'classes'} onPress={() => setTab('classes')} />
          <Chip label={`Other groups (${others.length})`} selected={tab === 'others'} onPress={() => setTab('others')} />
        </View>
      )}

      {shown.map((group) => {
        const mine = upcoming.filter((item) => item.groupId === group.id);
        const next = mine.find((item) => item.itemType === 'class') ?? mine[0];
        const assignments = mine.filter((item) => item.itemType === 'assignment' && !item.done).length;
        const tests = mine.filter((item) => item.itemType === 'exam').length;
        const nextLabel = next
          ? next.startDay === today
            ? 'Today'
            : fromKey(next.startDay).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
          : 'Nothing scheduled';

        return (
          <PressableScale
            key={group.id}
            scaleTo={0.98}
            onPress={() => router.push({ pathname: '/group/[id]', params: { id: group.id } })}
            style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <View style={styles.cardTop}>
              <View style={[styles.dateChip, { backgroundColor: theme.background }]}>
                <Icon name="event" size={13} color={group.color} />
                <ThemedText type="caption">{nextLabel}</ThemedText>
              </View>
              <MenuButton
                accessibilityLabel={`Options for ${group.name}`}
                items={[
                  { label: 'Open calendar', icon: 'event', onPress: () => router.navigate({ pathname: '/calendar', params: { date: next?.startDay ?? today } }) },
                  { label: 'Edit', icon: 'edit', onPress: () => router.push({ pathname: '/group/[id]', params: { id: group.id, edit: '1' } }) },
                  { label: 'Delete', icon: 'trash', destructive: true, onPress: () => remove(group) },
                ]}>
                <View style={[styles.more, { backgroundColor: theme.background }]}>
                  <Icon name="more" size={16} color={theme.textSecondary} />
                </View>
              </MenuButton>
            </View>
            <View style={styles.nameRow}>
              <ThemedText style={[styles.name, styles.flex]} numberOfLines={1}>
                {group.name}
              </ThemedText>
              {grades.get(group.id)?.percent != null && (
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {formatPercent(grades.get(group.id)!.percent!)} · {letter(grades.get(group.id)!.percent!)}
                </ThemedText>
              )}
            </View>
            <View style={styles.counts}>
              <View style={[styles.dot, { backgroundColor: group.color }]} />
              <ThemedText type="caption" themeColor="textSecondary">
                Assignments: {assignments}
              </ThemedText>
              <View style={[styles.dot, { backgroundColor: theme.danger }]} />
              <ThemedText type="caption" themeColor="textSecondary">
                Tests: {tests}
              </ThemedText>
            </View>
          </PressableScale>
        );
      })}

      {dateOnly.length > 0 && (
        <Pressable onPress={() => setShowDateOnly(!showDateOnly)} hitSlop={6} style={styles.dateOnly}>
          <ThemedText type="caption" themeColor="textSecondary">
            {showDateOnly
              ? 'Hide date-only groups'
              : `${dateOnly.length} date-only group${dateOnly.length === 1 ? '' : 's'} hidden (holidays and term dates) · Show`}
          </ThemedText>
        </Pressable>
      )}

      <PressableScale
        scaleTo={0.98}
        onPress={() => router.push('/import')}
        style={[styles.card, styles.importCard, { borderColor: theme.backgroundSelected }]}>
        <Icon name="upload" size={18} color={theme.textSecondary} />
        <ThemedText type="smallBold" themeColor="textSecondary">
          Import a syllabus
        </ThemedText>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two + 4 },
  tabs: { flexDirection: 'row', gap: Spacing.two },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: Spacing.two + 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 1,
  },
  more: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  flex: { flex: 1 },
  name: { fontSize: 18, lineHeight: 23, fontWeight: 700 },
  counts: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginLeft: 4 },
  dateOnly: { alignSelf: 'center', paddingVertical: Spacing.one },
  importCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 1.5 },
});
