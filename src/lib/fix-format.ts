/**
 * What "Fix mistakes" sends and gets back (shared by the app and the server): the student says
 * what's wrong with a class ("I'm in Lab B, not Lab A"), Claude proposes changes to its items,
 * and the app shows them for review before applying any. No secrets here.
 */

type ItemType = 'class' | 'exam' | 'assignment' | 'reading' | 'other';
const TYPES: ItemType[] = ['class', 'exam', 'assignment', 'reading', 'other'];

/** One of the class's events or tasks (a weekly class is one row for the whole series). */
export type FixItem = {
  ref: string;
  kind: 'event' | 'task';
  title: string;
  /** First day (series) or the day (one-off), 'YYYY-MM-DD'. */
  date: string;
  start_time: string | null;
  end_time: string | null;
  /** Weekly days for a repeating item (0 = Sunday), else null. */
  weekdays: number[] | null;
  repeat_until: string | null;
  item_type: ItemType | null;
  details: string | null;
  done: boolean;
};

export type FixRequest = {
  request: string;
  course: string;
  items: FixItem[];
  /** This course as read from its imported syllabi (JSON), with every section's meetings and items. */
  documents: string | null;
  today: string;
};

export type FixChange = {
  op: 'update' | 'delete' | 'add';
  /** The item changed or removed; null for "add". */
  ref: string | null;
  kind: 'event' | 'task';
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  weekdays: number[] | null;
  repeat_until: string | null;
  item_type: ItemType;
  reason: string;
};

export type FixPlan = { summary: string; changes: FixChange[]; warnings: string[] };
export type FixResponse = { ok: true; plan: FixPlan } | { ok: false; error: string };

export const MAX_FIX_REQUEST = 2000;
export const MAX_FIX_ITEMS = 400;
export const MAX_FIX_DOCUMENTS = 150_000;

const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const nullable = (type: string, description: string) => ({ type: [type, 'null'], description });

export const FIX_SCHEMA = object({
  summary: { type: 'string', description: 'One sentence: what will change' },
  changes: {
    type: 'array',
    items: object({
      op: { type: 'string', enum: ['update', 'delete', 'add'] },
      ref: nullable('string', 'The ref of the item to update or delete; null when adding'),
      kind: { type: 'string', enum: ['event', 'task'], description: 'Classes, exams and events are events; homework and readings are tasks' },
      title: { type: 'string' },
      date: { type: 'string', description: 'YYYY-MM-DD: the day, or the first day of a weekly series' },
      start_time: nullable('string', 'HH:MM 24-hour, or null (all-day event / task with no time)'),
      end_time: nullable('string', 'HH:MM 24-hour (events only), or null'),
      weekdays: { type: ['array', 'null'], items: { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6] }, description: 'Weekly days for a repeating class (0 = Sunday), else null' },
      repeat_until: nullable('string', 'Last day of a weekly series (YYYY-MM-DD), else null'),
      item_type: { type: 'string', enum: TYPES },
      reason: { type: 'string', description: 'Why, in under 15 words' },
    }),
  },
  warnings: { type: 'array', items: { type: 'string' } },
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Checks a request body; returns the cleaned request or the message to send back. */
export function parseFixRequest(body: Record<string, unknown>): FixRequest | string {
  const request = typeof body.request === 'string' ? body.request.trim().slice(0, MAX_FIX_REQUEST) : '';
  if (!request) return 'Say what’s wrong first.';
  if (typeof body.today !== 'string' || !DAY.test(body.today)) return 'Send today’s date.';
  const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX_FIX_ITEMS).flatMap((raw): FixItem[] => {
    const item = raw as Partial<FixItem>;
    const ref = text(item?.ref, 80);
    const title = text(item?.title, 200);
    if (!ref || !title || typeof item.date !== 'string' || !DAY.test(item.date)) return [];
    return [{
      ref,
      kind: item.kind === 'task' ? 'task' : 'event',
      title,
      date: item.date,
      start_time: typeof item.start_time === 'string' && TIME.test(item.start_time) ? item.start_time : null,
      end_time: typeof item.end_time === 'string' && TIME.test(item.end_time) ? item.end_time : null,
      weekdays: Array.isArray(item.weekdays) ? item.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : null,
      repeat_until: typeof item.repeat_until === 'string' && DAY.test(item.repeat_until) ? item.repeat_until : null,
      item_type: TYPES.includes(item.item_type as ItemType) ? (item.item_type as ItemType) : null,
      details: text(item.details, 500),
      done: item.done === true,
    }];
  });
  return {
    request,
    course: text(body.course, 120) ?? 'this class',
    items,
    documents: text(body.documents, MAX_FIX_DOCUMENTS),
    today: body.today,
  };
}

/** Drops changes that don't make sense: unknown refs, bad dates and times, two changes to one item. */
export function cleanFixPlan(plan: FixPlan, items: FixItem[]): FixPlan {
  const byRef = new Map(items.map((item) => [item.ref, item]));
  const touched = new Set<string>();
  const changes = (Array.isArray(plan.changes) ? plan.changes : []).flatMap((change): FixChange[] => {
    if (!change || !['update', 'delete', 'add'].includes(change.op)) return [];
    if (change.op !== 'add') {
      const item = change.ref ? byRef.get(change.ref) : undefined;
      if (!item || touched.has(item.ref)) return [];
      touched.add(item.ref);
      // The item's own kind: an event can't turn into a task in place.
      change = { ...change, kind: item.kind };
    }
    if (typeof change.title !== 'string' || !change.title.trim() || !DAY.test(change.date)) return [];
    const start = change.start_time && TIME.test(change.start_time) ? change.start_time : null;
    const weekdays = Array.isArray(change.weekdays) ? [...new Set(change.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    return [{
      op: change.op,
      ref: change.op === 'add' ? null : change.ref,
      kind: change.kind === 'task' ? 'task' : 'event',
      title: change.title.trim().slice(0, 200),
      date: change.date,
      start_time: start,
      end_time: start && change.end_time && TIME.test(change.end_time) && change.end_time > start ? change.end_time : null,
      weekdays: weekdays.length ? weekdays : null,
      repeat_until: weekdays.length && change.repeat_until && DAY.test(change.repeat_until) ? change.repeat_until : null,
      item_type: TYPES.includes(change.item_type) ? change.item_type : 'other',
      reason: typeof change.reason === 'string' ? change.reason.trim().slice(0, 200) : '',
    }];
  });
  return {
    summary: typeof plan.summary === 'string' ? plan.summary.trim().slice(0, 300) : '',
    changes,
    warnings: Array.isArray(plan.warnings) ? plan.warnings.filter((w) => typeof w === 'string').slice(0, 10) : [],
  };
}
