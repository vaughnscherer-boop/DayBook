import type { CalendarItem } from '@/lib/calendar-items';
import { freeGapsOn } from '@/lib/day-brief';
import { daysBetween, shiftKey } from '@/lib/dates';
import { isStudySession, sessionsFor } from '@/lib/study-sessions';

/**
 * Proposes study sessions before an exam: spread over the days before it, one per class per day,
 * each in a free stretch of that day. Pure, like day-brief.ts.
 */

export type StudySession = { day: string; start: string; end: string }; // 'HH:MM'

const SESSION_MINUTES = 60;
const MIN_SESSION_MINUTES = 45;
/** Sessions go in the first free stretch from here on, or the earliest one of the day if none. */
const PREFERRED_FROM = '15:00';

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/** How many sessions an exam this far off deserves. */
export function sessionTarget(daysAhead: number): number {
  if (daysAhead >= 10) return 4;
  if (daysAhead >= 5) return 3;
  if (daysAhead >= 2) return 2;
  return daysAhead >= 1 ? 1 : 0;
}

/**
 * Sessions to add for `exam` on top of those already planned. `items` must cover today through the
 * exam's day. Skips days that are full or already have a session for the same class.
 */
export function planStudy(
  items: CalendarItem[],
  exam: { title: string; groupId: string | null; startDay: string },
  today: string,
  now = new Date()
): StudySession[] {
  const ahead = daysBetween(today, exam.startDay);
  const need = sessionTarget(ahead) - sessionsFor(items, exam).length;
  if (need <= 0) return [];

  // Days before the exam; with a single day to go, that's today (from now on).
  const days: string[] = [];
  for (let i = ahead === 1 ? 0 : 1; i < ahead; i++) days.push(shiftKey(today, i));
  const busyCourse = new Set(
    items.filter((item) => isStudySession(item) && item.groupId === exam.groupId).map((item) => item.startDay)
  );
  const nowClock = clock(Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15);

  const gapFor = (day: string): StudySession | null => {
    const from = day === today ? nowClock : '00:00';
    const gaps = freeGapsOn(items, day, from, MIN_SESSION_MINUTES);
    // Afternoon or evening if any gap has room from PREFERRED_FROM on; otherwise the earliest gap.
    const late = gaps
      .map((g) => ({ start: g.start < PREFERRED_FROM ? PREFERRED_FROM : g.start, end: g.end }))
      .find((g) => minutes(g.end) - minutes(g.start) >= MIN_SESSION_MINUTES);
    const gap = late ?? gaps[0];
    if (!gap) return null;
    const length = Math.min(SESSION_MINUTES, minutes(gap.end) - minutes(gap.start));
    return { day, start: gap.start, end: clock(minutes(gap.start) + length) };
  };

  const picked: StudySession[] = [];
  const used = new Set<string>();
  const wanted = Math.min(need, days.length);
  for (let k = 0; k < wanted; k++) {
    // The k-th evenly spread day; if that one is taken or full, the nearest that works.
    const ideal = Math.round(((k + 1) * days.length) / wanted) - 1;
    const order = days
      .map((_, index) => index)
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal) || b - a);
    for (const index of order) {
      const day = days[index];
      if (used.has(day) || busyCourse.has(day)) continue;
      const session = gapFor(day);
      if (!session) continue;
      used.add(day);
      picked.push(session);
      break;
    }
  }
  return picked.sort((a, b) => a.day.localeCompare(b.day));
}
