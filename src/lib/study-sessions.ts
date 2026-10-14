import type { CalendarItem } from '@/lib/calendar-items';

/** Study sessions are ordinary events titled "Study: <exam>", in the exam's class. */
export const STUDY_PREFIX = 'Study: ';
export const studyTitle = (exam: string) => `${STUDY_PREFIX}${exam}`;
export const isStudySession = (item: CalendarItem) => item.kind === 'event' && item.title.startsWith(STUDY_PREFIX);

/** The sessions already on the calendar for `exam`, before it. */
export function sessionsFor(
  items: CalendarItem[],
  exam: { title: string; groupId: string | null; startDay: string }
): CalendarItem[] {
  const title = studyTitle(exam.title);
  return items.filter(
    (item) => item.kind === 'event' && item.title === title && item.groupId === exam.groupId && item.startDay < exam.startDay
  );
}
