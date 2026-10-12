import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fromKey, toDateKey } from '@/lib/dates';
import { describeRule, type RepeatRule } from '@/lib/recurrence';

type Preset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'none', label: 'Never' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function presetOf(rule: RepeatRule | null): Preset {
  if (!rule) return 'none';
  if (rule.freq === 'weekly') {
    if (rule.interval === 1 && rule.weekdays?.join() === '1,2,3,4,5') return 'weekdays';
    return rule.interval === 2 ? 'biweekly' : 'weekly';
  }
  return rule.freq;
}

type Props = {
  rule: RepeatRule | null;
  until: string | null;
  /** First day of the series ('YYYY-MM-DD'); weekly repeats default to its weekday. */
  startDay: string;
  onChange: (rule: RepeatRule | null) => void;
  onUntilChange: (until: string | null) => void;
};

/** Repeat row for the editors: preset chips, weekday toggles for weekly, and an optional end date. */
export function RepeatPicker({ rule, until, startDay, onChange, onUntilChange }: Props) {
  const theme = useTheme();
  const preset = presetOf(rule);
  const startWeekday = fromKey(startDay).getDay();

  const choose = (value: Preset) => {
    if (value === 'none') onChange(null);
    else if (value === 'daily') onChange({ freq: 'daily', interval: 1 });
    else if (value === 'weekdays') onChange({ freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] });
    else if (value === 'weekly' || value === 'biweekly') {
      onChange({ freq: 'weekly', interval: value === 'weekly' ? 1 : 2, weekdays: [startWeekday] });
    } else onChange({ freq: value, interval: 1 });
  };

  const toggleWeekday = (day: number) => {
    if (rule?.freq !== 'weekly') return;
    const current = rule.weekdays?.length ? rule.weekdays : [startWeekday];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    if (next.length) onChange({ ...rule, weekdays: next.sort() });
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary">
          Repeat
        </ThemedText>
        {rule && (
          <ThemedText type="small" themeColor="textSecondary">
            {describeRule(rule, startDay)}
          </ThemedText>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {PRESETS.map(({ value, label }) => {
          const selected = value === preset;
          return (
            <Pressable
              key={value}
              onPress={() => choose(value)}
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                { borderColor: selected ? theme.accent : theme.backgroundSelected },
                selected && { backgroundColor: theme.accent },
              ]}>
              <ThemedText type="small" style={selected ? styles.selectedText : undefined}>
                {label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {(preset === 'weekly' || preset === 'biweekly') && (
        <View style={styles.weekdays}>
          {DAY_LETTERS.map((letter, day) => {
            const on = (rule?.weekdays?.length ? rule.weekdays : [startWeekday]).includes(day);
            return (
              <Pressable
                key={day}
                onPress={() => toggleWeekday(day)}
                accessibilityState={{ selected: on }}
                style={[styles.weekday, { borderColor: theme.backgroundSelected }, on && { backgroundColor: theme.accent }]}>
                <ThemedText type="small" style={on ? styles.selectedText : undefined}>
                  {letter}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}

      {rule && (
        <>
          <View style={styles.row}>
            <ThemedText>Ends</ThemedText>
            <Switch value={until !== null} onValueChange={(on) => onUntilChange(on ? startDay : null)} />
          </View>
          {until && (
            <DateTimeField
              label="On"
              mode="date"
              value={fromKey(until)}
              onChange={(date) => onUntilChange(toDateKey(date))}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  selectedText: { color: '#ffffff' },
  weekdays: { flexDirection: 'row', gap: Spacing.one },
  weekday: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
