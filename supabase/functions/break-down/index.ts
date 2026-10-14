import { createClient } from '@supabase/supabase-js';

import { BreakdownError, breakDown } from '../../../server/break-down.ts';
import { MAX_BREAKDOWN_TEXT, type BreakdownResponse } from '../../../src/lib/breakdown-format.ts';

/**
 * Splits an assignment into dated steps. POST { title, details, notes, due, today } with the
 * signed-in user's token -> { ok, steps: [{ title, date }] }. Uses the same Anthropic key secret.
 *
 *   supabase functions deploy break-down --use-api --no-verify-jwt --project-ref <ref>
 */

const TIME_LIMIT_MS = 40_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const send = (status: number, body: BreakdownResponse) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const fail = (status: number, error: string) => send(status, { ok: false, error });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_BREAKDOWN_TEXT) : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Use POST.');
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return fail(500, 'No Anthropic key on the server.');

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return fail(401, 'Sign in to Daybook (side panel → Account) to break down assignments.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Bad request.');
  }
  const title = text(body.title);
  const due = body.due;
  const today = body.today;
  if (!title || typeof due !== 'string' || typeof today !== 'string' || !DAY.test(due) || !DAY.test(today)) {
    return fail(400, 'Send a title, a due date and today’s date.');
  }
  if (due < today) return fail(400, 'That was due already.');

  try {
    const steps = await breakDown(
      { title, details: text(body.details), notes: text(body.notes), due, today },
      AbortSignal.timeout(TIME_LIMIT_MS)
    );
    return send(200, { ok: true, steps });
  } catch (error) {
    if (error instanceof BreakdownError) return fail(502, error.message);
    console.error('[break-down] failed', error);
    return fail(500, 'Something went wrong.');
  }
});
