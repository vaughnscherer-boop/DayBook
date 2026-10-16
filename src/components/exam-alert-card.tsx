import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addStudySessions } from '@/components/course/study-planner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { untilText } from '@/lib/day-brief';
import { planStudy } from '@/lib/study-plan';

type Props = {
  exam: CalendarItem;
  /** The calendar the exam is in; sessions go there too. */
  calendarId: string | null;
  /** Items from today through the exam's day, so busy times are known. */
  items: CalendarItem[];
  today: string;
  onChanged: () => void;
};

/**
 * Top of Today when a test is days away and nothing's planned for it: one tap puts study sessions
 * in your free time before it (the same plan the exam's own page proposes).
 */
export function ExamAlertCard({ exam, calendarId, items, today, onChanged }: Props) {
  const db = useSQLiteContext();
  const [saving, setSaving] = useState(false);
  const plan = planStudy(items, exam, today);

  const add = async () => {
    if (saving || plan.length === 0) return;
    setSaving(true);
    await addStudySessions(db, exam, calendarId, plan);
    setSaving(false);
    onChanged();
  };
  const open = () =>
    router.push({
      pathname: exam.kind === 'event' ? '/event/[id]' : '/task/[id]',
      params: { id: exam.id, date: exam.occurrenceDate },
    });

  return (
    // Calm on purpose: a nudge in the exam's own color, not an alarm. Red stays for what's overdue.
    <ThemedView type="backgroundElement" style={[styles.card, { borderLeftColor: exam.color }]}>
      <View style={styles.text}>
        <ThemedText type="label">
          {exam.title} {untilText(exam.startDay, today)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {plan.length > 0
            ? 'No study time planned yet. Add sessions in your free time before it?'
            : 'No study time planned, and no free hour left before it.'}
        </ThemedText>
      </View>
      <View style={styles.buttons}>
        {plan.length > 0 && (
          <Button
            title={`Plan ${plan.length} study session${plan.length === 1 ? '' : 's'}`}
            onPress={add}
            busy={saving}
            style={styles.flex}
          />
        )}
        <Button title="Open" variant="secondary" onPress={open} style={plan.length > 0 ? undefined : styles.flex} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, borderCurve: 'continuous', borderLeftWidth: 4, padding: Spacing.three, gap: Spacing.twoHalf },
  text: { gap: 2 },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
