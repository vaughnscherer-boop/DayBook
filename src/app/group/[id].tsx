import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CourseDocuments } from '@/components/course/course-documents';
import { CourseInfoCard } from '@/components/course/course-info-card';
import { FixMistakes } from '@/components/course/fix-mistakes';
import { GradeImport } from '@/components/course/grade-import';
import { GradeCard } from '@/components/course/grade-card';
import { CourseUpcoming } from '@/components/course/course-upcoming';
import { CourseStudy } from '@/components/course/course-study';
import { GroupList } from '@/components/group-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CloseToolbar, closeModal } from '@/components/ui/close-button';
import { CourseAttendance } from '@/components/course/course-attendance';
import { EmptyState } from '@/components/ui/empty-state';
import { Spacing } from '@/constants/theme';
import { listTerms, type Term } from '@/db/terms';
import { gradeItems } from '@/db/grades';
import { useAttendance } from '@/hooks/use-attendance';
import { useCalendarData } from '@/hooks/use-calendar-data';
import type { CalendarItem } from '@/lib/calendar-items';
import { toggleTask } from '@/lib/task-toggle';
import { shiftKey, todayKey } from '@/lib/dates';
import { termRange } from '@/lib/terms';

/** How far ahead a course's page looks. */
const LOOKAHEAD_DAYS = 120;
const SHOWN = 8;
const STUDY_LOOKAHEAD_DAYS = 28;

/**
 * One class: where and when it meets, its links, grade (typed in or imported from the school site), what's
 * coming up, its documents, "Fix mistakes", and (⋯ → Edit) its name, color and shades.
 */
export default function CourseScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const db = useSQLiteContext();
  const { groups, itemsBetween, categories, grades, events, tasks, reload } = useCalendarData();
  const attendance = useAttendance();
  const group = groups.find((g) => g.id === id);
  const [terms, setTerms] = useState<Term[]>([]);

  const loadTerms = useCallback(() => listTerms(db).then(setTerms), [db]);
  useFocusEffect(
    useCallback(() => {
      loadTerms();
    }, [loadTerms])
  );
  const changed = () => {
    reload();
    loadTerms();
  };

  // Merged or deleted from here: there's nothing left to show, so close.
  const seen = useRef(false);
  useEffect(() => {
    if (group) seen.current = true;
    else if (seen.current) closeModal();
  }, [group]);

  const today = todayKey();
  const upcoming = useMemo(() => {
    if (!group) return [];
    const mine = itemsBetween(today, shiftKey(today, LOOKAHEAD_DAYS)).filter((item) => item.groupId === group.id);
    // Exams and homework lead; classes would otherwise fill the list every day.
    const work = mine.filter((item) => item.itemType !== 'class' && !item.done);
    const classes = mine.filter((item) => item.itemType === 'class').slice(0, 2);
    return [...work.slice(0, SHOWN), ...classes].sort(
      (a, b) => a.startDay.localeCompare(b.startDay) || (a.time ?? '').localeCompare(b.time ?? '')
    );
  }, [group, itemsBetween, today]);

  // Exams and assignments in the next few weeks can get study time; later ones can wait.
  const studyFor = useMemo(
    () =>
      group
        ? itemsBetween(today, shiftKey(today, STUDY_LOOKAHEAD_DAYS)).filter(
            (item) =>
              item.groupId === group.id &&
              (item.itemType === 'exam' || item.itemType === 'assignment') &&
              !item.repeating &&
              !item.done &&
              item.startDay > today
          )
        : [],
    [group, itemsBetween, today]
  );

  const toggle = (item: CalendarItem) => toggleTask(db, item, changed);

  const term = terms.find((t) => t.id === group?.term_id);

  return (
    <ThemedView style={styles.container}>
      {/* The big name below is the title; the bar just holds Close. */}
      <Stack.Screen options={{ title: '' }} />
      <CloseToolbar />
      <ScrollView contentContainerStyle={styles.content}>
        {group ? (
          <>
            {/* The class's own header: its name in its color, then who and where. */}
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <View style={[styles.dot, { backgroundColor: group.color }]} />
                <ThemedText type="subtitle" style={styles.flex} numberOfLines={2}>
                  {group.name}
                </ThemedText>
              </View>
              {(group.instructor || group.location) && (
                <ThemedText type="small" themeColor="textSecondary">
                  {[group.instructor, group.location].filter(Boolean).join(' · ')}
                </ThemedText>
              )}
              {term && (
                <ThemedText type="small" themeColor="textSecondary">
                  {term.name} · {termRange(term)}
                  {group.archived ? ' · ended' : ''}
                </ThemedText>
              )}
            </View>

            <CourseInfoCard group={group} terms={terms} onChanged={changed} />

            <Section title="Grade">
              <GradeCard
                group={group}
                categories={categories.filter((c) => c.group_id === group.id)}
                items={gradeItems(group, events, tasks)}
                result={grades.get(group.id)}
                onChanged={changed}
              />
              <GradeImport
                group={group}
                categories={categories.filter((c) => c.group_id === group.id)}
                events={events}
                tasks={tasks}
                percent={grades.get(group.id)?.percent ?? null}
                onChanged={changed}
              />
            </Section>

            <Section title="Coming up">
              <CourseUpcoming items={upcoming} onToggle={toggle} onChanged={changed} />
            </Section>

            <Section title="Attendance">
              <CourseAttendance group={group} records={attendance} onChanged={changed} />
            </Section>

            {studyFor.length > 0 && (
              <Section title="Study">
                <CourseStudy
                  choices={studyFor}
                  calendarId={group.calendar_id}
                  itemsUntil={(day) => itemsBetween(today, day)}
                  onChanged={changed}
                />
              </Section>
            )}

            <Section title="Documents">
              <CourseDocuments groupId={group.id} onChanged={changed} />
            </Section>

            <Section title="Fix mistakes">
              <FixMistakes group={group} events={events} tasks={tasks} onChanged={changed} />
            </Section>

            <Section title="Edit class">
              <GroupList
                groups={groups.filter((g) => g.calendar_id === group.calendar_id)}
                focusId={group.id}
                autoOpen={edit === '1'}
                onChanged={changed}
              />
            </Section>
          </>
        ) : (
          <EmptyState text="This class no longer exists." />
        )}
      </ScrollView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="heading">{title}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  header: { gap: Spacing.one },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf },
  dot: { width: 12, height: 12, borderRadius: 6 },
  flex: { flex: 1 },
  section: { gap: Spacing.twoHalf },
});
