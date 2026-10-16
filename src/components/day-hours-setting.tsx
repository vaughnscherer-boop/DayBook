import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { DEFAULT_SETTINGS, getSettings, setSetting } from '@/db/settings';
import { notifyDataChanged } from '@/lib/data-events';
import { dateToTime, timeToDate } from '@/lib/dates';

/** Settings: the hours your day runs, which Today's free time and planned study sessions stay inside. */
export function DayHoursSetting() {
  const db = useSQLiteContext();
  const [hours, setHours] = useState({ start: DEFAULT_SETTINGS.dayStart, end: DEFAULT_SETTINGS.dayEnd });

  useFocusEffect(
    useCallback(() => {
      getSettings(db).then((settings) => setHours({ start: settings.dayStart, end: settings.dayEnd }));
    }, [db])
  );

  const change = async (key: 'dayStart' | 'dayEnd', date: Date) => {
    const time = dateToTime(date);
    setHours((prev) => (key === 'dayStart' ? { ...prev, start: time } : { ...prev, end: time }));
    await setSetting(db, key, time);
    // Screens reload and pick the new hours up.
    notifyDataChanged();
  };

  return (
    <ThemedView type="backgroundElement" style={styles.group}>
      <DateTimeField label="My day starts" mode="time" value={timeToDate(hours.start)} onChange={(d) => change('dayStart', d)} />
      <DateTimeField label="My day ends" mode="time" value={timeToDate(hours.end)} onChange={(d) => change('dayEnd', d)} />
      <ThemedText type="small" themeColor="textSecondary">
        Free time on Today and planned study sessions stay inside these hours. Studying late? Set the end to midnight.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.two },
});
