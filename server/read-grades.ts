import { askForJson, fileBlock } from './claude-json.ts';
import { GRADE_SCHEMA, type GradeRead, type GradeRequest } from '../src/lib/grade-import-format.ts';

// Server-only like read-schedule.ts: relative imports so it runs under both Node and Deno.

const SYSTEM = `You read a student's grades page from their school site (Canvas, Moodle, Blackboard, Brightspace, PowerSchool...) for one class, and match each graded item to the student's planner.

Grades
- One entry per item that has a score. Skip rows with no score yet ("–", "-", blank, "Not submitted", "Submitted" with no points, "Excused"), totals and category subtotals.
- score and max are points as shown ("18 / 20" → 18 and 20). When only a percent is shown, score is the percent and max is 100. A letter grade alone is not a score: skip it.
- Never invent or round scores.
- kind: exam for exams, midterms, finals, tests and quizzes; assignment for everything else.
- category: the group the page lists the item under ("Homework", "Quizzes"), or null.
- date: the due date shown, YYYY-MM-DD (the school year containing today when the year is missing), or null.

Matching
- The student's planner items for this class are listed with a ref each. Set ref to the planner item that is the same piece of work: titles may be worded differently ("HW 3" / "Homework 3", "Midterm" / "Exam 1"), and dates help. Use each ref at most once. When nothing matches, ref is null.

Also
- categories: the weighted categories the page shows ("Exams 40%"), weight as a percent number; [] when it shows none.
- overall_percent: the course total the page shows, as a percent, or null.
- warnings: short notes about anything to double-check (under 20 words each).

Pasted pages are messy: ignore menus, links, comments and rubric text.`;

export async function readGrades(input: GradeRequest, effort: 'medium' | 'high', signal?: AbortSignal): Promise<GradeRead> {
  const planner = input.items
    .map((item) => `- ref ${item.ref}: ${item.title} (${item.item_type}${item.date ? `, ${item.date}` : ''}${item.max ? `, out of ${item.max}` : ''})`)
    .join('\n');
  const read = await askForJson<GradeRead>({
    system: SYSTEM,
    schema: GRADE_SCHEMA,
    effort,
    signal,
    content: [
      fileBlock(input),
      {
        type: 'text',
        text: [
          `Class: ${input.course}`,
          `Today's date: ${input.today}`,
          input.categories.length ? `The planner's grade categories: ${input.categories.join(', ')}` : null,
          `The planner's items for this class:\n${planner || '(none yet)'}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  });

  // Keep the answer honest whatever the model said.
  const refs = new Set(input.items.map((item) => item.ref));
  const used = new Set<string>();
  const grades = (Array.isArray(read.grades) ? read.grades : [])
    .filter((g) => typeof g?.title === 'string' && g.title.trim() && Number.isFinite(g.score) && g.score >= 0)
    .map((g) => {
      const ref = g.ref && refs.has(g.ref) && !used.has(g.ref) ? g.ref : null;
      if (ref) used.add(ref);
      return {
        title: g.title.trim().slice(0, 200),
        score: g.score,
        max: Number.isFinite(g.max) && g.max! > 0 ? g.max : null,
        ref,
        category: g.category?.trim() || null,
        date: g.date && /^\d{4}-\d{2}-\d{2}$/.test(g.date) ? g.date : null,
        kind: g.kind === 'exam' ? ('exam' as const) : ('assignment' as const),
      };
    });
  return {
    grades,
    categories: (Array.isArray(read.categories) ? read.categories : []).filter(
      (c) => typeof c?.name === 'string' && c.name.trim() && Number.isFinite(c.weight) && c.weight > 0
    ),
    overall_percent: Number.isFinite(read.overall_percent) ? read.overall_percent : null,
    warnings: Array.isArray(read.warnings) ? read.warnings.filter((w) => typeof w === 'string').slice(0, 10) : [],
  };
}
