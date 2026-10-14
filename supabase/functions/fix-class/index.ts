import { createClient } from '@supabase/supabase-js';

import { ClaudeError } from '../../../server/claude-json.ts';
import { fixClass } from '../../../server/fix-class.ts';
import { parseFixRequest, type FixResponse } from '../../../src/lib/fix-format.ts';

/**
 * "Fix mistakes" for one class: proposes changes to its items from what the student says is wrong.
 * POST FixRequest with the signed-in user's token -> FixResponse. Uses the same Anthropic key secret.
 *
 *   supabase functions deploy fix-class --use-api --no-verify-jwt --project-ref <ref>
 */

const TIME_LIMIT_MS = 140_000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const send = (status: number, body: FixResponse) =>
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
  if (!auth.user) return fail(401, 'Sign in to Daybook (side panel → Account) to fix mistakes with Claude.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Bad request.');
  }
  const request = parseFixRequest(body);
  if (typeof request === 'string') return fail(400, request);

  try {
    return send(200, { ok: true, plan: await fixClass(request, 'medium', AbortSignal.timeout(TIME_LIMIT_MS)) });
  } catch (error) {
    if (error instanceof ClaudeError) return fail(502, error.message);
    console.error('[fix-class] failed', error);
    return fail(500, 'Something went wrong.');
  }
});
