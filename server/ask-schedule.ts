import { ASK_SCHEMA, type AskChange, type AskRequest } from '../src/lib/ask-format.ts';
import { askForJson, ClaudeError } from './claude-json.ts';

// Server-only like break-down.ts: relative imports so it runs under both Node and Deno.

const SYSTEM = `You are the assistant inside Daybook, a student's planner. You get their calendar items as JSON and a question or request.

- Answer in one to three short, friendly sentences, using only what the items say. Give dates as weekday and date ("Friday, Oct 23") and times as "9 AM". If the items don't say, say so; never invent classes, dates or what something covers.
- If they ask you to change things (move, reschedule, mark done, delete, add), propose those changes in "changes" and describe them briefly in "answer" ("I'd move these 3 to Thursday — check them below."). Otherwise "changes" is [].
- Only change items that are in the list, by their exact "id". Never change repeating items ("repeating": true); say they'd need to be edited one by one in the app.
- "move": set the new "date" (YYYY-MM-DD) and "time" (HH:MM 24-hour, or null to keep it all-day). "done": tasks only. "add": id null, with date, time or null, and "class" as one of the class names in the items, or null.
- "title" is always the item's title (or the new item's title for "add").`;

/** Answers a question about the schedule, with any changes it asks for proposed (not applied). */
export async function askSchedule(input: AskRequest, signal?: AbortSignal): Promise<{ answer: string; changes: AskChange[] }> {
  const result = await askForJson<{ answer: string; changes: AskChange[] }>({
    system: SYSTEM,
    content: [
      {
        type: 'text',
        text: `Today is ${input.today}; it's ${input.now} now.\n\nItems:\n${JSON.stringify(input.items)}\n\nStudent: ${input.question}`,
      },
    ],
    schema: ASK_SCHEMA as unknown as Record<string, unknown>,
    effort: 'low',
    maxTokens: 4000,
    signal,
  });
  const ids = new Map(input.items.map((item) => [item.id, item]));
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const time = /^\d{2}:\d{2}$/;
  // Keep only changes that make sense for the items we sent.
  const changes = (result.changes ?? []).filter((change) => {
    if (change.op === 'add') return !!change.title?.trim() && !!change.date && day.test(change.date) && (!change.time || time.test(change.time));
    const item = change.id ? ids.get(change.id) : undefined;
    if (!item || item.repeating) return false;
    if (change.op === 'done') return item.kind === 'task';
    if (change.op === 'move') return !!change.date && day.test(change.date) && (!change.time || time.test(change.time));
    return change.op === 'delete';
  });
  if (typeof result.answer !== 'string') throw new ClaudeError('The answer came back garbled — please try again.');
  return { answer: result.answer.trim(), changes };
}
