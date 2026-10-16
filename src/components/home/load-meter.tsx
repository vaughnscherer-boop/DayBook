import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { formatMinutes, fromKey } from '@/lib/dates';
import { weekLoad } from '@/lib/load';

const BAR_HEIGHT = 56;

/**
 * "This week's load" on Home: each day's work due (filled) against its free time (the track), so a
 * crunch shows up days ahead. Overloaded days are red; tap one to see it and move things off it.
 */
export function LoadMeter({ items, today }: { items: CalendarItem[]; today: string }) {
  const theme = useTheme();
  const load = weekLoad(items, today);
  if (load.every((day) => day.tasks === 0)) return null;
  const scale = Math.max(60, ...load.map((day) => Math.max(day.dueMinutes, Math.min(day.freeMinutes, 8 * 60))));
  const heavy = load.filter((day) => day.overloaded);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.head}>
        <ThemedText type="label" style={styles.flex}>
          This week’s load
        </ThemedText>
        <ThemedText type="small" style={{ color: heavy.length ? theme.danger : theme.textSecondary }}>
          {heavy.length
            ? `${heavy.length} day${heavy.length === 1 ? '' : 's'} won’t fit`
            : `${formatMinutes(load.reduce((sum, day) => sum + day.dueMinutes, 0))} of work`}
        </ThemedText>
      </View>
      <View style={styles.days}>
        {load.map((day) => {
          const track = Math.min(BAR_HEIGHT, (Math.min(day.freeMinutes, scale) / scale) * BAR_HEIGHT);
          const fill = Math.min(BAR_HEIGHT, (day.dueMinutes / scale) * BAR_HEIGHT);
          const color = day.overloaded ? theme.danger : theme.accent;
          return (
            <Pressable
              key={day.day}
              onPress={() => router.navigate({ pathname: '/today', params: { date: day.day } })}
              accessibilityRole="button"
              accessibilityLabel={`${fromKey(day.day).toLocaleDateString(undefined, { weekday: 'long' })}: ${formatMinutes(
                day.dueMinutes
              )} of work, ${formatMinutes(day.freeMinutes)} free${day.overloaded ? ', overloaded' : ''}`}
              style={styles.day}>
              <View style={[styles.column, { height: BAR_HEIGHT }]}>
                <View style={[styles.track, { height: Math.max(track, 4), borderColor: theme.backgroundSelected }]} />
                {fill > 0 && <View style={[styles.fill, { height: Math.max(fill, 4), backgroundColor: color }]} />}
              </View>
              <ThemedText
                type="caption"
                themeColor={day.day === today ? 'text' : 'textSecondary'}
                style={day.overloaded && { color: theme.danger }}>
                {fromKey(day.day).toLocaleDateString(undefined, { weekday: 'narrow' })}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.twoHalf },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: Spacing.one, flex: 1 },
  column: { width: 14, justifyContent: 'flex-end' },
  // Free time: an outlined track. Work due: a solid bar over it.
  track: { position: 'absolute', bottom: 0, left: 0, right: 0, borderWidth: 1, borderRadius: Radius.full },
  fill: { borderRadius: Radius.full },
});
