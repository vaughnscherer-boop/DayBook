import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { EventColors, Spacing } from '@/constants/theme';
import { createCalendar, type Calendar } from '@/db/calendars';
import { addFeed, listFeeds, removeFeed, type Feed } from '@/db/feeds';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { readFeedOnServer } from '@/lib/feed-api';
import { FEED_SITES, type FeedSite } from '@/lib/feed-format';
import { getFeedStatus, refreshFeed, subscribeFeedStatus } from '@/lib/feed-sync';

type Props = { calendars: Calendar[]; onChanged: () => void };

/**
 * Settings → School sites: paste the calendar link from Canvas, Moodle, Blackboard, Brightspace or
 * Schoology and its assignments and events appear in Daybook, grouped by course, and stay up to date.
 */
export function SchoolFeeds({ calendars, onChanged }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const status = useSyncExternalStore(subscribeFeedStatus, getFeedStatus);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => listFeeds(db).then(setFeeds), [db]);
  // Reload the list when a refresh finishes (its last-synced time changes).
  useEffect(() => {
    load();
  }, [load, status]);

  const connect = async () => {
    const link = url.trim();
    if (!link || busy) return;
    setBusy(true);
    setError(null);
    const response = await readFeedOnServer(link);
    if (!response.ok) {
      setBusy(false);
      return setError(response.error);
    }
    // Everything lands in a "School" calendar: an existing one, or a new one.
    let calendarId = calendars.find((c) => /school/i.test(c.name))?.id;
    if (!calendarId) {
      const used = new Set(calendars.map((c) => c.color));
      calendarId = await createCalendar(db, 'School', EventColors.find((c) => !used.has(c)) ?? EventColors[0]);
    }
    const label = response.site === 'other' ? hostOf(link) : FEED_SITES[response.site].name;
    const id = await addFeed(db, { url: link, site: response.site, label, calendarId });
    const feed = (await listFeeds(db)).find((f) => f.id === id);
    setUrl('');
    setAdding(false);
    setBusy(false);
    if (feed) await refreshFeed(db, feed);
    await load();
    onChanged();
  };

  const refresh = async (feed: Feed) => {
    await refreshFeed(db, feed);
    onChanged();
  };

  const remove = (feed: Feed) =>
    confirmDestructive(
      `Remove “${feed.label}”?`,
      'Everything it added to your calendar is removed too, including anything you ticked off.',
      'Remove',
      async () => {
        await removeFeed(db, feed.id);
        await load();
        onChanged();
      }
    );

  return (
    <View style={styles.container}>
      {feeds.length === 0 && !adding && (
        <EmptyState text="Connect Canvas, Moodle or another school site to get your assignments automatically." icon="class" />
      )}

      {feeds.map((feed) => {
        const state = status[feed.id];
        return (
          <ThemedView key={feed.id} type="backgroundElement" style={styles.card}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">{feed.label}</ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {state?.state === 'syncing'
                    ? 'Updating…'
                    : state?.state === 'ok'
                      ? summary(state.result)
                      : feed.last_synced_at
                        ? `Updated ${new Date(feed.last_synced_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                        : 'Not updated yet'}
                </ThemedText>
                {state?.state === 'error' && (
                  <ThemedText type="caption" style={{ color: theme.danger }}>
                    {state.message}
                  </ThemedText>
                )}
              </View>
              <Pressable onPress={() => refresh(feed)} hitSlop={8} disabled={state?.state === 'syncing'} accessibilityRole="button">
                <ThemedText type="small" style={{ color: theme.accent }}>
                  Refresh
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => remove(feed)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${feed.label}`}>
                <ThemedText type="small" style={{ color: theme.danger }}>
                  Remove
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        );
      })}

      {adding ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            Paste your school site’s calendar link:
          </ThemedText>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://… or webcal://…"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onSubmitEditing={connect}
            accessibilityLabel="Calendar feed link"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          {error && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          )}
          <View style={styles.hints}>
            {(Object.keys(FEED_SITES) as FeedSite[]).map((site) => (
              <ThemedText key={site} type="caption" themeColor="textSecondary">
                {FEED_SITES[site].hint}
              </ThemedText>
            ))}
          </View>
          <View style={styles.row}>
            <Button title="Cancel" variant="ghost" onPress={() => { setAdding(false); setError(null); }} style={styles.flex} />
            <Button title="Connect" onPress={connect} busy={busy} disabled={!url.trim()} style={styles.flex} />
          </View>
        </ThemedView>
      ) : (
        <Button title="Add a school site" variant="secondary" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}

function summary(result: { added: number; updated: number; removed: number }): string {
  const parts = [
    result.added ? `${result.added} added` : '',
    result.updated ? `${result.updated} changed` : '',
    result.removed ? `${result.removed} removed` : '',
  ].filter(Boolean);
  return parts.length ? `Just now: ${parts.join(', ')}` : 'Up to date';
}

function hostOf(link: string): string {
  try {
    return new URL(link.replace(/^webcals?:\/\//i, 'https://')).hostname.replace(/^www\./, '');
  } catch {
    return 'Calendar feed';
  }
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
  input: { fontSize: 15, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.one },
  hints: { gap: Spacing.one },
});
