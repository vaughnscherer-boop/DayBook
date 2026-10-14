import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { mergeBreaks, parseBreaks, type TermBreak } from '@/lib/terms';

export type Term = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  breaks: string; // JSON TermBreak[]
  created_at: string;
  updated_at: string;
};

export async function listTerms(db: SQLiteDatabase): Promise<Term[]> {
  return db.getAllAsync<Term>('SELECT * FROM terms ORDER BY starts_on DESC');
}

export async function createTerm(
  db: SQLiteDatabase,
  input: { name: string; starts_on: string; ends_on: string; breaks?: TermBreak[] }
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO terms (id, name, starts_on, ends_on, breaks, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    input.name.trim(),
    input.starts_on,
    input.ends_on,
    JSON.stringify(input.breaks ?? []),
    now,
    now
  );
  return id;
}

export async function updateTerm(
  db: SQLiteDatabase,
  id: string,
  changes: Partial<{ name: string; starts_on: string; ends_on: string; breaks: TermBreak[] }>
) {
  const term = await db.getFirstAsync<Term>('SELECT * FROM terms WHERE id = ?', id);
  if (!term) return;
  await db.runAsync(
    'UPDATE terms SET name = ?, starts_on = ?, ends_on = ?, breaks = ?, updated_at = ? WHERE id = ?',
    changes.name?.trim() || term.name,
    changes.starts_on ?? term.starts_on,
    changes.ends_on ?? term.ends_on,
    changes.breaks ? JSON.stringify(changes.breaks) : term.breaks,
    new Date().toISOString(),
    id
  );
}

/** Removes the term; its courses stay, just no longer in a term. */
export async function deleteTerm(db: SQLiteDatabase, id: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE groups SET term_id = NULL, archived = 0, updated_at = ? WHERE term_id = ?', new Date().toISOString(), id);
    await db.runAsync('DELETE FROM terms WHERE id = ?', id);
  });
}

/** Ends a term: its courses are archived (hidden from Home), their events and tasks stay. */
export async function endTerm(db: SQLiteDatabase, id: string) {
  await db.runAsync('UPDATE groups SET archived = 1, updated_at = ? WHERE term_id = ?', new Date().toISOString(), id);
}

export async function reopenTerm(db: SQLiteDatabase, id: string) {
  await db.runAsync('UPDATE groups SET archived = 0, updated_at = ? WHERE term_id = ?', new Date().toISOString(), id);
}

/**
 * The term for an imported syllabus: an existing one with the same dates, else a new one named
 * after the start ("Fall 2026"). Breaks the syllabus lists are added to it.
 */
export async function findOrCreateTerm(
  db: SQLiteDatabase,
  span: { starts_on: string; ends_on: string },
  breaks: TermBreak[]
): Promise<string> {
  const overlapping = await db.getFirstAsync<Term>(
    'SELECT * FROM terms WHERE starts_on <= ? AND ends_on >= ? ORDER BY abs(julianday(starts_on) - julianday(?)) LIMIT 1',
    span.ends_on,
    span.starts_on,
    span.starts_on
  );
  if (overlapping) {
    const merged = mergeBreaks(parseBreaks(overlapping.breaks), breaks);
    if (merged.length !== parseBreaks(overlapping.breaks).length) await updateTerm(db, overlapping.id, { breaks: merged });
    return overlapping.id;
  }
  return createTerm(db, { name: termName(span.starts_on), ...span, breaks: mergeBreaks([], breaks) });
}

/** "Fall 2026" from a term's start date. */
export function termName(startsOn: string): string {
  const [year, month] = startsOn.split('-').map(Number);
  const season = month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Fall';
  return `${season} ${year}`;
}
