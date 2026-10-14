import { createClient } from '@supabase/supabase-js';

import { summarizeTitles, SummarizeError } from '../../../server/summarize-titles.ts';

/**
 * Shortens wordy planner entries ("I need to give back my borrowed latin books" -> "Return latin
 * books"). POST { titles: string[] } with the signed-in user's token -> { ok, titles }.
 * The Anthropic key is the same Supabase secret the import function uses.
 *
 *   supabase functions deploy summarize-titles --use-api --no-verify-jwt --project-ref <ref>
 */

const MAX_TITLES = 30;
const MAX_LENGTH = 300;
const TIME_LIMIT_MS = 10_000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

type Body = { ok: true; titles: string[] } | { ok: false; error: string };
const send = (status: number, body: Body) =>
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
  if (!auth.user) return fail(401, 'Sign in to Daybook to shorten titles.');

  let body: { titles?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Bad request.');
  }
  const titles = body.titles;
  if (
    !Array.isArray(titles) ||
    titles.length === 0 ||
    titles.length > MAX_TITLES ||
    titles.some((t) => typeof t !== 'string' || t.length === 0 || t.length > MAX_LENGTH)
  ) {
    return fail(400, `Send 1–${MAX_TITLES} titles of up to ${MAX_LENGTH} characters.`);
  }

  try {
    return send(200, { ok: true, titles: await summarizeTitles(titles, AbortSignal.timeout(TIME_LIMIT_MS)) });
  } catch (error) {
    if (error instanceof SummarizeError) return fail(502, error.message);
    console.error('[summarize] failed', error);
    return fail(500, 'Something went wrong.');
  }
});
