import { courseCode } from '@/lib/grouping';

/**
 * What kind of thing an event or task is inside its group (class, exam, homework...). Each type is
 * drawn in its own shade of the group's color, so Latin quizzes, Latin homework and Latin class are
 * all recognizably "Latin" but still tell apart at a glance.
 */
export type ItemType = 'class' | 'exam' | 'assignment' | 'reading' | 'other';

export const ITEM_TYPES: { type: ItemType; label: string }[] = [
  { type: 'class', label: 'Class' },
  { type: 'exam', label: 'Exam / quiz' },
  { type: 'assignment', label: 'Assignment' },
  { type: 'reading', label: 'Reading' },
  { type: 'other', label: 'Other' },
];

export const isItemType = (value: unknown): value is ItemType => ITEM_TYPES.some((t) => t.type === value);

/** Shade steps: negative darkens, positive lightens, 0 is the group's own color. */
export const SHADE_STEPS = [-3, -2, -1, 0, 1, 2, 3] as const;
export const DEFAULT_SHADES: Record<ItemType, number> = { class: 0, exam: -2, assignment: 1, reading: 2, other: 0 };

const EXAM = /\b(exams?|midterms?|mid-terms?|quiz(zes)?|tests?|finals?)\b/;
// "Final paper" and "test prep worksheet" are homework, not exams.
const NOT_EXAM = /\bfinal\s+(paper|project|draft|essay|report|presentation|portfolio)\b/;
const ASSIGNMENT =
  /\b(hw|homework|ex|assignments?|worksheets?|problem sets?|problems|psets?|essays?|papers?|projects?|reports?|drafts?|presentations?|exercises?|translat(e|ion|ions)|compositions?|journal|responses?|prelab|pre-lab|lab reports?|discussion posts?|due|submit|turn in)\b/;
const READING = /\b(read|reading|readings|chapters?|ch|pp|pages?)\b/;
const CLASS = /\b(lectures?|class|classes|labs?|discussion|seminar|recitation|tutorial|studio|section|drill)\b/;

/**
 * Guesses the type from the title. `inCourse` (the item is in a course group) lets a plain task
 * count as homework and a plain weekly event as the class itself.
 */
export function detectItemType(title: string, kind: 'event' | 'task', repeating: boolean, inCourse: boolean): ItemType {
  const text = title.toLowerCase();
  if (EXAM.test(text) && !NOT_EXAM.test(text)) return 'exam';
  if (ASSIGNMENT.test(text)) return 'assignment';
  if (READING.test(text)) return 'reading';
  if (/\boffice hours?\b/.test(text)) return 'other';
  if (kind === 'event' && CLASS.test(text)) return 'class';
  if (inCourse && kind === 'task') return 'assignment';
  if (inCourse && kind === 'event' && repeating) return 'class';
  return 'other';
}

/** A group is a course when it came from a syllabus or is named like one ("BIO 150"). */
export const isCourseGroup = (group: { name: string; source: string }) =>
  group.source === 'import' || courseCode(group.name) !== null;

/** `hex` mixed toward black (negative step) or white (positive step). */
export function shade(hex: string, step: number): string {
  if (step === 0) return hex;
  const n = parseInt(hex.slice(1), 16);
  const target = step < 0 ? 0 : 255;
  const amount = Math.min(Math.abs(step) * (step < 0 ? 0.2 : 0.22), 0.9);
  const mix = (channel: number) => Math.round(channel + (target - channel) * amount);
  const [r, g, b] = [mix(n >> 16), mix((n >> 8) & 255), mix(n & 255)];
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}

/** The group's shade step for each type: its own choices (JSON) over the defaults. */
export function groupShades(typeShades: string | null | undefined): Record<ItemType, number> {
  let saved: Partial<Record<ItemType, number>> = {};
  try {
    saved = JSON.parse(typeShades || '{}');
  } catch {}
  return { ...DEFAULT_SHADES, ...saved };
}

/** The color a type is drawn in within a group. */
export const typeColor = (group: { color: string; type_shades: string }, type: ItemType) =>
  shade(group.color, groupShades(group.type_shades)[type]);
