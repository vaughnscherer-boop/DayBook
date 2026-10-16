import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import type { Group } from '@/db/groups';
import { itemsOnDay, textOn, type CalendarItem } from '@/lib/calendar-items';
import { formatShortTime, toDateKey, toDateTimeKey } from '@/lib/dates';

/** Where an item happens: "Location: …" in its notes (from imports), else its class's room. */
function whereIs(item: CalendarItem, groups: Group[]): string | null {
  return item.notes?.match(/Location:\s*(.+)/)?.[1]?.trim() ?? groups.find((g) => g.id === item.groupId)?.location ?? null;
}

/** "in 25 min", "in 1 h 10 min" */
function untilStart(fromMinutes: number) {
  if (fromMinutes < 60) return `in ${fromMinutes} min`;
  const hours = Math.floor(fromMinutes / 60);
  const minutes = fromMinutes % 60;
  return `in ${hours} h${minutes ? ` ${minutes} min` : ''}`;
}

function openDirections(place: string) {
  const query = encodeURIComponent(place);
  const url = Platform.select({
    ios: `maps://?q=${query}`,
    android: `geo:0,0?q=${query}`,
    default: `https://www.google.com/maps/search/?api=1&query=${query}`,
  });
  Linking.openURL(url).catch(() => {});
}

const minutesOf = (key: string) => Number(key.slice(11, 13)) * 60 + Number(key.slice(14, 16));

/**
 * Top of Home on a school day: the class (or test) you're in right now, or the next one today, with
 * how long until it starts and directions to the room. Nothing once the day's classes are over.
 */
export function NextClassCard({ items, groups }: { items: CalendarItem[]; groups: Group[] }) {
  // Re-render each minute so "in 25 min" counts down and the card moves on when a class ends.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const today = toDateKey(now);
  const nowKey = toDateTimeKey(now);
  const classes = itemsOnDay(items, today)
    .filter((item) => item.kind === 'event' && !item.allDay && (item.itemType === 'class' || item.itemType === 'exam'))
    .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));
  const current = classes.find((item) => item.startsAt! <= nowKey && item.endsAt! > nowKey);
  const next = current ?? classes.find((item) => item.startsAt! > nowKey);
  if (!next) return null;

  const ink = textOn(next.color);
  const place = whereIs(next, groups);
  const when = current
    ? `Now · until ${formatShortTime(next.endsAt!)}`
    : `Next · ${formatShortTime(next.startsAt!)} · ${untilStart(minutesOf(next.startsAt!) - minutesOf(nowKey))}`;

  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: next.id, date: next.occurrenceDate } })}
      accessibilityRole="button"
      accessibilityLabel={`${when}: ${next.title}${place ? ` in ${place}` : ''}`}
      style={[styles.card, { backgroundColor: next.color }]}>
      <View style={styles.text}>
        <ThemedText type="smallBold" style={{ color: ink }}>
          {when}
        </ThemedText>
        <ThemedText type="smallBold" numberOfLines={1} style={[styles.title, { color: ink }]}>
          {next.title}
        </ThemedText>
        {place && (
          <ThemedText type="small" numberOfLines={1} style={{ color: ink }}>
            {place}
          </ThemedText>
        )}
      </View>
      {place && (
        <Pressable
          onPress={() => openDirections(place)}
          accessibilityRole="button"
          accessibilityLabel={`Directions to ${place}`}
          hitSlop={8}
          style={[styles.directions, { borderColor: ink }]}>
          <Icon name="location" size={14} color={ink} />
          <ThemedText type="smallBold" style={{ color: ink }}>
            Directions
          </ThemedText>
        </Pressable>
      )}
      {!place && (
        <ThemedText type="smallBold" style={[styles.time, { color: ink }]}>
          {formatShortTime(next.startsAt!)}
        </ThemedText>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Radius.lg, borderCurve: 'continuous', padding: Spacing.three },
  time: { fontVariant: ['tabular-nums'] },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: 800, letterSpacing: -0.2 },
  directions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.two,
  },
});
