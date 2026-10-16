import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fromKey, todayKey, weekDays } from '@/lib/dates';
import { tap } from '@/lib/haptics';

type Props = {
  day: string;
  onPick: (day: string) => void;
};

/** The week around `day`, one column per day; the chosen day sits in a dark rounded box. */
export function WeekStrip({ day, onPick }: Props) {
  const theme = useTheme();
  const today = todayKey();

  return (
    <View style={[styles.strip, { borderColor: theme.backgroundSelected }]}>
      {weekDays(fromKey(day)).map((key) => {
        const selected = key === day;
        const isToday = key === today;
        const color = selected ? theme.onAccent : theme.text;
        return (
          <Pressable
            key={key}
            onPress={() => {
              if (!selected) tap();
              onPick(key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={fromKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            style={[styles.day, selected && { backgroundColor: theme.accent }]}>
            <ThemedText type="small" style={{ color: selected ? theme.onAccent : theme.textSecondary }}>
              {fromKey(key).toLocaleDateString(undefined, { weekday: 'short' })}
            </ThemedText>
            <ThemedText style={[styles.number, { color }]}>{Number(key.slice(8))}</ThemedText>
            <View style={[styles.todayDot, { backgroundColor: isToday ? color : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  day: { flex: 1, alignItems: 'center', gap: 2, paddingTop: Spacing.two, paddingBottom: Spacing.two, borderRadius: Radius.md, borderCurve: 'continuous' },
  number: { fontSize: 17, lineHeight: 22, fontWeight: 600, fontVariant: ['tabular-nums'] },
  todayDot: { width: 4, height: 4, borderRadius: 2 },
});
