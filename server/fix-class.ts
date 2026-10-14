import { askForJson } from './claude-json.ts';
import { cleanFixPlan, FIX_SCHEMA, type FixPlan, type FixRequest } from '../src/lib/fix-format.ts';

// Server-only like read-schedule.ts: relative imports so it runs under both Node and Deno.

const SYSTEM = `You fix mistakes in one class on a student's planner. The student says what's wrong; you propose the smallest set of changes to that class's items that fixes it. The student reviews every change before it's applied.

- Change only what the student's message is about. Leave every other item alone, and never touch items unrelated to the mistake.
- Use only refs from the item list. To change an item, op "update" with its ref and its complete new values (copy any field that stays the same). To remove one, op "delete" with its ref (copy its values). To add one, op "add" with ref null.
- Wrong section ("I'm in Lab B, not Lab A", "I switched to the 10am section"): use the syllabus data. Delete or update the old section's meetings and section-only items, and add the new section's meetings and items with their own days, times and dates. Items for everyone stay. If the syllabus data doesn't list that section, change nothing and say so in warnings.
- Moved dates or times ("the midterm is Oct 22 now"): update that item. Wrong names: update the title. Missing items the student mentions: add them. Duplicates: delete the extra one.
- Weekly classes are events with weekdays (0 = Sunday) and repeat_until; keep their first day (date) on one of their weekdays. Homework and readings are tasks (start_time is a due time or null, end_time null). Exams, quizzes, classes and other events are events.
- Dates are YYYY-MM-DD in the current school year; times are 24-hour HH:MM.
- If the message is unclear or asks for nothing you can change, return no changes and explain in warnings.
- summary: one sentence a student would understand. reason: under 15 words per change.`;

export async function fixClass(input: FixRequest, effort: 'medium' | 'high', signal?: AbortSignal): Promise<FixPlan> {
  const plan = await askForJson<FixPlan>({
    system: SYSTEM,
    schema: FIX_SCHEMA,
    effort,
    signal,
    content: [
      {
        type: 'text',
        text: [
          `Class: ${input.course}`,
          `Today's date: ${input.today}`,
          `The class's items on the planner (JSON):\n${JSON.stringify(input.items)}`,
          input.documents
            ? `The class as read from its syllabus, with every section (JSON):\n${input.documents}`
            : 'No syllabus data is saved for this class.',
          `What the student says is wrong:\n${input.request}`,
        ].join('\n\n'),
      },
    ],
  });
  return cleanFixPlan(plan, input.items);
}
