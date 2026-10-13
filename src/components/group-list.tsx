import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ColorSwatches } from '@/components/color-swatches';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { deleteGroup, mergeGroups, updateGroup, type Group } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { groupShades, ITEM_TYPES, shade, SHADE_STEPS, type ItemType } from '@/lib/item-type';

type Props = {
  /** Groups of one calendar. */
  groups: Group[];
  onChanged: () => void;
  /** Show only this group, already open for editing (the Edit sheet from Home's class cards). */
  focusId?: string;
};

/** A calendar's groups (made automatically); tap one to rename, recolor, merge or delete it. */
export function GroupList({ groups, onChanged, focusId }: Props) {
  const db = useSQLiteContext();
  const [editing, setEditing] = useState<string | null>(focusId ?? null);
  const shown = focusId ? groups.filter((group) => group.id === focusId) : groups;
  if (shown.length === 0) return null;

  const change = async (action: Promise<unknown>) => {
    await action;
    onChanged();
  };

  return (
    <View style={styles.container}>
      {shown.map((group) => (
        <GroupRow
          key={group.id}
          group={group}
          others={groups.filter((other) => other.id !== group.id)}
          editing={editing === group.id}
          onToggleEdit={() => setEditing(editing === group.id ? null : group.id)}
          onRename={(name) => name.trim() && name.trim() !== group.name && change(updateGroup(db, group.id, { name }))}
          onColor={(color) => change(updateGroup(db, group.id, { color }))}
          onShade={(type, step) =>
            change(updateGroup(db, group.id, { typeShades: { ...groupShades(group.type_shades), [type]: step } }))
          }
          onMerge={(into) => {
            setEditing(null);
            change(mergeGroups(db, group.id, into.id));
          }}
          onDelete={() =>
            confirmDestructive(
              `Delete group “${group.name}”?`,
              'Its events and tasks stay, without a group.',
              'Delete',
              () => {
                setEditing(null);
                change(deleteGroup(db, group.id));
              }
            )
          }
        />
      ))}
    </View>
  );
}

type RowProps = {
  group: Group;
  others: Group[];
  editing: boolean;
  onToggleEdit: () => void;
  onRename: (name: string) => void;
  onColor: (color: string) => void;
  onShade: (type: ItemType, step: number) => void;
  onMerge: (into: Group) => void;
  onDelete: () => void;
};

function GroupRow({ group, others, editing, ...actions }: RowProps) {
  const theme = useTheme();
  const [name, setName] = useState(group.name);

  return (
    <View>
      <Pressable onPress={actions.onToggleEdit} style={styles.row} accessibilityLabel={`Group ${group.name}`}>
        <View style={[styles.dot, { backgroundColor: group.color }]} />
        <ThemedText type="small" numberOfLines={1} style={styles.name}>
          {group.name}
        </ThemedText>
        <Icon name={editing ? 'collapse' : 'expand'} size={14} color={theme.textSecondary} />
      </Pressable>

      {editing && (
        <ThemedView type="backgroundElement" style={styles.editor}>
          <TextInput
            value={name}
            onChangeText={setName}
            onEndEditing={() => actions.onRename(name)}
            onBlur={() => actions.onRename(name)}
            onSubmitEditing={() => actions.onRename(name)}
            placeholder="Group name"
            placeholderTextColor={theme.textSecondary}
            style={[styles.nameInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <ColorSwatches value={group.color} onChange={actions.onColor} size={20} />
          <TypeShades group={group} onShade={actions.onShade} />
          {others.length > 0 && (
            <View style={styles.merge}>
              <ThemedText type="small" themeColor="textSecondary">
                Merge into
              </ThemedText>
              <View style={styles.mergeChips}>
                {others.map((other) => (
                  <Pressable
                    key={other.id}
                    onPress={() => actions.onMerge(other)}
                    style={[styles.chip, { borderColor: theme.backgroundSelected }]}>
                    <View style={[styles.smallDot, { backgroundColor: other.color }]} />
                    <ThemedText type="small">{other.name}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <Pressable onPress={actions.onDelete} hitSlop={6} style={styles.deleteRow}>
            <ThemedText type="small" style={{ color: theme.danger }}>
              Delete group
            </ThemedText>
          </Pressable>
        </ThemedView>
      )}
    </View>
  );
}

/** One row per type (class, exam, homework...): which shade of the group's color it's drawn in. */
function TypeShades({ group, onShade }: { group: Group; onShade: (type: ItemType, step: number) => void }) {
  const theme = useTheme();
  const shades = groupShades(group.type_shades);
  return (
    <View style={styles.shades}>
      <ThemedText type="small" themeColor="textSecondary">
        Shade for each type
      </ThemedText>
      {ITEM_TYPES.map(({ type, label }) => (
        <View key={type} style={styles.shadeRow}>
          <ThemedText type="small" numberOfLines={1} style={styles.shadeLabel}>
            {label}
          </ThemedText>
          {SHADE_STEPS.map((step) => {
            const selected = shades[type] === step;
            return (
              <Pressable
                key={step}
                onPress={() => onShade(type, step)}
                accessibilityLabel={`${label} shade ${step}`}
                accessibilityState={{ selected }}
                hitSlop={2}
                style={[styles.shadeRing, { borderColor: selected ? theme.text : 'transparent' }]}>
                <View style={[styles.shadeDot, { backgroundColor: shade(group.color, step) }]} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingLeft: 28, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 3 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  smallDot: { width: 8, height: 8, borderRadius: 4 },
  name: { flex: 1 },
  editor: { borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.two, marginBottom: Spacing.one },
  nameInput: { fontSize: 15, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.one },
  merge: { gap: Spacing.one },
  mergeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  deleteRow: { alignSelf: 'flex-end' },
  shades: { gap: 2 },
  shadeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  shadeLabel: { width: 84 },
  shadeRing: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  shadeDot: { width: 14, height: 14, borderRadius: 7 },
});
