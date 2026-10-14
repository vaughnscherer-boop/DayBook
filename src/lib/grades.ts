import type { ItemType } from '@/lib/item-type';

/**
 * Course grades from weighted categories (Exams 40%, Homework 30%...). Pure, so the math can be
 * checked without the app; `src/db/grades.ts` stores categories and scores.
 *
 * A category's percent is its points earned over points possible (drop-lowest removes the worst
 * scores first). The course grade averages the categories that have scores, by weight, so it stays
 * meaningful early in the term when the final hasn't happened yet.
 */

export type Category = { id: string; name: string; weight: number; drop_lowest: number };

export type GradeItem = {
  id: string;
  title: string;
  itemType: ItemType;
  categoryId: string | null;
  score: number | null;
  max: number | null;
};

export type CategoryResult = {
  category: Category;
  /** Percent over the scored items, or null when none are scored. */
  percent: number | null;
  scored: number;
  /** Exams/assignments in the category, scored or not. */
  total: number;
};

export type CourseGrade = {
  /** Weighted percent over the categories with scores, or null before anything is graded. */
  percent: number | null;
  categories: CategoryResult[];
  /** Graded items that fit no category (so they count for nothing). */
  uncategorized: number;
};

const isScored = (item: GradeItem) => item.score !== null && item.max !== null && item.max > 0;

const WORDS: Record<ItemType, RegExp> = {
  exam: /\b(exams?|tests?|quiz(zes)?|midterms?|finals?)\b/i,
  assignment: /\b(homeworks?|hw|assignments?|problem sets?|psets?|labs?|projects?|papers?|essays?|reports?|worksheets?|participation|reading)\b/i,
  reading: /\b(homeworks?|hw|assignments?|reading|participation)\b/i,
  class: /\b(attendance|participation)\b/i,
  other: /(?!)/,
};

/** The first word of a plural-insensitive stem: "Quizzes" -> "quiz", "Exams" -> "exam". */
const stem = (word: string) => word.toLowerCase().replace(/zzes$/, 'z').replace(/(es|s)$/, '');

/**
 * The category an item counts in: the one it was put in by hand, else one whose name is a word in
 * the item's title ("Quiz 3" -> "Quizzes"), else one whose name fits its type (an exam -> "Exams"
 * or "Tests"). Null when nothing fits.
 */
export function categoryFor(item: GradeItem, categories: Category[]): Category | null {
  if (item.categoryId) {
    const chosen = categories.find((c) => c.id === item.categoryId);
    if (chosen) return chosen;
  }
  // The category whose name appears in the title; when several do ("Final exam" fits both "Exams"
  // and "Final"), the one named by the earliest word, since a qualifier comes before the noun.
  const titleWords = (item.title.toLowerCase().match(/[a-z]+/g) ?? []).map(stem);
  let byTitle: Category | null = null;
  let earliest = Infinity;
  for (const category of categories) {
    const at = (category.name.toLowerCase().match(/[a-z]+/g) ?? [])
      .map(stem)
      .filter((word) => word.length > 2)
      .map((word) => titleWords.indexOf(word))
      .filter((index) => index >= 0);
    if (at.length > 0 && Math.min(...at) < earliest) {
      earliest = Math.min(...at);
      byTitle = category;
    }
  }
  if (byTitle) return byTitle;
  const byType = categories.find((c) => WORDS[item.itemType].test(c.name));
  if (byType) return byType;
  return null;
}

/** Percent for one category's items; the lowest `drop` scores are left out (never all of them). */
export function categoryPercent(items: GradeItem[], drop: number): number | null {
  const scored = items.filter(isScored);
  if (scored.length === 0) return null;
  const keep = [...scored].sort((a, b) => b.score! / b.max! - a.score! / a.max!);
  const removable = Math.min(Math.max(drop, 0), keep.length - 1);
  const kept = keep.slice(0, keep.length - removable);
  const earned = kept.reduce((sum, i) => sum + i.score!, 0);
  const possible = kept.reduce((sum, i) => sum + i.max!, 0);
  return (earned / possible) * 100;
}

export function courseGrade(categories: Category[], items: GradeItem[]): CourseGrade {
  const byCategory = new Map<string, GradeItem[]>(categories.map((c) => [c.id, []]));
  let uncategorized = 0;
  for (const item of items) {
    const category = categoryFor(item, categories);
    if (category) byCategory.get(category.id)!.push(item);
    else if (isScored(item)) uncategorized++;
  }
  const results: CategoryResult[] = categories.map((category) => {
    const mine = byCategory.get(category.id)!;
    return {
      category,
      percent: categoryPercent(mine, category.drop_lowest),
      scored: mine.filter(isScored).length,
      total: mine.length,
    };
  });
  const counted = results.filter((r) => r.percent !== null && r.category.weight > 0);
  const weight = counted.reduce((sum, r) => sum + r.category.weight, 0);
  const percent = weight > 0 ? counted.reduce((sum, r) => sum + r.percent! * r.category.weight, 0) / weight : null;
  return { percent, categories: results, uncategorized };
}

const SCALE: [number, string][] = [
  [93, 'A'], [90, 'A-'], [87, 'B+'], [83, 'B'], [80, 'B-'], [77, 'C+'], [73, 'C'], [70, 'C-'], [67, 'D+'], [63, 'D'], [60, 'D-'],
];

export function letter(percent: number): string {
  return SCALE.find(([min]) => percent >= min - 1e-9)?.[1] ?? 'F';
}

/** "92.4%" for a percent (one decimal, no trailing ".0"). */
export const formatPercent = (percent: number) => `${Math.round(percent * 10) / 10}%`;

/**
 * "What do I need?": the average percent to earn on the not-yet-graded items of `categoryId` to end
 * with `target` overall. The other categories stay as they are now, and each ungraded item is worth
 * as many points as the category's graded ones average (100 if none are graded). Null when the
 * category has no ungraded items or the target can't be reached from the numbers we have.
 */
export function neededOn(
  categories: Category[],
  items: GradeItem[],
  categoryId: string,
  target: number
): { needed: number; reachable: boolean } | null {
  const result = courseGrade(categories, items);
  const mine = result.categories.find((r) => r.category.id === categoryId);
  if (!mine || mine.category.weight <= 0) return null;
  const inCategory = items.filter((item) => categoryFor(item, categories)?.id === categoryId);
  const ungraded = inCategory.filter((item) => !isScored(item));
  if (ungraded.length === 0) return null;

  const others = result.categories.filter((r) => r.category.id !== categoryId && r.percent !== null && r.category.weight > 0);
  const otherWeight = others.reduce((sum, r) => sum + r.category.weight, 0);
  const otherPoints = others.reduce((sum, r) => sum + r.percent! * r.category.weight, 0);
  const w = mine.category.weight;
  // Overall = (otherPoints + w * categoryPercent) / (otherWeight + w)
  const categoryNeeded = (target * (otherWeight + w) - otherPoints) / w;

  const scored = inCategory.filter(isScored);
  const earned = scored.reduce((sum, i) => sum + i.score!, 0);
  const possible = scored.reduce((sum, i) => sum + i.max!, 0);
  const each = scored.length ? possible / scored.length : 100;
  const remaining = each * ungraded.length;
  // categoryPercent = (earned + x/100 * remaining) / (possible + remaining) * 100
  const needed = ((categoryNeeded / 100) * (possible + remaining) - earned) / remaining * 100;
  return { needed, reachable: needed <= 100 + 1e-9 };
}
