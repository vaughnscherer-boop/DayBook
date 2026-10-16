import { router } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { createEvent } from '@/db/events';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { formatDateKey, formatTime, todayKey } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';
import { planStudy, type StudySession } from '@/lib/study-plan';
import { sessionsFor, studyTitle } from '@/lib/study-sessions';

type Props = {
  exam: CalendarItem;
  /** The calendar the exam is in; sessions go there too. */
  calendarId: string | null;
  /** Items from today through the exam's day, so busy times and earlier sessions are known. */
  items: CalendarItem[];
  onChanged: () => void;
  /** Shown under the heading: the class page's picker of what to study for. */
  picker?: ReactNode;
};

const range = (session: StudySession) =>
  `${formatDateKey(session.day)}, ${formatTime(`${session.day}T${session.start}`)}–${formatTime(`${session.day}T${session.end}`)}`;

/** Adds sessions as "Study: <exam>" events in the exam's calendar and class. */
export async function addStudySessions(
  db: SQLiteDatabase,
  exam: CalendarItem,
  calendarId: string | null,
  sessions: StudySession[]
) {
  for (const session of sessions) {
    await createEvent(db, {
      // Same exam and day → same id, so two devices accepting the same plan don't double up.
      id: `study-${exam.id}-${session.day}`,
      title: studyTitle(exam.title),
      starts_at: `${session.day}T${session.start}`,
      ends_at: `${session.day}T${session.end}`,
      calendar_id: calendarId,
      group: exam.groupId ? { groupId: exam.groupId } : undefined,
      item_type: 'other',
    });
  }
  rescheduleAll(db);
}

/**
 * "Plan study sessions" for an exam: proposes a few hour-long sessions in free time before it. You
 * can drop any you don't want, then add the rest as "Study: <exam>" events (edit them like any event).
 */
export function StudyPlanner({ exam, calendarId, items, onChanged, picker }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [proposal, setProposal] = useState<StudySession[] | null>(null);
  const [saving, setSaving] = useState(false);
  const planned = sessionsFor(items, exam);
  const today = todayKey();

  if (exam.startDay <= today && !planned.length) return null;

  const propose = () => setProposal(planStudy(items, exam, today));
  const accept = async () => {
    if (!proposal?.length || saving) return;
    setSaving(true);
    await addStudySessions(db, exam, calendarId, proposal);
    setProposal(null);
    setSaving(false);
    onChanged();
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Study plan</ThemedText>
      {picker}
      {planned.map((session) => (
        <Pressable
          key={session.key}
          onPress={() => router.push({ pathname: '/event/[id]', params: { id: session.id } })}
          style={styles.row}>
          <View style={[styles.bar, { backgroundColor: session.color }]} />
          <ThemedText type="small" style={styles.flex}>
            {range({ day: session.startDay, start: session.time ?? '', end: session.endsAt?.slice(11, 16) ?? '' })}
          </ThemedText>
        </Pressable>
      ))}
      {planned.length === 0 && !proposal && (
        <ThemedText type="small" themeColor="textSecondary">
          No study time planned yet.
        </ThemedText>
      )}

      {proposal && (
        <View style={styles.proposal}>
          {proposal.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {planned.length > 0 ? 'That’s all the sessions this needs.' : 'No free time found before it’s due.'}
            </ThemedText>
          ) : (
            proposal.map((session) => (
              <View key={session.day} style={styles.row}>
                <ThemedText type="small" style={styles.flex}>
                  {range(session)}
                </ThemedText>
                <Pressable
                  onPress={() => setProposal(proposal.filter((s) => s !== session))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${range(session)}`}
                  hitSlop={8}>
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    Remove
                  </ThemedText>
                </Pressable>
              </View>
            ))
          )}
        </View>
      )}

      {proposal && proposal.length > 0 ? (
        <Button
          title={`Add ${proposal.length} session${proposal.length === 1 ? '' : 's'}`}
          onPress={accept}
          busy={saving}
        />
      ) : (
        <Button title="Plan study sessions" variant="secondary" onPress={propose} />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.two },
  proposal: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  bar: { width: 4, height: 18, borderRadius: 2 },
});
