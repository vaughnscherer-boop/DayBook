import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { FeedResponse } from '../src/lib/feed-format.ts';
import { isImportType, MAX_IMPORT_BYTES, MAX_IMPORT_TEXT, TEXT_IMPORT, type ImportResponse } from '../src/lib/schedule-format.ts';
import { readSchedule, ScheduleReadError } from './read-schedule.ts';
import { FeedError, readFeed } from './school-feed.ts';
import { summarizeTitles, SummarizeError } from './summarize-titles.ts';

/**
 * Daybook's import server: POST /api/import { fileName, mediaType, data (base64), today } -> ImportResponse.
 * It holds the Anthropic API key (ANTHROPIC_API_KEY, from .env.local) so the app never does.
 *
 *   npm run server        (listens on PORT, default 8787, on every network interface so a phone
 *                          on the same Wi-Fi can reach it)
 */

const PORT = Number(process.env.PORT ?? 8787);
const DAILY_LIMIT = 20;
// Imports per device per day. In memory, so it resets when the server restarts; enough to stop a
// runaway loop from emptying the account, not a real quota (that needs sign-in).
const usage = new Map<string, { day: string; count: number }>();

function send(
  res: ServerResponse,
  status: number,
  body: ImportResponse | FeedResponse | { ok: true } | { ok: true; titles: string[] }
) {
  res.writeHead(status, {
    'content-type': 'application/json',
    // The app's web build runs on another origin (the Expo dev server or its own host).
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-device-id',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
  });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}
const fail = (res: ServerResponse, status: number, error: string) => send(res, status, { ok: false, error });

/** The request body as text, or null if it's bigger than a 15 MB file would be once base64'd. */
async function readBody(req: IncomingMessage): Promise<string | null> {
  const limit = Math.ceil((MAX_IMPORT_BYTES * 4) / 3) + 10_000;
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > limit) return null;
    parts.push(part);
  }
  return Buffer.concat(parts).toString('utf8');
}

async function handleImport(req: IncomingMessage, res: ServerResponse) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(res, 500, 'Importing isn’t set up: add ANTHROPIC_API_KEY to .env.local and restart the server.');
  }
  const text = await readBody(req);
  if (text === null) return fail(res, 413, 'That file is over 15 MB.');

  let body: { fileName?: unknown; mediaType?: unknown; data?: unknown; today?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return fail(res, 400, 'The upload didn’t arrive in one piece — please try again.');
  }
  const { fileName, mediaType, data, today } = body;
  if (typeof data !== 'string' || typeof mediaType !== 'string' || typeof today !== 'string') {
    return fail(res, 400, 'Missing file.');
  }
  if (!isImportType(mediaType)) return fail(res, 415, 'Use a PDF, PNG, JPEG, GIF or WebP file.');
  if (mediaType === TEXT_IMPORT && data.length > MAX_IMPORT_TEXT) return fail(res, 413, 'That text is too long — paste just the part with the dates.');

  const device = String(req.headers['x-device-id'] ?? 'unknown');
  const day = new Date().toISOString().slice(0, 10);
  const used = usage.get(device);
  const count = used?.day === day ? used.count : 0;
  if (count >= DAILY_LIMIT) return fail(res, 429, `That’s ${DAILY_LIMIT} imports today — try again tomorrow.`);
  usage.set(device, { day, count: count + 1 });

  try {
    const result = await readSchedule({
      data,
      mediaType,
      fileName: typeof fileName === 'string' ? fileName.slice(0, 200) : 'schedule',
      today: /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : day,
    });
    console.log(`[import] ${result.schedule.title} — $${result.costUsd.toFixed(3)}`);
    send(res, 200, { ok: true, ...result });
  } catch (error) {
    if (error instanceof ScheduleReadError) return fail(res, 502, error.message);
    console.error('[import] failed', error);
    fail(res, 500, 'Something went wrong reading that file — please try again.');
  }
}

/** POST /api/summarize { titles: string[] } -> { ok, titles }: the local twin of the summarize-titles function. */
async function handleSummarize(req: IncomingMessage, res: ServerResponse) {
  if (!process.env.ANTHROPIC_API_KEY) return fail(res, 500, 'No ANTHROPIC_API_KEY in .env.local.');
  let titles: unknown;
  try {
    titles = (JSON.parse((await readBody(req)) ?? '') as { titles?: unknown }).titles;
  } catch {
    return fail(res, 400, 'Bad request.');
  }
  if (!Array.isArray(titles) || titles.length === 0 || titles.length > 30 || titles.some((t) => typeof t !== 'string' || t.length > 300)) {
    return fail(res, 400, 'Send 1–30 titles of up to 300 characters.');
  }
  try {
    send(res, 200, { ok: true, titles: await summarizeTitles(titles as string[], AbortSignal.timeout(10_000)) });
  } catch (error) {
    if (error instanceof SummarizeError) return fail(res, 502, error.message);
    console.error('[summarize] failed', error);
    fail(res, 500, 'Something went wrong.');
  }
}

/**
 * POST /api/feed { url } -> FeedResponse: the local twin of the school-feed function. FEED_ALLOW_LOCAL=1
 * also lets it read http:// and localhost links, for trying feeds out on your own computer.
 */
async function handleFeed(req: IncomingMessage, res: ServerResponse) {
  let url: unknown;
  try {
    url = (JSON.parse((await readBody(req)) ?? '') as { url?: unknown }).url;
  } catch {
    return fail(res, 400, 'Bad request.');
  }
  if (typeof url !== 'string' || url.length === 0 || url.length > 2000) return fail(res, 400, 'Send the calendar link.');
  try {
    send(res, 200, await readFeed(url, { allowLocal: process.env.FEED_ALLOW_LOCAL === '1' }));
  } catch (error) {
    if (error instanceof FeedError) return fail(res, 400, error.message);
    console.error('[feed] failed', error);
    fail(res, 500, 'Something went wrong reading that calendar.');
  }
}

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (req.method === 'OPTIONS') return send(res, 204, { ok: true });
  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });
  if (req.method === 'POST' && path === '/api/import') {
    handleImport(req, res).catch((error) => {
      console.error('[import] crashed', error);
      fail(res, 500, 'Something went wrong reading that file — please try again.');
    });
    return;
  }
  if (req.method === 'POST' && path === '/api/summarize') {
    handleSummarize(req, res).catch(() => fail(res, 500, 'Something went wrong.'));
    return;
  }
  if (req.method === 'POST' && path === '/api/feed') {
    handleFeed(req, res).catch(() => fail(res, 500, 'Something went wrong.'));
    return;
  }
  fail(res, 404, 'Not found.');
});
// Claude can take a minute or two on a long syllabus; don't let Node cut the request off.
server.requestTimeout = 5 * 60_000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Daybook import server on http://localhost:${PORT}${process.env.ANTHROPIC_API_KEY ? '' : ' (no ANTHROPIC_API_KEY set!)'}`);
});
