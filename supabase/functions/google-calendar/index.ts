import { createClient } from '@supabase/supabase-js';

import {
  accessToken,
  GoogleError,
  googleApi,
  mirrorCalendar,
  type DaybookEvent,
  type DaybookSide,
  type EventLink,
} from '../../../server/google-mirror.ts';

/**
 * Daybook ↔ Google Calendar (Supabase Edge Function). The app calls it with the signed-in user's
 * token: POST { action, ... }. The Google refresh token stays here, in public.google_accounts
 * (supabase/google.sql), never on a device. Daybook's side is the user's rows in public.records, the
 * same rows the app syncs, so every device sees the result through normal sync.
 *
 *   connect    { refreshToken, timeZone }  after "Continue with Google" (calendar permission)
 *   status                                  { connected, email, linked: [{ calendarId, googleCalendarId }] }
 *   calendars                               your Google calendars and which are linked
 *   link       { googleCalendarId }         show that Google calendar in Daybook, then sync it
 *   unlink     { calendarId }               remove it from Daybook (Google keeps it)
 *   sync                                    two-way mirror of every linked calendar
 *   disconnect                              unlink everything and revoke Google's permission
 *
 * Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (the same OAuth client as Supabase's Google sign-in).
 *
 *   supabase functions deploy google-calendar --use-api --no-verify-jwt --project-ref <ref>
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const LOCK_MS = 120_000;

function send(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => send(status, { ok: false, error, ...extra });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

type Account = { user_id: string; google_email: string | null; refresh_token: string; time_zone: string };
type CalendarLink = { calendar_id: string; google_calendar_id: string };

/** Today in the user's time zone, 'YYYY-MM-DD'. */
const todayIn = (timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());

// ---- Daybook's rows (public.records) -------------------------------------------------------------

function records(userId: string) {
  const write = async (tbl: string, id: string, data: Record<string, unknown> | null) => {
    const { error } = await admin.from('records').upsert(
      { user_id: userId, tbl, id, data, deleted: data === null, changed_at: new Date().toISOString() },
      { onConflict: 'user_id,tbl,id' }
    );
    if (error) throw new Error(`Saving to Daybook failed: ${error.message}`);
  };
  const list = async (tbl: string, calendarId: string) => {
    const { data, error } = await admin
      .from('records')
      .select('id, data')
      .eq('user_id', userId)
      .eq('tbl', tbl)
      .eq('deleted', false)
      .eq('data->>calendar_id', calendarId);
    if (error) throw new Error(`Reading Daybook failed: ${error.message}`);
    return (data ?? []) as { id: string; data: Record<string, unknown> }[];
  };
  return { write, list };
}

/** The mirror's view of one Daybook calendar and its event links. */
function daybookSide(userId: string, calendarId: string, googleCalendarId: string): DaybookSide {
  const rows = records(userId);
  const now = () => new Date().toISOString();
  return {
    async create(fields) {
      const id = crypto.randomUUID();
      const stamp = now();
      await rows.write('events', id, {
        id,
        ...fields,
        external_id: null,
        calendar_id: calendarId,
        color: null,
        repeat: null,
        repeat_until: null,
        exceptions: '[]',
        group_id: null,
        group_locked: 0,
        import_id: null,
        item_type: null,
        details: null,
        created_at: stamp,
        updated_at: stamp,
      });
      return id;
    },
    // Keep every other column (group, color, type...) as the app last saved it.
    update: (event, fields) => rows.write('events', event.id, { ...event, ...fields, updated_at: now() }),
    remove: (event) => rows.write('events', event.id, null),
    async saveLink(link) {
      const { error } = await admin
        .from('google_event_links')
        .upsert({ user_id: userId, google_calendar_id: googleCalendarId, ...link }, { onConflict: 'user_id,google_event_id,occurrence' });
      if (error) throw new Error(error.message);
    },
    async dropLink(link) {
      await admin
        .from('google_event_links')
        .delete()
        .eq('user_id', userId)
        .eq('google_event_id', link.google_event_id)
        .eq('occurrence', link.occurrence);
    },
  };
}

// ---- Actions -------------------------------------------------------------------------------------

async function getAccount(userId: string): Promise<Account | null> {
  const { data } = await admin.from('google_accounts').select('*').eq('user_id', userId).maybeSingle();
  return (data as Account | null) ?? null;
}

async function getLinks(userId: string): Promise<CalendarLink[]> {
  const { data } = await admin.from('google_calendar_links').select('calendar_id, google_calendar_id').eq('user_id', userId);
  return (data ?? []) as CalendarLink[];
}

const clientId = () => Deno.env.get('GOOGLE_CLIENT_ID')!;
const clientSecret = () => Deno.env.get('GOOGLE_CLIENT_SECRET')!;

async function apiFor(account: Account) {
  return googleApi(await accessToken(account.refresh_token, clientId(), clientSecret()));
}

async function unlinkCalendar(userId: string, link: CalendarLink) {
  const rows = records(userId);
  await admin.from('google_event_links').delete().eq('user_id', userId).eq('google_calendar_id', link.google_calendar_id);
  await admin.from('google_calendar_links').delete().eq('user_id', userId).eq('calendar_id', link.calendar_id);
  // The copy goes away from Daybook (Google keeps the calendar), as when unlinking a phone calendar.
  for (const tbl of ['events', 'groups']) {
    for (const row of await rows.list(tbl, link.calendar_id)) await rows.write(tbl, row.id, null);
  }
  await rows.write('calendars', link.calendar_id, null);
}

async function syncAll(userId: string, account: Account): Promise<number> {
  // One sync at a time per account: two devices asking at once would otherwise both insert.
  const until = new Date(Date.now() + LOCK_MS).toISOString();
  const { data: claimed } = await admin
    .from('google_accounts')
    .update({ syncing_until: until })
    .eq('user_id', userId)
    .or(`syncing_until.is.null,syncing_until.lt.${new Date().toISOString()}`)
    .select('user_id');
  if (!claimed?.length) return 0;

  try {
    const api = await apiFor(account);
    const calendars = new Map((await api.calendars()).map((calendar) => [calendar.id, calendar]));
    const today = todayIn(account.time_zone);
    let changed = 0;
    for (const link of await getLinks(userId)) {
      const google = calendars.get(link.google_calendar_id);
      if (!google) continue; // Removed from the Google account: leave Daybook as it is.
      const [locals, { data: links }] = await Promise.all([
        records(userId).list('events', link.calendar_id),
        admin.from('google_event_links').select('event_id, google_event_id, occurrence, fingerprint')
          .eq('user_id', userId)
          .eq('google_calendar_id', link.google_calendar_id),
      ]);
      try {
        changed += await mirrorCalendar({
          api,
          googleCalendarId: link.google_calendar_id,
          writable: google.accessRole === 'owner' || google.accessRole === 'writer',
          timeZone: account.time_zone,
          today,
          locals: locals.map((row) => row.data as DaybookEvent),
          links: (links ?? []) as EventLink[],
          daybook: daybookSide(userId, link.calendar_id, link.google_calendar_id),
        });
      } catch (error) {
        console.error(`[google] mirror failed for ${link.google_calendar_id}`, error);
      }
    }
    return changed;
  } finally {
    await admin.from('google_accounts').update({ syncing_until: null }).eq('user_id', userId);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Use POST.');
  if (!Deno.env.get('GOOGLE_CLIENT_ID') || !Deno.env.get('GOOGLE_CLIENT_SECRET')) {
    return fail(500, 'Google Calendar isn’t set up on the server yet (no Google client secrets).');
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth.user;
  if (!user) return fail(401, 'Sign in to Daybook first.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Bad request.');
  }

  try {
    switch (body.action) {
      case 'connect': {
        const { refreshToken, timeZone } = body;
        if (typeof refreshToken !== 'string' || !refreshToken) return fail(400, 'Google didn’t send calendar permission. Try again.');
        const zone = typeof timeZone === 'string' && timeZone ? timeZone : 'UTC';
        const access = await accessToken(refreshToken, clientId(), clientSecret());
        const info: { email?: string } = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { authorization: `Bearer ${access}` },
        }).then((response) => (response.ok ? response.json() : {}));
        const { error } = await admin.from('google_accounts').upsert({
          user_id: user.id,
          google_email: info.email ?? null,
          refresh_token: refreshToken,
          time_zone: zone,
          connected_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        return send(200, { ok: true, email: info.email ?? null });
      }

      case 'status': {
        const account = await getAccount(user.id);
        const linked = account ? await getLinks(user.id) : [];
        return send(200, {
          ok: true,
          connected: !!account,
          email: account?.google_email ?? null,
          linked: linked.map((link) => ({ calendarId: link.calendar_id, googleCalendarId: link.google_calendar_id })),
        });
      }

      case 'calendars': {
        const account = await getAccount(user.id);
        if (!account) return fail(409, 'Connect Google first.', { reconnect: true });
        const api = await apiFor(account);
        const linked = new Map((await getLinks(user.id)).map((link) => [link.google_calendar_id, link.calendar_id]));
        const calendars = (await api.calendars()).map((calendar) => ({
          id: calendar.id,
          name: calendar.summary,
          color: calendar.backgroundColor ?? null,
          primary: !!calendar.primary,
          readOnly: calendar.accessRole !== 'owner' && calendar.accessRole !== 'writer',
          linkedCalendarId: linked.get(calendar.id) ?? null,
        }));
        return send(200, { ok: true, calendars });
      }

      case 'link': {
        const account = await getAccount(user.id);
        if (!account) return fail(409, 'Connect Google first.', { reconnect: true });
        const googleCalendarId = body.googleCalendarId;
        if (typeof googleCalendarId !== 'string') return fail(400, 'Which calendar?');
        const existing = (await getLinks(user.id)).find((link) => link.google_calendar_id === googleCalendarId);
        if (existing) return send(200, { ok: true, calendarId: existing.calendar_id, changed: 0 });

        const api = await apiFor(account);
        const google = (await api.calendars()).find((calendar) => calendar.id === googleCalendarId);
        if (!google) return fail(404, 'That Google calendar wasn’t found.');
        const calendarId = crypto.randomUUID();
        const stamp = new Date().toISOString();
        await records(user.id).write('calendars', calendarId, {
          id: calendarId,
          name: google.summary,
          color: (google.backgroundColor ?? '#4A6FA5').toUpperCase(),
          visible: 1,
          is_default: 0,
          sort_order: 100,
          created_at: stamp,
          updated_at: stamp,
        });
        await admin.from('google_calendar_links').insert({ user_id: user.id, calendar_id: calendarId, google_calendar_id: googleCalendarId });
        const changed = await syncAll(user.id, account);
        return send(200, { ok: true, calendarId, changed });
      }

      case 'unlink': {
        const link = (await getLinks(user.id)).find((l) => l.calendar_id === body.calendarId);
        if (link) await unlinkCalendar(user.id, link);
        return send(200, { ok: true });
      }

      case 'sync': {
        const account = await getAccount(user.id);
        if (!account) return send(200, { ok: true, changed: 0, connected: false });
        return send(200, { ok: true, changed: await syncAll(user.id, account), connected: true });
      }

      case 'disconnect': {
        const account = await getAccount(user.id);
        for (const link of await getLinks(user.id)) await unlinkCalendar(user.id, link);
        if (account) {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(account.refresh_token)}`, { method: 'POST' }).catch(
            () => {}
          );
          await admin.from('google_accounts').delete().eq('user_id', user.id);
        }
        return send(200, { ok: true });
      }

      default:
        return fail(400, 'Unknown action.');
    }
  } catch (error) {
    // Calendar access wasn't granted: Google's consent screen lets you untick it.
    if (error instanceof GoogleError && error.status === 403 && /insufficient.*scope/i.test(error.message)) {
      return fail(
        409,
        'Google didn’t give Daybook calendar access. Connect again and tick “See, edit, share, and permanently delete all the calendars…” on Google’s screen.',
        { reconnect: true }
      );
    }
    // Google refused the stored permission (revoked, or expired in Testing mode): ask to reconnect.
    if (error instanceof GoogleError && (error.status === 400 || error.status === 401)) {
      return fail(409, 'Google needs you to reconnect Daybook.', { reconnect: true });
    }
    console.error('[google]', error);
    return fail(500, error instanceof Error ? error.message : 'Something went wrong.');
  }
});
