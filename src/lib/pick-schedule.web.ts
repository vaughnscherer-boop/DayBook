import * as DocumentPicker from 'expo-document-picker';

import type { PickResult } from '@/lib/pick-schedule';
import { IMPORT_TYPES, MAX_IMPORT_BYTES } from '@/lib/schedule-format';

export type { PickedFile, PickResult } from '@/lib/pick-schedule';

/** Opens the browser's file chooser for a PDF or image; with `base64` the picker reads it as a data: URL. */
export async function pickScheduleFile(): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({ type: Object.keys(IMPORT_TYPES).join(','), base64: true });
  if (result.canceled) return { kind: 'cancelled' };
  const asset = result.assets[0];
  const match = asset.base64?.match(/^data:([^;]+);base64,(.*)$/);
  const mediaType = asset.mimeType ?? match?.[1] ?? '';
  if (!match || !IMPORT_TYPES[mediaType]) return { kind: 'error', message: 'Pick a PDF or an image (PNG, JPEG).' };
  if (asset.size && asset.size > MAX_IMPORT_BYTES) return { kind: 'error', message: 'That file is over 15 MB.' };
  return { kind: 'picked', file: { fileName: asset.name, mediaType, data: match[2] } };
}
