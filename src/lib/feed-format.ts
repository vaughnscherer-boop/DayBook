/**
 * What reading a school site's calendar feed (an .ics link from Canvas, Moodle, Blackboard...)
 * produces. Shared by the feed reader on the server (`server/school-feed.ts`) and the app. No secrets here.
 */

export type FeedSite = 'canvas' | 'moodle' | 'blackboard' | 'brightspace' | 'schoology' | 'other';

export const FEED_SITES: Record<FeedSite, { name: string; hint: string }> = {
  canvas: { name: 'Canvas', hint: 'Canvas: Calendar → Calendar Feed (bottom right), copy the link.' },
  moodle: { name: 'Moodle', hint: 'Moodle: Calendar → Import or export calendars → Export calendar → Get calendar URL.' },
  blackboard: { name: 'Blackboard', hint: 'Blackboard: Calendar → Share Calendar → copy the iCal link.' },
  brightspace: { name: 'Brightspace', hint: 'Brightspace: Calendar → Subscribe, copy the feed link.' },
  schoology: { name: 'Schoology', hint: 'Schoology: Calendar → Export (the iCal icon), copy the link.' },
  other: { name: 'Calendar feed', hint: 'Any calendar link that ends in .ics (or starts with webcal://) works.' },
};

export type FeedItem = {
  /** Stable id from the school site; the same item keeps the same uid on every refresh. */
  uid: string;
  title: string;
  /** The course as the site names it ("BIO 150-01", "Intro to Biology"), when it says. */
  course: string | null;
  /**
   * 'YYYY-MM-DD' for an all-day item, 'YYYY-MM-DDTHH:MM:SSZ' for a moment in UTC (turn it into the
   * phone's local time), or 'YYYY-MM-DDTHH:MM' for a clock time with no zone (use as is).
   */
  start: string;
  /** Same formats as `start`; for all-day items, the last day. Null when the feed gives none. */
  end: string | null;
  allDay: boolean;
  description: string | null;
  url: string | null;
  /** The site means a due date (homework to hand in) rather than something you attend. */
  due: boolean;
};

export type FeedResponse = { ok: true; site: FeedSite; items: FeedItem[] } | { ok: false; error: string };

export const MAX_FEED_BYTES = 5 * 1024 * 1024;
export const MAX_FEED_ITEMS = 3000;
