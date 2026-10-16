import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

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
          ? photosAvailable
            ? 'For iPhone photos, use “Choose photo” instead.'
            : 'iPhone photos (HEIC) can’t be read yet — take a screenshot of the photo and import that.'
          : 'Pick a PDF or an image (PNG, JPEG).',
    };
  }
  if (asset.size && asset.size > MAX_IMPORT_BYTES) return { kind: 'error', message: 'That file is over 15 MB.' };
  const data = await new File(asset.uri).base64();
  return { kind: 'picked', file: { fileName: asset.name, mediaType, data } };
}

/**
 * Whether this build has the photo picker. It's native code added after some builds were made; on
 * those, the photo buttons stay hidden instead of crashing.
 */
export const photosAvailable = Platform.OS === 'web' || requireOptionalNativeModule('ExponentImagePicker') !== null;

/**
 * Takes a photo (a handout, the whiteboard, a printed syllabus) or picks one from the library, as
 * JPEG; iPhone HEIC photos are converted by the picker.
 */
export async function pickSchedulePhoto(source: 'camera' | 'library'): Promise<PickResult> {
  // Loaded here, not at the top, so builds without the native module still start.
  const ImagePicker = await import('expo-image-picker');
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { kind: 'error', message: 'Allow camera access in Settings to take a photo.' };
  }
  const options = { mediaTypes: ['images' as const], quality: 0.7, base64: true };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return { kind: 'cancelled' };
  const asset = result.assets[0];
  if (!asset.base64) return { kind: 'error', message: 'Couldn’t read that photo — try another.' };
  if (asset.base64.length * 0.75 > MAX_IMPORT_BYTES) return { kind: 'error', message: 'That photo is too large.' };
  return { kind: 'picked', file: { fileName: asset.fileName ?? 'Photo', mediaType: 'image/jpeg', data: asset.base64 } };
}
