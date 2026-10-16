import { router } from 'expo-router';

import type { ParsedEvent } from '@/lib/parse-event';

/** What quick add understood from typed text, handed to the full event or task form to check over. */
export type EntryDraft = {
  parsed: ParsedEvent;
  calendarId: string | null;
  notes?: string;
  /** What was typed and which form it went to, so Cancel can go back to quick add with it. */
  text?: string;
  kind?: 'event' | 'task';
};

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

/** Cancel on a form opened from quick add: back to quick add with what you'd typed, to fix it. */
export function backToQuickAdd() {
  router.replace({ pathname: '/new', params: { restore: '1' } });
}

/** Switch the form quick add opened between event and task, keeping the title as edited. */
export function reviewAs(kind: 'event' | 'task', draft: EntryDraft, title: string) {
  setDraft({ ...draft, parsed: { ...draft.parsed, title: title.trim() || draft.parsed.title }, kind });
  router.replace({ pathname: kind === 'event' ? '/event/[id]' : '/task/[id]', params: { id: 'new', draft: '1' } });
}
