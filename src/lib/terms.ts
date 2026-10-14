import { addDays, fromKey, toDateKey } from '@/lib/dates';

/**
 * School terms: a start and end date plus breaks (spring break, Thanksgiving...). Pure, so the date
 * math can be checked without the app; `src/db/terms.ts` stores them.
 */

export type TermBreak = { name: string; from: string; to: string }; // 'YYYY-MM-DD', inclusive
export type TermInfo = { id: string; name: string; starts_on: string; ends_on: string; breaks: string };

export function parseBreaks(json: string | null | undefined): TermBreak[] {
  try {
    const list = JSON.parse(json || '[]');
    return Array.isArray(list) ? list.filter((b) => b && typeof b.from === 'string' && typeof b.to === 'string') : [];
  } catch {
    return [];
  }
}

/** The term that contains `today`, else the next one to start, else the one that ended most recently. */
export function currentTerm<T extends TermInfo>(terms: T[], today: string): T | null {
  const running = terms.find((t) => t.starts_on <= today && today <= t.ends_on);
  if (running) return running;
  const upcoming = terms.filter((t) => t.starts_on > today).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0];
  if (upcoming) return upcoming;
  return [...terms].sort((a, b) => b.ends_on.localeCompare(a.ends_on))[0] ?? null;
}

/** Every date ('YYYY-MM-DD') inside any of the breaks. */
export function breakDates(breaks: TermBreak[]): string[] {
  const days = new Set<string>();
  for (const b of breaks) {
    if (b.to < b.from) continue;
    let day = fromKey(b.from);
    const last = b.to;
    for (let guard = 0; guard < 400; guard++) {
      const key = toDateKey(day);
      if (key > last) break;
      days.add(key);
      day = addDays(day, 1);
    }
  }
  return [...days].sort();
}

/**
 * How a repeating class fits a term: it stops at the term's end (never later than it already did)
 * and skips the break days, on top of the dates it already skips.
 */
export function fitSeriesToTerm(
  series: { repeat_until: string | null; exceptions: string[] },
  term: Pick<TermInfo, 'ends_on' | 'breaks'>
): { repeat_until: string; exceptions: string[] } {
  const until = series.repeat_until && series.repeat_until < term.ends_on ? series.repeat_until : term.ends_on;
  const skipped = [...new Set([...series.exceptions, ...breakDates(parseBreaks(term.breaks))])].sort();
  return { repeat_until: until, exceptions: skipped };
}

/** Merges new breaks into a term's list: an identical date range is kept once. */
export function mergeBreaks(existing: TermBreak[], added: TermBreak[]): TermBreak[] {
  const seen = new Set(existing.map((b) => `${b.from}|${b.to}`));
  const merged = [...existing];
  for (const b of added) {
    const key = `${b.from}|${b.to}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(b);
    }
  }
  return merged.sort((a, b) => a.from.localeCompare(b.from));
}

/** "Aug 25 – Dec 12" for a term's dates. */
export function termRange(term: Pick<TermInfo, 'starts_on' | 'ends_on'>): string {
  const fmt = (key: string) => fromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(term.starts_on)} – ${fmt(term.ends_on)}`;
}
