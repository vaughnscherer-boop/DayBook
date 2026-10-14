import Anthropic from '@anthropic-ai/sdk';

import { IMPORT_TYPES, SCHEDULE_SCHEMA, TEXT_IMPORT, type ScheduleImport } from '../src/lib/schedule-format.ts';

// Server-only (runs in `server/index.ts` under Node, never in the app), so the API key and the SDK
// stay out of the app bundle. Imports use relative `.ts` paths because Node runs this file directly.

const MODEL = 'claude-opus-5-5';
// Opus 5.5 pricing per million tokens, for the cost shown after an import.
const INPUT_PRICE = 4;
const OUTPUT_PRICE = 20;

const SYSTEM = `You turn a student's syllabus or schedule (a PDF or a photo) into calendar data for a planner app. Return only what the document actually says; never invent dates or times.

Courses
- One entry per course. A document that isn't a course (a work or sports schedule) is a single entry with code null and a descriptive name.
- nickname: the one lowercase word a student would type for this course ("bio", "latin", "calc").
- sections: when the document lists alternatives a student picks one of (lecture sections, lab sections A/B/C), list their labels exactly as written (e.g. "Sect. A", "Lab B"). Otherwise [].

Weekly meetings
- One meeting per recurring pattern: the lecture, each lab section, discussion sections, office hours, review/study sessions.
- section: for a pattern that belongs to one section, that section's label exactly as listed in sections; null if every student attends.
- optional: true for things a student may skip (office hours, drop-in or tutoring labs, conversation tables, review sessions); false for required class meetings and required labs.
- first_date / last_date: the first and last day that meeting actually happens (e.g. the first day of class), or null if the document doesn't say.
- cancelled_dates: every date between first_date and last_date on which that meeting is listed as not happening: "No Class", breaks, holidays, reading days, "No Labs" weeks (for a lab, use the lab's own day in that week). Include dates before the first real class if the schedule lists them as no class.

Dated items
- exam / quiz: tests, midterms, finals. If held in class with no separate time, at_class true and times null. Give finals their own times. If exams differ by section, one item per section with section set.
- assignment: homework, problem sets, lab reports, things to submit. In a schedule listing work on a class day, that work is due at that class: at_class true.
- reading: assigned readings/chapters for a class day (at_class true).
- presentation: student presentations.
- event: other dated class events worth a calendar entry (field trips, guest lectures, lab practicals).
- break: breaks and holidays (Fall Break, Thanksgiving Break, Reading Day) as one item each, using end_date for multi-day breaks.
- Be exhaustive: every dated thing to do, read, submit or attend belongs in items, including every reading. Work that differs by section (each lab section's own homework and due dates, per-section peer reviews and presentations) gets one item per section with section set; never collapse sections into one item or leave a section's work out.
- Skip lecture topics with nothing due, plain links, grading policy, and lists of other students' names.
- details: everything the document says about that particular item, as 1–3 short plain sentences a student can act on: what to do (exercises, pages, length), what it covers (chapters, topics), format and duration, how much of the grade it's worth, and how or where to submit. Pull in descriptions from anywhere in the document (an assignments section, a grading table, exam descriptions) onto the matching dated item. Use null when the document says nothing beyond the title; never invent or generalize.
- Titles: short and specific, as a student would write them in a planner: "Quiz 1 (Ch. 1–2)", "Ex. 16–20 & story, Ch. 1", "Read Ch. 1 (pp. 1–11)", "Problem Set 2", "Test 2". Don't repeat the course code in titles.

Pasted web pages
- The input may be text copied from a school site page (Moodle, Canvas, Blackboard, Brightspace...): a course page, a Timeline or "Upcoming events" list, or an assignment page. It is messy: menus, repeated headings, "Opened:" / "Due:" lines, section names like "Week 3". Use only the real course content.
- Items due or closing on a date are assignments, quizzes or exams as the wording says; "Opens" / "Opened" dates alone are not items. Ignore navigation, forums with no deadline, and links.
- A date given as "Tuesday, 14 October, 11:59 PM" is that day at that time (a due time, not a class). Set at_class false and give the time. No classes or weekly meetings unless the page lists them: meetings can be [].
- If the page names no course, use the page title or the heading as the course name.

Grading
- grading: the course's grade breakdown, one entry per weighted category, exactly as the document gives it ("Exams 40%", "Homework 25%", "Final 20%", "Participation 15%"). weight is the percent as a number. Merge a category listed in pieces (Midterm 1, Midterm 2) only if the document itself groups them; otherwise keep its lines. drop_lowest is how many of the lowest scores are dropped ("lowest quiz dropped" = 1), else null. [] if the document gives no weights; never invent them.

Dates and times
- Dates are YYYY-MM-DD. When the year is missing, use the term shown in the document; otherwise the school year containing today's date.
- Times are 24-hour HH:MM. "0245PM" means 14:45; "8-8:55 a.m." means 08:00–08:55.

warnings: short notes about anything ambiguous or contradictory a student should double-check (the same test listed on two dates, a "tentative" schedule, an unreadable part). Keep each under 20 words.`;

export class ScheduleReadError extends Error {}

/** Reads a syllabus/schedule file with Claude and returns its classes and dates. */
export async function readSchedule(input: {
  data: string; // base64
  mediaType: string;
  fileName: string;
  today: string; // 'YYYY-MM-DD' on the student's device
  /** How hard Claude thinks: 'medium' is faster (hosted functions have a time limit), 'high' more thorough. */
  effort?: 'medium' | 'high';
  /** Gives up (with a friendly error) when this fires. */
  signal?: AbortSignal;
}): Promise<{ schedule: ScheduleImport; costUsd: number }> {
  const isText = input.mediaType === TEXT_IMPORT;
  const kind = IMPORT_TYPES[input.mediaType];
  if (!kind && !isText) throw new ScheduleReadError('That file type isn’t supported — use a PDF, PNG, JPEG, GIF or WebP.');

  const file: Anthropic.Beta.BetaContentBlockParam = isText
    ? { type: 'text', text: `Text copied from a web page:\n\n${input.data}` }
    : kind === 'document'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.data } }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: input.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
            data: input.data,
          },
        };

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        // If a safety classifier declines, retry on Anthropic's recommended fallback model.
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: input.effort ?? 'medium', format: { type: 'json_schema', schema: SCHEDULE_SCHEMA } },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              file,
              { type: 'text', text: `File name: ${input.fileName}\nToday's date: ${input.today}` },
            ],
          },
        ],
      }, { signal: input.signal })
      .finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) {
      throw new ScheduleReadError('That took too long to read — try a shorter document, or just the schedule pages.');
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ScheduleReadError('The server’s Anthropic API key isn’t valid. Check ANTHROPIC_API_KEY in .env.local.');
    }
    if (error instanceof Anthropic.PermissionDeniedError || error instanceof Anthropic.BadRequestError) {
      // Out of credit shows up as a 400 about the credit balance.
      if (/credit/i.test(error.message)) {
        throw new ScheduleReadError('Out of API credit — add more at console.anthropic.com.');
      }
      throw new ScheduleReadError(`Claude couldn’t read that file (${error.message}).`);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ScheduleReadError('Too many imports right now — try again in a minute.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new ScheduleReadError('Couldn’t reach Anthropic — check the internet connection.');
    }
    throw error;
  }

  if (message.stop_reason === 'refusal') {
    throw new ScheduleReadError('Claude declined to read this file.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new ScheduleReadError('That document is too long to read in one go — try importing fewer pages.');
  }
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  let schedule: ScheduleImport;
  try {
    schedule = JSON.parse(text) as ScheduleImport;
  } catch {
    throw new ScheduleReadError('Claude’s answer came back garbled — please try again.');
  }

  const usage = message.usage;
  const inputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const costUsd = (inputTokens * INPUT_PRICE + usage.output_tokens * OUTPUT_PRICE) / 1_000_000;
  return { schedule, costUsd };
}
