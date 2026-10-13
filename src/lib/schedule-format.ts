/**
 * What reading a syllabus or schedule produces: courses with their weekly meetings, and dated
 * items (exams, homework, readings...). Shared by the import API route (which asks Claude for
 * exactly this JSON shape) and the app (which reviews and saves it). No secrets here.
 */

export type MeetingKind = 'lecture' | 'lab' | 'discussion' | 'office_hours' | 'study_session' | 'other';
export type ItemKind = 'exam' | 'quiz' | 'assignment' | 'reading' | 'presentation' | 'event' | 'break';

export type ScheduleMeeting = {
  label: string; // "Lecture", "Lab A", "Office hours"
  kind: MeetingKind;
  /** The section this meeting belongs to (one of the course's `sections`), or null if everyone attends. */
  section: string | null;
  /** Optional sessions (office hours, drop-in labs) start unticked. */
  optional: boolean;
  weekdays: number[]; // 0 Sunday – 6 Saturday
  start_time: string; // 'HH:MM' 24-hour
  end_time: string;
  location: string | null;
  first_date: string | null; // 'YYYY-MM-DD'
  last_date: string | null;
  /** Dates this meeting doesn't happen (holidays, breaks, "no class", "no labs"). */
  cancelled_dates: string[];
};

export type ScheduleItem = {
  kind: ItemKind;
  title: string;
  date: string; // 'YYYY-MM-DD'
  end_date: string | null; // breaks spanning several days
  start_time: string | null;
  end_time: string | null;
  /** Due or held at that day's class meeting (time comes from the class). */
  at_class: boolean;
  section: string | null;
  notes: string | null;
  /** What the document says about it: what to do, what it covers, format, weight, how to submit. */
  details: string | null;
};

export type ScheduleCourse = {
  code: string | null; // "BIO 150"
  name: string; // "Evolution" / "Beginning Latin I"
  nickname: string | null; // "bio", "latin"
  sections: string[]; // ["Lab A", "Lab B", "Lab C"]; empty when there's only one
  meetings: ScheduleMeeting[];
  items: ScheduleItem[];
};

export type ScheduleImport = {
  title: string;
  term_start: string | null;
  term_end: string | null;
  courses: ScheduleCourse[];
  warnings: string[];
};

/** What the import API returns. */
export type ImportResponse =
  | { ok: true; schedule: ScheduleImport; costUsd: number }
  | { ok: false; error: string };

// ---- JSON schema for Claude's structured output (every property required; null = unknown) ----

const nullable = (type: 'string' | 'integer') => ({ type: [type, 'null'] });
const date = (description: string) => ({ type: 'string', description: `${description} (YYYY-MM-DD)` });
const time = (description: string) => ({ type: 'string', description: `${description} (HH:MM, 24-hour)` });
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const SCHEDULE_SCHEMA = object({
  title: { type: 'string', description: 'Short name for the document, e.g. "BIO 150 · Fall 2026"' },
  term_start: { ...nullable('string'), description: 'First day of classes (YYYY-MM-DD), or null' },
  term_end: { ...nullable('string'), description: 'Last day of classes (YYYY-MM-DD), or null' },
  courses: {
    type: 'array',
    items: object({
      code: { ...nullable('string'), description: 'Course code like "BIO 150", or null (e.g. a work schedule)' },
      name: { type: 'string' },
      nickname: { ...nullable('string'), description: 'One lowercase word a student would use, e.g. "bio", "latin"' },
      sections: { type: 'array', items: { type: 'string' }, description: 'Section/lab labels to choose between; [] if none' },
      meetings: {
        type: 'array',
        items: object({
          label: { type: 'string' },
          kind: { type: 'string', enum: ['lecture', 'lab', 'discussion', 'office_hours', 'study_session', 'other'] },
          section: { ...nullable('string'), description: 'Exactly one of the course sections, or null for everyone' },
          optional: { type: 'boolean' },
          weekdays: { type: 'array', items: { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6] }, description: '0 = Sunday' },
          start_time: time('Start'),
          end_time: time('End'),
          location: nullable('string'),
          first_date: { ...nullable('string'), description: 'First meeting (YYYY-MM-DD), or null' },
          last_date: { ...nullable('string'), description: 'Last meeting (YYYY-MM-DD), or null' },
          cancelled_dates: { type: 'array', items: date('A date this meeting does not happen') },
        }),
      },
      items: {
        type: 'array',
        items: object({
          kind: { type: 'string', enum: ['exam', 'quiz', 'assignment', 'reading', 'presentation', 'event', 'break'] },
          title: { type: 'string' },
          date: date('Date'),
          end_date: { ...nullable('string'), description: 'Last day for multi-day items (YYYY-MM-DD), or null' },
          start_time: { ...nullable('string'), description: 'HH:MM 24-hour, or null' },
          end_time: { ...nullable('string'), description: 'HH:MM 24-hour, or null' },
          at_class: { type: 'boolean' },
          section: { ...nullable('string'), description: 'Exactly one of the course sections, or null for everyone' },
          notes: nullable('string'),
          details: {
            ...nullable('string'),
            description: 'What the document says about this item, in 1–3 short sentences; null if nothing',
          },
        }),
      },
    }),
  },
  warnings: { type: 'array', items: { type: 'string' } },
});

/** File types the import accepts (Claude reads PDFs and these image formats). */
export const IMPORT_TYPES: Record<string, 'document' | 'image'> = {
  'application/pdf': 'document',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
};
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
