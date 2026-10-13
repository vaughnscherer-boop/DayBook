/** "The data changed behind your back" (e.g. sync brought in edits from another device): screens reload. */
const listeners = new Set<() => void>();

export function onDataChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyDataChanged() {
  for (const listener of listeners) listener();
}

/** "Something may have changed here" (the calendar reloaded): the phone-calendar mirror re-checks. */
const localListeners = new Set<() => void>();

export function onLocalChange(listener: () => void): () => void {
  localListeners.add(listener);
  return () => localListeners.delete(listener);
}

export function notifyLocalChange() {
  for (const listener of localListeners) listener();
}
