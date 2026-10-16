import { Link, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Children, Fragment, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { TaskCheck } from '@/components/ui/task-check';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { confirmDeleteItem, duplicateItem, moveToTomorrow } from '@/lib/item-actions';
import { rescheduleAll } from '@/lib/notifications';

const CHECK = 22;
/** Separators start under the title, like Reminders: row padding + check + gap. */
const SEPARATOR_INSET = Spacing.three + CHECK + Spacing.twoHalf;

/**
 * Rows grouped in one rounded surface with hairlines between them (the Reminders pattern), instead of a
 * separate card per item.
 */
export function RowGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const rows = Children.toArray(children);
  return (
    <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={[styles.separator, { backgroundColor: theme.backgroundSelected }]} />}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

type Props = {
  item: CalendarItem;
  subtitle?: string;
  onOpen: () => void;
  onToggle: () => void;
  /** Shown before the check, e.g. a selection circle. */
  leading?: ReactNode;
  /** What an imported syllabus says about it, under the subtitle. */
  details?: string | null;
  /** In place of the chevron, e.g. "in 2 days". */
  trailing?: ReactNode;
  /** Turns on the long-press preview and menu (iOS), and runs after one of its actions changes something. */
  onChanged?: () => void;
};

/** One task (check) or event (color bar) in a RowGroup: title, a detail line and a chevron. */
export function ItemRow({ item, subtitle, onOpen, onToggle, leading, details, trailing, onChanged }: Props) {
  const theme = useTheme();
  const db = useSQLiteContext();
  // Long-press preview and menu on iPhone, except while picking rows (a leading control is showing).
  const withMenu = Platform.OS === 'ios' && !!onChanged && !leading;
  const changed = () => {
    onChanged?.();
    rescheduleAll(db);
  };

  const row = (
    <Pressable
      onPress={withMenu ? undefined : onOpen}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      {leading}
      <View style={styles.lead}>
        {item.kind === 'task' ? (
          <TaskCheck done={item.done} color={item.color} size={CHECK} onToggle={onToggle} />
        ) : (
          <View style={[styles.bar, { backgroundColor: item.color }]} />
        )}
      </View>
      <View style={styles.text}>
        <ThemedText
          type="label"
          numberOfLines={1}
          themeColor={item.done ? 'textSecondary' : 'text'}
          style={item.done && styles.done}>
          {item.title}
        </ThemedText>
        {!!subtitle && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        )}
        {!!details && !item.done && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.details}>
            {details}
          </ThemedText>
        )}
      </View>
      {trailing ?? <Icon name="forward" size={13} weight="semibold" color={theme.textSecondary} />}
    </Pressable>
  );
  if (!withMenu) return row;

  return (
    <Link
      href={{ pathname: item.kind === 'task' ? '/task/[id]' : '/event/[id]', params: { id: item.id, date: item.occurrenceDate } }}
      asChild>
      <Link.Trigger>{row}</Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        {item.kind === 'task' && (
          <Link.MenuAction title={item.done ? 'Not done' : 'Done'} icon="checkmark.circle" onPress={onToggle} />
        )}
        {item.kind === 'task' && !item.done && (
          <Link.MenuAction
            title="Focus on this"
            icon="timer"
            onPress={() => router.push({ pathname: '/focus/[id]', params: { id: item.id } })}
          />
        )}
        {item.kind === 'task' && !item.repeating && (
          <Link.MenuAction
            title="Move to tomorrow"
            icon="arrow.forward.circle"
            onPress={async () => {
              await moveToTomorrow(db, item);
              changed();
            }}
          />
        )}
        <Link.MenuAction
          title="Duplicate"
          icon="plus.square.on.square"
          onPress={async () => {
            await duplicateItem(db, item);
            changed();
          }}
        />
        <Link.MenuAction title="Delete" icon="trash" destructive onPress={() => confirmDeleteItem(db, item, changed)} />
      </Link.Menu>
    </Link>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: Radius.md, borderCurve: 'continuous', overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: SEPARATOR_INSET },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
  },
  lead: { width: CHECK, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' },
  // The slot is a column, so the bar fills its height with flex rather than stretch.
  bar: { width: 4, flex: 1, minHeight: 20, borderRadius: 2 },
  text: { flex: 1, gap: 2 },
  done: { textDecorationLine: 'line-through' },
  details: { fontStyle: 'italic' },
});
