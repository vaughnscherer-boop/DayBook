import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { parseLinks, updateCourseInfo, type CourseLink, type Group } from '@/db/groups';
import type { Term } from '@/db/terms';
import { useTheme } from '@/hooks/use-theme';
import { termRange } from '@/lib/terms';

type Props = { group: Group; terms: Term[]; onChanged: () => void };

/** A course's instructor, room, office hours, links and term. Tap a field to edit; it saves as you leave it. */
export function CourseInfoCard({ group, terms, onChanged }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const links = parseLinks(group.links);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');

  const save = async (info: Parameters<typeof updateCourseInfo>[2]) => {
    await updateCourseInfo(db, group.id, info);
    onChanged();
  };

  const addLink = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    // "canvas.school.edu/courses/1" without a scheme still opens.
    const full = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    await save({ links: [...links, { label: label.trim() || hostOf(full), url: full }] });
    setLabel('');
    setUrl('');
    setAdding(false);
  };

  const removeLink = (link: CourseLink) => save({ links: links.filter((l) => l !== link && l.url !== link.url) });

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Field key={`i:${group.instructor}`} icon="person" placeholder="Instructor" value={group.instructor} onSave={(instructor) => save({ instructor })} />
      <Field key={`l:${group.location}`} icon="location" placeholder="Room / location" value={group.location} onSave={(location) => save({ location })} />
      <Field key={`o:${group.office_hours}`} icon="clock" placeholder="Office hours" value={group.office_hours} onSave={(officeHours) => save({ officeHours })} />

      {links.map((link) => (
        <View key={link.url} style={styles.row}>
          <Icon name="link" size={16} color={theme.textSecondary} />
          <Pressable style={styles.flex} onPress={() => Linking.openURL(link.url).catch(() => {})} accessibilityRole="link">
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ color: theme.accent }}>
              {link.label}
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => removeLink(link)} hitSlop={8} accessibilityLabel={`Remove link ${link.label}`}>
            <Icon name="close" size={14} color={theme.textSecondary} />
          </Pressable>
        </View>
      ))}

      {adding ? (
        <View style={styles.addLink}>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Label (Canvas, Zoom…)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onSubmitEditing={addLink}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <View style={styles.actions}>
            <Pressable onPress={() => setAdding(false)} hitSlop={6}>
              <ThemedText type="small" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
            <Pressable onPress={addLink} hitSlop={6}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Add link
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} style={styles.row} accessibilityRole="button">
          <Icon name="add" size={16} color={theme.accent} />
          <ThemedText type="small" style={{ color: theme.accent }}>
            Add a link
          </ThemedText>
        </Pressable>
      )}

      {terms.length > 0 && (
        <View style={styles.terms}>
          <ThemedText type="caption" themeColor="textSecondary">
            Term
          </ThemedText>
          <View style={styles.chips}>
            {terms.map((term) => (
              <Chip
                key={term.id}
                label={`${term.name} · ${termRange(term)}`}
                selected={group.term_id === term.id}
                onPress={() => save({ termId: group.term_id === term.id ? null : term.id })}
              />
            ))}
          </View>
        </View>
      )}
    </ThemedView>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Field({
  icon,
  placeholder,
  value,
  onSave,
}: {
  icon: IconName;
  placeholder: string;
  value: string | null;
  onSave: (value: string) => void;
}) {
  const theme = useTheme();
  // The parent re-keys this when the saved value changes (e.g. edited on another device).
  const [text, setText] = useState(value ?? '');
  const commit = () => {
    if (text.trim() !== (value ?? '')) onSave(text);
  };
  return (
    <View style={styles.row}>
      <Icon name={icon} size={16} color={theme.textSecondary} />
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={commit}
        onEndEditing={commit}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel={placeholder}
        style={[styles.flex, styles.field, { color: theme.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  field: { fontSize: 15, paddingVertical: Spacing.one },
  addLink: { gap: Spacing.two },
  input: { fontSize: 15, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.one },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.three },
  terms: { gap: Spacing.one, marginTop: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
