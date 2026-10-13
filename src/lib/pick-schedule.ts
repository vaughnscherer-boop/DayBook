import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { IMPORT_TYPES, MAX_IMPORT_BYTES } from '@/lib/schedule-format';

export type PickedFile = { fileName: string; mediaType: string; data: string };
export type PickResult = { kind: 'picked'; file: PickedFile } | { kind: 'cancelled' } | { kind: 'error'; message: string };

const ACCEPT = Object.keys(IMPORT_TYPES);

/** Opens the Files picker for a PDF or image and reads it as base64. */
export async function pickScheduleFile(): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({ type: [...ACCEPT, 'image/heic'], copyToCacheDirectory: true });
  if (result.canceled) return { kind: 'cancelled' };
  const asset = result.assets[0];
  const mediaType = asset.mimeType ?? '';
  if (!IMPORT_TYPES[mediaType]) {
    return {
      kind: 'error',
      message:
        mediaType === 'image/heic'
          ? 'iPhone photos (HEIC) can’t be read yet — take a screenshot of the photo and import that.'
          : 'Pick a PDF or an image (PNG, JPEG).',
    };
  }
  if (asset.size && asset.size > MAX_IMPORT_BYTES) return { kind: 'error', message: 'That file is over 15 MB.' };
  const data = await new File(asset.uri).base64();
  return { kind: 'picked', file: { fileName: asset.name, mediaType, data } };
}
