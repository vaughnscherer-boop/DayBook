import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { dateToTime, toDateKey, toDateTimeKey } from '@/lib/dates';

import type { DateTimeFieldProps } from './date-time-field';

const INPUT_TYPE = { date: 'date', time: 'time', datetime: 'datetime-local' } as const;

function toInputValue(date: Date, mode: DateTimeFieldProps['mode']) {
  if (mode === 'date') return toDateKey(date);
  if (mode === 'time') return dateToTime(date);
  return toDateTimeKey(date);
}

function fromInputValue(raw: string, previous: Date, mode: DateTimeFieldProps['mode']) {
  if (mode === 'time') {
    const [h, m] = raw.split(':').map(Number);
    const next = new Date(previous);
    next.setHours(h, m, 0, 0);
    return next;
  }
  return new Date(mode === 'date' ? `${raw}T${dateToTime(previous)}` : raw);
}

/** Web fallback: a plain browser date/time input. */
export function DateTimeField({ label, value, onChange, mode }: DateTimeFieldProps) {
  return (
    <View style={styles.row}>
      <ThemedText>{label}</ThemedText>
      {createElement('input', {
        type: INPUT_TYPE[mode],
        value: toInputValue(value, mode),
        onChange: (e: { target: { value: string } }) => {
          if (e.target.value) onChange(fromInputValue(e.target.value, value, mode));
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});
