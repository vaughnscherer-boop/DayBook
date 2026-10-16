/** Text pasted into quick add that's long enough to be a page, handed to the import screen. */
let pending: string | null = null;

export function setPendingPaste(text: string) {
  pending = text;
}

/** The pasted text, once; null when there's none. */
export function takePendingPaste() {
  const text = pending;
  pending = null;
  return text;
}
