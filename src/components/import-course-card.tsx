import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon } from '@/components/ui/icon';
import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/dates';
import { changeSection, fitsSection, shortDate, type CourseChoice } from '@/lib/import-schedule';
import type { ItemKind, ScheduleCourse, ScheduleMeeting } from '@/lib/schedule-format';

type Props = {
  course: ScheduleCourse;
  choice: CourseChoice;
  onChange: (choice: CourseChoice) => void;
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SECTIONS: { title: string; kinds: ItemKind[] }[] = [
  { title: 'Exams & quizzes', kinds: ['exam', 'quiz'] },
  { title: 'Assignments', kinds: ['assignment'] },
  { title: 'Readings', kinds: ['reading'] },
  { title: 'Presentations', kinds: ['presentation'] },
  { title: 'Class events', kinds: ['event'] },
  { title: 'Breaks & holidays', kinds: ['break'] },
];
const PREVIEW_ROWS = 4;

const timeLabel = (time: string) => formatTime(`2000-01-01T${time}`);

function meetingLine(m: ScheduleMeeting) {
  const days = m.weekdays.map((d) => DAY_NAMES[d]).join(', ');
  return `${days} · ${timeLabel(m.start_time)}–${timeLabel(m.end_time)}${m.location ? ` · ${m.location}` : ''}`;
}

/** One course on the review screen: pick your section, then tick what to add. */
export function ImportCourseCard({ course, choice, onChange }: Props) {
  const theme = useTheme();
  const needsSection = course.sections.length > 1;

  const setMeeting = (i: number, on: boolean) =>
    onChange({ ...choice, meetings: choice.meetings.map((v, j) => (j === i ? on : v)) });
  const setItems = (indexes: number[], on: boolean) =>
    onChange({ ...choice, items: choice.items.map((v, j) => (indexes.includes(j) ? on : v)) });

  // Rows for other sections are hidden once you've picked yours.
  const meetingRows = course.meetings
    .map((meeting, i) => ({ meeting, i }))
    .filter(({ meeting }) => fitsSection(meeting.section, choice.section));
  const itemRows = course.items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => fitsSection(item.section, choice.section));

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View>
        <ThemedText type="smallBold">{course.code ?? course.name}</ThemedText>
        {course.code && course.name !== course.code && (
          <ThemedText type="small" themeColor="textSecondary">
            {course.name}
          </ThemedText>
        )}
      </View>

      {needsSection && (
        <View style={styles.block}>
          <ThemedText type="small" style={!choice.section && { color: theme.danger }}>
            {choice.section ? 'Your section' : 'Which section are you in?'}
          </ThemedText>
          <View style={styles.chips}>
            {course.sections.map((section) => {
              const selected = choice.section === section;
              return (
                <Chip
                  key={section}
                  label={section}
                  selected={selected}
                  onPress={() => onChange(changeSection(course, choice, section))}
                />
              );
            })}
          </View>
        </View>
      )}

      {meetingRows.length > 0 && (
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            Weekly classes (repeat all term)
          </ThemedText>
          {meetingRows.map(({ meeting, i }) => (
            <CheckRow
              key={i}
              checked={choice.meetings[i]}
              onToggle={() => setMeeting(i, !choice.meetings[i])}
              title={meeting.label + (meeting.optional ? ' (optional)' : '')}
              detail={meetingLine(meeting)}
            />
          ))}
        </View>
      )}

      {SECTIONS.map(({ title, kinds }) => {
        const rows = itemRows.filter(({ item }) => kinds.includes(item.kind));
        if (rows.length === 0) return null;
        return (
          <ItemGroup
            key={title}
            title={title}
            rows={rows.map(({ item, i }) => ({
              index: i,
              title: item.title,
              description: item.details ?? null,
              detail:
                shortDate(item.date) +
                (item.end_date && item.end_date > item.date ? ` – ${shortDate(item.end_date)}` : '') +
                (item.start_time ? ` · ${timeLabel(item.start_time)}` : item.at_class ? ' · at class' : ''),
            }))}
            checked={choice.items}
            onSet={setItems}
          />
        );
      })}
    </ThemedView>
  );
}

type GroupProps = {
  title: string;
  rows: { index: number; title: string; detail: string; description?: string | null }[];
  checked: boolean[];
  onSet: (indexes: number[], on: boolean) => void;
};

/** "Assignments (25)" with an all/none checkbox; long lists start folded. */
function ItemGroup({ title, rows, checked, onSet }: GroupProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const indexes = rows.map((row) => row.index);
  const count = indexes.filter((i) => checked[i]).length;
  const all = count === rows.length;
  const shown = expanded ? rows : rows.slice(0, PREVIEW_ROWS);

  return (
    <View style={styles.block}>
      <Pressable
        onPress={() => onSet(indexes, !all)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: all ? true : count === 0 ? false : 'mixed' }}
        style={styles.groupHeader}>
        <Icon name={all ? 'checked' : count === 0 ? 'unchecked' : 'partial'} color={theme.accent} />
        <ThemedText type="smallBold" style={styles.flex}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {count} of {rows.length}
        </ThemedText>
      </Pressable>
      {shown.map((row) => (
        <CheckRow
          key={row.index}
          checked={checked[row.index]}
          onToggle={() => onSet([row.index], !checked[row.index])}
          title={row.title}
          detail={row.detail}
          description={row.description}
        />
      ))}
      {rows.length > PREVIEW_ROWS && (
        <Pressable onPress={() => setExpanded(!expanded)} hitSlop={6} style={styles.more}>
          <ThemedText type="small" themeColor="textSecondary">
            {expanded ? 'Show fewer' : `Show all ${rows.length}`}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

type CheckRowProps = {
  checked: boolean;
  onToggle: () => void;
  title: string;
  detail: string;
  /** What the syllabus says about it, shown later when you open the item. */
  description?: string | null;
};

function CheckRow({ checked, onToggle, title, detail, description }: CheckRowProps) {
  const theme = useTheme();
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.row}>
      <Icon name={checked ? 'checked' : 'unchecked'} color={theme.accent} />
      <View style={styles.flex}>
        <ThemedText type="small" numberOfLines={2} themeColor={checked ? 'text' : 'textSecondary'}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {detail}
        </ThemedText>
        {description && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.description}>
            ⓘ {description}
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  block: { gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.half },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, paddingVertical: 3, paddingLeft: Spacing.two },
  box: { fontSize: 18, lineHeight: 22, width: 20 },
  flex: { flex: 1 },
  description: { fontStyle: 'italic' },
  more: { paddingLeft: Spacing.two + 28, paddingVertical: Spacing.half },
});
