/** What "Break it down" sends and gets back (shared by the app and the server). */
export type BreakdownRequest = {
  title: string;
  details: string | null;
  notes: string | null;
  /** 'YYYY-MM-DD' */
  due: string;
  /** 'YYYY-MM-DD' on the student's device */
  today: string;
};
export type BreakdownStep = { title: string; date: string };
export type BreakdownResponse = { ok: true; steps: BreakdownStep[] } | { ok: false; error: string };

export const MAX_BREAKDOWN_TEXT = 4000;
