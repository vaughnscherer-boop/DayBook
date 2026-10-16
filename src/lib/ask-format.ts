/** What "Ask Daybook" sends and gets back (shared by the app and the server). */

/** One calendar item as Claude sees it. */
export type AskItem = {
  id: string;
  kind: 'event' | 'task';
  title: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM', or null for all-day items and tasks without a time */
  time: string | null;
  /** 'HH:MM' end for timed events */
  end: string | null;
  class: string | null;
  type: string;
  done: boolean;
  repeating: boolean;
  details: string | null;
};

/** A change Claude proposes; the app shows them and only applies the ones you keep. */
export type AskChange = {
  op: 'move' | 'done' | 'delete' | 'add';
  /** The item it's about (null for "add") */
  id: string | null;
  kind: 'event' | 'task';
  title: string;
  /** New date for "move"/"add" */
  date: string | null;
  /** New time for "move"/"add", or null */
  time: string | null;
  /** For "add": the class it belongs to, by name */
  class: string | null;
};

export type AskRequest = { question: string; today: string; now: string; items: AskItem[] };
export type AskResponse = { ok: true; answer: string; changes: AskChange[] } | { ok: false; error: string };

export const MAX_QUESTION = 500;
export const MAX_ITEMS = 400;

export const ASK_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['move', 'done', 'delete', 'add'] },
          id: { type: ['string', 'null'] },
          kind: { type: 'string', enum: ['event', 'task'] },
          title: { type: 'string' },
          date: { type: ['string', 'null'] },
          time: { type: ['string', 'null'] },
          class: { type: ['string', 'null'] },
        },
        required: ['op', 'id', 'kind', 'title', 'date', 'time', 'class'],
        additionalProperties: false,
      },
    },
  },
  required: ['answer', 'changes'],
  additionalProperties: false,
} as const;

/** Checks and trims a request body; an error message when it isn't usable. */
export function parseAskRequest(body: Record<string, unknown>): AskRequest | string {
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : '';
  const { today, now } = body;
  if (!question) return 'Ask something first.';
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today) || typeof now !== 'string') return 'Send today’s date.';
  if (!Array.isArray(body.items)) return 'Send the calendar items.';
  return { question, today, now: now.slice(0, 5), items: (body.items as AskItem[]).slice(0, MAX_ITEMS) };
}
