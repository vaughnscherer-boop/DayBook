import { useMemo, useState, type Ref } from 'react';
import { ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { Calendar as MiniMonth } from 'react-native-calendars';

import { AddBox, type NewEntry } from '@/components/add-box';
import { CalendarList } from '@/components/calendar-list';
import { DayAgenda } from '@/components/day-agenda';
import { NotificationSettings } from '@/components/notification-settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Calendar } from '@/db/calendars';
import { useTheme } from '@/hooks/use-theme';
import { itemsOnDay, type CalendarItem } from '@/lib/calendar-items';
import { fromKey, monthGrid } from '@/lib/dates';

type Props = {
  calendars: Calendar[];
  focusedDate: string;
  /** Calendar chosen in the add box (remembered between launches). */
  calendarId: string | null;
  onCalendarChange: (calendarId: string) => void;
  onAdd: (entry: NewEntry) => void;
  itemsBetween: (start: string, end: string) => CalendarItem[];
  onOpenItem: (item: CalendarItem) => void;
  onToggleTask: (item: CalendarItem) => void;
  onChanged: () => void;
  inputRef?: Ref<TextInput>;
};

/** Add box, mini month, calendars and reminder settings. Docked on wide screens, a drawer on phones. */
export function SidePanel(props: Props) {
  const theme = useTheme();
  // Day clicked in the mini month (its list drops down below); the big calendar doesn't move.
  const [peekDay, setPeekDay] = useState<string | null>(null);
  const [miniMonth, setMiniMonth] = useState(props.focusedDate);

  const { itemsBetween } = props;
  const markedDates = useMemo(() => {
    const weeks = monthGrid(fromKey(miniMonth));
    const marks: Record<string, { marked?: boolean; selected?: boolean }> = {};
    for (const item of itemsBetween(weeks[0][0], weeks[weeks.length - 1][6])) {
      marks[item.startDay] = { marked: true };
    }
    if (peekDay) marks[peekDay] = { ...marks[peekDay], selected: true };
    return marks;
  }, [itemsBetween, miniMonth, peekDay]);

  const miniTheme = useMemo(
    () => ({
      calendarBackground: 'transparent',
      dayTextColor: theme.text,
      monthTextColor: theme.text,
      textSectionTitleColor: theme.textSecondary,
      textDisabledColor: theme.textSecondary,
      todayTextColor: theme.accent,
      selectedDayBackgroundColor: theme.accent,
      selectedDayTextColor: '#ffffff',
      arrowColor: theme.accent,
      dotColor: theme.accent,
      selectedDotColor: '#ffffff',
      textDayFontSize: 13,
      textMonthFontSize: 14,
      textDayHeaderFontSize: 11,
    }),
    [theme]
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <AddBox
        calendars={props.calendars}
        referenceDay={fromKey(props.focusedDate)}
        calendarId={props.calendarId}
        onCalendarChange={props.onCalendarChange}
        onAdd={props.onAdd}
        inputRef={props.inputRef}
      />

      <View>
        <MiniMonth
          key={theme.background}
          current={props.focusedDate}
          markedDates={markedDates}
          onDayPress={(day) => setPeekDay(peekDay === day.dateString ? null : day.dateString)}
          onMonthChange={(month) => setMiniMonth(month.dateString)}
          firstDay={0}
          hideExtraDays={false}
          theme={miniTheme}
          style={styles.miniMonth}
        />
        {peekDay && (
          <DayAgenda
            day={peekDay}
            items={itemsOnDay(itemsBetween(peekDay, peekDay), peekDay)}
            onClose={() => setPeekDay(null)}
            onOpenItem={props.onOpenItem}
            onToggleTask={props.onToggleTask}
          />
        )}
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          CALENDARS
        </ThemedText>
        <CalendarList calendars={props.calendars} onChanged={props.onChanged} />
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          REMINDERS
        </ThemedText>
        <NotificationSettings />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.four },
  miniMonth: { paddingLeft: 0, paddingRight: 0, marginBottom: Spacing.two },
  section: { gap: Spacing.two },
});
