import { useCallback, useEffect, useRef, useState } from 'react';

import { shortenTitles, shortTitle } from '@/lib/summarize-api';

const DEBOUNCE_MS = 600;
const SETTLE_MS = 2000;

/**
 * Short planner titles for wordy typed ones ("I need to give back my borrowed latin books" ->
 * "Return latin books"). Fetches shortly after typing stops; `short` gives the best title known now,
 * and `settle` waits (briefly) for a request still in flight so saving right away still gets it.
 */
export function useShortTitles(titles: string[]) {
  const [, rerender] = useState(0);
  const pending = useRef<Promise<void> | null>(null);
  const key = titles.join('\n');

  useEffect(() => {
    const wanted = key ? key.split('\n') : [];
    const timer = setTimeout(() => {
      const run = shortenTitles(wanted).then(() => rerender((n) => n + 1));
      pending.current = run;
      run.finally(() => {
        if (pending.current === run) pending.current = null;
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key]);

  const settle = useCallback(async () => {
    const current = pending.current;
    if (current) await Promise.race([current, new Promise((resolve) => setTimeout(resolve, SETTLE_MS))]);
  }, []);

  return { short: shortTitle, settle };
}
