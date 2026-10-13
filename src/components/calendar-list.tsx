import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ColorSwatches } from '@/components/color-swatches';
import { GroupList } from '@/components/group-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon } from '@/components/ui/icon';
import { EventColors, Spacing } from '@/constants/theme';
import {
  createCalendar,
  deleteCalendar,
  setDefaultCalendar,
  updateCalendar,
  type Calendar,
} from '@/db/calendars';
import type { Group } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';
import { textOn } from '@/lib/calendar-items';
import { confirmDestructive } from '@/lib/confirm';

type Props = { calendars: Calendar[]; groups: Group[]; onChanged: () => void };

/**
 * Calendars with show/hide checkboxes, each with its automatic groups underneath; tap a row to edit
 * its color, name, default, or delete it.
 */
export function CalendarList({ calendars, groups, onChanged }: Props) {
  const db = useSQLiteContext();
  const [editing, setEditing] = useState<string | null>(null);

  const change = async (action: Promise<unknown>) => {
    await action;
    onChanged();
  };

  const addCalendar = async () => {
    const used = new Set(calendars.map((c) => c.color));
    const color = EventColors.find((c) => !used.has(c)) ?? EventColors[calendars.length % EventColors.length];
    const id = await createCalendar(db, 'New calendar', color);
    setEditing(id);
    onChanged();
  };

  return (
    <View style={styles.container}>
      {calendars.map((calendar) => (
        <View key={calendar.id}>
          <CalendarRow
            calendar={calendar}
            editing={editing === calendar.id}
            onToggleEdit={() => setEditing(editing === calendar.id ? null : calendar.id)}
            onToggleVisible={() => change(updateCalendar(db, calendar.id, { visible: !calendar.visible }))}
            onColor={(color) => change(updateCalendar(db, calendar.id, { color }))}
            onRename={(name) => name.trim() && change(updateCalendar(db, calendar.id, { name }))}
            onMakeDefault={() => change(setDefaultCalendar(db, calendar.id))}
            onDelete={() =>
              confirmDestructive(
                `Delete “${calendar.name}”?`,
                'Its events and tasks move to your default calendar.',
                'Delete',
                () => {
                  setEditing(null);
                  change(deleteCalendar(db, calendar.id));
                }
              )
            }
          />
          <GroupList groups={groups.filter((group) => group.calendar_id === calendar.id)} onChanged={onChanged} />
        </View>
      ))}
      <Pressable onPress={addCalendar} style={styles.addRow}>
        <ThemedText type="small" themeColor="textSecondary">
          + New calendar
        </ThemedText>
      </Pressable>
    </View>
  );
}

type RowProps = {
  calendar: Calendar;
  editing: boolean;
  onToggleEdit: () => void;
  onToggleVisible: () => void;
  onColor: (color: string) => void;
  onRename: (name: string) => void;
  onMakeDefault: () => void;
  onDelete: () => void;
};

function CalendarRow({ calendar, editing, ...actions }: RowProps) {
  const theme = useTheme();
  const [name, setName] = useState(calendar.name);
  const visible = calendar.visible === 1;
  const isDefault = calendar.is_default === 1;

  return (
    <View>
      <Pressable onPress={actions.onToggleEdit} style={styles.row}>
        <Pressable
          onPress={actions.onToggleVisible}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: visible }}
          accessibilityLabel={`Show ${calendar.name}`}
          style={[
            styles.checkbox,
            { borderColor: calendar.color },
            visible && { backgroundColor: calendar.color },
          ]}>
          {visible && <Icon name="checkmark" size={12} weight="bold" color={textOn(calendar.color)} />}
        </Pressable>
        <ThemedText numberOfLines={1} style={styles.name} themeColor={visible ? 'text' : 'textSecondary'}>
          {calendar.name}
        </ThemedText>
        {isDefault && (
          <ThemedText type="small" themeColor="textSecondary">
            Default
          </ThemedText>
        )}
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
            placeholder="Calendar name"
            placeholderTextColor={theme.textSecondary}
            style={[styles.nameInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <ColorSwatches value={calendar.color} onChange={actions.onColor} size={22} />
          <View style={styles.editorActions}>
            {!isDefault && (
              <Pressable onPress={actions.onMakeDefault} hitSlop={6}>
                <ThemedText type="small" style={{ color: theme.accent }}>
                  Make default
                </ThemedText>
              </Pressable>
            )}
            <View style={styles.spacer} />
            {!isDefault && (
              <Pressable onPress={actions.onDelete} hitSlop={6}>
                <ThemedText type="small" style={{ color: theme.danger }}>
                  Delete
                </ThemedText>
              </Pressable>
            )}
          </View>
        </ThemedView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#ffffff', fontSize: 13, lineHeight: 16, fontWeight: '700' },
  name: { flex: 1 },
  editor: { borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.two, marginBottom: Spacing.one },
  nameInput: {
    fontSize: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one,
  },
  editorActions: { flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1 },
  addRow: { paddingVertical: Spacing.one },
});
