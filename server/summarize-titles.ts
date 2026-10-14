import Anthropic from '@anthropic-ai/sdk';

// Server-only like read-schedule.ts (the API key and SDK stay out of the app bundle), so it imports
// with relative paths and runs under both Node and Deno.

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM = `You shorten what a student typed into their planner into a clean task title.

- Write a short imperative title, usually 2–5 words: "Return latin books", "Call mom", "Email Prof. Kim about extension".
- Drop filler and wordiness: "I need to", "remember to", "at some point", "my", "borrowed".
- Keep proper nouns, class names, numbers, chapter and page references ("Read Ch. 4 for Latin").
- Never add facts that aren't in the input. Don't add dates or times.
- If a title is already short and clear, return it unchanged.
- Return exactly one title per input, in the same order. Capitalise only the first word and proper nouns.`;

const SCHEMA = {
  type: 'object',
  properties: { titles: { type: 'array', items: { type: 'string' } } },
  required: ['titles'],
  additionalProperties: false,
};

export class SummarizeError extends Error {}

/** Shortens each title; the result has the same length and order as the input. */
export async function summarizeTitles(titles: string[], signal?: AbortSignal): Promise<string[]> {
  if (titles.length === 0) return [];
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  let message: Anthropic.Message;
  try {
    message = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(titles) }],
      },
      { signal }
    );
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) throw new SummarizeError('That took too long.');
    if (error instanceof Anthropic.RateLimitError) throw new SummarizeError('Too many requests right now.');
    if (error instanceof Anthropic.APIConnectionError) throw new SummarizeError('Couldn’t reach Anthropic.');
    throw error;
  }

  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  let result: string[];
  try {
    result = (JSON.parse(text) as { titles: string[] }).titles;
  } catch {
    throw new SummarizeError('The answer came back garbled.');
  }
  if (!Array.isArray(result) || result.length !== titles.length) {
    throw new SummarizeError('The answer didn’t match the request.');
  }
  // An empty rewrite is never an improvement: keep what was typed.
  return result.map((title, i) => (typeof title === 'string' && title.trim() ? title.trim() : titles[i]));
}
