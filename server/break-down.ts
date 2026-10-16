import Anthropic from '@anthropic-ai/sdk';

import type { BreakdownRequest, BreakdownStep } from '../src/lib/breakdown-format.ts';

// Server-only like summarize-titles.ts (the API key and SDK stay out of the app bundle), so it
// imports with relative paths and runs under both Node and Deno.

const MODEL = 'claude-opus-5-5';

const SYSTEM = `You split a student's big assignment into small steps they can tick off on a planner, each with its own date.

- 3 to 6 steps, in the order a student would do them: understand the task, gather or read, draft, revise, submit. Fewer steps for a small task.
- Titles are short imperative phrases of 2–7 words: "Outline the argument", "Draft sections 1–2", "Proofread and submit". Keep any numbers, chapter or page references from the assignment.
- Dates are YYYY-MM-DD, spread sensibly from today to the due date, never after it and never before today. The last step is on the due date or the day before. If little time is left, use fewer steps, and put several on the same day if you must.
- minutes: a realistic estimate of how long a typical student needs for the step, from 10 to 240.
- Use only what the assignment says. Don't invent requirements, sources, page counts or tools.`;

const SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, date: { type: 'string' }, minutes: { type: 'integer' } },
        required: ['title', 'date', 'minutes'],
        additionalProperties: false,
      },
    },
  },
  required: ['steps'],
  additionalProperties: false,
};

export class BreakdownError extends Error {}

/** Steps for one assignment, with dates between today and the due date. */
export async function breakDown(input: BreakdownRequest, signal?: AbortSignal): Promise<BreakdownStep[]> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const prompt = [
    `Assignment: ${input.title}`,
    input.details && `What the syllabus says: ${input.details}`,
    input.notes && `Student's notes: ${input.notes}`,
    `Due: ${input.due}`,
    `Today: ${input.today}`,
  ]
    .filter(Boolean)
    .join('\n');

  let message: Anthropic.Message;
  try {
    message = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 2048,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal }
    );
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) throw new BreakdownError('That took too long — try again.');
    if (error instanceof Anthropic.RateLimitError) throw new BreakdownError('Too many requests right now.');
    if (error instanceof Anthropic.APIConnectionError) throw new BreakdownError('Couldn’t reach Anthropic.');
    throw error;
  }

  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  let steps: BreakdownStep[];
  try {
    steps = (JSON.parse(text) as { steps: BreakdownStep[] }).steps;
  } catch {
    throw new BreakdownError('The answer came back garbled — please try again.');
  }
  if (!Array.isArray(steps)) throw new BreakdownError('The answer came back garbled — please try again.');

  // Keep the dates honest whatever the model said: between today and the due date.
  const clean = steps
    .filter((step) => typeof step?.title === 'string' && step.title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(step.date))
    .map((step) => ({
      title: step.title.trim().slice(0, 120),
      date: step.date < input.today ? input.today : step.date > input.due ? input.due : step.date,
      ...(Number.isFinite(step.minutes) && { minutes: Math.min(240, Math.max(10, Math.round(step.minutes!))) }),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);
  if (clean.length === 0) throw new BreakdownError('Couldn’t come up with steps for that — try adding notes.');
  return clean;
}
