/**
 * What "Import grades" sends and gets back (shared by the app and the server): a school site's
 * grades page (pasted text, a screenshot or a PDF) plus the class's own exams and assignments, so
 * Claude can match each graded row to one of them. No secrets here.
 */

/** One of the class's exams/assignments that a grade row could belong to. */
export type GradeTarget = { ref: string; title: string; date: string | null; item_type: string; max: number | null };

export type GradeRequest = {
  mediaType: string;
  /** base64 for files, the text itself for a pasted page */
  data: string;
  course: string;
  items: GradeTarget[];
  categories: string[];
  today: string;
};

export type ReadGrade = {
  title: string;
  score: number;
  max: number | null;
  /** The matching class item's ref, or null when the class doesn't have it yet. */
  ref: string | null;
  /** The grade category the page puts it in, as named on the page. */
  category: string | null;
  date: string | null;
  kind: 'exam' | 'assignment';
};

export type GradeRead = {
  grades: ReadGrade[];
  /** Category weights the page shows ("Exams 40%"); [] when it doesn't. */
  categories: { name: string; weight: number }[];
  /** The course total the site shows, in percent, or null. */
  overall_percent: number | null;
  warnings: string[];
};

export type GradeResponse = { ok: true; read: GradeRead } | { ok: false; error: string };

export const MAX_GRADE_TARGETS = 300;

const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const GRADE_SCHEMA = object({
  grades: {
    type: 'array',
    items: object({
      title: { type: 'string', description: 'The item as the page names it' },
      score: { type: 'number', description: 'Points earned (or the percent, with max 100, when only a percent is shown)' },
      max: { type: ['number', 'null'], description: 'Points possible, or null if not shown' },
      ref: { type: ['string', 'null'], description: 'The ref of the matching class item, or null if none matches' },
      category: { type: ['string', 'null'], description: 'The grade category the page lists it under, or null' },
      date: { type: ['string', 'null'], description: 'Due date shown (YYYY-MM-DD), or null' },
      kind: { type: 'string', enum: ['exam', 'assignment'] },
    }),
  },
  categories: {
    type: 'array',
    items: object({ name: { type: 'string' }, weight: { type: 'number', description: 'Percent of the course grade' } }),
  },
  overall_percent: { type: ['number', 'null'], description: 'The course total percent the page shows, or null' },
  warnings: { type: 'array', items: { type: 'string' } },
});

/** Checks a request body; returns the cleaned request or the message to send back. */
export function parseGradeRequest(body: Record<string, unknown>, limits: { maxText: number; maxBytes: number; isType: (t: string) => boolean; textType: string }): GradeRequest | string {
  const { mediaType, data, course, items, categories, today } = body;
  if (typeof data !== 'string' || typeof mediaType !== 'string' || !data) return 'Paste the grades page or pick a file.';
  if (!limits.isType(mediaType)) return 'Use a PDF, PNG, JPEG, GIF or WebP file.';
  if (mediaType === limits.textType ? data.length > limits.maxText : (data.length * 3) / 4 > limits.maxBytes) return 'That’s too much — paste just the grades table.';
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return 'Send today’s date.';
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  return {
    mediaType,
    data,
    today,
    course: text(course, 120) || 'this class',
    items: (Array.isArray(items) ? items : []).slice(0, MAX_GRADE_TARGETS).flatMap((raw) => {
      const item = raw as Partial<GradeTarget>;
      const ref = text(item?.ref, 80);
      const title = text(item?.title, 200);
      if (!ref || !title) return [];
      return [{
        ref,
        title,
        date: typeof item.date === 'string' ? item.date.slice(0, 10) : null,
        item_type: text(item.item_type, 20) || 'assignment',
        max: typeof item.max === 'number' && Number.isFinite(item.max) ? item.max : null,
      }];
    }),
    categories: (Array.isArray(categories) ? categories : []).slice(0, 30).map((c) => text(c, 80)).filter(Boolean),
  };
}
