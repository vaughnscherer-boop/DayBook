import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StudyPlanner } from '@/components/course/study-planner';
import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import type { CalendarItem } from '@/lib/calendar-items';
import { shortDate } from '@/lib/import-schedule';

type Props = {
  /** The class's upcoming exams and assignments, soonest first. */
  choices: CalendarItem[];
  calendarId: string | null;
  /** Items from today through `day`, so busy times and earlier sessions are known. */
  itemsUntil: (day: string) => CalendarItem[];
  onChanged: () => void;
};

/** One study planner for a class, with a pick of which exam or assignment to plan for. */
export function CourseStudy({ choices, calendarId, itemsUntil, onChanged }: Props) {
  // Exams first: they're what most people plan study time for.
  const [picked, setPicked] = useState<string | null>(null);
  const exam = choices.find((c) => c.key === picked) ?? choices.find((c) => c.itemType === 'exam') ?? choices[0];
  if (!exam) return null;

  return (
    <StudyPlanner
      // A fresh planner for each pick, so one item's proposal doesn't carry over to another.
      key={exam.key}
      exam={exam}
      calendarId={calendarId}
      items={itemsUntil(exam.startDay)}
      onChanged={onChanged}
      picker={
        choices.length > 1 ? (
          <View style={styles.chips}>
            {choices.map((choice) => (
              <Chip
                key={choice.key}
                label={`${choice.title} · ${shortDate(choice.startDay)}`}
                selected={choice.key === exam.key}
                onPress={() => setPicked(choice.key)}
              />
            ))}
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            For {exam.title} · {shortDate(exam.startDay)}
          </ThemedText>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
