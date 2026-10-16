import { createClient } from '@supabase/supabase-js';

import { askSchedule } from '../../../server/ask-schedule.ts';
import { ClaudeError } from '../../../server/claude-json.ts';
import { parseAskRequest, type AskResponse } from '../../../src/lib/ask-format.ts';

/**
 * "Ask Daybook": answers a question about the student's calendar and proposes any changes they ask
 * for (the app applies only the ones they keep). POST AskRequest with the signed-in user's token ->
 * AskResponse. Uses the same Anthropic key secret.
 *
 *   supabase functions deploy ask-schedule --use-api --no-verify-jwt --project-ref <ref>
 */

const TIME_LIMIT_MS = 60_000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const send = (status: number, body: AskResponse) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const fail = (status: number, error: string) => send(status, { ok: false, error });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Use POST.');
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return fail(500, 'No Anthropic key on the server.');

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return fail(401, 'Sign in first: this uses your Daybook account.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Bad request.');
  }
  const request = parseAskRequest(body);
  if (typeof request === 'string') return fail(400, request);

  try {
    return send(200, { ok: true, ...(await askSchedule(request, AbortSignal.timeout(TIME_LIMIT_MS))) });
  } catch (error) {
    if (error instanceof ClaudeError) return fail(502, error.message);
    console.error('[ask-schedule] failed', error);
    return fail(500, 'Something went wrong.');
  }
});
