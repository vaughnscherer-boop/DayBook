import { createClient } from '@supabase/supabase-js';

import { ClaudeError } from '../../../server/claude-json.ts';
import { readGrades } from '../../../server/read-grades.ts';
import { parseGradeRequest, type GradeResponse } from '../../../src/lib/grade-import-format.ts';
import { isImportType, MAX_IMPORT_BYTES, MAX_IMPORT_TEXT, TEXT_IMPORT } from '../../../src/lib/schedule-format.ts';

/**
 * Reads a school site's grades page for one class and matches it to the class's items.
 * POST GradeRequest with the signed-in user's token -> GradeResponse. Uses the same Anthropic key secret.
 *
 *   supabase functions deploy read-grades --use-api --no-verify-jwt --project-ref <ref>
 */

const TIME_LIMIT_MS = 140_000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const send = (status: number, body: GradeResponse) =>
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
  if (!auth.user) return fail(401, 'Sign in to Daybook (side panel → Account) to import grades.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Bad request.');
  }
  const request = parseGradeRequest(body, { maxText: MAX_IMPORT_TEXT, maxBytes: MAX_IMPORT_BYTES, isType: isImportType, textType: TEXT_IMPORT });
  if (typeof request === 'string') return fail(400, request);

  try {
    return send(200, { ok: true, read: await readGrades(request, 'medium', AbortSignal.timeout(TIME_LIMIT_MS)) });
  } catch (error) {
    if (error instanceof ClaudeError) return fail(502, error.message);
    console.error('[read-grades] failed', error);
    return fail(500, 'Something went wrong.');
  }
});
