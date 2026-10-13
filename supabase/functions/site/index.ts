/**
 * Daybook's public home page and privacy policy, for Google's OAuth consent screen (which needs both
 * on an authorized domain). Served from the Supabase project's own domain:
 *
 *   https://<ref>.supabase.co/functions/v1/site            home page
 *   https://<ref>.supabase.co/functions/v1/site/privacy    privacy policy
 *   https://<ref>.supabase.co/functions/v1/site/terms      terms of service
 *
 *   supabase functions deploy site --use-api --no-verify-jwt --project-ref <ref>
 */

const CONTACT = 'vaughn.scherer@gmail.com';

const HOME = `Daybook

Daybook is a personal calendar and planner: events, tasks, class schedules imported from a syllabus,
a morning brief and a nightly check-in. It runs on iPhone and in the browser, and syncs between them
through your Daybook account.

Signing in with Google lets you use your Google account for Daybook and, if you choose, show your
Google calendars in Daybook and edit them from any device.

Privacy policy: /functions/v1/site/privacy
Terms of service: /functions/v1/site/terms
Contact: ${CONTACT}
`;

const PRIVACY = `Daybook privacy policy
Last updated: October 13, 2026

What Daybook stores
- Your account: your email address, and your name and email from Google if you sign in with Google.
- Your calendar: the events, tasks, calendars and settings you create in Daybook. They are stored in
  your Daybook account so they appear on each of your devices.

Google Calendar
- If you connect Google Calendar, Daybook asks Google for access to your calendars
  (https://www.googleapis.com/auth/calendar) so it can show the calendars you choose in Daybook and
  copy changes both ways between Daybook and Google Calendar.
- Daybook keeps the access Google grants on its server and uses it only for this. Events from the
  calendars you turn on are stored in your Daybook account like your other events.
- Daybook's use of information received from Google APIs adheres to the Google API Services User
  Data Policy, including the Limited Use requirements. Your Google data is not sold, shared with
  anyone, used for advertising, or used to train AI models.
- You can disconnect at any time in Daybook (Settings → Google Calendar → Disconnect), which deletes
  the stored access and removes your Google calendars from Daybook, or from your Google Account
  settings under Third-party connections.

Syllabus imports
- A file you import is sent to an AI service (Anthropic's Claude) to read the dates in it, and is
  not kept afterwards.

Deleting your data
- Email ${CONTACT} to delete your Daybook account and everything stored in it.

Contact: ${CONTACT}
`;

const TERMS = `Daybook terms of service
Last updated: October 13, 2026

Daybook is a personal project offered free of charge, as is, without warranties of any kind. By using
it you agree to these terms.

- Use Daybook only for your own lawful, personal planning.
- You are responsible for your account and for keeping your password safe.
- Keep your own copies of anything important. Daybook tries to keep your calendar safe and in sync,
  but it can't guarantee that data is never lost, delayed or changed, including events copied to or
  from Google Calendar or your phone's calendars.
- Daybook may change, pause or stop at any time. These terms may be updated; continuing to use
  Daybook after a change means you accept the new terms.
- To the extent the law allows, Daybook and its maker are not liable for any loss or damage arising
  from using it.
- How your data is handled is described in the privacy policy: /functions/v1/site/privacy

Contact: ${CONTACT}
`;

Deno.serve((req) => {
  const path = new URL(req.url).pathname;
  const body = path.endsWith('/privacy') ? PRIVACY : path.endsWith('/terms') ? TERMS : HOME;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
});
