import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform, Pressable, ScrollView, StyleSheet, View, type TextInput } from 'react-native';

import { AddBox, type NewEntry } from '@/components/add-box';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CloseToolbar } from '@/components/ui/close-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { getSettings, setSetting } from '@/db/settings';
import { useCalendarData } from '@/hooks/use-calendar-data';
import { useTheme } from '@/hooks/use-theme';
import { readDraft, setDraft } from '@/lib/entry-draft';
import { setPendingPaste } from '@/lib/paste-draft';

// iOS's Paste button is native code newer than some builds; only load it where it exists.
const PasteButton =
  Platform.OS === 'ios' && requireOptionalNativeModule('ExpoClipboard') ? lazy(() => import('@/components/paste-button')) : null;

/** A pasted page (several lines, or a lot of text) goes to import instead of quick add. */
const looksLikeAPage = (text: string) => text.split(/\r?\n/).filter((line) => line.trim()).length > 2 || text.length > 300;

/**
 * Quick add, opened from the bottom bar's +: type it in plain words and check it over in the full
 * form before it's added, or start from a blank form.
 */
export default function NewScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { calendars, classes } = useCalendarData();
  const inputRef = useRef<TextInput>(null);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [today] = useState(() => new Date());
  // Back from the form with Cancel (/new?restore=1): put the typed text back to fix it.
  // `text`: from Siri's "Add to Daybook" (daybook://new?text=…), filled in to check over.
  const { restore, text: spoken } = useLocalSearchParams<{ restore?: string; text?: string }>();
  const [restored] = useState(() => (restore ? readDraft() : null));
  // Text from the Paste button; the add box restarts with it.
  const [pastedText, setPastedText] = useState<string | null>(null);
  const paste = (text: string) => {
    if (looksLikeAPage(text)) {
      setPendingPaste(text);
      replaceWith({ pathname: '/import', params: { paste: '1' } });
    } else setPastedText(text.trim());
  };

  // Start on the calendar you used last time, like the old add box.
  useEffect(() => {
    getSettings(db).then((settings) => setCalendarId(settings.lastCalendarId));
  }, [db]);
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);
  const chosen = calendars.find((c) => c.id === calendarId)?.id ?? calendars.find((c) => c.is_default)?.id ?? null;

  const replaceWith = (href: Parameters<typeof router.push>[0]) => {
    if (router.canGoBack()) router.back();
    router.push(href);
  };
  // Open what was understood in the event or task form, filled in, to change anything before adding.
  const review = ({ kind, parsed, calendarId: target, notes, text }: NewEntry) => {
    setDraft({ parsed, calendarId: target, notes, text, kind });
    replaceWith({ pathname: kind === 'event' ? '/event/[id]' : '/task/[id]', params: { id: 'new', draft: '1' } });
  };

  const row = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={[styles.row, { borderColor: theme.backgroundSelected }]}>
      <View style={[styles.rowIcon, { backgroundColor: theme.backgroundElement }]}>
        <Icon name={icon} size={17} color={theme.text} />
      </View>
      <ThemedText style={styles.flex}>{label}</ThemedText>
      <Icon name="forward" size={13} weight="semibold" color={theme.textSecondary} />
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      {/* A way out besides swiping the sheet down. */}
      <CloseToolbar />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {PasteButton && (
          <View style={styles.pasteRow}>
            <Suspense fallback={null}>
              <PasteButton onPaste={paste} />
            </Suspense>
          </View>
        )}
        <AddBox
          key={pastedText ?? spoken ?? 'typed'}
          calendars={calendars}
          referenceDay={today}
          calendarId={chosen}
          classes={classes}
          onCalendarChange={(id) => {
            setCalendarId(id);
            setSetting(db, 'lastCalendarId', id);
          }}
          onAdd={review}
          inputRef={inputRef}
          initialText={pastedText ?? spoken ?? restored?.text}
          initialKind={restored?.kind}
        />
        <View>
          {row('event', 'New event with all the details', () => replaceWith({ pathname: '/event/[id]', params: { id: 'new' } }))}
          {row('checked', 'New task with all the details', () => replaceWith({ pathname: '/task/[id]', params: { id: 'new' } }))}
          {row('upload', 'Import a syllabus or schedule', () => replaceWith('/import'))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pasteRow: { alignItems: 'flex-end' },
  content: { padding: Spacing.three, gap: Spacing.four },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
    paddingVertical: Spacing.twoHalf,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
