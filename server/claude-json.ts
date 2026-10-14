import Anthropic from '@anthropic-ai/sdk';

import { IMPORT_TYPES, TEXT_IMPORT } from '../src/lib/schedule-format.ts';

// Server-only like read-schedule.ts: relative imports so it runs under both Node and Deno.

const MODEL = 'claude-opus-5-5';

/** A message for the student ("That took too long…"); anything else is a bug and gets logged. */
export class ClaudeError extends Error {}

/** A picked file or pasted page as a content block Claude can read. */
export function fileBlock(file: { mediaType: string; data: string }): Anthropic.Beta.BetaContentBlockParam {
  if (file.mediaType === TEXT_IMPORT) return { type: 'text', text: `Text copied from a web page:\n\n${file.data}` };
  const kind = IMPORT_TYPES[file.mediaType];
  if (!kind) throw new ClaudeError('That file type isn’t supported — use a PDF, PNG, JPEG, GIF or WebP.');
  if (kind === 'document') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } };
  return {
    type: 'image',
    source: { type: 'base64', media_type: file.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', data: file.data },
  };
}

/** Asks Claude for JSON matching `schema` and parses it. */
export async function askForJson<T>(input: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<T> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages
      .stream(
        {
          model: MODEL,
          max_tokens: input.maxTokens ?? 32000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          thinking: { type: 'adaptive' },
          output_config: { effort: input.effort ?? 'medium', format: { type: 'json_schema', schema: input.schema } },
          system: input.system,
          messages: [{ role: 'user', content: input.content }],
        },
        { signal: input.signal }
      )
      .finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) throw new ClaudeError('That took too long — try again with less.');
    if (error instanceof Anthropic.AuthenticationError) throw new ClaudeError('The server’s Anthropic API key isn’t valid.');
    if (error instanceof Anthropic.PermissionDeniedError || error instanceof Anthropic.BadRequestError) {
      if (/credit/i.test(error.message)) throw new ClaudeError('Out of API credit — add more at console.anthropic.com.');
      throw new ClaudeError(`Claude couldn’t read that (${error.message}).`);
    }
    if (error instanceof Anthropic.RateLimitError) throw new ClaudeError('Too many requests right now — try again in a minute.');
    if (error instanceof Anthropic.APIConnectionError) throw new ClaudeError('Couldn’t reach Anthropic — check the internet connection.');
    throw error;
  }
  if (message.stop_reason === 'refusal') throw new ClaudeError('Claude declined to read this.');
  if (message.stop_reason === 'max_tokens') throw new ClaudeError('That’s too much to read in one go — try a shorter part.');
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ClaudeError('Claude’s answer came back garbled — please try again.');
  }
}
