/** A short message at the bottom of the screen, optionally with Undo. Shown by ToastHost. */
export type Toast = { id: number; text: string; undo?: () => void | Promise<void> };

let nextId = 1;
const listeners = new Set<(toast: Toast | null) => void>();

/** Shows a message for a few seconds, replacing any message already showing. */
export function showToast(text: string, undo?: Toast['undo']) {
  const toast = { id: nextId++, text, undo };
  listeners.forEach((listener) => listener(toast));
}

export function onToast(listener: (toast: Toast | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
