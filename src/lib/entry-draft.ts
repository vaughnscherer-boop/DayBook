import type { ParsedEvent } from '@/lib/parse-event';

/** What quick add understood from typed text, handed to the full event or task form to check over. */
export type EntryDraft = { parsed: ParsedEvent; calendarId: string | null; notes?: string };

// Kept in memory rather than in the URL: it's only meant for the form opened right after typing.
let current: EntryDraft | null = null;

export function setDraft(draft: EntryDraft) {
  current = draft;
}

/** The latest draft; null after a reload, so the form just starts blank. */
export function readDraft() {
  return current;
}

/** The class "due next class" homework belongs to, as the form's group choice. */
export function draftGroup(draft: EntryDraft) {
  const ref = draft.parsed.classRef;
  return ref?.kind === 'found' ? { groupId: ref.groupId } : null;
}
