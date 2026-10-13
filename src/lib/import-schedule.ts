import { fromKey } from '@/lib/dates';
import { courseCode, tokens } from '@/lib/grouping';
import type { ItemType } from '@/lib/item-type';
import { firstMatchingDay, type RepeatRule } from '@/lib/recurrence';
import type { ItemKind, MeetingKind, ScheduleCourse, ScheduleImport, ScheduleItem, ScheduleMeeting } from '@/lib/schedule-format';

/**
 * Turns what Claude read from a syllabus, plus what you ticked on the review screen, into the
 * groups, repeating class events, dated events and tasks to save. Pure, so it can be tested
 * without spending API credit; `src/db/imports.ts` writes the result.
 */

/** Your choices for one course on the review screen (arrays line up with the course's meetings/items). */
export type CourseChoice = { section: string | null; meetings: boolean[]; items: boolean[] };

export type EventDraft = {
  course: number;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  repeat: RepeatRule | null;
  repeat_until: string | null;
  exceptions: string[];
  item_type: ItemType;
  details: string | null;
};
export type TaskDraft = {
  course: number;
  title: string;
  notes: string | null;
  date: string;
  time: string | null;
  item_type: ItemType;
  details: string | null;
};
export type GroupDraft = { course: number; name: string; keywords: string[] };
export type ImportPlan = { groups: GroupDraft[]; events: EventDraft[]; tasks: TaskDraft[] };

/** Kinds that become tasks to tick off; the rest become calendar events. */
export const TASK_KINDS: ItemKind[] = ['assignment', 'reading'];

/** Each kind's type within the course group, which picks its shade of the course color. */
const MEETING_TYPES: Record<MeetingKind, ItemType> = {
  lecture: 'class',
  lab: 'class',
  discussion: 'class',
  other: 'class',
  office_hours: 'other',
  study_session: 'other',
};
const ITEM_TYPES: Record<ItemKind, ItemType> = {
  exam: 'exam',
  quiz: 'exam',
  assignment: 'assignment',
  presentation: 'assignment',
  reading: 'reading',
  event: 'other',
  break: 'other',
};

/** Kinds shown unticked at first (there are usually lots of them). */
const OFF_BY_DEFAULT: ItemKind[] = ['reading'];

/** Whether something for `section` applies to someone in `chosen` (null section = everyone). */
export const fitsSection = (section: string | null, chosen: string | null) => section === null || section === chosen;

/** Starting ticks: required meetings and everything for your section, minus readings and optional sessions. */
export function defaultChoice(course: ScheduleCourse, section: string | null = course.sections.length === 1 ? course.sections[0] : null): CourseChoice {
  return {
    section,
    meetings: course.meetings.map((m) => !m.optional && fitsSection(m.section, section)),
    items: course.items.map((item) => !OFF_BY_DEFAULT.includes(item.kind) && fitsSection(item.section, section)),
  };
}

/** Switching section re-ticks the section-specific rows to match; everything else keeps your ticks. */
export function changeSection(course: ScheduleCourse, choice: CourseChoice, section: string | null): CourseChoice {
  const fresh = defaultChoice(course, section);
  return {
    section,
    meetings: course.meetings.map((m, i) => (m.section === null ? choice.meetings[i] : fresh.meetings[i])),
    items: course.items.map((item, i) => (item.section === null ? choice.items[i] : fresh.items[i])),
  };
}

/** "BIO 150", or the course name when there's no code. */
export const courseLabel = (course: ScheduleCourse) => course.code ?? course.name;

/** Words that mean this course, for automatic grouping and "due next class". */
export function courseKeywords(course: ScheduleCourse): string[] {
  const keywords = new Set<string>();
  for (const text of [course.code, course.nickname, course.name]) {
    const words = text ? tokens(text).join(' ') : '';
    if (words) keywords.add(words);
  }
  const code = course.code ? courseCode(course.code) : null;
  if (code) keywords.add(code.keyword);
  return [...keywords];
}

/** The class meeting an "at class" item lines up with on `date`: its section's, else the lecture. */
function classOn(course: ScheduleCourse, choice: CourseChoice, item: ScheduleItem): ScheduleMeeting | null {
  const weekday = fromKey(item.date).getDay();
  const candidates = course.meetings.filter(
    (m) =>
      !m.optional &&
      m.weekdays.includes(weekday) &&
      fitsSection(m.section, choice.section) &&
      (item.section === null || m.section === item.section || m.section === null)
  );
  return candidates.find((m) => item.section !== null && m.section === item.section) ?? candidates.find((m) => m.section === null) ?? candidates[0] ?? null;
}

const addHour = (time: string) => `${String(Math.min(Number(time.slice(0, 2)) + 1, 23)).padStart(2, '0')}${time.slice(2)}`;

export function buildImportPlan(schedule: ScheduleImport, choices: CourseChoice[], today: string): ImportPlan {
  const plan: ImportPlan = { groups: [], events: [], tasks: [] };

  schedule.courses.forEach((course, c) => {
    const choice = choices[c];
    const pickedMeetings = course.meetings.filter((_, i) => choice.meetings[i]);
    const pickedItems = course.items.filter((_, i) => choice.items[i]);
    if (pickedMeetings.length === 0 && pickedItems.length === 0) return;

    const label = courseLabel(course);
    plan.groups.push({ course: c, name: label, keywords: courseKeywords(course) });

    for (const meeting of pickedMeetings) {
      const rule: RepeatRule = { freq: 'weekly', interval: 1, weekdays: [...meeting.weekdays].sort() };
      const from = meeting.first_date ?? schedule.term_start ?? today;
      const first = firstMatchingDay(rule, from);
      const title = meeting.label.toLowerCase().startsWith(label.toLowerCase()) ? meeting.label : `${label} ${meeting.label}`;
      plan.events.push({
        course: c,
        title,
        notes: meeting.location ? `Location: ${meeting.location}` : null,
        starts_at: `${first}T${meeting.start_time}`,
        ends_at: `${first}T${meeting.end_time > meeting.start_time ? meeting.end_time : addHour(meeting.start_time)}`,
        all_day: false,
        repeat: rule,
        repeat_until: meeting.last_date ?? schedule.term_end,
        exceptions: meeting.cancelled_dates,
        item_type: MEETING_TYPES[meeting.kind],
        details: null,
      });
    }

    for (const item of pickedItems) {
      const atClass = item.at_class && !item.start_time ? classOn(course, choice, item) : null;
      const start = item.start_time ?? atClass?.start_time ?? null;
      const notes = item.notes;
      const item_type = ITEM_TYPES[item.kind];
      // Responses saved before descriptions existed have no `details`.
      const details = item.details?.trim() || null;
      if (TASK_KINDS.includes(item.kind)) {
        // Due at the start of that day's class when it's due "at class".
        plan.tasks.push({ course: c, title: item.title, notes, date: item.date, time: start, item_type, details });
        continue;
      }
      if (start && item.kind !== 'break') {
        const end = item.end_time ?? atClass?.end_time ?? addHour(start);
        plan.events.push({
          course: c,
          title: item.title,
          notes,
          starts_at: `${item.date}T${start}`,
          ends_at: `${item.date}T${end > start ? end : addHour(start)}`,
          all_day: false,
          repeat: null,
          repeat_until: null,
          exceptions: [],
          item_type,
          details,
        });
      } else {
        const last = item.end_date && item.end_date > item.date ? item.end_date : item.date;
        plan.events.push({
          course: c,
          title: item.title,
          notes,
          starts_at: `${item.date}T00:00`,
          ends_at: `${last}T23:59`,
          all_day: true,
          repeat: null,
          repeat_until: null,
          exceptions: [],
          item_type,
          details,
        });
      }
    }
  });
  return plan;
}

/** How many events and tasks the current ticks would add. */
export function countPlan(plan: ImportPlan) {
  return { events: plan.events.length, tasks: plan.tasks.length };
}

/** A friendly "Mon, Sep 14" for review rows. */
export function shortDate(day: string): string {
  return fromKey(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
