import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { CalendarChips } from '@/components/calendar-chips';
import { ImportCourseCard } from '@/components/import-course-card';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ThemedView } from '@/components/themed-view';
import { nativeOnly } from '@/components/ui/back-arrow';
import { EventColors, Spacing } from '@/constants/theme';
import { createCalendar, listCalendars, type Calendar } from '@/db/calendars';
import { listGroups, type Group } from '@/db/groups';
import { listGroupImports, listImports, saveImport, undoImport, type ImportRecord } from '@/db/imports';
import { getSettings, setSetting } from '@/db/settings';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive, notify } from '@/lib/confirm';
import { todayKey } from '@/lib/dates';
import { readScheduleOnServer } from '@/lib/import-api';
import { buildImportPlan, countPlan, defaultChoice, type CourseChoice } from '@/lib/import-schedule';
import { rescheduleAll } from '@/lib/notifications';
import { pickScheduleFile, type PickedFile } from '@/lib/pick-schedule';
import { MAX_IMPORT_TEXT, TEXT_IMPORT, type ScheduleImport } from '@/lib/schedule-format';

type Step =
  | { kind: 'start'; error?: string }
  | { kind: 'reading'; fileName: string }
  | { kind: 'review'; fileName: string; schedule: ScheduleImport; costUsd: number };

const NEW_SCHOOL = '__new-school__';

/** Back to the calendar (also when this screen was opened directly by its URL). */
const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * Import a syllabus or schedule: pick a file, Claude reads it, you review and add it. Opened from a
 * class's page (`groupId`), it adds the document to that class only.
 */
export default function ImportScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const db = useSQLiteContext();
  const theme = useTheme();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [choices, setChoices] = useState<CourseChoice[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [pasted, setPasted] = useState('');
  const [course, setCourse] = useState<Group | null>(null);

  const loadImports = () => (groupId ? listGroupImports(db, groupId) : listImports(db));
  useEffect(() => {
    listCalendars(db).then(setCalendars);
    (groupId ? listGroupImports(db, groupId) : listImports(db)).then(setImports);
    if (groupId) listGroups(db).then((groups) => setCourse(groups.find((g) => g.id === groupId) ?? null));
  }, [db, groupId]);

  const school = calendars.find((c) => /school|class/i.test(c.name));

  const pick = async () => {
    const picked = await pickScheduleFile();
    if (picked.kind === 'cancelled') return;
    if (picked.kind === 'error') {
      setStep({ kind: 'start', error: picked.message });
      return;
    }
    await read(picked.file);
  };

  const readPasted = () => {
    const text = pasted.trim();
    if (text.length > MAX_IMPORT_TEXT) {
      setStep({ kind: 'start', error: 'That’s too much text — paste just the part with the dates.' });
      return;
    }
    return read({ fileName: 'Pasted page', mediaType: TEXT_IMPORT, data: text });
  };

  const read = async (file: PickedFile) => {
    setStep({ kind: 'reading', fileName: file.fileName });
    const settings = await getSettings(db);
    let deviceId = settings.deviceId;
    if (!deviceId) {
      deviceId = randomUUID();
      await setSetting(db, 'deviceId', deviceId);
    }
    const result = await readScheduleOnServer(file, deviceId, course?.name ?? null);
    if (!result.ok) {
      setStep({ kind: 'start', error: result.error });
      return;
    }
    setChoices(result.schedule.courses.map((course) => defaultChoice(course)));
    // Classes go in a "School" calendar: an existing one, or a new one made on save. A class's own
    // documents go in its calendar.
    setCalendarId(course?.calendar_id ?? school?.id ?? NEW_SCHOOL);
    setStep({ kind: 'review', fileName: file.fileName, schedule: result.schedule, costUsd: result.costUsd });
  };

  const plan = useMemo(
    () => (step.kind === 'review' ? buildImportPlan(step.schedule, choices, todayKey()) : null),
    [step, choices]
  );
  const counts = plan ? countPlan(plan) : { events: 0, tasks: 0 };
  const total = counts.events + counts.tasks;
  // A course split into sections needs yours first, or its classes and class-time homework can't be placed.
  const needsSection =
    step.kind === 'review'
      ? step.schedule.courses.find((course, i) => course.sections.length > 1 && !choices[i]?.section)
      : undefined;
  const canSave = total > 0 && !needsSection && !saving;

  const save = async () => {
    if (step.kind !== 'review' || !plan || !canSave) return;
    setSaving(true);
    let target = calendarId;
    if (target === NEW_SCHOOL || !target) {
      const used = new Set(calendars.map((c) => c.color));
      target = await createCalendar(db, 'School', EventColors.find((c) => !used.has(c)) ?? EventColors[0]);
    }
    const { added, updated } = await saveImport(db, plan, {
      title: step.schedule.title,
      fileName: step.fileName,
      calendarId: target,
      schedule: step.schedule,
      intoGroupId: course?.id,
    });
    rescheduleAll(db);
    close();
    // Importing a syllabus you already added fills in descriptions instead of duplicating it.
    if (updated > 0) {
      notify(
        `Added descriptions to ${updated} item${updated === 1 ? '' : 's'}`,
        added > 0 ? `Also added ${added} new item${added === 1 ? '' : 's'}.` : 'Everything else was already on your calendar.'
      );
    }
  };

  const undo = (record: ImportRecord) =>
    confirmDestructive(`Undo “${record.title}”?`, 'Everything this import added will be removed.', 'Undo import', async () => {
      await undoImport(db, record.id);
      rescheduleAll(db);
      setImports(await loadImports());
    });

  const chipCalendars: Calendar[] = school
    ? calendars
    : [
        ...calendars,
        // A stand-in chip for the calendar that gets created on save.
        { id: NEW_SCHOOL, name: '+ New “School”', color: theme.accent, visible: 1, is_default: 0, sort_order: 999, created_at: '', updated_at: '' },
      ];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: course ? `Add to ${course.name}` : 'Import schedule',
          headerLeft: nativeOnly(() => (
            <Pressable onPress={close} hitSlop={8}>
              <ThemedText style={{ color: theme.accent }}>{step.kind === 'review' ? 'Cancel' : 'Close'}</ThemedText>
            </Pressable>
          )),
        }}
      />

      {step.kind === 'start' && (
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">{course ? `Add a document for ${course.name}` : 'Add a syllabus or schedule'}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {course
              ? 'Pick a syllabus, schedule, assignment sheet or exam guide for this class. Everything Daybook finds goes into this class, and you choose what to add first.'
              : 'Pick a PDF or a screenshot. Daybook reads your class times, exams, homework and breaks, and you choose what to add before anything changes.'}
          </ThemedText>
          <Button title="Choose file…" onPress={pick} />
          <View style={styles.block}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              OR PASTE A PAGE
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              On a Moodle, Canvas or other school page, select all, copy, and paste it here. Daybook finds the due dates
              and exams.
            </ThemedText>
            <TextInput
              value={pasted}
              onChangeText={setPasted}
              multiline
              placeholder="Paste the page text…"
              placeholderTextColor={theme.textSecondary}
              style={[styles.paste, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <Button title="Read pasted text" onPress={readPasted} disabled={pasted.trim().length < 20} />
          </View>
          {step.error && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {step.error}
            </ThemedText>
          )}
          {imports.length > 0 && (
            <View style={styles.block}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                IMPORTED
              </ThemedText>
              {imports.map((record) => (
                <ThemedView key={record.id} type="backgroundElement" style={styles.importRow}>
                  <View style={styles.flex}>
                    <ThemedText type="small">{record.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {new Date(record.created_at).toLocaleDateString()} · {record.file_name}
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => undo(record)} hitSlop={6}>
                    <ThemedText type="small" style={{ color: theme.danger }}>
                      Undo
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {step.kind === 'reading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
          <ThemedText type="smallBold">Reading {step.fileName}…</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            This usually takes 30–90 seconds for a full syllabus.
          </ThemedText>
        </View>
      )}

      {step.kind === 'review' && (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <View>
              <ThemedText type="subtitle">{step.schedule.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {step.fileName} · read for about ${step.costUsd.toFixed(2)}
              </ThemedText>
            </View>

            {step.schedule.warnings.length > 0 && (
              <ThemedView type="backgroundElement" style={[styles.warnings, { borderColor: theme.danger }]}>
                <ThemedText type="smallBold">Double-check</ThemedText>
                {step.schedule.warnings.map((warning) => (
                  <ThemedText key={warning} type="small" themeColor="textSecondary">
                    • {warning}
                  </ThemedText>
                ))}
              </ThemedView>
            )}

            {!course && (
              <View style={styles.block}>
                <ThemedText type="small" themeColor="textSecondary">
                  Add to calendar
                </ThemedText>
                <CalendarChips calendars={chipCalendars} value={calendarId} onChange={setCalendarId} />
              </View>
            )}

            {step.schedule.courses.map((course, i) => (
              <ImportCourseCard
                key={i}
                course={course}
                choice={choices[i]}
                onChange={(next) => setChoices(choices.map((c, j) => (j === i ? next : c)))}
              />
            ))}
          </ScrollView>
          <ThemedView style={[styles.footer, { borderColor: theme.backgroundSelected }]}>
            <Button
              onPress={save}
              disabled={!canSave && !saving}
              busy={saving}
              title={
                needsSection
                  ? `Pick your section for ${needsSection.code ?? needsSection.name}`
                  : total === 0
                    ? 'Nothing selected'
                    : `Add ${[
                        counts.events && `${counts.events} event${counts.events === 1 ? '' : 's'}`,
                        counts.tasks && `${counts.tasks} task${counts.tasks === 1 ? '' : 's'}`,
                      ]
                        .filter(Boolean)
                        .join(' and ')}`
              }
            />
          </ThemedView>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  block: { gap: Spacing.two },
  importRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Spacing.two, padding: Spacing.two },
  flex: { flex: 1 },
  paste: { minHeight: 120, maxHeight: 240, borderRadius: Spacing.two, padding: Spacing.two, fontSize: 15, textAlignVertical: 'top' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  centerText: { textAlign: 'center' },
  warnings: { borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.one, borderLeftWidth: 3 },
  footer: { padding: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
});
