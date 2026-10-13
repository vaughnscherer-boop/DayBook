import { createClient } from '@supabase/supabase-js';

import { readSchedule, ScheduleReadError } from '../../../server/read-schedule.ts';
import { IMPORT_TYPES, MAX_IMPORT_BYTES, type ImportResponse } from '../../../src/lib/schedule-format.ts';

/**
 * Hosted syllabus import (Supabase Edge Function), so imports work from the phone anywhere:
 * POST { fileName, mediaType, data (base64), today } with the signed-in user's token -> ImportResponse.
 *
 * Same Claude call as the local `npm run server` (server/read-schedule.ts). The Anthropic key is a
 * Supabase secret (ANTHROPIC_API_KEY). Only signed-in Daybook users can import, at most DAILY_LIMIT a
 * day each, logged in public.import_log. Free-plan functions are cut off at 150 s, so Claude reads at
 * medium effort and we give up cleanly a little before that.
 *
 *   supabase functions deploy import-schedule --use-api --no-verify-jwt --project-ref <ref>
 */

const DAILY_LIMIT = 20;
const TIME_LIMIT_MS = 140_000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function send(status: number, body: ImportResponse) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
const fail = (status: number, error: string) => send(status, { ok: false, error });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Use POST.');
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return fail(500, 'Importing isn’t set up yet (no Anthropic key on the server).');

  // Who's asking: only signed-in Daybook accounts can spend import credit.
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth.user;
  if (!user) return fail(401, 'Sign in to Daybook (side panel → Account) to import a syllabus.');

  let body: { fileName?: unknown; mediaType?: unknown; data?: unknown; today?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'The upload didn’t arrive in one piece — please try again.');
  }
  const { fileName, mediaType, data, today } = body;
  if (typeof data !== 'string' || typeof mediaType !== 'string' || typeof today !== 'string') {
    return fail(400, 'Missing file.');
  }
  if (!IMPORT_TYPES[mediaType]) return fail(415, 'Use a PDF, PNG, JPEG, GIF or WebP file.');
  if ((data.length * 3) / 4 > MAX_IMPORT_BYTES) return fail(413, 'That file is over 15 MB.');

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('import_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) return fail(429, `That’s ${DAILY_LIMIT} imports in a day — try again tomorrow.`);

  const name = typeof fileName === 'string' ? fileName.slice(0, 200) : 'schedule';
  try {
    const result = await readSchedule({
      data,
      mediaType,
      fileName: name,
      today: /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().slice(0, 10),
      effort: 'medium',
      signal: AbortSignal.timeout(TIME_LIMIT_MS),
    });
    await admin.from('import_log').insert({ user_id: user.id, file_name: name, cost_usd: result.costUsd });
    console.log(`[import] ${result.schedule.title} — $${result.costUsd.toFixed(3)}`);
    return send(200, { ok: true, ...result });
  } catch (error) {
    if (error instanceof ScheduleReadError) return fail(502, error.message);
    console.error('[import] failed', error);
    return fail(500, 'Something went wrong reading that file — please try again.');
  }
});
