import { createClient } from '@supabase/supabase-js';

import { FeedError, readFeed } from '../../../server/school-feed.ts';
import type { FeedResponse } from '../../../src/lib/feed-format.ts';

/**
 * Reads a school site's calendar feed (Canvas, Moodle, Blackboard, Brightspace, Schoology or any
 * .ics link) so the app can add its assignments and events, from the phone or the web build alike
 * (a browser can't fetch these links itself). POST { url } with the signed-in user's token ->
 * { ok, site, items }. Only public https addresses are fetched (see checkFeedUrl).
 *
 *   supabase functions deploy school-feed --use-api --no-verify-jwt --project-ref <ref>
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const send = (status: number, body: FeedResponse) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const fail = (status: number, error: string) => send(status, { ok: false, error });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Use POST.');

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return fail(401, 'Sign in to Daybook to connect a school site.');

  let url: unknown;
  try {
    url = (await req.json()).url;
  } catch {
    return fail(400, 'Bad request.');
  }
  if (typeof url !== 'string' || url.length === 0 || url.length > 2000) return fail(400, 'Send the calendar link.');

  try {
    return send(200, await readFeed(url));
  } catch (error) {
    if (error instanceof FeedError) return fail(400, error.message);
    console.error('[school-feed] failed', error);
    return fail(500, 'Something went wrong reading that calendar.');
  }
});
