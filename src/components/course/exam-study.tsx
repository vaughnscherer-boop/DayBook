import { useCalendarData } from '@/hooks/use-calendar-data';
import { StudyPlanner } from '@/components/course/study-planner';
import { shiftKey, todayKey } from '@/lib/dates';

/** The study planner for the exam or quiz with this id (the event or task screen's own item); nothing for other items. */
export function ExamStudy({ id }: { id: string }) {
  const { itemsBetween, events, tasks, reload } = useCalendarData();
  const today = todayKey();
  const exam = itemsBetween(today, shiftKey(today, 365)).find((item) => item.id === id && item.itemType === 'exam' && !item.repeating);
  if (!exam) return null;
  const calendarId = (exam.kind === 'event' ? events : tasks).find((row) => row.id === id)?.calendar_id ?? null;
  return <StudyPlanner exam={exam} calendarId={calendarId} items={itemsBetween(today, exam.startDay)} onChanged={reload} />;
}
